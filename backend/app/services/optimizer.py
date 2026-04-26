"""
Importance-weighted camera placement optimizer.

Score function:
    S(cameras) = Σ_cell  importance[cell] * visible(cell, cameras)
                 -------------------------------------------
                          Σ_cell  importance[cell]
returns 0–1.

Constraint: Σ camera_cost(c) <= budget.

Algorithm:
  1. Build candidate mount positions along walls + ceiling at standard heights.
  2. Greedy: for each unfilled budget slot, pick the (position, type) tuple
     that adds the most importance-weighted coverage.
  3. Optional local search: random-jiggle each camera, accept if score improves.
"""

import math
import random
from typing import Optional

import numpy as np
from scipy.ndimage import label as _connected_label

from app.services.raycast import (
    _wall_segments,
    _obstruction_aabbs,
    occlusion_mask,
    camera_fov_mask,
    per_camera_visibility,
)


CAMERA_TYPES = [
    {"type": "Bullet 2K", "cost_usd": 199, "fov_h": 80,  "fov_v": 45, "ir": False, "hdr": False},
    {"type": "Dome IR",   "cost_usd": 229, "fov_h": 100, "fov_v": 65, "ir": True,  "hdr": False},
    {"type": "Dome WDR",  "cost_usd": 279, "fov_h": 120, "fov_v": 90, "ir": False, "hdr": True},
    {"type": "Dome 4K",   "cost_usd": 349, "fov_h": 110, "fov_v": 70, "ir": False, "hdr": True},
    {"type": "PTZ",       "cost_usd": 599, "fov_h": 65,  "fov_v": 40, "ir": True,  "hdr": True},
]

CEILING_HEIGHT = 2.7  # meters — standard mount height


def optimize(
    scene: dict,
    importance_grid: np.ndarray,
    grid_bounds: dict,
    grid_resolution: float,
    budget_usd: float,
    locked_cameras: Optional[list[dict]] = None,
    candidate_step: float = 1.0,
    max_cameras: int = 12,
    refine_iters: int = 0,
    max_cells: int = 2000,
) -> dict:
    """
    Returns:
      {
        "cameras":          [...]   selected cameras (existing schema)
        "score":            float   importance-weighted coverage 0–1
        "total_cost_usd":   float
        "iterations":       [...]   per-step diagnostics for the demo
      }
    """
    locked_cameras = locked_cameras or []

    # Sample importance + cell positions, optionally subsampled for speed
    cells_xy, cell_weights = _flatten_grid(importance_grid, grid_bounds, grid_resolution)
    if len(cells_xy) > max_cells:
        # stratified subsample weighted by importance (more samples in important regions)
        rng = np.random.default_rng(0)
        # Sample uniformly to stay representative; importance is multiplied later
        idx = rng.choice(len(cells_xy), size=max_cells, replace=False)
        cells_xy = cells_xy[idx]
        cell_weights = cell_weights[idx]
    total_weight = float(cell_weights.sum())
    if total_weight <= 0:
        return {"cameras": locked_cameras, "score": 0.0, "total_cost_usd": _cost(locked_cameras), "iterations": []}

    virtual_walls = _close_perimeter(scene)
    candidates = _build_candidates(scene, candidate_step, virtual_walls)
    if not candidates:
        return {"cameras": locked_cameras, "score": 0.0, "total_cost_usd": _cost(locked_cameras), "iterations": []}

    # Pre-compute visibility mask for every (candidate, type) up front
    segments = _wall_segments(scene)
    aabbs = _obstruction_aabbs(scene)
    precomputed = _precompute_candidate_visibility(scene, candidates, cells_xy, segments, aabbs)

    cameras = list(locked_cameras)
    # Reset camera-id counter per call so IDs are deterministic
    _make_camera.counter = []  # type: ignore[attr-defined]

    covered = _coverage_mask(scene, cameras, cells_xy)

    iterations: list[dict] = []
    spent = _cost(cameras)
    used_keys: set = set()

    while len(cameras) < max_cameras:
        best = _greedy_pick(
            precomputed, cell_weights, covered,
            budget_remaining=budget_usd - spent,
            exclude=used_keys,
        )
        if best is None:
            break
        cam = _make_camera(candidates[best["cand_idx"]], best["ctype"], idx=len(cameras))
        cameras.append(cam)
        covered |= best["mask"]
        spent += cam["cost_usd"]
        used_keys.add((best["cand_idx"], best["ctype"]["type"]))
        score_now = float((covered * cell_weights).sum() / total_weight)
        iterations.append({
            "camera_id": cam["id"],
            "type": cam["type"],
            "position": cam["position"],
            "marginal_gain": best["gain"],
            "score": score_now,
            "cost_usd": spent,
        })

    if refine_iters > 0:
        cameras, covered = _local_search(
            scene, cameras, locked_cameras, candidates,
            cells_xy, cell_weights, covered, refine_iters,
        )

    final_score = float((covered * cell_weights).sum() / total_weight)
    analytics = _compute_analytics(scene, cameras, importance_grid, grid_bounds, grid_resolution)
    return {
        "cameras": cameras,
        "score": final_score,
        "total_cost_usd": _cost(cameras),
        "iterations": iterations,
        **analytics,
    }


def _precompute_candidate_visibility(scene, candidates, cells_xy, segments, aabbs):
    """
    For each (candidate, camera_type), compute the boolean visibility mask once.
    Returns list of dicts: { cand_idx, ctype, mask }.
    """
    out: list[dict] = []
    cells_3d = np.column_stack([cells_xy, np.full(len(cells_xy), 1.2)])
    for cand_idx, cand in enumerate(candidates):
        cam_xy = np.array(cand["position"][:2])
        cam_pos_3d = np.array(cand["position"], dtype=float)
        target_3d = np.array(cand["target"], dtype=float)
        for ctype in CAMERA_TYPES:
            fov = camera_fov_mask(cam_pos_3d, target_3d, ctype["fov_h"], ctype["fov_v"], cells_3d)
            idx = np.where(fov)[0]
            mask = np.zeros(len(cells_xy), dtype=bool)
            if len(idx):
                vis = occlusion_mask(cam_xy, cells_xy[idx], segments, aabbs)
                mask[idx[vis]] = True
            out.append({"cand_idx": cand_idx, "ctype": ctype, "mask": mask})
    return out


def _greedy_pick(precomputed, weights, covered, budget_remaining, exclude):
    best = None
    best_score = 0.0
    for entry in precomputed:
        if (entry["cand_idx"], entry["ctype"]["type"]) in exclude:
            continue
        if entry["ctype"]["cost_usd"] > budget_remaining:
            continue
        new = entry["mask"] & ~covered
        gain = float((new * weights).sum())
        if gain <= 0:
            continue
        score = gain / entry["ctype"]["cost_usd"]
        if score > best_score:
            best_score = score
            best = {
                "cand_idx": entry["cand_idx"],
                "ctype": entry["ctype"],
                "mask": entry["mask"],
                "gain": gain,
            }
    return best


# ─── candidates ───────────────────────────────────────────────────


MIN_WALL_CLEARANCE = 0.25  # candidate must be at least this far from every wall
MAX_CLOSURE_GAP    = 4.0   # only close perimeter gaps smaller than this (m)


def _close_perimeter(scene: dict) -> list[dict]:
    """
    Find dangling wall endpoints (touched by exactly one wall segment) and
    connect nearby pairs with virtual closure walls. These are used only for
    candidate clearance — not added to the scene and not used in raycasting.

    This closes building-perimeter gaps without affecting doorways, since
    doorways have real wall segments on both sides whose ends connect to
    adjacent walls and are therefore not dangling.
    """
    from collections import defaultdict

    walls = scene.get("walls", [])
    if not walls:
        return []

    # Snap resolution: endpoints within this distance are treated as the same node
    SNAP = 0.15

    def snap(pt: list) -> tuple:
        return (round(pt[0] / SNAP) * SNAP, round(pt[1] / SNAP) * SNAP)

    degree: dict[tuple, int] = defaultdict(int)
    for w in walls:
        degree[snap(w["from"])] += 1
        degree[snap(w["to"])] += 1

    # Dangling = only one wall touches this endpoint
    dangles = [pt for pt, d in degree.items() if d == 1]
    if len(dangles) < 2:
        return []

    virtual: list[dict] = []
    used: set[int] = set()
    for i in range(len(dangles)):
        if i in used:
            continue
        best_j, best_dist = None, float("inf")
        for j in range(len(dangles)):
            if j == i or j in used:
                continue
            d = math.hypot(dangles[i][0] - dangles[j][0], dangles[i][1] - dangles[j][1])
            if d < best_dist:
                best_dist = d
                best_j = j
        if best_j is not None and best_dist <= MAX_CLOSURE_GAP:
            a, b = dangles[i], dangles[best_j]
            virtual.append({
                "id": f"_vwall_{i}",
                "from": [a[0], a[1]],
                "to":   [b[0], b[1]],
                "height": 2.7,
            })
            used.add(i)
            used.add(best_j)

    print(f"[optimizer] perimeter closure: {len(virtual)} virtual wall(s) added")
    return virtual


def _dist_to_segment(px: float, py: float, x0: float, y0: float, x1: float, y1: float) -> float:
    """Minimum distance from point (px, py) to line segment (x0,y0)→(x1,y1)."""
    dx, dy = x1 - x0, y1 - y0
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq < 1e-12:
        return math.hypot(px - x0, py - y0)
    t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / seg_len_sq))
    return math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))


def _build_candidates(scene: dict, step: float, virtual_walls: Optional[list[dict]] = None) -> list[dict]:
    """
    Mount points along each wall, every `step` meters, offset inward toward
    the scene center up to ceiling height.

    Constraint A: candidates must be at least MIN_WALL_CLEARANCE from every
    wall (real + virtual perimeter closure walls).
    Constraint B: candidates must be inside a room polygon (Polycam scenes).
    Without this the optimizer can "cheat" by placing a camera outside the
    mesh and still claim coverage of room cells. avery_house (no _raw_rooms)
    falls through unfiltered — its bbox rooms tile the scene anyway.
    """
    candidates: list[dict] = []
    bounds = scene["bounds"]
    cz = min(CEILING_HEIGHT, bounds["max"][2] - 0.1)

    walls = scene.get("walls", [])
    # Virtual perimeter walls used only for clearance — not for raycasting
    all_walls_for_clearance = walls + (virtual_walls or [])

    wall_segments = [
        (w["from"][0], w["from"][1], w["to"][0], w["to"][1])
        for w in all_walls_for_clearance
    ]

    def clear_of_all_walls(x: float, y: float, source_wall_id: str) -> bool:
        for w, seg in zip(all_walls_for_clearance, wall_segments):
            if w["id"] == source_wall_id:
                continue
            if _dist_to_segment(x, y, *seg) < MIN_WALL_CLEARANCE:
                return False
        return True

    for w in walls:
        x0, y0 = w["from"]
        x1, y1 = w["to"]
        length = math.hypot(x1 - x0, y1 - y0)
        if length < 0.5:
            continue
        dx, dy = (x1 - x0) / length, (y1 - y0) / length
        nx, ny = -dy, dx
        # Flip normal toward scene center if needed
        cx, cy = (bounds["min"][0] + bounds["max"][0]) / 2, (bounds["min"][1] + bounds["max"][1]) / 2
        wall_mid_x = (x0 + x1) / 2
        wall_mid_y = (y0 + y1) / 2
        if (nx * (cx - wall_mid_x) + ny * (cy - wall_mid_y)) < 0:
            nx, ny = -nx, -ny

        n_steps = max(1, int(length / 0.5))
        for i in range(n_steps + 1):
            t = i / n_steps if n_steps > 0 else 0.5
            mx = x0 + t * (x1 - x0) + nx * 0.6
            my = y0 + t * (y1 - y0) + ny * 0.6
            if not (bounds["min"][0] <= mx <= bounds["max"][0]):
                continue
            if not (bounds["min"][1] <= my <= bounds["max"][1]):
                continue
            if not clear_of_all_walls(mx, my, w["id"]):
                continue
            # Clip target to scene bounds so it can't shoot through into adjacent rooms
            tx = max(bounds["min"][0], min(bounds["max"][0], mx + nx * 4.0))
            ty = max(bounds["min"][1], min(bounds["max"][1], my + ny * 4.0))
            candidates.append({
                "position": [round(mx, 2), round(my, 2), cz],
                "target": [round(tx, 2), round(ty, 2), 1.2],
                "wall_id": w["id"],
                "normal": [nx, ny, 0.0],
            })

    # ── Constraint B: drop any candidate outside the room polygons ──
    polygons = [r["polygon"] for r in (scene.get("_raw_rooms") or []) if r.get("polygon")]
    if polygons:
        before = len(candidates)
        candidates = [
            c for c in candidates
            if any(_point_in_polygon(c["position"][0], c["position"][1], poly) for poly in polygons)
        ]
        print(f"[optimizer] polygon-inside filter: {before} → {len(candidates)} candidates")

    return candidates


def _point_in_polygon(x: float, y: float, polygon: list[list[float]]) -> bool:
    """Even-odd ray-casting test."""
    n = len(polygon)
    if n < 3:
        return False
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i][0], polygon[i][1]
        xj, yj = polygon[j][0], polygon[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi):
            inside = not inside
        j = i
    return inside


# ─── greedy step ──────────────────────────────────────────────────


def _make_camera(candidate: dict, ctype: dict, idx: int) -> dict:
    n = len(_make_camera.counter)
    _make_camera.counter.append(0)
    return {
        "id": f"CAM-{n+1:02d}",
        "label": f"CAM-{n+1:02d}",
        "type": ctype["type"],
        "position": list(candidate["position"]),
        "target": list(candidate["target"]),
        "fov_h": ctype["fov_h"],
        "fov_v": ctype["fov_v"],
        "cost_usd": ctype["cost_usd"],
        "ir_capable": ctype["ir"],
        "hdr_capable": ctype["hdr"],
        "status": "active",
        "locked": False,
    }
_make_camera.counter = []  # type: ignore[attr-defined]


# ─── score / coverage helpers ─────────────────────────────────────


def _coverage_mask(scene, cameras, cells_xy) -> np.ndarray:
    """Boolean mask of length len(cells_xy): which cells are covered by any camera."""
    out = np.zeros(len(cells_xy), dtype=bool)
    if not cameras:
        return out
    segments = _wall_segments(scene)
    aabbs = _obstruction_aabbs(scene)
    cells_3d = np.column_stack([cells_xy, np.full(len(cells_xy), 1.2)])
    for cam in cameras:
        fov = camera_fov_mask(
            np.array(cam["position"]), np.array(cam["target"]),
            cam["fov_h"], cam["fov_v"], cells_3d,
        )
        idx = np.where(fov)[0]
        if len(idx) == 0:
            continue
        vis = occlusion_mask(np.array(cam["position"][:2]), cells_xy[idx], segments, aabbs)
        out[idx[vis]] = True
    return out


def _cost(cameras: list[dict]) -> float:
    return float(sum(c.get("cost_usd", 0) for c in cameras))


def _flatten_grid(grid: np.ndarray, bounds: dict, resolution: float):
    """Unroll the (H, W) importance grid into (cells_xy, weights)."""
    H, W = grid.shape
    x_min, y_min = bounds["min"][0], bounds["min"][1]
    xs = x_min + (np.arange(W) + 0.5) * resolution
    ys = y_min + (np.arange(H) + 0.5) * resolution
    xx, yy = np.meshgrid(xs, ys)
    cells_xy = np.column_stack([xx.ravel(), yy.ravel()])
    weights = grid.ravel().astype(float)
    return cells_xy, weights


# ─── local search refinement ──────────────────────────────────────


def _local_search(scene, cameras, locked, candidates, cells_xy, cell_weights, covered, iters):
    """Random-jiggle: pick a non-locked camera, propose a nearby candidate, accept if score up."""
    locked_ids = {c["id"] for c in locked}
    total = float(cell_weights.sum()) or 1.0
    rng = random.Random(0)
    current_score = float((covered * cell_weights).sum() / total)

    for _ in range(iters):
        movables = [i for i, c in enumerate(cameras) if c["id"] not in locked_ids]
        if not movables:
            break
        i = rng.choice(movables)
        # propose: swap position to a random candidate
        new_cand = rng.choice(candidates)
        new_cam = dict(cameras[i])
        new_cam["position"] = list(new_cand["position"])
        new_cam["target"] = list(new_cand["target"])

        trial = list(cameras)
        trial[i] = new_cam
        new_covered = _coverage_mask(scene, trial, cells_xy)
        new_score = float((new_covered * cell_weights).sum() / total)
        if new_score > current_score:
            cameras = trial
            covered = new_covered
            current_score = new_score
    return cameras, covered



# ─── post-optimization analytics ──────────────────────────────────
# Powers the LeftRail CoveragePanel's entry-points / blind-spots / overlap-zones.
# Recomputed from the final camera list rather than carried out of the greedy loop
# so refine_iters / locked cameras are reflected correctly.

BLIND_SPOT_IMPORTANCE_THRESHOLD = 0.4   # cells below this are "intentionally uncovered"
BLIND_SPOT_MIN_AREA_M2          = 0.5   # smaller patches are noise, not actionable


def _compute_analytics(scene, cameras, importance_grid, grid_bounds, grid_resolution):
    """Returns {entry_points_covered, entry_points_total, blind_spots, overlap_zones}."""
    entry_points_total = len(scene.get("entry_points", []))
    if not cameras:
        return {
            "entry_points_covered": 0,
            "entry_points_total":   entry_points_total,
            "blind_spots":          [],
            "overlap_zones":        0,
        }

    H, W = importance_grid.shape
    cells_xy, _ = _flatten_grid(importance_grid, grid_bounds, grid_resolution)
    vis = per_camera_visibility(scene, cameras, cells_xy)             # (n_cam, H*W)
    coverage_count = vis.sum(axis=0).reshape(H, W)
    coverage_grid  = coverage_count > 0

    return {
        "entry_points_covered": _entry_points_covered(scene, cameras),
        "entry_points_total":   entry_points_total,
        "blind_spots":          _find_blind_spots(importance_grid, coverage_grid, grid_bounds, grid_resolution),
        "overlap_zones":        _count_overlap_regions(coverage_count),
    }


def _entry_points_covered(scene: dict, cameras: list[dict]) -> int:
    """Count entry points where at least one camera has FOV + clear LoS."""
    entries = scene.get("entry_points", [])
    if not entries:
        return 0

    segments = _wall_segments(scene)
    aabbs    = _obstruction_aabbs(scene)
    ep_3d    = np.array([ep["position"] for ep in entries], dtype=float)
    ep_xy    = ep_3d[:, :2]

    covered = np.zeros(len(entries), dtype=bool)
    for cam in cameras:
        cam_pos = np.array(cam["position"], dtype=float)
        target  = np.array(cam["target"],   dtype=float)
        fov     = camera_fov_mask(cam_pos, target, cam["fov_h"], cam["fov_v"], ep_3d)
        idx     = np.where(fov)[0]
        if len(idx) == 0:
            continue
        vis = occlusion_mask(cam_pos[:2], ep_xy[idx], segments, aabbs)
        covered[idx[vis]] = True
    return int(covered.sum())


def _find_blind_spots(importance_grid, coverage_grid, bounds, resolution) -> list[dict]:
    """
    Connected uncovered regions where importance > threshold.
    Severity scales with the region's average importance.
    """
    bad = (importance_grid > BLIND_SPOT_IMPORTANCE_THRESHOLD) & (~coverage_grid)
    labels, n = _connected_label(bad)
    cell_area = resolution * resolution

    out: list[dict] = []
    for i in range(1, n + 1):
        mask = labels == i
        area = float(mask.sum()) * cell_area
        if area < BLIND_SPOT_MIN_AREA_M2:
            continue
        rows, cols = np.where(mask)
        # Cell centers in world coords. importance_grid is (rows=Y, cols=X) starting at bounds.min.
        cx = bounds["min"][0] + (cols.mean() + 0.5) * resolution
        cy = bounds["min"][1] + (rows.mean() + 0.5) * resolution
        avg_imp = float(importance_grid[mask].mean())
        severity = "high" if avg_imp > 0.7 else "medium" if avg_imp > 0.5 else "low"
        out.append({
            "id":       f"bs_{len(out) + 1}",
            "position": [round(cx, 2), round(cy, 2), 0.0],
            "area_m2":  round(area, 2),
            "reason":   f"Uncovered importance-{avg_imp:.2f} region",
            "severity": severity,
        })
    # Sort biggest/most severe first so the panel shows the worst at the top
    out.sort(key=lambda b: (b["severity"] != "high", b["severity"] != "medium", -b["area_m2"]))
    return out


def _count_overlap_regions(coverage_count: np.ndarray) -> int:
    """Number of contiguous regions where 2+ cameras see the same cell."""
    overlap = coverage_count >= 2
    if not overlap.any():
        return 0
    _, n = _connected_label(overlap)
    return int(n)

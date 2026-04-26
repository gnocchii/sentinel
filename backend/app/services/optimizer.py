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

    # Sample cell positions. The importance grid leaks into the void OUTSIDE
    # any room polygon (parser quirk), which previously made 75% of "scored"
    # cells unreachable phantom space. Filter to cells actually inside a room
    # polygon so the score denominator reflects real interior, not exterior
    # void. Importance weighting is preserved — cells in a kitchen still count
    # more than cells in a closet, but ALL cells are at least real.
    cells_xy, raw_weights = _flatten_grid(importance_grid, grid_bounds, grid_resolution)
    in_scene = raw_weights > 0
    cells_xy = cells_xy[in_scene]
    cell_weights = raw_weights[in_scene]

    polygons = [r["polygon"] for r in (scene.get("_raw_rooms") or []) if r.get("polygon")]
    if polygons:
        in_room = np.array([
            any(_point_in_polygon(x, y, poly) for poly in polygons)
            for x, y in cells_xy
        ])
        cells_xy = cells_xy[in_room]
        cell_weights = cell_weights[in_room]
    if len(cells_xy) > max_cells:
        rng = np.random.default_rng(0)
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

    # Entry points are kept around for analytics + retarget tracking, but the
    # explicit door bonus is OFF: the greedy now just maximizes importance-
    # weighted floor coverage. Doors are part of the floor; they get covered
    # incidentally when the optimizer spreads cameras to cover all rooms.
    entry_list = scene.get("entry_points", []) or []
    entry_pts_xy = (
        np.array([ep["position"][:2] for ep in entry_list], dtype=float)
        if entry_list else np.zeros((0, 2), dtype=float)
    )
    door_bonus_per_entry = 0.0

    precomputed = _precompute_candidate_visibility(
        scene, candidates, cells_xy, segments, aabbs, entry_pts_xy,
    )

    cameras = list(locked_cameras)
    # Reset camera-id counter per call so IDs are deterministic
    _make_camera.counter = []  # type: ignore[attr-defined]

    covered = _coverage_mask(scene, cameras, cells_xy)
    entry_covered = _entry_coverage_mask(scene, cameras, entry_pts_xy, segments, aabbs)

    iterations: list[dict] = []
    spent = _cost(cameras)
    used_keys: set = set()
    placed_cand_indices: list[int] = []  # parallel to cameras[len(locked_cameras):]

    while len(cameras) < max_cameras:
        best = _greedy_pick(
            precomputed, cell_weights, covered, entry_covered,
            door_bonus_per_entry,
            budget_remaining=budget_usd - spent,
            exclude=used_keys,
        )
        if best is None:
            break
        cam = _make_camera(candidates[best["cand_idx"]], best["ctype"], idx=len(cameras))
        cameras.append(cam)
        placed_cand_indices.append(best["cand_idx"])
        covered |= best["mask"]
        entry_covered |= best["entry_mask"]
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

    # Cosmetic retarget: replace each optimizer-placed camera's wall-normal
    # default target with the lookAt that maximizes frame fill, biased toward
    # any entry points within reach. The yaw search centers on the candidate's
    # ORIGINAL aim direction (wall normal for plain candidates, door direction
    # for door-aimed candidates added by _augment_with_door_aimed_candidates).
    # Locked cameras keep their user-supplied target.
    floor_z = float(scene["bounds"]["min"][2])
    n_locked = len(locked_cameras)
    for cam, cand_idx in zip(cameras[n_locked:], placed_cand_indices):
        cand = candidates[cand_idx]
        cam_pos = np.array(cam["position"], dtype=float)
        cand_target = np.array(cand["target"], dtype=float)
        base_dir = cand_target[:2] - cam_pos[:2]
        if np.linalg.norm(base_dir) < 1e-6:
            base_dir = np.array(cand["normal"][:2], dtype=float)
        cam["target"] = _refine_demo_target(
            cam_pos,
            base_dir,
            cam["fov_h"], cam["fov_v"],
            cells_xy, cell_weights, segments, aabbs, floor_z,
            entry_pts_xy=entry_pts_xy,
            door_bonus_per_entry=door_bonus_per_entry,
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


# Doors sit ON wall segments because the parser doesn't cut walls at openings,
# and stacked wall surfaces (interior/exterior face of a thick wall) lie between
# the camera and the door. Pulling the test point this far toward the camera
# steps past those parser-artifact walls without affecting real obstructions.
_DOOR_INFLATE_TOWARD_CAM = 0.6


def _doors_toward_cam(cam_xy: np.ndarray, doors_xy: np.ndarray) -> np.ndarray:
    """Move each door point _DOOR_INFLATE_TOWARD_CAM meters toward cam_xy."""
    if len(doors_xy) == 0:
        return doors_xy
    delta = cam_xy[None, :] - doors_xy
    norms = np.linalg.norm(delta, axis=1, keepdims=True) + 1e-9
    step = np.minimum(norms.squeeze(-1), _DOOR_INFLATE_TOWARD_CAM)
    return doors_xy + (delta / norms) * step[:, None]


def _precompute_candidate_visibility(scene, candidates, cells_xy, segments, aabbs, entry_pts_xy):
    """
    For each (candidate, camera_type), compute the boolean visibility mask
    over the floor cells AND the entry points (doors/windows). Returns list
    of dicts: { cand_idx, ctype, mask, entry_mask }.

    The default candidate target is "4m straight off the wall" — useless for
    deciding what a camera CAN see. So we test against a wider effective FOV
    (clamped to 170°) so the precomputed mask captures everything the camera
    could see from this position, regardless of which exact yaw the retarget
    pass eventually picks.
    """
    out: list[dict] = []
    cells_3d   = np.column_stack([cells_xy, np.full(len(cells_xy), 1.2)])
    entry_3d   = (
        np.column_stack([entry_pts_xy, np.full(len(entry_pts_xy), 1.0)])
        if len(entry_pts_xy) else np.zeros((0, 3), dtype=float)
    )
    for cand_idx, cand in enumerate(candidates):
        cam_xy = np.array(cand["position"][:2])
        cam_pos_3d = np.array(cand["position"], dtype=float)
        target_3d = np.array(cand["target"], dtype=float)
        for ctype in CAMERA_TYPES:
            # Use a generous "what the camera could see from this spot" FOV so
            # the greedy isn't punished for picks that need a yaw rotation
            # later. Real fov is enforced once the retarget pass picks the aim.
            effective_fov_h = min(170.0, ctype["fov_h"] * 1.6)
            effective_fov_v = min(150.0, ctype["fov_v"] * 1.6)

            fov = camera_fov_mask(cam_pos_3d, target_3d, effective_fov_h, effective_fov_v, cells_3d)
            idx = np.where(fov)[0]
            mask = np.zeros(len(cells_xy), dtype=bool)
            if len(idx):
                vis = occlusion_mask(cam_xy, cells_xy[idx], segments, aabbs)
                mask[idx[vis]] = True

            entry_mask = np.zeros(len(entry_pts_xy), dtype=bool)
            if len(entry_3d):
                e_fov = camera_fov_mask(cam_pos_3d, target_3d, effective_fov_h, effective_fov_v, entry_3d)
                e_idx = np.where(e_fov)[0]
                if len(e_idx):
                    inflated = _doors_toward_cam(cam_xy, entry_pts_xy[e_idx])
                    e_vis = occlusion_mask(cam_xy, inflated, segments, aabbs)
                    entry_mask[e_idx[e_vis]] = True

            out.append({"cand_idx": cand_idx, "ctype": ctype, "mask": mask, "entry_mask": entry_mask})
    return out


def _entry_coverage_mask(scene, cameras, entry_pts_xy, segments, aabbs):
    """Boolean mask over entry_pts_xy: which doors are currently covered by any camera."""
    out = np.zeros(len(entry_pts_xy), dtype=bool)
    if not cameras or len(entry_pts_xy) == 0:
        return out
    entry_3d = np.column_stack([entry_pts_xy, np.full(len(entry_pts_xy), 1.0)])
    for cam in cameras:
        cam_pos = np.array(cam["position"], dtype=float)
        target  = np.array(cam["target"], dtype=float)
        fov = camera_fov_mask(cam_pos, target, cam["fov_h"], cam["fov_v"], entry_3d)
        idx = np.where(fov)[0]
        if len(idx) == 0:
            continue
        inflated = _doors_toward_cam(cam_pos[:2], entry_pts_xy[idx])
        vis = occlusion_mask(cam_pos[:2], inflated, segments, aabbs)
        out[idx[vis]] = True
    return out


def _greedy_pick(precomputed, weights, covered, entry_covered, door_bonus_per_entry,
                 budget_remaining, exclude):
    best = None
    best_score = 0.0
    for entry in precomputed:
        if (entry["cand_idx"], entry["ctype"]["type"]) in exclude:
            continue
        if entry["ctype"]["cost_usd"] > budget_remaining:
            continue
        new_floor = entry["mask"] & ~covered
        floor_gain = float((new_floor * weights).sum())

        new_doors = entry["entry_mask"] & ~entry_covered
        door_gain = float(new_doors.sum()) * door_bonus_per_entry

        gain = floor_gain + door_gain
        if gain <= 0:
            continue
        score = gain / entry["ctype"]["cost_usd"]
        if score > best_score:
            best_score = score
            best = {
                "cand_idx": entry["cand_idx"],
                "ctype": entry["ctype"],
                "mask": entry["mask"],
                "entry_mask": entry["entry_mask"],
                "gain": gain,
            }
    return best


# ─── candidates ───────────────────────────────────────────────────


MIN_WALL_CLEARANCE = 0.08  # candidate must be at least this far from non-source walls
                           # (small enough that wall-mounted candidates near corners are accepted)
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
        x0, y0, *_ = w["from"]  # tolerate 2D ([x,y]) or 3D ([x,y,z]) wall coords
        x1, y1, *_ = w["to"]
        length = math.hypot(x1 - x0, y1 - y0)
        if length < 0.3:  # short walls (door jambs etc.) still get one mount point
            continue
        dx, dy = (x1 - x0) / length, (y1 - y0) / length
        nx, ny = -dy, dx
        # Flip normal toward scene center if needed
        cx, cy = (bounds["min"][0] + bounds["max"][0]) / 2, (bounds["min"][1] + bounds["max"][1]) / 2
        wall_mid_x = (x0 + x1) / 2
        wall_mid_y = (y0 + y1) / 2
        if (nx * (cx - wall_mid_x) + ny * (cy - wall_mid_y)) < 0:
            nx, ny = -nx, -ny

        # Mount the camera body close to the wall surface (12 cm) so it reads as
        # wall-mounted in the digital twin instead of floating mid-room. The
        # 5 cm wall-skip in raycast.occlusion_mask handles the close-to-wall case.
        # Denser sampling (every 0.3 m) so the candidate set covers small rooms.
        n_steps = max(1, int(length / 0.3))
        for i in range(n_steps + 1):
            t = i / n_steps if n_steps > 0 else 0.5
            mx = x0 + t * (x1 - x0) + nx * 0.12
            my = y0 + t * (y1 - y0) + ny * 0.12
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

    # Polygon filter REMOVED. Original intent (prevent cameras "outside the
    # mesh" from cheating through walls) is already enforced by occlusion_mask:
    # a camera in the void can't raycast through walls. The polygon filter was
    # killing 50% of reachable cells because wall-mount candidates 0.12 m off
    # the wall fall just outside the polygon edge.
    return candidates


_DOOR_AIM_RADIUS = 12.0  # consider candidates within this distance of the door
_DOOR_AIMS_PER_DOOR = 10  # how many door-aimed candidates to add per door


def _augment_with_door_aimed_candidates(
    candidates: list[dict],
    entry_pts_xy: np.ndarray,
    segments: np.ndarray,
    aabbs: np.ndarray,
) -> list[dict]:
    """
    For every door, find the nearest wall-mount candidates that have line-of-sight
    to it (using the camera-side door inflation), and add door-aimed copies whose
    target is the door itself. The greedy can then pick a position+aim pair that
    explicitly watches a particular door — vs. relying on the cosmetic retarget
    to choose a yaw that happens to include it.
    """
    if not candidates or len(entry_pts_xy) == 0:
        return candidates

    cand_pos = np.array([c["position"][:2] for c in candidates])
    out: list[dict] = list(candidates)
    seen_keys: set = {(tuple(c["position"]), tuple(c["target"])) for c in candidates}

    for door_xy in entry_pts_xy:
        d_xy = np.array([door_xy[0], door_xy[1]])
        # Sort candidates by distance to door
        dists = np.linalg.norm(cand_pos - d_xy[None, :], axis=1)
        order = np.argsort(dists)

        added = 0
        for cand_idx in order:
            if dists[cand_idx] > _DOOR_AIM_RADIUS:
                break
            cand = candidates[cand_idx]
            cam_xy = cand_pos[cand_idx]
            inflated = _doors_toward_cam(cam_xy, d_xy[None, :])
            vis = occlusion_mask(cam_xy, inflated, segments, aabbs)
            if not vis.any():
                continue
            # New target: the door itself (z=1.0 floor-ish — height set by retarget pass anyway)
            new_target = [round(float(door_xy[0]), 2), round(float(door_xy[1]), 2), 1.0]
            key = (tuple(cand["position"]), tuple(new_target))
            if key in seen_keys:
                continue
            seen_keys.add(key)
            out.append({
                "position": list(cand["position"]),
                "target": new_target,
                "wall_id": cand["wall_id"],
                "normal": list(cand["normal"]),
            })
            added += 1
            if added >= _DOOR_AIMS_PER_DOOR:
                break

    print(f"[optimizer] door-aimed augment: {len(candidates)} → {len(out)} candidates")
    return out


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


def _point_to_polygon_distance(x: float, y: float, polygon: list[list[float]]) -> float:
    """Min distance from point (x, y) to any edge of the polygon."""
    n = len(polygon)
    if n < 2:
        return float("inf")
    best = float("inf")
    for i in range(n):
        x0, y0 = polygon[i][0], polygon[i][1]
        x1, y1 = polygon[(i + 1) % n][0], polygon[(i + 1) % n][1]
        d = _dist_to_segment(x, y, x0, y0, x1, y1)
        if d < best:
            best = d
    return best


# ─── greedy step ──────────────────────────────────────────────────


_DEMO_YAW_SAMPLES_DEG = (-60, -45, -30, -15, 0, 15, 30, 45, 60)
_DEMO_AIM_DISTANCE = 4.0
_DEMO_AIM_FLOOR_OFFSET = 1.0  # torso height above floor → ~20° tilt-down from a 2.7m mount
_DEMO_MIN_FRAME_DEPTH = 2.0   # below this, a wall is filling the frame at point-blank range
_DEMO_FRAME_RAY_OFFSETS_DEG = (-20, -10, 0, 10, 20)  # central FOV samples for "depth"


def _ray_seg_distances(cam_xy: np.ndarray, dir_xy: np.ndarray, segs: np.ndarray) -> float:
    """
    Distance from cam_xy to first wall/AABB-edge intersection along dir_xy.
    Returns +inf if the ray hits nothing. segs shape: (N, 4) = [x0, y0, x1, y1].
    """
    if len(segs) == 0:
        return float("inf")
    cx, cy = float(cam_xy[0]), float(cam_xy[1])
    dx, dy = float(dir_xy[0]), float(dir_xy[1])
    sx0, sy0 = segs[:, 0], segs[:, 1]
    sx1, sy1 = segs[:, 2], segs[:, 3]
    sdx, sdy = sx1 - sx0, sy1 - sy0
    denom = dx * sdy - dy * sdx
    with np.errstate(divide="ignore", invalid="ignore"):
        safe = np.where(np.abs(denom) > 1e-9, denom, np.nan)
        t_ray = ((sx0 - cx) * sdy - (sy0 - cy) * sdx) / safe
        s_seg = ((sx0 - cx) * dy  - (sy0 - cy) * dx) / safe
    valid = (t_ray > 0.05) & (s_seg >= 0.0) & (s_seg <= 1.0)
    if not valid.any():
        return float("inf")
    return float(np.where(valid, t_ray, np.inf).min())


def _build_blocker_segments(segments: np.ndarray, aabbs: np.ndarray) -> np.ndarray:
    """Combine wall segments and AABB perimeter edges into one (N, 4) array."""
    parts = [segments] if len(segments) else []
    if len(aabbs) > 0:
        x0, y0, x1, y1 = aabbs[:, 0], aabbs[:, 1], aabbs[:, 2], aabbs[:, 3]
        parts.append(np.column_stack([
            np.concatenate([x0, x1, x1, x0]),
            np.concatenate([y0, y0, y1, y1]),
            np.concatenate([x1, x1, x0, x0]),
            np.concatenate([y0, y1, y1, y0]),
        ]))
    if not parts:
        return np.zeros((0, 4), dtype=float)
    return np.vstack(parts)


def _refine_demo_target(
    cam_pos: np.ndarray,
    base_direction: np.ndarray,
    fov_h: float,
    fov_v: float,
    cells_xy: np.ndarray,
    cell_weights: np.ndarray,
    segments: np.ndarray,
    aabbs: np.ndarray,
    floor_z: float,
    entry_pts_xy: np.ndarray = None,
    door_bonus_per_entry: float = 0.0,
) -> list:
    """
    Pick the lookAt that maximizes 'frame fill' from this camera's position
    while penalizing aim directions that have a wall right in the camera's face.

    Sampled over a 120° yaw arc centered on `base_direction` (typically the
    inward wall normal, OR the camera→door direction for door-aimed candidates),
    at a fixed pitch that puts the aim point at floor + 1.0m. Each yaw is scored as:

        (visible_importance + door_bonus × visible_doors) × frame_depth_penalty

    where frame-depth is the median distance to the first wall hit across rays
    through the central FOV. Below _DEMO_MIN_FRAME_DEPTH (2.0m) the penalty
    approaches 0. The door bonus pushes the chosen yaw to include any entry
    points the camera's position actually has line-of-sight to.
    """
    if entry_pts_xy is None:
        entry_pts_xy = np.zeros((0, 2), dtype=float)
    nx, ny = float(base_direction[0]), float(base_direction[1])
    norm = math.hypot(nx, ny)
    if norm < 1e-9:
        nx, ny = 1.0, 0.0  # degenerate — pick an arbitrary direction
    else:
        nx, ny = nx / norm, ny / norm
    base_angle = math.atan2(ny, nx)
    aim_z = floor_z + _DEMO_AIM_FLOOR_OFFSET

    blockers = _build_blocker_segments(segments, aabbs)

    best_target = [
        float(cam_pos[0] + nx * _DEMO_AIM_DISTANCE),
        float(cam_pos[1] + ny * _DEMO_AIM_DISTANCE),
        aim_z,
    ]
    best_score = -1.0

    cells_3d = np.column_stack([cells_xy, np.full(len(cells_xy), 1.2)])
    entry_3d = (
        np.column_stack([entry_pts_xy, np.full(len(entry_pts_xy), 1.0)])
        if len(entry_pts_xy) else np.zeros((0, 3), dtype=float)
    )
    for offset_deg in _DEMO_YAW_SAMPLES_DEG:
        a = base_angle + math.radians(offset_deg)
        tx = float(cam_pos[0] + math.cos(a) * _DEMO_AIM_DISTANCE)
        ty = float(cam_pos[1] + math.sin(a) * _DEMO_AIM_DISTANCE)

        # Frame-depth: median first-wall distance across the central FOV.
        # Cameras pointed at a wall 1m away will have a tiny median; cameras
        # pointed down a hallway will have a large one.
        ray_dists = []
        for ray_deg in _DEMO_FRAME_RAY_OFFSETS_DEG:
            ra = a + math.radians(ray_deg)
            d = _ray_seg_distances(
                cam_pos[:2],
                np.array([math.cos(ra), math.sin(ra)]),
                blockers,
            )
            ray_dists.append(d)
        # Use median so a single ray slipping through a doorway doesn't rescue
        # an otherwise wall-staring aim.
        frame_depth = float(np.median(ray_dists))
        # Smooth penalty: 0 at depth 0, linearly to 1.0 at _DEMO_MIN_FRAME_DEPTH,
        # capped at 1.0 beyond. Squared so wall-staring yaws are heavily punished.
        depth_factor = min(frame_depth / _DEMO_MIN_FRAME_DEPTH, 1.0) ** 2

        target_3d = np.array([tx, ty, aim_z])
        fov = camera_fov_mask(cam_pos, target_3d, fov_h, fov_v, cells_3d)
        idx = np.where(fov)[0]
        if len(idx) == 0:
            continue
        vis = occlusion_mask(cam_pos[:2], cells_xy[idx], segments, aabbs)
        if not vis.any():
            continue
        visible_idx = idx[vis]
        floor_score = float(cell_weights[visible_idx].sum())

        # Door bonus: how many entry points this yaw has FOV + LoS to.
        # Door positions are inflated toward the camera to step past stacked
        # wall surfaces left by the parser.
        door_score = 0.0
        if len(entry_3d) and door_bonus_per_entry > 0:
            e_fov = camera_fov_mask(cam_pos, target_3d, fov_h, fov_v, entry_3d)
            e_idx = np.where(e_fov)[0]
            if len(e_idx):
                inflated = _doors_toward_cam(cam_pos[:2], entry_pts_xy[e_idx])
                e_vis = occlusion_mask(cam_pos[:2], inflated, segments, aabbs)
                door_score = float(e_vis.sum()) * door_bonus_per_entry

        score = (floor_score + door_score) * depth_factor

        if score > best_score:
            best_score = score
            best_target = [round(tx, 2), round(ty, 2), round(aim_z, 2)]

    return best_target


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
        # Inward-pointing wall normal — lets the renderer attach a mount plate
        # on the wall side of the camera body.
        "mount_normal": list(candidate["normal"]),
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

    # Zero out importance for cells outside any room polygon — those cells
    # are unreachable phantoms and shouldn't appear as blind spots.
    polygons = [r["polygon"] for r in (scene.get("_raw_rooms") or []) if r.get("polygon")]
    if polygons:
        in_room_grid = np.zeros((H, W), dtype=bool)
        for r_idx in range(H):
            for c_idx in range(W):
                x = grid_bounds["min"][0] + (c_idx + 0.5) * grid_resolution
                y = grid_bounds["min"][1] + (r_idx + 0.5) * grid_resolution
                if any(_point_in_polygon(x, y, p) for p in polygons):
                    in_room_grid[r_idx, c_idx] = True
        importance_grid = importance_grid * in_room_grid

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
        # Inflate door positions toward the camera to step past stacked
        # wall surfaces left by the parser (see _doors_toward_cam).
        inflated = _doors_toward_cam(cam_pos[:2], ep_xy[idx])
        vis = occlusion_mask(cam_pos[:2], inflated, segments, aabbs)
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

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

from app.services.raycast import (
    _wall_segments,
    _obstruction_aabbs,
    occlusion_mask,
    camera_fov_mask,
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

    candidates = _build_candidates(scene, candidate_step)
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
    return {
        "cameras": cameras,
        "score": final_score,
        "total_cost_usd": _cost(cameras),
        "iterations": iterations,
    }


def _precompute_candidate_visibility(scene, candidates, cells_xy, segments, aabbs):
    """
    For each (candidate, camera_type), compute the boolean visibility mask once.
    Returns list of dicts: { cand_idx, ctype, mask }.
    """
    out: list[dict] = []
    cells_3d = np.column_stack([cells_xy, np.zeros(len(cells_xy))])
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


def _build_candidates(scene: dict, step: float) -> list[dict]:
    """
    Mount points along each wall, every `step` meters, offset 0.4m inward and
    up to ceiling height. Returns list of {position, target, wall_id, normal}.
    """
    candidates: list[dict] = []
    bounds = scene["bounds"]
    cz = min(CEILING_HEIGHT, bounds["max"][2] - 0.1)

    walls = scene.get("walls", [])
    for w in walls:
        x0, y0 = w["from"]
        x1, y1 = w["to"]
        length = math.hypot(x1 - x0, y1 - y0)
        if length < 0.5:
            continue
        # Wall direction + inward normal (toward scene centroid)
        dx, dy = (x1 - x0) / length, (y1 - y0) / length
        nx, ny = -dy, dx
        # Flip normal toward scene center if needed
        cx, cy = (bounds["min"][0] + bounds["max"][0]) / 2, (bounds["min"][1] + bounds["max"][1]) / 2
        wall_mid_x = (x0 + x1) / 2
        wall_mid_y = (y0 + y1) / 2
        if (nx * (cx - wall_mid_x) + ny * (cy - wall_mid_y)) < 0:
            nx, ny = -nx, -ny

        n_steps = max(1, int(length / step))
        for i in range(n_steps + 1):
            t = i / n_steps if n_steps > 0 else 0.5
            mx = x0 + t * (x1 - x0) + nx * 0.3
            my = y0 + t * (y1 - y0) + ny * 0.3
            # Skip if outside scene bounds
            if not (bounds["min"][0] <= mx <= bounds["max"][0]):
                continue
            if not (bounds["min"][1] <= my <= bounds["max"][1]):
                continue
            target = [mx + nx * 4.0, my + ny * 4.0, 0.0]
            candidates.append({
                "position": [round(mx, 2), round(my, 2), cz],
                "target": [round(target[0], 2), round(target[1], 2), 0.0],
                "wall_id": w["id"],
                "normal": [nx, ny, 0.0],
            })
    return candidates


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
    cells_3d = np.column_stack([cells_xy, np.zeros(len(cells_xy))])
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

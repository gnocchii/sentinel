"""
Raycasting engine: given a scene (walls + obstructions) and a camera,
compute the set of floor-plane points visible from that camera.

Coverage % = visible_points / total_floor_points
"""

import numpy as np
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.camera import Camera


def build_floor_grid(bounds: dict, resolution: float = 0.2) -> np.ndarray:
    """Sample the floor plane at `resolution` meter intervals."""
    xs = np.arange(bounds["min"][0], bounds["max"][0], resolution)
    ys = np.arange(bounds["min"][1], bounds["max"][1], resolution)
    xx, yy = np.meshgrid(xs, ys)
    zz = np.zeros_like(xx)
    return np.stack([xx.ravel(), yy.ravel(), zz.ravel()], axis=1)


def segment_intersects_aabb(p0: np.ndarray, p1: np.ndarray, aabb_min: np.ndarray, aabb_max: np.ndarray) -> bool:
    """Slab test: does segment p0→p1 intersect axis-aligned bounding box?"""
    d = p1 - p0
    t_min, t_max = 0.0, 1.0
    for i in range(3):
        if abs(d[i]) < 1e-9:
            if p0[i] < aabb_min[i] or p0[i] > aabb_max[i]:
                return False
        else:
            t1 = (aabb_min[i] - p0[i]) / d[i]
            t2 = (aabb_max[i] - p0[i]) / d[i]
            t_min = max(t_min, min(t1, t2))
            t_max = min(t_max, max(t1, t2))
            if t_min > t_max:
                return False
    return True


def camera_fov_mask(camera_pos: np.ndarray, target: np.ndarray, fov_h_deg: float, fov_v_deg: float, points: np.ndarray) -> np.ndarray:
    """Return boolean mask of points within camera FOV cone."""
    forward = target - camera_pos
    forward /= np.linalg.norm(forward) + 1e-9

    to_points = points - camera_pos
    norms = np.linalg.norm(to_points, axis=1, keepdims=True) + 1e-9
    to_points_normalized = to_points / norms

    cos_half_h = np.cos(np.radians(fov_h_deg / 2))
    cos_half_v = np.cos(np.radians(fov_v_deg / 2))

    dot = to_points_normalized @ forward
    in_h = dot >= cos_half_h
    # Vertical: angle from forward projected onto vertical plane
    vert = np.abs(to_points_normalized[:, 2])
    in_v = vert <= np.sin(np.radians(fov_v_deg / 2))

    return in_h & in_v


def _wall_segments(scene: dict) -> np.ndarray:
    """Stack walls into shape (N, 4) = [[x0, y0, x1, y1], ...] for vectorized testing."""
    walls = scene.get("walls", [])
    if not walls:
        return np.zeros((0, 4), dtype=float)
    return np.array([[w["from"][0], w["from"][1], w["to"][0], w["to"][1]] for w in walls], dtype=float)


def _obstruction_aabbs(scene: dict) -> np.ndarray:
    """Furniture footprints as 2D AABBs, shape (N, 4) = [x_min, y_min, x_max, y_max]."""
    obs = scene.get("obstructions", [])
    if not obs:
        return np.zeros((0, 4), dtype=float)
    return np.array([
        [o["bounds"]["min"][0], o["bounds"]["min"][1], o["bounds"]["max"][0], o["bounds"]["max"][1]]
        for o in obs
    ], dtype=float)


def occlusion_mask(camera_xy: np.ndarray, points_xy: np.ndarray, segments: np.ndarray, aabbs: np.ndarray) -> np.ndarray:
    """
    Vectorized 2D line-of-sight test.
    Returns a boolean array of length len(points_xy):
      True  → cell visible (no wall/obstruction blocks ray from camera)
      False → cell occluded

    Vectorized over both points AND segments simultaneously — shape (n_walls, n_points).
    """
    if len(points_xy) == 0:
        return np.zeros(0, dtype=bool)

    # Combine wall segments + AABB perimeter segments into one (n_seg, 4) array
    all_segs = [segments] if len(segments) else []
    if len(aabbs) > 0:
        x0, y0, x1, y1 = aabbs[:, 0], aabbs[:, 1], aabbs[:, 2], aabbs[:, 3]
        aabb_segs = np.column_stack([
            np.concatenate([x0, x1, x1, x0]),
            np.concatenate([y0, y0, y1, y1]),
            np.concatenate([x1, x1, x0, x0]),
            np.concatenate([y0, y1, y1, y0]),
        ])
        all_segs.append(aabb_segs)
    if not all_segs:
        return np.ones(len(points_xy), dtype=bool)
    segs = np.vstack(all_segs)

    cx, cy = float(camera_xy[0]), float(camera_xy[1])
    px = points_xy[:, 0][None, :]   # (1, P)
    py = points_xy[:, 1][None, :]
    sx0 = segs[:, 0][:, None]        # (S, 1)
    sy0 = segs[:, 1][:, None]
    sx1 = segs[:, 2][:, None]
    sy1 = segs[:, 3][:, None]
    sdx = sx1 - sx0
    sdy = sy1 - sy0

    rx = px - cx     # (1, P)
    ry = py - cy
    denom = rx * sdy - ry * sdx       # (S, P)
    with np.errstate(divide="ignore", invalid="ignore"):
        safe = np.where(np.abs(denom) > 1e-9, denom, np.nan)
        t = ((sx0 - cx) * sdy - (sy0 - cy) * sdx) / safe
        s = ((sx0 - cx) * ry - (sy0 - cy) * rx) / safe
    blocked = (t > 0.01) & (t < 0.99) & (s > 0.0) & (s < 1.0)
    blocked = np.nan_to_num(blocked, nan=False)
    # Skip walls the camera is sitting on — distance < 5 cm
    cam_to_seg = _vec_point_seg_distance(cx, cy, segs)
    keep = cam_to_seg >= 0.05
    blocked = blocked & keep[:, None]

    any_blocked = blocked.any(axis=0)
    return ~any_blocked


def _vec_point_seg_distance(cx, cy, segs):
    """Vectorized point-to-segment distance, segs shape (N, 4)."""
    x0, y0, x1, y1 = segs[:, 0], segs[:, 1], segs[:, 2], segs[:, 3]
    dx, dy = x1 - x0, y1 - y0
    len2 = dx * dx + dy * dy
    with np.errstate(divide="ignore", invalid="ignore"):
        t = np.where(len2 > 0, ((cx - x0) * dx + (cy - y0) * dy) / len2, 0.0)
    t = np.clip(t, 0.0, 1.0)
    proj_x = x0 + t * dx
    proj_y = y0 + t * dy
    return np.hypot(cx - proj_x, cy - proj_y)


def _point_segment_distance(px, py, x0, y0, x1, y1) -> float:
    dx, dy = x1 - x0, y1 - y0
    if dx == 0 and dy == 0:
        return float(np.hypot(px - x0, py - y0))
    t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)))
    return float(np.hypot(px - (x0 + t * dx), py - (y0 + t * dy)))


def compute_coverage(scene: dict, cameras: list) -> dict:
    """
    Coverage with real wall + obstruction occlusion.
    A cell is covered iff at least one camera has it in FOV AND with clear LoS.
    """
    floor_points = build_floor_grid(scene["bounds"])
    total = len(floor_points)
    if total == 0:
        return {"coverage_pct": 0.0, "covered_points": 0, "total_points": 0, "per_camera_coverage": {}}

    segments = _wall_segments(scene)
    aabbs = _obstruction_aabbs(scene)

    covered = np.zeros(total, dtype=bool)
    per_camera: dict[str, float] = {}
    for cam in cameras:
        cam_pos = np.array(cam["position"], dtype=float)
        target = np.array(cam["target"], dtype=float)
        fov_mask = camera_fov_mask(cam_pos, target, cam["fov_h"], cam["fov_v"], floor_points)
        # only test occlusion for cells already in FOV — saves work
        idx = np.where(fov_mask)[0]
        if len(idx):
            vis = occlusion_mask(cam_pos[:2], floor_points[idx, :2], segments, aabbs)
            visible_idx = idx[vis]
            cam_mask = np.zeros(total, dtype=bool)
            cam_mask[visible_idx] = True
        else:
            cam_mask = np.zeros(total, dtype=bool)
        per_camera[cam["id"]] = float(cam_mask.sum() / total * 100)
        covered |= cam_mask

    return {
        "coverage_pct": float(covered.sum() / total * 100),
        "covered_points": int(covered.sum()),
        "total_points": total,
        "per_camera_coverage": per_camera,
    }


def compute_per_camera_coverage(scene: dict, cameras: list, resolution: float = 0.2) -> dict:
    """
    For the 3D coverage map: returns per-camera visibility on a regular floor grid,
    encoded as grid-index tuples so the frontend can efficiently instance-mesh them.
    """
    bounds = scene["bounds"]
    x_min, y_min = float(bounds["min"][0]), float(bounds["min"][1])
    x_max, y_max = float(bounds["max"][0]), float(bounds["max"][1])
    nx = max(1, int(np.ceil((x_max - x_min) / resolution)))
    ny = max(1, int(np.ceil((y_max - y_min) / resolution)))
    xs = x_min + (np.arange(nx) + 0.5) * resolution
    ys = y_min + (np.arange(ny) + 0.5) * resolution
    xx, yy = np.meshgrid(xs, ys)  # (ny, nx)
    points_xy = np.column_stack([xx.ravel(), yy.ravel()])
    points_3d = np.column_stack([points_xy, np.zeros(len(points_xy))])

    segments = _wall_segments(scene)
    aabbs = _obstruction_aabbs(scene)

    out_cameras: list[dict] = []
    union_mask = np.zeros(len(points_xy), dtype=bool)
    for cam in cameras:
        cam_pos = np.array(cam["position"], dtype=float)
        target = np.array(cam["target"], dtype=float)
        fov = camera_fov_mask(cam_pos, target, cam["fov_h"], cam["fov_v"], points_3d)
        idx_in_fov = np.where(fov)[0]
        cam_mask = np.zeros(len(points_xy), dtype=bool)
        if len(idx_in_fov):
            vis = occlusion_mask(cam_pos[:2], points_xy[idx_in_fov], segments, aabbs)
            cam_mask[idx_in_fov[vis]] = True
        union_mask |= cam_mask

        # Re-encode flat indices → (col, row)
        flat_idx = np.where(cam_mask)[0]
        cols = (flat_idx % nx).astype(int).tolist()
        rows = (flat_idx // nx).astype(int).tolist()
        out_cameras.append({
            "id": cam["id"],
            "label": cam.get("label", cam["id"]),
            "type": cam.get("type", ""),
            "position": list(cam["position"]),
            "covered_cells": list(zip(cols, rows)),
            "covered_count": int(cam_mask.sum()),
        })

    return {
        "bounds": {"min": [x_min, y_min], "max": [x_max, y_max]},
        "resolution": resolution,
        "shape": [int(ny), int(nx)],
        "total_cells": int(len(points_xy)),
        "covered_cells": int(union_mask.sum()),
        "coverage_pct": float(union_mask.sum() / len(points_xy) * 100) if len(points_xy) else 0.0,
        "cameras": out_cameras,
    }


def per_camera_visibility(scene: dict, cameras: list, points_xy: np.ndarray) -> np.ndarray:
    """
    For optimizer use: returns (n_cameras, n_points) boolean visibility matrix,
    operating on a caller-provided 2D point set rather than the full floor grid.
    """
    if not cameras or len(points_xy) == 0:
        return np.zeros((len(cameras), len(points_xy)), dtype=bool)

    segments = _wall_segments(scene)
    aabbs = _obstruction_aabbs(scene)
    points_3d = np.column_stack([points_xy, np.zeros(len(points_xy))])

    out = np.zeros((len(cameras), len(points_xy)), dtype=bool)
    for i, cam in enumerate(cameras):
        cam_pos = np.array(cam["position"], dtype=float)
        target = np.array(cam["target"], dtype=float)
        fov_mask = camera_fov_mask(cam_pos, target, cam["fov_h"], cam["fov_v"], points_3d)
        idx = np.where(fov_mask)[0]
        if len(idx):
            vis = occlusion_mask(cam_pos[:2], points_xy[idx], segments, aabbs)
            out[i, idx[vis]] = True
    return out

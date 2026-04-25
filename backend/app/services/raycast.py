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


def compute_coverage(scene: dict, cameras: list) -> dict:
    """
    Main coverage computation.
    Returns coverage_pct and per-camera visible point sets.

    TODO: wire up occlusion against scene["walls"] and scene["obstructions"]
    Currently uses FOV-only coverage (no occlusion) as a starting stub.
    """
    floor_points = build_floor_grid(scene["bounds"])
    total = len(floor_points)
    covered = np.zeros(total, dtype=bool)

    per_camera: dict[str, float] = {}
    for cam in cameras:
        cam_pos = np.array(cam["position"], dtype=float)
        target = np.array(cam["target"], dtype=float)
        mask = camera_fov_mask(cam_pos, target, cam["fov_h"], cam["fov_v"], floor_points)
        per_camera[cam["id"]] = float(mask.sum() / total * 100)
        covered |= mask

    return {
        "coverage_pct": float(covered.sum() / total * 100),
        "covered_points": int(covered.sum()),
        "total_points": total,
        "per_camera_coverage": per_camera,
    }

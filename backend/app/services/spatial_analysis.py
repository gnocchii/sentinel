"""
Task 1 — Spatial Segmentation & JSONification

Pipeline:
  PLY  →  RANSAC floor/walls  →  DBSCAN obstacles  →  doorway gaps  →  Spatial Manifest JSON

All distances are in metres. Coordinate axes:
  X = east, Y = north, Z = up (right-hand, Z-up)
"""
from __future__ import annotations

import json
import numpy as np
from pathlib import Path


# ─── Tuneable constants ──────────────────────────────────────────

RANSAC_DIST_THRESH  = 0.03   # metres — point within this distance = inlier
RANSAC_N            = 3      # min points to fit a plane
RANSAC_ITERS        = 2000
PLANE_MIN_INLIERS   = 0.05   # fraction of cloud that must be inliers to accept a plane
MAX_WALLS           = 6      # maximum wall planes to extract
WALL_NORMAL_Z_MAX   = 0.25   # |normal.z| below this → near-vertical → it's a wall
FLOOR_NORMAL_Z_MIN  = 0.85   # |normal.z| above this → near-horizontal → it's a floor/ceiling

DBSCAN_EPS          = 0.12   # metres — neighbourhood radius for DBSCAN
DBSCAN_MIN_PTS      = 15     # min points to form a cluster

DOOR_WIDTH_MIN      = 0.70   # metres
DOOR_WIDTH_MAX      = 2.50
DOOR_HEIGHT_MIN     = 1.80
WINDOW_HEIGHT_MIN   = 0.40   # gap above floor → probably a window


# ─── Main entry point ────────────────────────────────────────────

def analyze_pointcloud(ply_path: str | Path) -> dict:
    """
    Full pipeline. Returns the Spatial Manifest as a Python dict (JSON-serialisable).
    """
    import open3d as o3d  # lazy import — not needed unless a PLY is actually uploaded
    pcd = o3d.io.read_point_cloud(str(ply_path))
    if len(pcd.points) == 0:
        raise ValueError(f"Empty point cloud: {ply_path}")

    pts = np.asarray(pcd.points)
    manifest = {
        "scene_metadata":      _scene_metadata(pts),
        "structural_planes":   {},
        "obstacles":           [],
        "entry_candidates":    [],
        "sight_line_summary":  {},
    }

    remaining = pcd
    labels_assigned = np.full(len(pts), -1, dtype=int)  # -1 = unclassified

    # ── Floor ────────────────────────────────────────────────────
    floor_result = _extract_floor(remaining)
    if floor_result:
        floor_info, floor_indices, remaining = floor_result
        manifest["structural_planes"]["floor"] = floor_info
        labels_assigned[floor_indices] = 0   # 0 = floor

    # ── Walls ────────────────────────────────────────────────────
    walls = []
    wall_pcds = []
    for _ in range(MAX_WALLS):
        result = _extract_wall(remaining, len(pts))
        if not result:
            break
        wall_info, wall_indices_in_remaining, wall_pcd, remaining = result
        wall_info["id"] = f"W{len(walls)}"
        walls.append(wall_info)
        wall_pcds.append(wall_pcd)

    manifest["structural_planes"]["walls"] = walls

    # ── Obstacles (DBSCAN on what's left) ────────────────────────
    obstacles = _extract_obstacles(remaining)
    manifest["obstacles"] = obstacles

    # ── Doorway / window candidates ──────────────────────────────
    entries = _detect_entries(walls, wall_pcds, manifest["structural_planes"].get("floor"))
    manifest["entry_candidates"] = entries

    # ── Sight-line summary ───────────────────────────────────────
    manifest["sight_line_summary"] = _sight_line_summary(obstacles, manifest["scene_metadata"])

    return manifest


def save_manifest(manifest: dict, out_path: str | Path) -> None:
    Path(out_path).write_text(json.dumps(manifest, indent=2))


# ─── Floor extraction ────────────────────────────────────────────

def _extract_floor(pcd):
    pts = np.asarray(pcd.points)
    if len(pts) < RANSAC_N:
        return None

    plane_model, inliers = pcd.segment_plane(
        distance_threshold=RANSAC_DIST_THRESH,
        ransac_n=RANSAC_N,
        num_iterations=RANSAC_ITERS,
    )
    a, b, c, d = plane_model
    normal = np.array([a, b, c])
    normal /= (np.linalg.norm(normal) + 1e-9)

    # Floor normal must be nearly vertical
    if abs(normal[2]) < FLOOR_NORMAL_Z_MIN:
        return None
    if len(inliers) < PLANE_MIN_INLIERS * len(pts):
        return None

    floor_pts = pts[inliers]
    z_elev = float(np.median(floor_pts[:, 2]))

    floor_info = {
        "z_elevation_m": round(z_elev, 3),
        "plane_equation": {"a": round(a, 4), "b": round(b, 4), "c": round(c, 4), "d": round(d, 4)},
        "coverage_bounds": _bounds2d(floor_pts),
    }

    remaining = pcd.select_by_index(inliers, invert=True)
    return floor_info, inliers, remaining


# ─── Wall extraction ─────────────────────────────────────────────

def _extract_wall(pcd, total_pts: int):
    pts = np.asarray(pcd.points)
    if len(pts) < RANSAC_N * 10:
        return None

    plane_model, inliers = pcd.segment_plane(
        distance_threshold=RANSAC_DIST_THRESH,
        ransac_n=RANSAC_N,
        num_iterations=RANSAC_ITERS,
    )
    a, b, c, d = plane_model
    normal = np.array([a, b, c])
    normal /= (np.linalg.norm(normal) + 1e-9)

    if abs(normal[2]) > WALL_NORMAL_Z_MAX:
        # This plane is too horizontal — skip it (ceiling or furniture top)
        # Remove inliers anyway to avoid looping forever
        remaining = pcd.select_by_index(inliers, invert=True)
        return _extract_wall(remaining, total_pts)

    if len(inliers) < PLANE_MIN_INLIERS * total_pts:
        return None

    wall_pcd  = pcd.select_by_index(inliers)
    remaining = pcd.select_by_index(inliers, invert=True)
    wall_pts  = np.asarray(wall_pcd.points)

    # Dominant axis from normal
    abs_n = np.abs(normal[:2])
    direction = "east/west (+X)" if abs_n[0] > abs_n[1] else "north/south (+Y)"

    wall_info = {
        "id": "",   # filled by caller
        "normal": [round(float(n), 3) for n in normal],
        "direction": direction,
        "plane_equation": {"a": round(a, 4), "b": round(b, 4), "c": round(c, 4), "d": round(d, 4)},
        "extent": _bounds3d(wall_pts),
        "length_m": round(float(_wall_length(wall_pts, normal)), 2),
        "height_m": round(float(wall_pts[:, 2].max() - wall_pts[:, 2].min()), 2),
        "point_count": len(inliers),
    }

    return wall_info, inliers, wall_pcd, remaining


# ─── Obstacle extraction (DBSCAN) ────────────────────────────────

def _extract_obstacles(pcd) -> list[dict]:
    pts = np.asarray(pcd.points)
    if len(pts) < DBSCAN_MIN_PTS:
        return []

    labels = np.array(pcd.cluster_dbscan(eps=DBSCAN_EPS, min_points=DBSCAN_MIN_PTS, print_progress=False))
    obstacles = []

    for label in set(labels):
        if label < 0:
            continue  # noise
        mask   = labels == label
        cluster = pts[mask]
        if len(cluster) < DBSCAN_MIN_PTS:
            continue

        bb    = _bounds3d(cluster)
        dims  = {
            "width_m":  round(bb["xmax"] - bb["xmin"], 2),
            "depth_m":  round(bb["ymax"] - bb["ymin"], 2),
            "height_m": round(bb["zmax"] - bb["zmin"], 2),
        }
        centroid = cluster.mean(axis=0)
        occlusion = round(dims["width_m"] * dims["depth_m"], 2)

        obstacles.append({
            "id": f"OBS_{len(obstacles)}",
            "point_count": int(mask.sum()),
            "centroid_xyz": [round(float(v), 2) for v in centroid],
            "bounding_box": bb,
            "dimensions_m": dims,
            "occlusion_floor_area_m2": occlusion,
        })

    # Sort by occlusion size descending (most problematic first)
    obstacles.sort(key=lambda o: o["occlusion_floor_area_m2"], reverse=True)
    return obstacles


# ─── Entry candidate detection ───────────────────────────────────

def _detect_entries(walls: list[dict], wall_pcds: list, floor_info: dict | None) -> list[dict]:
    """
    For each wall, project its points onto the wall's primary axis and find
    gaps that match door or window dimensions.
    """
    entries = []
    floor_z = floor_info["z_elevation_m"] if floor_info else 0.0

    for wall, wall_pcd in zip(walls, wall_pcds):
        pts = np.asarray(wall_pcd.points)
        if len(pts) < 10:
            continue

        normal = np.array(wall["normal"])
        abs_n  = np.abs(normal[:2])
        # Project onto the axis perpendicular to the normal (the "along" axis)
        along_axis = 1 if abs_n[0] > abs_n[1] else 0  # Y if wall faces X, X if wall faces Y

        along_vals = pts[:, along_axis]
        z_vals     = pts[:, 2]

        # Bin the points along the wall axis in 5cm bins
        a_min, a_max = along_vals.min(), along_vals.max()
        bin_size = 0.05
        bins = np.arange(a_min, a_max + bin_size, bin_size)

        for i in range(len(bins) - 1):
            in_bin = (along_vals >= bins[i]) & (along_vals < bins[i + 1])
            # This bin has no points → potential gap
            if in_bin.sum() < 3:
                continue

        # Simpler: find contiguous gap regions
        resolution = 0.05
        grid = np.zeros(int((a_max - a_min) / resolution) + 1, dtype=bool)
        for v in along_vals:
            idx = int((v - a_min) / resolution)
            if 0 <= idx < len(grid):
                grid[idx] = True

        # Find runs of False (gaps)
        gap_start = None
        for idx, occupied in enumerate(grid):
            if not occupied and gap_start is None:
                gap_start = idx
            elif occupied and gap_start is not None:
                gap_width = (idx - gap_start) * resolution
                if DOOR_WIDTH_MIN <= gap_width <= DOOR_WIDTH_MAX:
                    gap_center_along = a_min + (gap_start + (idx - gap_start) / 2) * resolution

                    # Estimate wall's perpendicular coordinate from plane equation
                    peq = wall["plane_equation"]
                    # ax+by+cz+d=0, for points near this wall normal gives ~fixed coord
                    perp_axis = 0 if abs_n[0] > abs_n[1] else 1
                    if abs(peq["a"]) > abs(peq["b"]):
                        perp_val = -peq["d"] / (peq["a"] + 1e-9)
                    else:
                        perp_val = -peq["d"] / (peq["b"] + 1e-9)

                    pos = [0.0, 0.0, floor_z + 1.0]
                    pos[along_axis] = round(float(gap_center_along), 2)
                    pos[perp_axis]  = round(float(perp_val), 2)

                    # Check if gap starts near floor → door; else → window
                    gap_pts_z = z_vals[(along_vals >= a_min + gap_start * resolution) &
                                       (along_vals <= a_min + idx * resolution)]
                    gap_bottom = float(gap_pts_z.min()) if len(gap_pts_z) > 0 else floor_z
                    entry_type = "door" if gap_bottom < floor_z + 0.3 else "window"

                    entries.append({
                        "id":          f"ENTRY_{len(entries)}",
                        "wall_id":     wall["id"],
                        "type":        entry_type,
                        "position_xyz": pos,
                        "gap_width_m": round(float(gap_width), 2),
                        "threat_weight": 1.0 if entry_type == "door" else 0.6,
                    })
                gap_start = None

    return entries


# ─── Helpers ─────────────────────────────────────────────────────

def _scene_metadata(pts: np.ndarray) -> dict:
    bb = _bounds3d(pts)
    dx = bb["xmax"] - bb["xmin"]
    dy = bb["ymax"] - bb["ymin"]
    dz = bb["zmax"] - bb["zmin"]
    return {
        "point_count": len(pts),
        "bounds": bb,
        "estimated_floor_area_m2": round(dx * dy, 1),
        "estimated_ceiling_height_m": round(dz, 2),
    }


def _bounds3d(pts: np.ndarray) -> dict:
    return {
        "xmin": round(float(pts[:, 0].min()), 3), "xmax": round(float(pts[:, 0].max()), 3),
        "ymin": round(float(pts[:, 1].min()), 3), "ymax": round(float(pts[:, 1].max()), 3),
        "zmin": round(float(pts[:, 2].min()), 3), "zmax": round(float(pts[:, 2].max()), 3),
    }


def _bounds2d(pts: np.ndarray) -> dict:
    return {
        "xmin": round(float(pts[:, 0].min()), 3), "xmax": round(float(pts[:, 0].max()), 3),
        "ymin": round(float(pts[:, 1].min()), 3), "ymax": round(float(pts[:, 1].max()), 3),
    }


def _wall_length(pts: np.ndarray, normal: np.ndarray) -> float:
    # Length = extent along the axis perpendicular to the wall normal (in XY)
    along = np.array([-normal[1], normal[0], 0])  # 90° rotation in XY
    projected = pts @ along
    return projected.max() - projected.min()


def _sight_line_summary(obstacles: list[dict], meta: dict) -> dict:
    total_occ = sum(o["occlusion_floor_area_m2"] for o in obstacles)
    floor_area = meta["estimated_floor_area_m2"]
    if floor_area > 0:
        open_pct = round(max(0, (floor_area - total_occ) / floor_area * 100), 1)
    else:
        open_pct = 0.0

    largest = max(obstacles, key=lambda o: o["occlusion_floor_area_m2"]) if obstacles else None
    return {
        "total_obstacles": len(obstacles),
        "total_occlusion_area_m2": round(total_occ, 2),
        "estimated_open_sightlines_pct": open_pct,
        "largest_obstacle": (
            f"{largest['dimensions_m']['width_m']}m x {largest['dimensions_m']['depth_m']}m x "
            f"{largest['dimensions_m']['height_m']}m at {largest['centroid_xyz']}"
        ) if largest else "none",
    }

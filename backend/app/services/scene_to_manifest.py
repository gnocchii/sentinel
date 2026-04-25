"""
Convert avery_house.json scene geometry into the Spatial Manifest JSON format
that K2 spatial expects, without requiring a PLY file or open3d.
"""

import math


def scene_to_manifest(scene: dict) -> dict:
    bounds_min = scene["bounds"]["min"]  # [0, 0, 0]
    bounds_max = scene["bounds"]["max"]  # [12, 8, 3]
    walls       = scene.get("walls", [])
    obstructions = scene.get("obstructions", [])
    entry_points = scene.get("entry_points", [])

    # ── Walls ─────────────────────────────────────────────────────
    manifest_walls = []
    for w in walls:
        frm = w["from"]
        to  = w["to"]
        dx  = to[0] - frm[0]
        dy  = to[1] - frm[1]
        length    = math.sqrt(dx ** 2 + dy ** 2)
        direction = "x-axis" if abs(dx) > abs(dy) else "y-axis"
        manifest_walls.append({
            "id":        w["id"],
            "direction": direction,
            "length_m":  round(length, 2),
            "height_m":  float(w["height"]),
            "extent": {
                "xmin": min(frm[0], to[0]),
                "xmax": max(frm[0], to[0]),
                "ymin": min(frm[1], to[1]),
                "ymax": max(frm[1], to[1]),
                "zmin": 0.0,
                "zmax": float(w["height"]),
            },
        })

    # ── Obstacles ─────────────────────────────────────────────────
    obstacles       = []
    total_occlusion = 0.0
    for obs in obstructions:
        bb   = obs["bounds"]
        mn   = bb["min"]
        mx   = bb["max"]
        w_d  = mx[0] - mn[0]
        d_d  = mx[1] - mn[1]
        h_d  = mx[2] - mn[2]
        area = w_d * d_d
        total_occlusion += area
        obstacles.append({
            "id":          obs["id"],
            "centroid_xyz": [
                round((mn[0] + mx[0]) / 2, 2),
                round((mn[1] + mx[1]) / 2, 2),
                round((mn[2] + mx[2]) / 2, 2),
            ],
            "bounding_box": {
                "xmin": mn[0], "xmax": mx[0],
                "ymin": mn[1], "ymax": mx[1],
                "zmin": mn[2], "zmax": mx[2],
            },
            "dimensions_m": {
                "width_m": round(w_d, 2),
                "depth_m": round(d_d, 2),
                "height_m": round(h_d, 2),
            },
            "occlusion_floor_area_m2": round(area, 2),
        })

    # ── Entry candidates ──────────────────────────────────────────
    def _wall_id_from_normal(normal):
        nx, ny = normal[0], normal[1]
        if nx < 0:  return "w_west"
        if nx > 0:  return "w_east"
        if ny < 0:  return "w_south"
        return "w_north"

    entry_candidates = []
    for e in entry_points:
        entry_candidates.append({
            "id":           e["id"],
            "type":         e["type"],
            "wall_id":      _wall_id_from_normal(e["normal"]),
            "position_xyz": e["position"],
            "gap_width_m":  e["width"],
            "threat_weight": e["threat_weight"],
        })

    # ── Summary ───────────────────────────────────────────────────
    total_floor = (bounds_max[0] - bounds_min[0]) * (bounds_max[1] - bounds_min[1])
    open_pct    = round((total_floor - total_occlusion) / total_floor * 100, 1)
    largest     = max(obstacles, key=lambda x: x["occlusion_floor_area_m2"])["id"] if obstacles else None

    return {
        "scene_metadata": {
            "point_count": 50000,
            "estimated_floor_area_m2": scene.get("floor_area_m2", round(total_floor, 1)),
            "estimated_ceiling_height_m": round(bounds_max[2] - bounds_min[2], 2),
            "bounds": {
                "xmin": bounds_min[0], "xmax": bounds_max[0],
                "ymin": bounds_min[1], "ymax": bounds_max[1],
                "zmin": bounds_min[2], "zmax": bounds_max[2],
            },
        },
        "structural_planes": {
            "floor": {"z_elevation_m": float(bounds_min[2])},
            "walls": manifest_walls,
        },
        "obstacles":        obstacles,
        "entry_candidates": entry_candidates,
        "sight_line_summary": {
            "estimated_open_sightlines_pct": open_pct,
            "total_occlusion_area_m2":       round(total_occlusion, 2),
            "largest_obstacle":              largest,
        },
        "_source": "avery_house_json",
    }

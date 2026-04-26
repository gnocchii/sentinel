"""
USDZ → scene JSON parser for Polycam Floorplan/Room Mode exports.

Polycam writes per-element labeled meshes inside a .usda text file:
  - wall_*       → wall geometry
  - door_*       → door geometry (entry points)
  - joint_*      → wall corners (ignored)
  - floor_<RoomLabel>_N → floor footprint, room label embedded in name
  - <category>_* → furniture (table_*, chair_*, ...) → obstructions

Coordinate convention: Polycam uses Y-up; existing scene schema is Z-up.
We swap (x, y, z) → (x, z, y - floor_min) so the floor sits at scene_z = 0.
"""
from __future__ import annotations

import json
import math
import re
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Iterable


_MESH_RE = re.compile(
    r'def\s+Mesh\s+"([^"]+)"\s*\{(.*?)^\s*\}',
    re.DOTALL | re.MULTILINE,
)
_POINTS_RE = re.compile(r"point3f\[\]\s+points\s*=\s*\[(.*?)\]", re.DOTALL)
_TUPLE_RE = re.compile(r"\(([^)]+)\)")

# Recognized furniture prefixes (anything else with these prefixes becomes an obstruction)
_FURNITURE_PREFIXES = (
    "table", "chair", "sofa", "bed", "desk", "cabinet",
    "fridge", "oven", "sink", "toilet", "bathtub", "shower",
    "tv", "stairs", "shelf", "stove",
)


def parse_usdz(usdz_path: str | Path, scene_id: str | None = None) -> dict:
    """Top-level entry: USDZ file in, scene dict out (matching avery_house.json shape)."""
    usdz_path = Path(usdz_path)
    with zipfile.ZipFile(usdz_path) as zf:
        usda_name = next(n for n in zf.namelist() if n.endswith(".usda"))
        usda_text = zf.read(usda_name).decode("utf-8")

    return parse_usda(usda_text, scene_id or usdz_path.stem)


def parse_usda(usda_text: str, scene_id: str) -> dict:
    """Parse the .usda text content into a scene dict."""
    meshes = list(_iter_meshes(usda_text))

    # Find vertical floor level so we can offset Z to start at 0
    floor_y_pc = _floor_y(meshes)

    # Group meshes by category
    walls = [m for m in meshes if m["name"].startswith("wall_")]
    doors = [m for m in meshes if m["name"].startswith("door_")]
    floors = [m for m in meshes if m["name"].startswith("floor_")]
    furniture = [m for m in meshes if _is_furniture(m["name"])]

    # Convert Polycam Y-up to scene Z-up; vertical = (y_pc - floor_y_pc)
    def to_scene(p):
        x, y, z = p
        return (x, z, y - floor_y_pc)

    rooms = _build_rooms(floors, to_scene)
    wall_segments = _build_walls(walls, to_scene)
    entry_points = _build_entry_points(doors, to_scene, wall_segments)
    obstructions = _build_obstructions(furniture, to_scene)

    bounds = _scene_bounds(rooms, wall_segments, obstructions)

    scene = {
        "id": scene_id,
        "name": scene_id.replace("_", " ").title(),
        "floor_area_m2": round(sum(r["area_m2"] for r in rooms), 2),
        "bounds": bounds,
        "rooms": [_room_for_scene(r) for r in rooms],
        "walls": wall_segments,
        "entry_points": entry_points,
        "obstructions": obstructions,
        "windows_solar": [],
        "cameras": [],
        "analysis": {
            "coverage_pct": 0.0,
            "entry_points_covered": 0,
            "entry_points_total": len(entry_points),
            "blind_spots": [],
            "overlap_zones": 0,
            "total_cost_usd": 0.0,
            "lighting_risks": [],
        },
        "_raw_rooms": rooms,  # keeps polygon footprints for the importance rasterizer
    }
    return scene


def write_scene(scene: dict, out_dir: str | Path) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{scene['id']}.json"
    out_path.write_text(json.dumps(scene, indent=2))
    return out_path


# ─── mesh extraction ──────────────────────────────────────────────


def _iter_meshes(text: str) -> Iterable[dict]:
    for m in _MESH_RE.finditer(text):
        name = m.group(1)
        body = m.group(2)
        pts_match = _POINTS_RE.search(body)
        if not pts_match:
            continue
        coords = []
        for tup in _TUPLE_RE.finditer(pts_match.group(1)):
            try:
                x, y, z = (float(v.strip()) for v in tup.group(1).split(","))
                coords.append((x, y, z))
            except ValueError:
                continue
        if coords:
            yield {"name": name, "points": coords}


def _is_furniture(name: str) -> bool:
    return any(name.startswith(p + "_") for p in _FURNITURE_PREFIXES)


def _floor_y(meshes: list[dict]) -> float:
    """Lowest y-coordinate across floor meshes; falls back to global min."""
    floor_pts = [p for m in meshes if m["name"].startswith("floor_") for p in m["points"]]
    if floor_pts:
        return min(p[1] for p in floor_pts)
    all_pts = [p for m in meshes for p in m["points"]]
    return min(p[1] for p in all_pts) if all_pts else 0.0


# ─── rooms ────────────────────────────────────────────────────────


def _build_rooms(floor_meshes: list[dict], to_scene) -> list[dict]:
    """
    Polycam emits two floor meshes per room (top + bottom face) sharing a centroid.
    Group by approximate centroid (in scene coords), then build a polygon footprint
    from the union of unique 2D points.
    """
    groups: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for m in floor_meshes:
        scene_pts = [to_scene(p) for p in m["points"]]
        cx = sum(p[0] for p in scene_pts) / len(scene_pts)
        cy = sum(p[1] for p in scene_pts) / len(scene_pts)
        # 0.1 m centroid bucket — robust enough for top/bottom face pairing
        key = (round(cx, 1), round(cy, 1))
        groups[key].append({"mesh": m, "points": scene_pts})

    rooms: list[dict] = []
    for idx, (_, items) in enumerate(sorted(groups.items())):
        all_pts = [p for it in items for p in it["points"]]
        # Polygon = unique XY points along the floor, ordered around the centroid
        unique = _unique_xy(all_pts)
        polygon = _ccw_polygon(unique)
        label = _room_label_from_name(items[0]["mesh"]["name"])
        cx = sum(p[0] for p in polygon) / len(polygon)
        cy = sum(p[1] for p in polygon) / len(polygon)
        size_x = max(p[0] for p in polygon) - min(p[0] for p in polygon)
        size_y = max(p[1] for p in polygon) - min(p[1] for p in polygon)
        rooms.append({
            "id": f"room_{idx}",
            "raw_label": label,
            "polygon": polygon,
            "center": [cx, cy],
            "size": [size_x, size_y],
            "area_m2": _polygon_area(polygon),
        })
    return rooms


def _room_label_from_name(name: str) -> str:
    """`floor_Other_3` → 'Other'. `floor_Bedroom_2` → 'Bedroom'."""
    parts = name.split("_")
    if len(parts) >= 2:
        return parts[1]
    return "Unknown"


def _unique_xy(points: list[tuple[float, float, float]], tol: float = 0.02) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for x, y, _ in points:
        if not any(abs(x - ox) < tol and abs(y - oy) < tol for ox, oy in out):
            out.append((x, y))
    return out


def _ccw_polygon(points: list[tuple[float, float]]) -> list[list[float]]:
    """Order points counter-clockwise around their centroid."""
    if len(points) < 3:
        return [list(p) for p in points]
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    sorted_pts = sorted(points, key=lambda p: math.atan2(p[1] - cy, p[0] - cx))
    return [list(p) for p in sorted_pts]


def _polygon_area(polygon: list[list[float]]) -> float:
    if len(polygon) < 3:
        return 0.0
    total = 0.0
    for i, (x1, y1) in enumerate(polygon):
        x2, y2 = polygon[(i + 1) % len(polygon)]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2.0


def _room_for_scene(r: dict) -> dict:
    """Strip parser-internal fields; keep what the existing schema expects."""
    poly = r["polygon"]
    min_x = min(p[0] for p in poly)
    max_x = max(p[0] for p in poly)
    min_y = min(p[1] for p in poly)
    max_y = max(p[1] for p in poly)
    return {
        "id": r["id"],
        "label": r["raw_label"],
        "priority": "medium",  # K2 will override this in Phase 2
        "bounds": {"min": [min_x, min_y, 0.0], "max": [max_x, max_y, 3.0]},
    }


# ─── walls ────────────────────────────────────────────────────────


def _build_walls(wall_meshes: list[dict], to_scene) -> list[dict]:
    """Each wall mesh → one line segment along its dominant horizontal axis."""
    walls: list[dict] = []
    for m in wall_meshes:
        scene_pts = [to_scene(p) for p in m["points"]]
        xs = [p[0] for p in scene_pts]
        ys = [p[1] for p in scene_pts]
        zs = [p[2] for p in scene_pts]
        dx = max(xs) - min(xs)
        dy = max(ys) - min(ys)
        if dx >= dy:
            mid_y = (min(ys) + max(ys)) / 2
            seg = ([min(xs), mid_y], [max(xs), mid_y])
        else:
            mid_x = (min(xs) + max(xs)) / 2
            seg = ([mid_x, min(ys)], [mid_x, max(ys)])
        height = max(zs) - min(zs) if zs else 3.0
        walls.append({
            "id": m["name"],
            "from": seg[0],
            "to": seg[1],
            "height": round(max(height, 1.0), 2),
        })
    return walls


# ─── entry points (doors) ─────────────────────────────────────────


def _build_entry_points(door_meshes: list[dict], to_scene, walls: list[dict]) -> list[dict]:
    """Each door mesh → centroid + width; normal estimated from the nearest wall."""
    entries: list[dict] = []
    seen_centers: list[tuple[float, float]] = []
    for m in door_meshes:
        scene_pts = [to_scene(p) for p in m["points"]]
        xs = [p[0] for p in scene_pts]
        ys = [p[1] for p in scene_pts]
        cx = (min(xs) + max(xs)) / 2
        cy = (min(ys) + max(ys)) / 2
        # Polycam ships top+bottom door faces; collapse duplicates within 0.3 m
        if any(math.hypot(cx - sx, cy - sy) < 0.3 for sx, sy in seen_centers):
            continue
        seen_centers.append((cx, cy))
        width = max(max(xs) - min(xs), max(ys) - min(ys))
        normal = _nearest_wall_normal(cx, cy, walls)
        entries.append({
            "id": f"door_{len(entries)}",
            "label": f"Door {len(entries) + 1}",
            "type": "door",
            "position": [round(cx, 3), round(cy, 3), 1.0],
            "normal": normal,
            "width": round(width, 2),
            "threat_weight": 1.0,
        })
    return entries


def _nearest_wall_normal(x: float, y: float, walls: list[dict]) -> list[float]:
    """Outward-facing normal of the nearest wall segment."""
    if not walls:
        return [1.0, 0.0, 0.0]
    best = None
    best_d = float("inf")
    for w in walls:
        x0, y0 = w["from"]
        x1, y1 = w["to"]
        d = _point_segment_distance(x, y, x0, y0, x1, y1)
        if d < best_d:
            best_d = d
            best = (x0, y0, x1, y1)
    x0, y0, x1, y1 = best
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy) or 1.0
    # Perpendicular to wall direction
    nx, ny = -dy / length, dx / length
    return [round(nx, 3), round(ny, 3), 0.0]


def _point_segment_distance(px, py, x0, y0, x1, y1) -> float:
    dx, dy = x1 - x0, y1 - y0
    if dx == 0 and dy == 0:
        return math.hypot(px - x0, py - y0)
    t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)))
    cx, cy = x0 + t * dx, y0 + t * dy
    return math.hypot(px - cx, py - cy)


# ─── obstructions (furniture) ─────────────────────────────────────


def _build_obstructions(furniture_meshes: list[dict], to_scene) -> list[dict]:
    obstructions: list[dict] = []
    for m in furniture_meshes:
        scene_pts = [to_scene(p) for p in m["points"]]
        xs = [p[0] for p in scene_pts]
        ys = [p[1] for p in scene_pts]
        zs = [p[2] for p in scene_pts]
        category = m["name"].split("_")[0]
        obstructions.append({
            "id": m["name"],
            "label": category.capitalize(),
            "category": category,
            "bounds": {
                "min": [round(min(xs), 3), round(min(ys), 3), round(min(zs), 3)],
                "max": [round(max(xs), 3), round(max(ys), 3), round(max(zs), 3)],
            },
        })
    return obstructions


# ─── scene bounds ─────────────────────────────────────────────────


def _scene_bounds(rooms, walls, obstructions) -> dict:
    xs, ys, zs = [], [], [0.0]
    for r in rooms:
        for x, y in r["polygon"]:
            xs.append(x); ys.append(y)
    for w in walls:
        xs.extend([w["from"][0], w["to"][0]])
        ys.extend([w["from"][1], w["to"][1]])
        zs.append(w["height"])
    for o in obstructions:
        xs.extend([o["bounds"]["min"][0], o["bounds"]["max"][0]])
        ys.extend([o["bounds"]["min"][1], o["bounds"]["max"][1]])
        zs.extend([o["bounds"]["min"][2], o["bounds"]["max"][2]])
    if not xs:
        return {"min": [0, 0, 0], "max": [10, 10, 3]}
    pad = 0.5
    return {
        "min": [round(min(xs) - pad, 2), round(min(ys) - pad, 2), 0.0],
        "max": [round(max(xs) + pad, 2), round(max(ys) + pad, 2), round(max(zs), 2) or 3.0],
    }


# ─── CLI for manual smoke-testing ─────────────────────────────────


if __name__ == "__main__":
    import sys
    usdz = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "backend/app/data/scenes"
    scene = parse_usdz(usdz)
    path = write_scene(scene, out_dir)
    print(f"wrote {path}")
    print(f"  rooms: {len(scene['rooms'])}")
    print(f"  walls: {len(scene['walls'])}")
    print(f"  doors: {len(scene['entry_points'])}")
    print(f"  obstructions: {len(scene['obstructions'])}")
    print(f"  bounds: {scene['bounds']}")

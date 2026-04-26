"""
Rasterize sparse K2 importance scores into a dense 2D top-down grid.

Each cell of a (W, H) numpy array gets a value in [0, 1]:
  - room base score: K2's score for whichever room polygon contains the cell
  - door bump: Gaussian peak at each door position, peak = door score
  - obstruction dim: 0 inside furniture footprints (cameras can't see through them
    onto the cell anyway, so don't reward coverage there)

The grid is what the optimizer integrates against to compute
importance-weighted coverage.
"""

import math
import numpy as np

from app.services import importance as imp_service


# 0.2 m per cell — same resolution as raycast.py, so the grid lines up
DEFAULT_RESOLUTION = 0.2

# Door influence radius in meters — beyond this, the bump is < 5% of peak
DOOR_SIGMA = 0.6


def build_importance_grid(
    scene: dict,
    scores: dict,
    resolution: float = DEFAULT_RESOLUTION,
) -> dict:
    """
    Returns:
      {
        "grid":       np.ndarray (H, W), values 0–1
        "bounds":     {"min": [x, y], "max": [x, y]}
        "resolution": float (meters per cell)
        "shape":      [H, W]
      }
    Note: shape is (rows=Y, cols=X) following image/numpy convention.
    """
    bounds = scene["bounds"]
    x_min, y_min = bounds["min"][0], bounds["min"][1]
    x_max, y_max = bounds["max"][0], bounds["max"][1]

    nx = max(1, int(math.ceil((x_max - x_min) / resolution)))
    ny = max(1, int(math.ceil((y_max - y_min) / resolution)))

    grid = np.zeros((ny, nx), dtype=np.float32)

    # World coords for each cell center
    xs = x_min + (np.arange(nx) + 0.5) * resolution
    ys = y_min + (np.arange(ny) + 0.5) * resolution
    xx, yy = np.meshgrid(xs, ys)  # both shape (ny, nx)

    # 1. Paint room base scores from the polygon footprints
    raw_rooms = scene.get("_raw_rooms") or []
    if raw_rooms:
        _paint_polygons(grid, xx, yy, raw_rooms, scores.get("rooms", {}))
    else:
        _paint_bboxes(grid, xx, yy, scene.get("rooms", []), scores.get("rooms", {}))

    # 2. Add Gaussian bumps around each door
    for door in scene.get("entry_points", []):
        score = scores.get("doors", {}).get(door["id"], {}).get("score", 0.9)
        dx = door["position"][0]
        dy = door["position"][1]
        # bump = score * exp(-r²/(2σ²)) ; cap so we don't exceed 1.0
        r2 = (xx - dx) ** 2 + (yy - dy) ** 2
        bump = score * np.exp(-r2 / (2 * DOOR_SIGMA ** 2))
        grid = np.maximum(grid, bump)

    # 3. Zero out furniture footprints — cells inside a couch aren't "seeable"
    for obs in scene.get("obstructions", []):
        b = obs["bounds"]
        mask = (
            (xx >= b["min"][0]) & (xx <= b["max"][0]) &
            (yy >= b["min"][1]) & (yy <= b["max"][1])
        )
        grid[mask] = 0.0

    return {
        "grid": grid,
        "bounds": {"min": [x_min, y_min], "max": [x_max, y_max]},
        "resolution": resolution,
        "shape": list(grid.shape),
    }


def to_payload(result: dict, scores: dict) -> dict:
    """Serialize the grid + scores for the frontend (numpy → list)."""
    return {
        "grid": result["grid"].tolist(),
        "bounds": result["bounds"],
        "resolution": result["resolution"],
        "shape": result["shape"],
        "rooms": [
            {
                "id": rid,
                "inferred_type": info.get("inferred_type", ""),
                "score": info.get("score", 0.0),
                "reason": info.get("reason", ""),
            }
            for rid, info in scores.get("rooms", {}).items()
        ],
        "doors": [
            {
                "id": did,
                "score": info.get("score", 0.0),
                "reason": info.get("reason", ""),
            }
            for did, info in scores.get("doors", {}).items()
        ],
    }


# ─── polygon rasterization (room footprints) ──────────────────────


def _paint_polygons(grid, xx, yy, raw_rooms, room_scores):
    """For each room, find cells inside its polygon and set them to the room score."""
    for r in raw_rooms:
        score = room_scores.get(r["id"], {}).get("score", 0.5)
        polygon = r.get("polygon") or []
        if len(polygon) < 3:
            continue
        mask = _polygon_mask(polygon, xx, yy)
        grid[mask] = np.maximum(grid[mask], score)


def _paint_bboxes(grid, xx, yy, rooms, room_scores):
    """Fallback when polygon data isn't available: paint bounding rectangles."""
    for r in rooms:
        b = r["bounds"]
        score = room_scores.get(r["id"], {}).get("score", 0.5)
        mask = (
            (xx >= b["min"][0]) & (xx <= b["max"][0]) &
            (yy >= b["min"][1]) & (yy <= b["max"][1])
        )
        grid[mask] = np.maximum(grid[mask], score)


def _polygon_mask(polygon: list[list[float]], xx, yy) -> np.ndarray:
    """Even-odd ray-casting: for each cell, count edge crossings of a horizontal ray."""
    mask = np.zeros_like(xx, dtype=bool)
    n = len(polygon)
    for i in range(n):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % n]
        # An edge contributes a crossing for cell (x, y) iff
        #   (y1 > y) != (y2 > y)  AND  x < x1 + (y - y1) * (x2 - x1) / (y2 - y1)
        cond_y = (y1 > yy) != (y2 > yy)
        with np.errstate(divide="ignore", invalid="ignore"):
            slope = (x2 - x1) / (y2 - y1) if y2 != y1 else 0.0
            x_intersect = x1 + (yy - y1) * slope
        crossing = cond_y & (xx < x_intersect)
        mask ^= crossing
    return mask


# ─── orchestration helper ─────────────────────────────────────────


async def score_and_rasterize(scene: dict, resolution: float = DEFAULT_RESOLUTION) -> dict:
    """One call: fetch K2 scores (cached), rasterize, return frontend payload."""
    scores = await imp_service.score_importance(scene)
    raster = build_importance_grid(scene, scores, resolution=resolution)
    payload = to_payload(raster, scores)
    payload["meta"] = scores.get("meta", {})
    return payload

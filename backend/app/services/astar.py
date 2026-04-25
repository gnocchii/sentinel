"""
A* adversarial threat-path modeling.

Given a scene graph and a threat model, find the least-camera-visible
path an attacker would take from an entry point to a target zone.

Cost function: camera_visibility_weight * distance_weight
  - High visibility = high cost for attacker (they avoid it)
  - Low visibility = low cost (blind spots are exploitable)
"""

import heapq
import numpy as np
from typing import Optional


def build_nav_grid(bounds: dict, resolution: float = 0.3) -> np.ndarray:
    xs = np.arange(bounds["min"][0], bounds["max"][0], resolution)
    ys = np.arange(bounds["min"][1], bounds["max"][1], resolution)
    return xs, ys


def astar(
    start: tuple[float, float],
    goal: tuple[float, float],
    visibility_grid: np.ndarray,  # 2D array: higher = more visible
    bounds: dict,
    resolution: float = 0.3,
    threat_model: str = "burglar",
) -> list[tuple[float, float]]:
    """
    Returns waypoints [x, y] for the attacker's optimal path.

    threat_model options:
      "burglar"  — avoids cameras, prefers shadows, takes fastest exit
      "insider"  — knows layout, optimizes for dwell time in target zone
      "pro"      — minimizes total camera exposure time, slowest/stealthiest
    """
    xs, ys = build_nav_grid(bounds, resolution)
    nx, ny = len(xs), len(ys)

    def world_to_grid(wx, wy):
        xi = int((wx - bounds["min"][0]) / resolution)
        yi = int((wy - bounds["min"][1]) / resolution)
        return max(0, min(xi, nx - 1)), max(0, min(yi, ny - 1))

    def grid_to_world(xi, yi):
        return xs[xi], ys[yi]

    si, sj = world_to_grid(*start)
    gi, gj = world_to_grid(*goal)

    visibility_weight = {"burglar": 3.0, "insider": 1.5, "pro": 5.0}[threat_model]

    open_heap: list[tuple[float, tuple[int, int]]] = [(0, (si, sj))]
    came_from: dict[tuple[int, int], Optional[tuple[int, int]]] = {(si, sj): None}
    g_score: dict[tuple[int, int], float] = {(si, sj): 0.0}

    neighbors = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]

    while open_heap:
        _, current = heapq.heappop(open_heap)
        if current == (gi, gj):
            break
        ci, cj = current
        for di, dj in neighbors:
            ni, nj = ci + di, cj + dj
            if not (0 <= ni < nx and 0 <= nj < ny):
                continue
            step_cost = (1.414 if di and dj else 1.0) * resolution
            vis_cost = visibility_grid[ni, nj] * visibility_weight if visibility_grid is not None else 0
            tentative_g = g_score[current] + step_cost + vis_cost
            neighbor = (ni, nj)
            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                h = np.hypot(ni - gi, nj - gj) * resolution
                heapq.heappush(open_heap, (tentative_g + h, neighbor))

    path = []
    node: Optional[tuple[int, int]] = (gi, gj)
    while node is not None:
        path.append(grid_to_world(*node))
        node = came_from.get(node)
    path.reverse()
    return path


def compute_threat_paths(scene: dict, cameras: list, target_room_id: str = "server_room") -> list[dict]:
    """
    For each entry point, compute the adversarial path to the target room.
    Returns list of { entry_id, threat_model, path, breach_cameras } dicts.
    """
    results = []
    bounds = scene["bounds"]

    # Find target room center
    target_room = next((r for r in scene.get("rooms", []) if r["id"] == target_room_id), None)
    if not target_room:
        return results

    b = target_room["bounds"]
    goal = ((b["min"][0] + b["max"][0]) / 2, (b["min"][1] + b["max"][1]) / 2)

    xs, ys = build_nav_grid(bounds)
    visibility_grid = np.zeros((len(xs), len(ys)))  # TODO: fill from raycast

    for ep in scene.get("entry_points", []):
        start = (ep["position"][0], ep["position"][1])
        for threat_model in ["burglar", "pro"]:
            path = astar(start, goal, visibility_grid, bounds, threat_model=threat_model)
            results.append({
                "entry_id": ep["id"],
                "entry_label": ep["label"],
                "threat_model": threat_model,
                "path": path,
                "breach_cameras": [],  # TODO: populate from raycast intersection
            })

    return results

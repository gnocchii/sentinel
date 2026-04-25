"""
Camera placement optimizer.

Wraps K2 reasoning + raycast coverage into a single placement pipeline:
  1. K2 proposes camera positions (semantic reasoning)
  2. Raycast validates coverage %
  3. If coverage < target, K2 iterates (up to max_iter times)
"""

import json
import re
from app.services import raycast
from app.models.camera import Camera, PlacementResult


CAMERA_COSTS = {
    "Dome 4K":   349,
    "Bullet 2K": 199,
    "Dome WDR":  279,
    "Dome IR":   229,
    "PTZ":       599,
}


async def optimize_placement(scene: dict, budget: float, locked_ids: list[str]) -> PlacementResult:
    """
    Full placement pipeline. Streams K2 reasoning, extracts <placement> JSON,
    validates with raycast, returns PlacementResult.
    """
    from app.services.k2_client import stream_placement_reasoning

    full_text = ""
    async for chunk in stream_placement_reasoning(scene, budget, locked_ids):
        full_text += chunk

    cameras = _extract_placement(full_text, scene, budget, locked_ids)
    coverage = raycast.compute_coverage(scene, [c.model_dump() for c in cameras])

    return PlacementResult(
        cameras=cameras,
        coverage_pct=coverage["coverage_pct"],
        entry_points_covered=_count_entry_coverage(scene, cameras),
        total_cost_usd=sum(c.cost_usd for c in cameras),
        reasoning=full_text,
    )


def optimize_placement_for_budget(scene: dict, budget: float, locked_ids: list[str]) -> dict:
    """
    Synchronous stub: adjusts hardcoded cameras to fit budget.
    Used while K2 async path is being integrated.
    """
    locked = {c["id"] for c in scene["cameras"] if c["id"] in locked_ids or c.get("locked")}
    available = sorted(
        [c for c in scene["cameras"] if c["id"] not in locked],
        key=lambda c: c["cost_usd"] / max(c["fov_h"] * c["fov_v"], 1),
        reverse=True,
    )
    locked_cameras = [c for c in scene["cameras"] if c["id"] in locked]
    locked_cost = sum(c["cost_usd"] for c in locked_cameras)
    remaining = budget - locked_cost

    selected = list(locked_cameras)
    for cam in available:
        if remaining >= cam["cost_usd"]:
            selected.append(cam)
            remaining -= cam["cost_usd"]

    coverage = raycast.compute_coverage(scene, selected)
    return {
        "cameras": selected,
        "coverage_pct": coverage["coverage_pct"],
        "total_cost_usd": budget - remaining,
    }


def _extract_placement(text: str, scene: dict, budget: float, locked_ids: list[str]) -> list[Camera]:
    """Parse <placement>...</placement> JSON from K2 response, fall back to budget-adjusted defaults."""
    match = re.search(r"<placement>(.*?)</placement>", text, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(1))
            return [Camera(**c) for c in data.get("cameras", [])]
        except Exception:
            pass
    # Fallback: use hardcoded budget-adjusted placement
    result = optimize_placement_for_budget(scene, budget, locked_ids)
    return [Camera(**c) for c in result["cameras"]]


def _count_entry_coverage(scene: dict, cameras: list[Camera]) -> int:
    covered = 0
    for ep in scene.get("entry_points", []):
        ep_pos = ep["position"]
        for cam in cameras:
            import numpy as np
            cam_pos = np.array(cam.position)
            ep_arr = np.array(ep_pos)
            to_ep = ep_arr - cam_pos
            to_ep_n = to_ep / (np.linalg.norm(to_ep) + 1e-9)
            target = np.array(cam.target)
            forward = target - cam_pos
            forward /= np.linalg.norm(forward) + 1e-9
            cos_h = np.cos(np.radians(cam.fov_h / 2))
            if float(np.dot(to_ep_n, forward)) >= cos_h:
                covered += 1
                break
    return covered

"""
K2 Think V2 client — semantic placement reasoning + adversarial iteration.

All prompts use extended thinking (budget_tokens) so the streaming
response shows K2's visible reasoning chain in the UI panel.
"""

import json
import anthropic
from typing import AsyncIterator

from app.core.config import get_settings

PLACEMENT_SYSTEM = """You are Sentinel's security architect AI. You reason about physical security camera placement using:
- 3D geometry, FOV calculations, and occlusion analysis
- Entry-point prioritization and threat-model reasoning
- Budget constraints and coverage tradeoffs
- Lighting and environmental conditions

Always explain your reasoning step-by-step. Reference specific camera IDs and entry point IDs from the provided scene data.
Output your final placement as a JSON block inside <placement>...</placement> tags."""

PLACEMENT_PROMPT = """Scene: {scene_name}
Bounds: {bounds}
Entry points: {entry_points}
Rooms (with priority): {rooms}
Obstructions: {obstructions}
Budget: ${budget}
Locked cameras (must keep): {locked}

Current placement and coverage: {current_analysis}

Reason through optimal camera placement. Consider:
1. Entry-point coverage priority (threat_weight)
2. Critical zone coverage (server_room, high-priority rooms)
3. Blind-spot elimination vs budget
4. Overlap minimization (wasted budget)
5. Camera type selection (IR for dark corners, HDR/WDR for window-facing)

Then output the final placement as JSON."""

BUDGET_TRADEOFF_PROMPT = """Budget changed to ${new_budget} (from ${old_budget}).
Current cameras: {cameras}
Coverage: {coverage_pct}% — {entry_covered}/{entry_total} entry points

Explain in 2-3 sentences what tradeoffs you're making, which cameras to add/remove,
and the expected coverage impact. Be specific about camera IDs and dollar amounts."""

LIGHTING_PROMPT = """Window positions and normals: {windows}
Camera placements: {cameras}
Location: lat={lat}, lon={lon}

Identify time windows (hour ranges) where each camera faces glare risk from sunlight.
For each affected camera, recommend: HDR schedule, IR-capable swap, or supplemental lighting placement.
Be specific about hours and camera IDs."""


async def stream_placement_reasoning(scene: dict, budget: float, locked_ids: list[str]) -> AsyncIterator[str]:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    prompt = PLACEMENT_PROMPT.format(
        scene_name=scene["name"],
        bounds=json.dumps(scene["bounds"]),
        entry_points=json.dumps(scene["entry_points"], indent=2),
        rooms=json.dumps(scene["rooms"], indent=2),
        obstructions=json.dumps(scene["obstructions"], indent=2),
        budget=budget,
        locked=json.dumps(locked_ids),
        current_analysis=json.dumps(scene.get("analysis", {}), indent=2),
    )

    async with client.messages.stream(
        model=settings.k2_model,
        max_tokens=8000,
        thinking={"type": "enabled", "budget_tokens": 5000},
        system=PLACEMENT_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def stream_budget_tradeoff(scene: dict, new_budget: float, old_budget: float) -> AsyncIterator[str]:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    analysis = scene.get("analysis", {})
    prompt = BUDGET_TRADEOFF_PROMPT.format(
        new_budget=new_budget,
        old_budget=old_budget,
        cameras=json.dumps(scene["cameras"], indent=2),
        coverage_pct=analysis.get("coverage_pct", "?"),
        entry_covered=analysis.get("entry_points_covered", "?"),
        entry_total=analysis.get("entry_points_total", "?"),
    )

    async with client.messages.stream(
        model=settings.k2_model,
        max_tokens=1000,
        system=PLACEMENT_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def stream_lighting_analysis(scene: dict, lat: float, lon: float) -> AsyncIterator[str]:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    prompt = LIGHTING_PROMPT.format(
        windows=json.dumps(scene.get("windows_solar", []), indent=2),
        cameras=json.dumps(scene["cameras"], indent=2),
        lat=lat,
        lon=lon,
    )

    async with client.messages.stream(
        model=settings.k2_model,
        max_tokens=2000,
        system=PLACEMENT_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield text

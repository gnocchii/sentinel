"""
Task 2 — K2 Think V2 Prompt Engineering + API Client

Builds a high-density Security Architect prompt from the Spatial Manifest JSON
and streams camera placement recommendations from K2 Think V2.

K2 API is OpenAI-compatible. Returns structured JSON inside <placements>...</placements>.
"""

import json
import re
from typing import AsyncIterator
import httpx

from app.core.config import get_settings


# ─── System prompt ───────────────────────────────────────────────

SYSTEM_PROMPT = """You are a world-class physical security architect with deep expertise in:
- 3D spatial reasoning and line-of-sight occlusion analysis
- CCTV camera placement optimization (coverage, overlap minimization, blind-spot elimination)
- Threat modeling: identifying exploitable entry points and attacker paths
- Cost-vs-coverage tradeoffs across camera types (Dome 4K, Bullet 2K, PTZ, IR, WDR)

You will be given a Spatial Manifest JSON describing a real 3D space derived from a point cloud scan.
All coordinates are in metres. Axes: X=east, Y=north, Z=up.

Your task is to reason carefully about camera placement using the spatial data, then output
your recommendations in the exact structured format specified. Think step-by-step, showing
your reasoning for each placement decision."""


# ─── Prompt builder ──────────────────────────────────────────────

def generate_k2_prompt(spatial_manifest: dict, n_cameras: int = 5) -> str:
    meta      = spatial_manifest.get("scene_metadata", {})
    floor     = spatial_manifest.get("structural_planes", {}).get("floor", {})
    walls     = spatial_manifest.get("structural_planes", {}).get("walls", [])
    obstacles = spatial_manifest.get("obstacles", [])
    entries   = spatial_manifest.get("entry_candidates", [])
    sight     = spatial_manifest.get("sight_line_summary", {})

    # ── Scene summary ──────────────────────────────────────────
    scene_summary = f"""
## SCENE SUMMARY
- Point count: {meta.get('point_count', '?')}
- Floor area: {meta.get('estimated_floor_area_m2', '?')} m²
- Ceiling height: {meta.get('estimated_ceiling_height_m', '?')} m
- Floor elevation Z: {floor.get('z_elevation_m', 0.0)} m
- Spatial bounds:
    X: [{meta.get('bounds', {}).get('xmin', 0)}, {meta.get('bounds', {}).get('xmax', 0)}] m (east/west)
    Y: [{meta.get('bounds', {}).get('ymin', 0)}, {meta.get('bounds', {}).get('ymax', 0)}] m (north/south)
    Z: [{meta.get('bounds', {}).get('zmin', 0)}, {meta.get('bounds', {}).get('zmax', 0)}] m (floor/ceiling)
"""

    # ── Walls ─────────────────────────────────────────────────
    wall_lines = []
    for w in walls:
        ext = w.get("extent", {})
        wall_lines.append(
            f"  - {w['id']} ({w.get('direction','?')}): "
            f"X[{ext.get('xmin','?')},{ext.get('xmax','?')}] "
            f"Y[{ext.get('ymin','?')},{ext.get('ymax','?')}] "
            f"Z[{ext.get('zmin','?')},{ext.get('zmax','?')}] "
            f"— length {w.get('length_m','?')}m, height {w.get('height_m','?')}m"
        )
    walls_section = "## WALLS DETECTED\n" + ("\n".join(wall_lines) if wall_lines else "  (none detected)")

    # ── Obstacles ─────────────────────────────────────────────
    obs_lines = []
    for o in obstacles:
        bb   = o.get("bounding_box", {})
        dims = o.get("dimensions_m", {})
        obs_lines.append(
            f"  - {o['id']}: centroid {o.get('centroid_xyz','?')}, "
            f"size {dims.get('width_m','?')}m(W) × {dims.get('depth_m','?')}m(D) × {dims.get('height_m','?')}m(H), "
            f"occludes {o.get('occlusion_floor_area_m2','?')} m² of floor, "
            f"bbox X[{bb.get('xmin','?')},{bb.get('xmax','?')}] "
            f"Y[{bb.get('ymin','?')},{bb.get('ymax','?')}] "
            f"Z[{bb.get('zmin','?')},{bb.get('zmax','?')}]"
        )
    obstacles_section = (
        "## OBSTACLES / FURNITURE\n"
        + (f"Total occlusion area: {sight.get('total_occlusion_area_m2','?')} m², "
           f"open sightlines: {sight.get('estimated_open_sightlines_pct','?')}%\n"
           + "\n".join(obs_lines) if obs_lines else "  (no obstacles detected)")
    )

    # ── Entry points ──────────────────────────────────────────
    entry_lines = []
    for e in entries:
        entry_lines.append(
            f"  - {e['id']} ({e.get('type','?')}): wall={e.get('wall_id','?')}, "
            f"position {e.get('position_xyz','?')}, width {e.get('gap_width_m','?')}m, "
            f"threat_weight={e.get('threat_weight','?')}"
        )
    entries_section = (
        "## ENTRY POINTS (doors / windows)\n"
        + ("\n".join(entry_lines) if entry_lines else "  (none detected — assume perimeter walls are sealed)")
    )

    # ── Task instruction ──────────────────────────────────────
    task_instruction = f"""
## YOUR TASK

Place exactly **{n_cameras} security cameras** in this space to achieve:
1. Maximum floor-area coverage (target ≥ 90%)
2. All {len(entries)} entry point(s) covered by at least one camera
3. Blind spots behind obstacles minimised
4. Minimal wasted overlap between cameras

### Reasoning requirements
For EACH camera placement, explicitly state:
a) Why this position (which wall/corner/ceiling mount) was chosen
b) Which specific obstacles create sight-line occlusions and how you mitigated them
c) Which entry point(s) this camera covers
d) Estimated coverage zone (describe the floor region covered)

### Output format
After your chain-of-thought reasoning, output the final placements in this exact JSON block
(do not omit — the system parses this):

<placements>
{{
  "camera_count": {n_cameras},
  "estimated_total_coverage_pct": <number>,
  "cameras": [
    {{
      "id": "CAM_K2_01",
      "position_xyz": [x, y, z],
      "pan_deg": <0-359, 0=north/+Y, 90=east/+X>,
      "tilt_deg": <negative = looking down, e.g. -30>,
      "fov_h_deg": <horizontal FOV, typically 90-120 for dome, 60-80 for bullet>,
      "fov_v_deg": <vertical FOV, typically 60-70>,
      "type": "Dome 4K | Bullet 2K | PTZ | Dome IR | Dome WDR",
      "rationale": "<1-2 sentences: why this spot, what it covers, what occlusion it avoids>"
    }}
  ]
}}
</placements>
"""

    return "\n".join([scene_summary, walls_section, obstacles_section, entries_section, task_instruction])


# ─── K2 API client ───────────────────────────────────────────────

async def stream_k2_placement(
    spatial_manifest: dict,
    n_cameras: int = 5,
) -> AsyncIterator[tuple[str, str]]:
    """
    Streams the K2 Think V2 response token by token.
    Yields (phase, text) tuples where phase is "thinking" or "answer".
    Caller accumulates all text for parse_placements; can split for display.
    """
    settings = get_settings()
    if not settings.k2_think_api_key:
        yield "[K2_THINK_API_KEY not set — add it to .env]\n"
        return

    prompt = generate_k2_prompt(spatial_manifest, n_cameras)

    payload = {
        "model":    settings.k2_think_model,
        "stream":   True,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
    }

    headers = {
        "Authorization": f"Bearer {settings.k2_think_api_key}",
        "Content-Type":  "application/json",
        "Accept":        "text/event-stream",
    }

    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            f"{settings.k2_think_base_url}/chat/completions",
            json=payload,
            headers=headers,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                if data == "[DONE]":
                    return
                try:
                    chunk = json.loads(data)
                    delta = chunk["choices"][0]["delta"]
                    thinking = delta.get("reasoning_content") or ""
                    answer   = delta.get("content") or ""
                    if thinking:
                        yield ("thinking", thinking)
                    if answer:
                        yield ("answer", answer)
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue


async def get_k2_placement(spatial_manifest: dict, n_cameras: int = 5) -> dict:
    """
    Non-streaming: collects full response and parses the <placements> JSON block.
    Returns parsed placement dict, or raises if parsing fails.
    """
    full_text = ""
    async for _phase, text in stream_k2_placement(spatial_manifest, n_cameras):
        full_text += text

    return parse_placements(full_text)


def parse_placements(k2_response: str) -> dict:
    """
    Extract and parse the <placements>...</placements> JSON block from K2 output.
    Raises ValueError if not found.
    """
    match = re.search(r"<placements>(.*?)</placements>", k2_response, re.DOTALL)
    if not match:
        raise ValueError("No <placements> block found in K2 response")
    return json.loads(match.group(1).strip())

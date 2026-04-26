"""
K2 Think V2 importance scoring.

Sends a compact scene description (rooms + furniture + doors + adjacencies)
to K2 Think and asks it to:
  1. Infer each room's likely function from geometry + furniture
  2. Score 0–1 camera-placement importance per room and per door

Uses the OpenAI-compatible chat completions endpoint at api.k2think.ai.
Caches by scene hash so re-running the same scan doesn't re-bill.
"""

import hashlib
import json
import math
import re
from pathlib import Path
from typing import AsyncIterator

import httpx

from app.core.config import get_settings


SYSTEM_PROMPT = """You are Sentinel's spatial-reasoning AI for indoor camera placement.

Given a floorplan (rooms with size + furniture, doors with positions), you:
1. Infer each room's likely function (kitchen, bedroom, hallway, bathroom, living room, ...) from size, aspect ratio, and furniture.
2. Score 0–1 importance for camera placement:
   - 1.0 = critical chokepoint (front door, main hallway intersection)
   - 0.7–0.9 = high-value (entry rooms, corridors near valuables)
   - 0.4–0.6 = general living spaces
   - 0.1–0.3 = private/low-value (bedrooms in residential, breakrooms)
   - 0.0 = privacy zone (bathroom, changing room)
3. Doors score independently — typically 0.85–1.0, higher for exterior/main entrances.

Reason briefly first. Then output a single JSON object inside <importance>...</importance> tags.
"""

USER_TEMPLATE = """Floorplan:
{scene_summary}

Reason about each room's likely function and importance, then output:

<importance>
{{
  "rooms": [
    {{"id": "<room_id>", "inferred_type": "<type>", "score": <0-1>, "reason": "<one sentence>"}}
  ],
  "doors": [
    {{"id": "<door_id>", "score": <0-1>, "reason": "<one sentence>"}}
  ]
}}
</importance>"""


# ─── public API ───────────────────────────────────────────────────


async def score_importance(scene: dict, use_cache: bool = True) -> dict:
    """Returns { 'rooms': {room_id: score}, 'doors': {door_id: score}, 'reasoning': str, 'meta': {...} }."""
    cache_key = _scene_hash(scene)
    if use_cache:
        cached = _read_cache(cache_key)
        if cached:
            return cached

    summary = build_scene_summary(scene)
    raw = await _call_k2(SYSTEM_PROMPT, USER_TEMPLATE.format(scene_summary=summary))
    parsed = _parse_importance(raw, scene)
    parsed["reasoning"] = raw

    _write_cache(cache_key, parsed)
    return parsed


async def stream_importance_reasoning(scene: dict) -> AsyncIterator[str]:
    """Streaming variant for the K2 panel — yields token chunks."""
    summary = build_scene_summary(scene)
    user_prompt = USER_TEMPLATE.format(scene_summary=summary)
    settings = get_settings()

    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            f"{settings.k2_think_base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.k2_think_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.k2_think_model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": True,
            },
        ) as resp:
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    return
                try:
                    chunk = json.loads(data)
                    delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if delta:
                        yield delta
                except json.JSONDecodeError:
                    continue


# ─── scene → prompt summary ───────────────────────────────────────


def build_scene_summary(scene: dict) -> str:
    """Compact text description K2 receives — geometry + furniture + door adjacencies."""
    rooms = scene.get("rooms", [])
    raw_rooms = scene.get("_raw_rooms", [])
    obstructions = scene.get("obstructions", [])
    doors = scene.get("entry_points", [])

    # Group obstructions per room they fall inside
    room_furniture: dict[str, list[str]] = {r["id"]: [] for r in rooms}
    for obs in obstructions:
        b = obs["bounds"]
        cx = (b["min"][0] + b["max"][0]) / 2
        cy = (b["min"][1] + b["max"][1]) / 2
        owner = _which_room(cx, cy, rooms)
        if owner:
            room_furniture[owner].append(obs.get("category", "unknown"))

    lines = ["Rooms:"]
    for r in rooms:
        b = r["bounds"]
        sx = round(b["max"][0] - b["min"][0], 2)
        sy = round(b["max"][1] - b["min"][1], 2)
        area = round(sx * sy, 1)
        cx = round((b["min"][0] + b["max"][0]) / 2, 2)
        cy = round((b["min"][1] + b["max"][1]) / 2, 2)
        furniture = room_furniture.get(r["id"], [])
        furn_str = (
            ", ".join(f"{n}× {name}" for name, n in _count(furniture).items())
            if furniture else "none"
        )
        lines.append(
            f"  - {r['id']}: size {sx}m × {sy}m (area {area} m²), center ({cx}, {cy}), furniture: {furn_str}"
        )

    lines.append("\nDoors (each connects two rooms):")
    for d in doors:
        x, y = d["position"][0], d["position"][1]
        nearest = _two_nearest_rooms(x, y, rooms)
        connects = " <-> ".join(nearest) if nearest else "exterior"
        lines.append(f"  - {d['id']}: at ({round(x,2)}, {round(y,2)}), width {d['width']}m, connects {connects}")

    return "\n".join(lines)


def _which_room(x: float, y: float, rooms: list[dict]) -> str | None:
    for r in rooms:
        b = r["bounds"]
        if b["min"][0] <= x <= b["max"][0] and b["min"][1] <= y <= b["max"][1]:
            return r["id"]
    return None


def _two_nearest_rooms(x: float, y: float, rooms: list[dict]) -> list[str]:
    distances: list[tuple[float, str]] = []
    for r in rooms:
        b = r["bounds"]
        cx = (b["min"][0] + b["max"][0]) / 2
        cy = (b["min"][1] + b["max"][1]) / 2
        distances.append((math.hypot(x - cx, y - cy), r["id"]))
    distances.sort()
    return [r for _, r in distances[:2]]


def _count(items: list[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for it in items:
        out[it] = out.get(it, 0) + 1
    return out


# ─── K2 HTTP call (non-streaming, used by score_importance) ───────


async def _call_k2(system_prompt: str, user_prompt: str) -> str:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(
            f"{settings.k2_think_base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.k2_think_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.k2_think_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


# ─── parse <importance> JSON out of the response ─────────────────


def _parse_importance(text: str, scene: dict) -> dict:
    """K2-Think emits <think> traces that often contain `<importance>` placeholders;
    walk all matches in reverse and pick the first one with valid JSON."""
    matches = list(re.finditer(r"<importance>(.*?)</importance>", text, re.DOTALL))
    if not matches:
        return _fallback(scene, "no <importance> block in response")

    payload = None
    last_err: Exception | None = None
    for m in reversed(matches):
        body = m.group(1).strip()
        if not body or body == "...":
            continue
        try:
            payload = json.loads(body)
            break
        except json.JSONDecodeError as e:
            last_err = e
            continue

    if payload is None:
        return _fallback(scene, f"no parseable JSON in any <importance> block: {last_err}")

    rooms_out: dict[str, dict] = {}
    for r in payload.get("rooms", []):
        rid = r.get("id")
        if not rid:
            continue
        rooms_out[rid] = {
            "score": _clamp01(r.get("score", 0.5)),
            "inferred_type": r.get("inferred_type", "unknown"),
            "reason": r.get("reason", ""),
        }

    doors_out: dict[str, dict] = {}
    for d in payload.get("doors", []):
        did = d.get("id")
        if not did:
            continue
        doors_out[did] = {
            "score": _clamp01(d.get("score", 0.9)),
            "reason": d.get("reason", ""),
        }

    return {"rooms": rooms_out, "doors": doors_out, "meta": {"source": "k2"}}


def _fallback(scene: dict, reason: str) -> dict:
    """Default scoring when K2 fails or output is unparseable."""
    return {
        "rooms": {r["id"]: {"score": 0.5, "inferred_type": "unknown", "reason": "fallback"}
                  for r in scene.get("rooms", [])},
        "doors": {d["id"]: {"score": 0.9, "reason": "fallback"}
                  for d in scene.get("entry_points", [])},
        "meta": {"source": "fallback", "reason": reason},
    }


def _clamp01(v) -> float:
    try:
        f = float(v)
        return max(0.0, min(1.0, f))
    except (TypeError, ValueError):
        return 0.5


# ─── disk cache ───────────────────────────────────────────────────


CACHE_DIR = Path(__file__).parent.parent / "data" / "_importance_cache"


def _scene_hash(scene: dict) -> str:
    skeleton = {
        "rooms": [(r["id"], r["bounds"]) for r in scene.get("rooms", [])],
        "doors": [(d["id"], d["position"]) for d in scene.get("entry_points", [])],
        "obstructions": [
            (o["id"], o.get("category") or o.get("label", ""))
            for o in scene.get("obstructions", [])
        ],
    }
    blob = json.dumps(skeleton, sort_keys=True).encode()
    return hashlib.sha256(blob).hexdigest()[:16]


def _read_cache(key: str) -> dict | None:
    path = CACHE_DIR / f"{key}.json"
    if path.exists():
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            return None
    return None


def _write_cache(key: str, data: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / f"{key}.json").write_text(json.dumps(data, indent=2))

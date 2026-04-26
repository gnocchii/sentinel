"""
K2 Think V2 importance scoring.

Sends a compact scene description (rooms + furniture + doors + adjacencies)
to K2 Think and asks it to:
  1. Infer each room's likely function from geometry + furniture
  2. Score 0–1 camera-placement importance per room and per door

Uses the OpenAI-compatible chat completions endpoint at api.k2think.ai.
Caches by scene hash so re-running the same scan doesn't re-bill.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import AsyncIterator

import httpx

from app.core.config import get_settings


SYSTEM_PROMPT = """You are Sentinel's spatial-reasoning AI for indoor camera placement.

Given a floorplan (rooms with size + furniture + shape hint, doors with positions and width), you:
1. Infer each room's likely function (kitchen, bedroom, hallway, bathroom, living room, ...) from
   size, aspect ratio (shape hint), furniture, AND door count. A long-narrow room (aspect ≥ 4:1)
   with no furniture is almost always a hallway/corridor. A wide rectangular room with multiple
   doors is usually a lobby/entry/foyer, NOT a hallway.
2. Score 0–1 importance for camera placement:
   - 1.0 = critical chokepoint (front door zone, main hallway intersection)
   - 0.7–0.9 = high-value (entry rooms, hallways, corridors near valuables)
   - 0.4–0.6 = general living/work spaces
   - 0.1–0.3 = private/low-value (bedrooms in residential)
   - 0.0 = privacy zone (bathroom, changing room)
3. Doors score independently — typically 0.85–1.0. Doors flagged "[likely main entrance]" should
   score ≥ 0.95.

Furniture detection is sometimes incomplete; when a room has 0 furniture, lean on its shape and
door count to classify it. Never call a room a hallway unless its aspect ratio supports it.

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
    """Compact text description K2 receives — geometry + furniture + door adjacencies + shape hints."""
    rooms = scene.get("rooms", [])
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

    # Count doors that touch each room polygon (door is "touching" if within 0.6m of bbox edge)
    room_door_count = _doors_per_room(doors, rooms)

    # Tag the widest door as the likely main entrance
    main_entrance_id = _likely_main_entrance(doors)

    lines = ["Rooms:"]
    for r in rooms:
        b = r["bounds"]
        sx = round(b["max"][0] - b["min"][0], 2)
        sy = round(b["max"][1] - b["min"][1], 2)
        area = round(sx * sy, 1)
        cx = round((b["min"][0] + b["max"][0]) / 2, 2)
        cy = round((b["min"][1] + b["max"][1]) / 2, 2)
        long_side = max(sx, sy)
        short_side = max(min(sx, sy), 0.01)
        aspect = round(long_side / short_side, 1)
        shape = _shape_hint(aspect, area)
        furniture = room_furniture.get(r["id"], [])
        furn_str = (
            ", ".join(f"{n}× {name}" for name, n in _count(furniture).items())
            if furniture else "none (detection incomplete — use shape + doors)"
        )
        lines.append(
            f"  - {r['id']}: size {sx}m × {sy}m (area {area} m², aspect {aspect}:1, {shape}),"
            f" center ({cx}, {cy}), {room_door_count.get(r['id'], 0)} door(s), furniture: {furn_str}"
        )

    lines.append("\nDoors (each connects two rooms):")
    for d in doors:
        x, y = d["position"][0], d["position"][1]
        nearest = _two_nearest_rooms(x, y, rooms)
        connects = " <-> ".join(nearest) if nearest else "exterior"
        tag = "  [likely main entrance]" if d["id"] == main_entrance_id else ""
        lines.append(
            f"  - {d['id']}: at ({round(x,2)}, {round(y,2)}), width {d['width']}m, connects {connects}{tag}"
        )

    return "\n".join(lines)


def _shape_hint(aspect: float, area: float) -> str:
    """Human-readable shape category. Aspect ≥ 4 = corridor; small + low-aspect = closet."""
    if aspect >= 4.0:
        return "long narrow — corridor/hallway shape"
    if aspect >= 2.5:
        return "elongated rectangle"
    if area < 4.0:
        return "small — closet/utility"
    return "wide rectangle"


def _doors_per_room(doors: list[dict], rooms: list[dict], slack: float = 0.6) -> dict[str, int]:
    """Count doors whose position lies within `slack` meters of each room's bbox."""
    counts: dict[str, int] = {r["id"]: 0 for r in rooms}
    for d in doors:
        x, y = d["position"][0], d["position"][1]
        for r in rooms:
            b = r["bounds"]
            if (b["min"][0] - slack <= x <= b["max"][0] + slack and
                b["min"][1] - slack <= y <= b["max"][1] + slack):
                counts[r["id"]] += 1
    return counts


def _likely_main_entrance(doors: list[dict]) -> str | None:
    """Widest door wins, but only if it's noticeably wider than the median (≥ 1.5m absolute)."""
    if not doors:
        return None
    widest = max(doors, key=lambda d: d.get("width", 0.0))
    if widest.get("width", 0.0) >= 1.5:
        return widest["id"]
    return None


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
    """When K2 fails or output is unparseable, use the deterministic geometry prior."""
    prior = geometry_prior(scene)
    prior["meta"] = {"source": "fallback-prior", "reason": reason}
    return prior


def geometry_prior(scene: dict) -> dict:
    """
    Rule-based scoring from shape + furniture + door width alone (no LLM).

    Heuristics — kept simple so they're predictable:
      - aspect ≥ 4         → hallway/corridor, score 0.85
      - has table + chair  → dining/meeting,    score 0.55
      - has table only     → breakroom/dining,  score 0.55
      - has bed            → bedroom,           score 0.20
      - has toilet/shower  → bathroom,          score 0.0
      - empty + 4+ doors   → lobby/entry,       score 0.85
      - empty + wide       → lounge/open area,  score 0.55
      - default            → unknown,           score 0.5

      - door width ≥ 1.5m  → main entrance,     score 0.97
      - 0.95 ≤ width < 1.5 → standard interior, score 0.88
      - width < 0.95       → narrow/service,    score 0.82
    """
    rooms = scene.get("rooms", [])
    obstructions = scene.get("obstructions", [])
    doors = scene.get("entry_points", [])

    # Group furniture per room
    room_furn: dict[str, list[str]] = {r["id"]: [] for r in rooms}
    for o in obstructions:
        b = o["bounds"]
        cx = (b["min"][0] + b["max"][0]) / 2
        cy = (b["min"][1] + b["max"][1]) / 2
        owner = _which_room(cx, cy, rooms)
        if owner:
            room_furn[owner].append(o.get("category", ""))

    door_counts = _doors_per_room(doors, rooms)

    rooms_out: dict[str, dict] = {}
    for r in rooms:
        b = r["bounds"]
        sx = b["max"][0] - b["min"][0]
        sy = b["max"][1] - b["min"][1]
        long_side, short_side = max(sx, sy), max(min(sx, sy), 0.01)
        aspect = long_side / short_side
        area = sx * sy
        cats = set(room_furn[r["id"]])
        n_doors = door_counts.get(r["id"], 0)

        # Priority: furniture > shape > door-count.
        # Rationale: a long-narrow room with dining tables is a galley/cafeteria, not a hallway.
        # Only fall back to the aspect rule when furniture gives no signal.
        if "toilet" in cats or "bathtub" in cats or "shower" in cats:
            score, t, why = 0.0, "bathroom", "bathroom fixtures present"
        elif "bed" in cats:
            score, t, why = 0.20, "bedroom", "bed detected"
        elif "table" in cats and ("chair" in cats or n_doors >= 2):
            score, t, why = 0.55, "breakroom/dining", "tables with seating or multiple entries"
        elif "table" in cats:
            score, t, why = 0.55, "breakroom/dining", "tables present"
        elif "desk" in cats:
            score, t, why = 0.78, "office", "desk present"
        elif aspect >= 4.0:
            score, t, why = 0.85, "hallway", f"long-narrow shape (aspect {aspect:.1f}:1)"
        elif not cats and n_doors >= 4 and area >= 15:
            score, t, why = 0.85, "lobby/entry", f"empty room with {n_doors} doors — circulation hub"
        elif not cats and area >= 15:
            score, t, why = 0.55, "lounge/open", "empty wide room"
        else:
            score, t, why = 0.5, "unknown", "no strong signal"

        rooms_out[r["id"]] = {"score": score, "inferred_type": t, "reason": why}

    main_id = _likely_main_entrance(doors)
    doors_out: dict[str, dict] = {}
    for d in doors:
        w = d.get("width", 1.0)
        if d["id"] == main_id:
            doors_out[d["id"]] = {"score": 0.97, "reason": f"widest door ({w}m) — likely main entrance"}
        elif w >= 0.95:
            doors_out[d["id"]] = {"score": 0.88, "reason": f"standard interior door ({w}m)"}
        else:
            doors_out[d["id"]] = {"score": 0.82, "reason": f"narrow/service door ({w}m)"}

    return {"rooms": rooms_out, "doors": doors_out, "meta": {"source": "prior"}}


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

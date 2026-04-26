"""
Importance map endpoints.

  GET  /importance/{scene_id}                 → cached scores + rasterized grid
  POST /importance/{scene_id}/recompute       → bypass cache, re-call K2
  GET  /importance/{scene_id}/stream          → SSE stream of K2 reasoning tokens
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.api.routes.scene import load_scene
from app.services.importance import score_importance, stream_importance_reasoning
from app.services.importance_grid import build_importance_grid, to_payload


router = APIRouter(prefix="/importance", tags=["importance"])


@router.get("/{scene_id}")
async def get_importance(scene_id: str):
    scene = load_scene(scene_id)
    scores = await score_importance(scene, use_cache=True)
    grid = build_importance_grid(scene, scores)
    payload = to_payload(grid, scores)
    payload["meta"] = scores.get("meta", {})
    return payload


@router.post("/{scene_id}/recompute")
async def recompute_importance(scene_id: str):
    scene = load_scene(scene_id)
    scores = await score_importance(scene, use_cache=False)
    grid = build_importance_grid(scene, scores)
    payload = to_payload(grid, scores)
    payload["meta"] = scores.get("meta", {})
    return payload


@router.get("/{scene_id}/stream")
async def stream_importance(scene_id: str):
    scene = load_scene(scene_id)

    async def event_stream():
        async for chunk in stream_importance_reasoning(scene):
            # SSE: split on newlines so multi-line tokens render correctly
            for line in chunk.splitlines() or [""]:
                yield f"data: {line}\n"
            yield "\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

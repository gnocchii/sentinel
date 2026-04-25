"""
K2 Think V2 streaming endpoints.
All return Server-Sent Events (text/event-stream) so the frontend
K2Panel can render tokens as they arrive.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.api.routes.scene import load_scene
from app.services.k2_client import (
    stream_placement_reasoning,
    stream_budget_tradeoff,
    stream_lighting_analysis,
)
from app.core.config import get_settings

router = APIRouter(prefix="/k2", tags=["k2"])


def _require_key():
    if not get_settings().anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not set — K2 unavailable")


def sse(generator):
    async def event_stream():
        async for chunk in generator:
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(event_stream(), media_type="text/event-stream")


class PlacementStreamRequest(BaseModel):
    scene_id: str
    budget_usd: float
    locked_camera_ids: list[str] = []


class BudgetTradeoffRequest(BaseModel):
    scene_id: str
    new_budget: float
    old_budget: float


@router.post("/stream-placement")
async def stream_placement(req: PlacementStreamRequest):
    _require_key()
    scene = load_scene(req.scene_id)
    return sse(stream_placement_reasoning(scene, req.budget_usd, req.locked_camera_ids))


@router.post("/stream-budget-tradeoff")
async def stream_budget(req: BudgetTradeoffRequest):
    _require_key()
    scene = load_scene(req.scene_id)
    return sse(stream_budget_tradeoff(scene, req.new_budget, req.old_budget))


@router.get("/stream-lighting/{scene_id}")
async def stream_lighting(scene_id: str):
    _require_key()
    scene = load_scene(scene_id)
    settings = get_settings()
    return sse(stream_lighting_analysis(scene, settings.scene_latitude, settings.scene_longitude))

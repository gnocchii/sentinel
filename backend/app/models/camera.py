from pydantic import BaseModel
from typing import Literal


CameraType = Literal["Dome 4K", "Bullet 2K", "Dome WDR", "Dome IR", "PTZ"]
CameraStatus = Literal["active", "warning", "offline"]


class Camera(BaseModel):
    id: str
    label: str
    type: CameraType
    position: list[float]       # [x, y, z]
    target: list[float]         # look-at point [x, y, z]
    fov_h: float                # horizontal FOV degrees
    fov_v: float                # vertical FOV degrees
    cost_usd: float
    ir_capable: bool = False
    hdr_capable: bool = False
    status: CameraStatus = "active"
    locked: bool = False        # pinned — survives budget pruning


class PlacementRequest(BaseModel):
    scene_id: str
    budget_usd: float
    locked_camera_ids: list[str] = []


class PlacementResult(BaseModel):
    cameras: list[Camera]
    coverage_pct: float
    entry_points_covered: int
    total_cost_usd: float
    reasoning: str              # K2's chain-of-thought summary

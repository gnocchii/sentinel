from pydantic import BaseModel
from typing import Literal


class Vec3(BaseModel):
    x: float
    y: float
    z: float


class Bounds(BaseModel):
    min: list[float]  # [x, y, z]
    max: list[float]


class Room(BaseModel):
    id: str
    label: str
    priority: Literal["low", "medium", "high", "critical"]
    bounds: Bounds


class Wall(BaseModel):
    id: str
    from_: list[float]
    to: list[float]
    height: float

    class Config:
        populate_by_name = True
        fields = {"from_": "from"}


class EntryPoint(BaseModel):
    id: str
    label: str
    type: Literal["door", "window"]
    position: list[float]
    normal: list[float]
    width: float
    threat_weight: float = 1.0


class Obstruction(BaseModel):
    id: str
    label: str
    bounds: Bounds


class BlindSpot(BaseModel):
    id: str
    position: list[float]
    area_m2: float
    reason: str
    severity: Literal["low", "medium", "high"]


class LightingRisk(BaseModel):
    camera_id: str
    window_id: str
    risk_window: dict  # {"start_hour": float, "end_hour": float}
    type: Literal["glare", "shadow", "dark"]
    mitigation: str


class SceneAnalysis(BaseModel):
    coverage_pct: float
    entry_points_covered: int
    entry_points_total: int
    blind_spots: list[BlindSpot]
    overlap_zones: int
    total_cost_usd: float
    lighting_risks: list[LightingRisk]

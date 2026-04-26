// ─── Core geometry ───────────────────────────────────────────────

export type Vec3 = [number, number, number]

export interface Bounds {
  min: Vec3
  max: Vec3
}

// ─── Scene ───────────────────────────────────────────────────────

export type RoomPriority = "low" | "medium" | "high" | "critical"

export interface Room {
  id: string
  label: string
  priority: RoomPriority
  bounds: Bounds
}

export interface Wall {
  id: string
  from: Vec3
  to: Vec3
  height: number
}

export type EntryType = "door" | "window"

export interface EntryPoint {
  id: string
  label: string
  type: EntryType
  position: Vec3
  normal: Vec3
  width: number
  threat_weight: number
}

export interface Obstruction {
  id: string
  label: string
  bounds: Bounds
}

export interface BlindSpot {
  id: string
  position: Vec3
  area_m2: number
  reason: string
  severity: "low" | "medium" | "high"
}

export interface LightingRisk {
  camera_id: string
  window_id: string
  risk_window: { start_hour: number; end_hour: number }
  type: "glare" | "shadow" | "dark"
  mitigation: string
}

export interface SceneAnalysis {
  coverage_pct: number
  entry_points_covered: number
  entry_points_total: number
  blind_spots: BlindSpot[]
  overlap_zones: number
  total_cost_usd: number
  lighting_risks: LightingRisk[]
}

export interface Scene {
  id: string
  name: string
  floor_area_m2: number
  bounds: Bounds
  rooms: Room[]
  walls: Wall[]
  entry_points: EntryPoint[]
  obstructions: Obstruction[]
  cameras: Camera[]
  analysis: SceneAnalysis
}

// ─── Cameras ─────────────────────────────────────────────────────

export type CameraType = "Dome 4K" | "Bullet 2K" | "Dome WDR" | "Dome IR" | "PTZ"
export type CameraStatus = "active" | "warning" | "offline"

export interface Camera {
  id: string
  label: string
  type: CameraType
  position: Vec3
  target: Vec3
  fov_h: number
  fov_v: number
  cost_usd: number
  ir_capable: boolean
  hdr_capable: boolean
  status: CameraStatus
  locked: boolean
  // Inward-pointing wall normal (XY in scene space, Z=0). Used by the renderer
  // to attach a wall-mount plate. Optional for legacy / hand-placed cameras.
  mount_normal?: Vec3
}

// ─── Point cloud ─────────────────────────────────────────────────

export interface PointCloudData {
  scene_id: string
  count: number
  points: [number, number, number, number, number, number][]  // [x, y, z, r, g, b]
}

export interface ScanUploadResponse {
  scan_id: string
  status: "processing" | "done" | "failed"
  filename: string
  size_bytes: number
}

export interface ScanStatus {
  scan_id: string
  status: "processing" | "done" | "failed"
  filename: string
  size_bytes: number
  pointcloud_path?: string
  error?: string
}

// ─── Lighting ────────────────────────────────────────────────────

export type LightQuality = "good" | "warning" | "critical" | "dark"

export interface HourlyLight {
  hour: number
  sun_azimuth: number
  sun_altitude: number
  quality: LightQuality
}

export interface CameraLighting {
  camera_id: string
  hourly: HourlyLight[]
  risk_windows: { start_hour: number; end_hour: number; type: string }[]
}

// ─── Threat paths ────────────────────────────────────────────────

export type ThreatModel = "burglar" | "insider" | "pro"

export interface ThreatPath {
  entry_id: string
  entry_label: string
  threat_model: ThreatModel
  path: [number, number][]   // [x, y] waypoints
  breach_cameras: string[]
}

// ─── 3D coverage map ─────────────────────────────────────────────

export interface CameraCoverage3D {
  id: string
  label: string
  type: string
  position: [number, number, number]
  covered_cells: [number, number][]   // [col, row] grid indices
  covered_count: number
}

export interface Coverage3DPayload {
  bounds: { min: [number, number]; max: [number, number] }
  resolution: number
  shape: [number, number]
  total_cells: number
  covered_cells: number
  coverage_pct: number
  cameras: CameraCoverage3D[]
}

// ─── Importance map ──────────────────────────────────────────────

export interface ImportanceRoomScore {
  id: string
  inferred_type: string
  score: number
  reason: string
}

export interface ImportanceDoorScore {
  id: string
  score: number
  reason: string
}

export interface ImportancePayload {
  grid: number[][]                // 2D array of (H × W) values 0..1
  bounds: { min: [number, number]; max: [number, number] }
  resolution: number
  shape: [number, number]
  rooms: ImportanceRoomScore[]
  doors: ImportanceDoorScore[]
  meta: { source: string; reason?: string }
}

// ─── UI state ────────────────────────────────────────────────────

export type TwinTab = "digital-twin" | "point-cloud" | "threat-path" | "camera-feeds" | "importance-map"

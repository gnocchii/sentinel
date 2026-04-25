/**
 * Derives simulated camera view parameters from camera placement data.
 *
 * Algorithm:
 *   1. A WALKTHROUGH_PATH defines where the video operator was at each
 *      timestamp: { t, x, y, heading_deg }. You define this once per video.
 *   2. For a placed camera at position [cx, cy], find the path keyframe
 *      where the operator was closest to that camera. That gives startTime.
 *   3. The camera's target direction vs the operator's heading gives the
 *      horizontal pan offset within the video frame.
 *   4. The camera's fov_h vs RECORDING_FOV gives the crop width.
 *
 * The only hardcoded thing is WALKTHROUGH_PATH — which is specific to your
 * video, not to any camera. Tune the timestamps to match your walkthrough.mp4.
 */

export interface CameraViewConfig {
  cameraId: string
  startTime: number
  endTime: number
  cropX: number       // normalized 0–1 (left edge of crop)
  cropY: number
  cropW: number       // normalized 0–1 (width of crop)
  cropH: number
  tiltDeg: number
  effects: {
    grayscale: number
    brightness: number
    contrast: number
    greenTint: boolean
    noise: number
    vignette: boolean
  }
}

// ─── Walkthrough path ────────────────────────────────────────────
//
// Keyframes: where was the camera operator in the Avery House space
// at each timestamp in walkthrough.mp4?
//
// Tune these timestamps to match your actual video.
// x/y are in the same coordinate space as avery_house.json (meters).
// heading_deg: 0=north (+Y), 90=east (+X), 180=south, 270=west.
//
interface PathKeyframe {
  t: number           // seconds into the video
  x: number
  y: number
  heading_deg: number // direction the operator is facing / camera is pointing
}

const WALKTHROUGH_PATH: PathKeyframe[] = [
  { t:  0, x:  0.5, y: 4.0, heading_deg:  90 },  // main entrance, facing east
  { t:  5, x:  2.0, y: 4.0, heading_deg:  90 },  // mid living room
  { t: 10, x:  4.0, y: 2.0, heading_deg: 135 },  // SW corner sweep
  { t: 15, x:  4.5, y: 6.0, heading_deg:  45 },  // NW living room
  { t: 20, x:  6.5, y: 4.0, heading_deg:  90 },  // corridor entrance
  { t: 25, x:  7.0, y: 5.5, heading_deg:   0 },  // corridor, facing north
  { t: 30, x:  7.0, y: 3.0, heading_deg: 180 },  // corridor, facing south
  { t: 35, x:  9.5, y: 6.5, heading_deg:  90 },  // office entry
  { t: 40, x: 11.0, y: 7.0, heading_deg: 270 },  // office far wall, facing west
  { t: 45, x: 11.5, y: 4.5, heading_deg: 270 },  // back door area
  { t: 50, x: 10.0, y: 1.5, heading_deg: 270 },  // server room
  { t: 55, x:  9.0, y: 0.5, heading_deg: 180 },  // server room corner
]

// ─── Constants ──────────────────────────────────────────────────

// Horizontal FOV of the phone/camera that recorded the walkthrough.
// Standard phone wide-angle is ~90°. Adjust if you know your video's FOV.
const RECORDING_FOV_H = 90

// How many seconds of video to loop per camera view
const SEGMENT_DURATION = 8

// Vertical crop: how much of the frame height to use (trim top/bottom)
const CROP_H = 0.80
const CROP_Y = 0.10

// ─── Core derivation ─────────────────────────────────────────────

function degToRad(d: number) { return (d * Math.PI) / 180 }

function dist2d(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

// Interpolate between two keyframes at time t
function interpolatePath(t: number): PathKeyframe {
  if (t <= WALKTHROUGH_PATH[0].t) return WALKTHROUGH_PATH[0]
  const last = WALKTHROUGH_PATH[WALKTHROUGH_PATH.length - 1]
  if (t >= last.t) return last

  const i = WALKTHROUGH_PATH.findIndex((k) => k.t > t) - 1
  const a = WALKTHROUGH_PATH[i]
  const b = WALKTHROUGH_PATH[i + 1]
  const alpha = (t - a.t) / (b.t - a.t)

  // Interpolate heading via shortest arc
  let dh = ((b.heading_deg - a.heading_deg + 540) % 360) - 180
  return {
    t,
    x: a.x + alpha * (b.x - a.x),
    y: a.y + alpha * (b.y - a.y),
    heading_deg: (a.heading_deg + alpha * dh + 360) % 360,
  }
}

// Find the video timestamp where the operator was closest to a given position.
// Searches in 0.5s steps across the full path.
function findClosestTimestamp(cx: number, cy: number): number {
  let bestT = WALKTHROUGH_PATH[0].t
  let bestDist = Infinity
  const endT = WALKTHROUGH_PATH[WALKTHROUGH_PATH.length - 1].t

  for (let t = 0; t <= endT; t += 0.5) {
    const kf = interpolatePath(t)
    const d  = dist2d(kf.x, kf.y, cx, cy)
    if (d < bestDist) {
      bestDist = d
      bestT = t
    }
  }
  return bestT
}

// Compute the camera's facing direction in degrees (0=N, 90=E, ...)
// from position + target vectors.
function cameraHeading(pos: number[], target: number[]): number {
  const dx = target[0] - pos[0]
  const dy = target[1] - pos[1]
  // atan2(dx, dy) gives angle from north, clockwise
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
}

// Derive crop parameters from heading difference + FOV.
// panOffset is the fractional shift of the crop center within the frame.
function computeCrop(
  camHeading: number,
  operatorHeading: number,
  cameraFovH: number,
): { cropX: number; cropW: number } {
  const cropW = Math.min(0.95, cameraFovH / RECORDING_FOV_H)

  // Angle difference: how far left/right the camera points vs operator
  let deltaH = ((camHeading - operatorHeading + 540) % 360) - 180
  // Clamp: can't pan beyond what's in the video frame
  const maxDelta = (RECORDING_FOV_H / 2) * (1 - cropW)
  deltaH = Math.max(-maxDelta, Math.min(maxDelta, deltaH))

  // Convert angle delta to normalized frame offset
  const panFraction = deltaH / RECORDING_FOV_H  // -0.5 to +0.5
  const center = 0.5 + panFraction
  const cropX = Math.max(0, Math.min(1 - cropW, center - cropW / 2))

  return { cropX, cropW }
}

// ─── Public API ─────────────────────────────────────────────────

interface CameraInput {
  id: string
  position: number[]
  target: number[]
  fov_h: number
  fov_v: number
  ir_capable: boolean
  hdr_capable: boolean
  status: string
}

export function deriveViewConfig(camera: CameraInput): CameraViewConfig {
  const [cx, cy] = camera.position
  const startTime = Math.max(0, findClosestTimestamp(cx, cy) - 1)
  const endTime   = Math.min(
    WALKTHROUGH_PATH[WALKTHROUGH_PATH.length - 1].t,
    startTime + SEGMENT_DURATION,
  )

  const opKf       = interpolatePath(startTime + (endTime - startTime) / 2)
  const camHeading = cameraHeading(camera.position, camera.target)
  const { cropX, cropW } = computeCrop(camHeading, opKf.heading_deg, camera.fov_h)

  // Mount tilt: cameras higher up are angled down more
  const mountHeight = camera.position[2] ?? 2.5
  const tiltDeg = Math.min(25, mountHeight * 6)

  return {
    cameraId: camera.id,
    startTime,
    endTime,
    cropX,
    cropY: CROP_Y,
    cropW,
    cropH: CROP_H,
    tiltDeg,
    effects: {
      grayscale:  camera.ir_capable ? 0.4 : 0,
      brightness: camera.hdr_capable ? 1.1 : 1.0,
      contrast:   camera.status === "warning" ? 0.95 : 1.08,
      greenTint:  false,
      noise:      camera.ir_capable ? 0.05 : 0.02,
      vignette:   true,
    },
  }
}

// Cache derived configs so we don't recompute every frame
const _cache = new Map<string, CameraViewConfig>()

export function getViewConfig(camera: CameraInput): CameraViewConfig {
  if (!_cache.has(camera.id)) {
    _cache.set(camera.id, deriveViewConfig(camera))
  }
  return _cache.get(camera.id)!
}

export function clearViewCache() {
  _cache.clear()
}

// Apply night-vision effects based on simulation hour
export function applyNightVision(config: CameraViewConfig, hour: number): CameraViewConfig {
  const isNight = hour >= 21 || hour < 5
  if (!isNight) return config
  const hasIR = config.effects.grayscale > 0
  return {
    ...config,
    effects: {
      ...config.effects,
      grayscale:  hasIR ? 1.0 : config.effects.grayscale,
      greenTint:  hasIR,
      brightness: hasIR ? 1.3 : config.effects.brightness * 0.4,
      noise:      config.effects.noise + (hasIR ? 0.06 : 0.12),
    },
  }
}

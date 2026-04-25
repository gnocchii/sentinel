/**
 * Maps each hardcoded camera to a segment of the walkthrough video.
 *
 * Concept: a walkthrough video records someone walking through the space.
 * Each camera is positioned at a different point in that space.
 * We simulate what camera X sees by finding the video segment where
 * the operator is nearest to camera X's position, then cropping and
 * transforming the frame to match that camera's FOV and angle.
 *
 * Numbers are tuned for a ~60s office interior walkthrough video.
 * Swap walkthrough.mp4 and re-tune timestamps to match your video.
 */

export interface CameraViewConfig {
  cameraId: string

  // Which segment of the video to loop (seconds)
  startTime: number
  endTime: number

  // Normalized crop of the video frame [0–1].
  // cropX/cropY = top-left corner, cropW/cropH = size.
  // Narrower FOV cameras get a smaller crop (more zoom).
  cropX: number
  cropY: number
  cropW: number
  cropH: number

  // Tilt the canvas to simulate a downward-angled mount
  tiltDeg: number

  // Per-camera visual effects
  effects: {
    grayscale: number    // 0–1  (IR cameras → 1.0)
    brightness: number   // 0–2  (1.0 = normal)
    contrast: number     // 0–2  (1.0 = normal)
    greenTint: boolean   // true for active night-vision IR
    noise: number        // 0–1  film grain intensity
    vignette: boolean    // darkened edges (security cam look)
  }
}

// Crop width from FOV: wider FOV = larger crop slice of the frame
function fovToCropW(fovH: number): number {
  // 120° → 0.92, 110° → 0.82, 100° → 0.72, 80° → 0.58, 65° → 0.48
  return Math.min(0.95, 0.48 + (fovH - 65) * 0.0147)
}

export const CAMERA_VIDEO_MAP: CameraViewConfig[] = [
  {
    cameraId: "CAM-01",
    startTime: 6, endTime: 14,
    // SW corner of main room — wide Dome 4K looking NE into the space
    cropX: 0.08, cropY: 0.10, cropW: fovToCropW(110), cropH: 0.78,
    tiltDeg: 12,
    effects: { grayscale: 0, brightness: 1.05, contrast: 1.1, greenTint: false, noise: 0.03, vignette: true },
  },
  {
    cameraId: "CAM-02",
    startTime: 30, endTime: 38,
    // SE corner (server room) — Dome 4K looking NW, darker area
    cropX: 0.05, cropY: 0.12, cropW: fovToCropW(110), cropH: 0.76,
    tiltDeg: 15,
    effects: { grayscale: 0, brightness: 0.9, contrast: 1.15, greenTint: false, noise: 0.05, vignette: true },
  },
  {
    cameraId: "CAM-03",
    startTime: 46, endTime: 54,
    // NE corner (office) — Bullet 2K narrow FOV looking SW
    cropX: 0.20, cropY: 0.08, cropW: fovToCropW(80), cropH: 0.80,
    tiltDeg: 8,
    effects: { grayscale: 0, brightness: 1.0, contrast: 1.05, greenTint: false, noise: 0.04, vignette: true },
  },
  {
    cameraId: "CAM-04",
    startTime: 17, endTime: 25,
    // Corridor center — Dome WDR wide angle (backlit from windows)
    cropX: 0.04, cropY: 0.06, cropW: fovToCropW(120), cropH: 0.88,
    tiltDeg: 5,
    effects: { grayscale: 0, brightness: 1.1, contrast: 0.95, greenTint: false, noise: 0.02, vignette: true },
  },
  {
    cameraId: "CAM-05",
    startTime: 1, endTime: 8,
    // Main entrance — Dome IR looking inward down entry corridor
    cropX: 0.12, cropY: 0.10, cropW: fovToCropW(100), cropH: 0.78,
    tiltDeg: 10,
    effects: { grayscale: 0.15, brightness: 1.0, contrast: 1.1, greenTint: false, noise: 0.04, vignette: true },
  },
  {
    cameraId: "CAM-06",
    startTime: 37, endTime: 45,
    // Back door — Dome IR looking inward, slightly dim
    cropX: 0.10, cropY: 0.08, cropW: fovToCropW(100), cropH: 0.80,
    tiltDeg: 10,
    effects: { grayscale: 0.2, brightness: 0.95, contrast: 1.15, greenTint: false, noise: 0.06, vignette: true },
  },
  {
    cameraId: "CAM-07",
    startTime: 22, endTime: 30,
    // PTZ center — narrowest FOV, highest mount, looking south across space
    cropX: 0.25, cropY: 0.05, cropW: fovToCropW(65), cropH: 0.88,
    tiltDeg: 20,
    effects: { grayscale: 0, brightness: 1.05, contrast: 1.05, greenTint: false, noise: 0.02, vignette: true },
  },
]

// Activate night-vision green tint when simulationHour is dark (21–5)
export function applyNightVision(config: CameraViewConfig, hour: number): CameraViewConfig {
  const isNight = hour >= 21 || hour < 5
  if (!isNight) return config
  const hasIR = config.effects.grayscale > 0
  return {
    ...config,
    effects: {
      ...config.effects,
      grayscale: hasIR ? 1.0 : config.effects.grayscale,
      greenTint: hasIR,
      brightness: hasIR ? 1.3 : config.effects.brightness * 0.4,
      noise: config.effects.noise + (hasIR ? 0.06 : 0.12),
    },
  }
}

export function getViewConfig(cameraId: string): CameraViewConfig | null {
  return CAMERA_VIDEO_MAP.find((c) => c.cameraId === cameraId) ?? null
}

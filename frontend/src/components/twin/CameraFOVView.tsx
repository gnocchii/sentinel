"use client"
/**
 * CameraFOVView — simulates what a placed camera would see.
 *
 * How it works:
 *   1. A hidden <video> element plays the walkthrough video.
 *   2. requestAnimationFrame copies each frame to a <canvas>.
 *   3. The canvas drawImage call crops to the camera's FOV slice.
 *   4. CSS filters apply per-camera effects (IR grayscale, WDR brightness, etc.).
 *   5. A canvas 2D overlay draws the security-cam HUD (timestamp, REC, grid lines).
 *
 * The video loops within the segment assigned to this camera in cameraVideoMap.ts.
 */

import { useEffect, useRef, useCallback, useState } from "react"
import { getViewConfig, applyNightVision } from "@/lib/cameraVideoMap"
import type { Camera } from "@/lib/types"
import { useSentinel } from "@/store/sentinel"

const VIDEO_SRC = "/walkthrough.mp4"

interface Props {
  camera: Camera
  width?: number
  height?: number
  className?: string
}

export default function CameraFOVView({ camera, width = 480, height = 270, className = "" }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)
  const { simulationHour } = useSentinel()

  const [videoLoaded, setVideoLoaded] = useState(false)
  const [videoError, setVideoError]   = useState(false)

  const rawConfig = getViewConfig(camera)
  const config = rawConfig ? applyNightVision(rawConfig, simulationHour) : null

  // Draw one frame: crop + HUD overlay
  const drawFrame = useCallback(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !config || video.readyState < 2) return
    const ctx = canvas.getContext("2d")!
    const vw = video.videoWidth
    const vh = video.videoHeight

    // Source crop in video pixels
    const sx = config.cropX * vw
    const sy = config.cropY * vh
    const sw = config.cropW * vw
    const sh = config.cropH * vh

    // Clear + draw cropped frame
    ctx.save()
    // Tilt: rotate canvas around center for mount angle simulation
    if (config.tiltDeg !== 0) {
      ctx.translate(width / 2, height / 2)
      ctx.rotate((config.tiltDeg * Math.PI) / 180 * 0.15) // subtle tilt
      ctx.translate(-width / 2, -height / 2)
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height)
    ctx.restore()

    // Vignette overlay
    if (config.effects.vignette) {
      const grad = ctx.createRadialGradient(width / 2, height / 2, height * 0.25, width / 2, height / 2, height * 0.75)
      grad.addColorStop(0, "rgba(0,0,0,0)")
      grad.addColorStop(1, "rgba(0,0,0,0.55)")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)
    }

    // Green tint for night-vision IR
    if (config.effects.greenTint) {
      ctx.fillStyle = "rgba(0,40,0,0.25)"
      ctx.fillRect(0, 0, width, height)
    }

    // Film grain
    if (config.effects.noise > 0) {
      drawNoise(ctx, width, height, config.effects.noise)
    }

    // HUD overlay
    drawHUD(ctx, camera, width, height, simulationHour)
  }, [config, camera, width, height, simulationHour])

  // RAF loop
  const startLoop = useCallback(() => {
    const loop = () => {
      drawFrame()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [drawFrame])

  // Segment looping: when video passes endTime, seek back to startTime
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || !config) return
    if (video.currentTime >= config.endTime) {
      video.currentTime = config.startTime
    }
  }, [config])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !config) return

    video.currentTime = config.startTime
    video.play().catch(() => {})
    video.addEventListener("timeupdate", handleTimeUpdate)
    startLoop()

    return () => {
      cancelAnimationFrame(rafRef.current)
      video.removeEventListener("timeupdate", handleTimeUpdate)
      video.pause()
    }
  }, [config, handleTimeUpdate, startLoop])

  // Apply CSS filters for brightness/contrast/grayscale
  const cssFilter = config
    ? [
        `grayscale(${config.effects.grayscale})`,
        `brightness(${config.effects.brightness})`,
        `contrast(${config.effects.contrast})`,
      ].join(" ")
    : ""

  if (!config) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/30 rounded text-dim text-xs ${className}`}
        style={{ width, height }}
      >
        No view config for {camera.id}
      </div>
    )
  }

  return (
    <div className={`relative rounded overflow-hidden ${className}`} style={{ width, height }}>
      {/* Hidden video source */}
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        muted
        playsInline
        preload="auto"
        className="hidden"
        onCanPlay={() => setVideoLoaded(true)}
        onError={() => setVideoError(true)}
      />

      {/* Rendered output */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ filter: cssFilter, display: "block" }}
      />

      {/* Fallback: shown when video hasn't loaded or errored */}
      {(!videoLoaded || videoError) && (
        <NoVideoFallback camera={camera} width={width} height={height} error={videoError} />
      )}
    </div>
  )
}

// ─── HUD drawing ────────────────────────────────────────────────

function drawHUD(ctx: CanvasRenderingContext2D, camera: Camera, w: number, h: number, hour: number) {
  const ts = `${String(hour).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}:${String(new Date().getSeconds()).padStart(2, "0")}`

  ctx.save()
  ctx.font = "bold 11px 'JetBrains Mono', monospace"
  ctx.fillStyle = "rgba(0,255,136,0.9)"

  // Top-left: camera ID
  ctx.fillText(camera.id, 8, 18)

  // Top-right: timestamp
  const tsW = ctx.measureText(ts).width
  ctx.fillText(ts, w - tsW - 8, 18)

  // Bottom-left: camera type
  ctx.font = "9px monospace"
  ctx.fillStyle = "rgba(0,255,136,0.6)"
  ctx.fillText(camera.type.toUpperCase(), 8, h - 8)

  // Bottom-right: REC indicator
  if (camera.status !== "offline") {
    ctx.fillStyle = "rgba(255,68,68,0.9)"
    ctx.beginPath()
    ctx.arc(w - 20, h - 12, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = "9px monospace"
    ctx.fillStyle = "rgba(255,68,68,0.9)"
    ctx.fillText("REC", w - 14, h - 8)
  }

  // Subtle crosshair in center
  ctx.strokeStyle = "rgba(0,255,136,0.2)"
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(w / 2 - 12, h / 2); ctx.lineTo(w / 2 + 12, h / 2)
  ctx.moveTo(w / 2, h / 2 - 8);  ctx.lineTo(w / 2, h / 2 + 8)
  ctx.stroke()

  // Warning status badge
  if (camera.status === "warning") {
    ctx.fillStyle = "rgba(255,170,0,0.85)"
    ctx.font = "bold 9px monospace"
    ctx.fillText("⚠ OBSTRUCTION", 8, h - 22)
  }

  ctx.restore()
}

function drawNoise(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number) {
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const amount = intensity * 40
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount
    data[i]     = Math.min(255, Math.max(0, data[i]     + n))
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n))
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n))
  }
  ctx.putImageData(imageData, 0, 0)
}

// ─── Fallback if walkthrough.mp4 isn't present ──────────────────

function NoVideoFallback({ camera, width, height, error }: { camera: Camera; width: number; height: number; error: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg/90 text-center p-3">
      {/* Animated scan line effect while waiting */}
      <div className="absolute inset-0 overflow-hidden opacity-20">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-t border-green/30 w-full" style={{ marginTop: `${(height / 6) * i}px` }} />
        ))}
      </div>

      <div className="relative z-10 space-y-2">
        <div className="text-green text-xs font-semibold font-mono">{camera.id} · {camera.type}</div>
        {error ? (
          <p className="text-dim text-[10px] leading-relaxed">
            Add walkthrough video to
            <br />
            <span className="text-cyan font-mono">frontend/public/walkthrough.mp4</span>
            <br />
            <a
              href="https://www.pexels.com/search/videos/office+interior+walkthrough/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan underline"
            >
              Download free from Pexels →
            </a>
          </p>
        ) : (
          <p className="text-dim text-[10px]">Loading feed…</p>
        )}
      </div>
    </div>
  )
}

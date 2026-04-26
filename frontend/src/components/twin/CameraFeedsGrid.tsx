"use client"
/**
 * CameraFeedsGrid — full-viewport grid of simulated camera views.
 * "See through the eyes of your future system" tab.
 *
 * Two render modes:
 *   - Avery House scene: video-crop simulated views (one shared <video>, per-camera canvas).
 *   - Any other scene:    static security-cam HUDs (no video — synthetic per-camera previews).
 */

import { useEffect, useRef, useCallback, useState } from "react"
import { useSentinel } from "@/store/sentinel"
import { getViewConfig, applyNightVision } from "@/lib/cameraVideoMap"
import CameraFOVView from "./CameraFOVView"
import type { Camera } from "@/lib/types"

const VIDEO_SRC = "/walkthrough.mp4"

export default function CameraFeedsGrid() {
  const { cameras, selectedCameraId, selectCamera, simulationHour, sceneId } = useSentinel()
  const videoRef   = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const sceneSupportsVideo = sceneId === "avery_house"

  // Only load the walkthrough video for the Avery House demo. For any other
  // scene the video is irrelevant (and walkthrough.mp4 may not exist).
  useEffect(() => {
    if (!sceneSupportsVideo) return
    const v = videoRef.current
    if (!v) return
    v.src = VIDEO_SRC
    v.muted = true
    v.playsInline = true
    v.preload = "auto"
    v.oncanplay  = () => setReady(true)
    v.onerror    = () => setError(true)
    v.load()
  }, [sceneSupportsVideo])

  const selectedCam = cameras.find((c) => c.id === selectedCameraId) ?? cameras[0]
  const hasMappedCam = !!selectedCam && !!getViewConfig(selectedCam.id)

  if (cameras.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg text-center p-8">
        <div className="space-y-2 max-w-md">
          <p className="text-text text-sm">No cameras placed yet</p>
          <p className="text-dim text-xs">Click <span className="text-cyan">Optimize Cameras</span> below to run the K2-importance pipeline. Then come back here for the camera POV view.</p>
        </div>
      </div>
    )
  }

  if (!sceneSupportsVideo || !hasMappedCam) {
    return <StaticFeedsLayout
      cameras={cameras}
      selectedCameraId={selectedCameraId}
      onSelect={selectCamera}
      hour={simulationHour}
    />
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg text-center p-8">
        <div className="space-y-2">
          <p className="text-dim text-sm">Video not found at <span className="text-cyan font-mono">frontend/public/walkthrough.mp4</span></p>
          <a
            href="https://www.pexels.com/search/videos/office+interior+walkthrough/"
            target="_blank" rel="noopener noreferrer"
            className="text-cyan text-xs underline"
          >Download a free walkthrough from Pexels →</a>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-bg overflow-hidden">
      {/* Top: selected camera — large featured view */}
      {selectedCam && (
        <div className="flex gap-0 flex-1 min-h-0">
          <FeaturedFeed
            camera={selectedCam}
            videoEl={videoRef.current}
            ready={ready}
            hour={simulationHour}
          />

          {/* Right column: other cameras */}
          <div className="w-48 flex flex-col gap-px bg-border shrink-0 overflow-y-auto">
            {cameras
              .filter((c) => c.id !== selectedCam.id)
              .map((cam) => (
                <MiniFeed
                  key={cam.id}
                  camera={cam}
                  videoEl={videoRef.current}
                  ready={ready}
                  hour={simulationHour}
                  onClick={() => selectCamera(cam.id)}
                />
              ))}
          </div>
        </div>
      )}

      {/* Hidden shared video source */}
      <video ref={videoRef} className="hidden" />
    </div>
  )
}

// ─── Featured (large) feed ──────────────────────────────────────

function FeaturedFeed({
  camera, videoEl, ready, hour,
}: {
  camera: Camera; videoEl: HTMLVideoElement | null; ready: boolean; hour: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)
  const raw       = ready ? getViewConfig(camera) : null
  const config    = raw ? applyNightVision(raw, hour) : null

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const video  = videoEl
    if (!canvas || !video || !config || video.readyState < 2) return
    const ctx = canvas.getContext("2d")!
    const { videoWidth: vw, videoHeight: vh } = video

    ctx.drawImage(
      video,
      config.cropX * vw, config.cropY * vh, config.cropW * vw, config.cropH * vh,
      0, 0, canvas.width, canvas.height,
    )
    drawVignette(ctx, canvas.width, canvas.height)
    if (config.effects.greenTint) {
      ctx.fillStyle = "rgba(0,40,0,0.22)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    drawHUD(ctx, camera, canvas.width, canvas.height, hour, "large")
  }, [config, videoEl, camera, hour])

  // Segment loop + RAF
  useEffect(() => {
    if (!config || !videoEl) return
    videoEl.currentTime = config.startTime
    videoEl.play().catch(() => {})

    const onTime = () => {
      if (videoEl.currentTime >= config.endTime) videoEl.currentTime = config.startTime
    }
    videoEl.addEventListener("timeupdate", onTime)

    const loop = () => { draw(); rafRef.current = requestAnimationFrame(loop) }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      videoEl.removeEventListener("timeupdate", onTime)
    }
  }, [config, videoEl, draw])

  const filter = config
    ? `grayscale(${config.effects.grayscale}) brightness(${config.effects.brightness}) contrast(${config.effects.contrast})`
    : ""

  return (
    <div className="flex-1 relative min-w-0 bg-black">
      <canvas
        ref={canvasRef}
        width={960}
        height={540}
        style={{ width: "100%", height: "100%", objectFit: "cover", filter }}
      />
      {!ready && <LoadingOverlay cameraId={camera.id} />}
    </div>
  )
}

// ─── Mini feed tile ─────────────────────────────────────────────

function MiniFeed({
  camera, videoEl, ready, hour, onClick,
}: {
  camera: Camera; videoEl: HTMLVideoElement | null; ready: boolean; hour: number; onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)
  const rawMini   = ready ? getViewConfig(camera) : null
  const config    = rawMini ? applyNightVision(rawMini, hour) : null

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const video  = videoEl
    if (!canvas || !video || !config || video.readyState < 2) return
    const ctx  = canvas.getContext("2d")!
    const { videoWidth: vw, videoHeight: vh } = video

    // Each mini-feed samples a static frame (no looping) to avoid fighting the featured feed
    const sampleT = config.startTime + (config.endTime - config.startTime) * 0.3
    if (Math.abs(video.currentTime - sampleT) > 3) {
      // Don't seek — just draw whatever frame is current, tinted for this camera
    }
    ctx.drawImage(
      video,
      config.cropX * vw, config.cropY * vh, config.cropW * vw, config.cropH * vh,
      0, 0, canvas.width, canvas.height,
    )
    drawVignette(ctx, canvas.width, canvas.height)
    drawHUD(ctx, camera, canvas.width, canvas.height, hour, "mini")
  }, [config, videoEl, camera, hour])

  useEffect(() => {
    if (!ready) return
    const loop = () => { draw(); rafRef.current = requestAnimationFrame(loop) }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [ready, draw])

  const filter = config
    ? `grayscale(${config.effects.grayscale}) brightness(${config.effects.brightness}) contrast(${config.effects.contrast})`
    : ""

  return (
    <button onClick={onClick} className="relative flex-shrink-0 w-full hover:brightness-110 transition-all">
      <canvas
        ref={canvasRef}
        width={192}
        height={108}
        style={{ width: "100%", display: "block", filter }}
      />
      {!ready && <LoadingOverlay cameraId={camera.id} mini />}
    </button>
  )
}

// ─── Helpers ────────────────────────────────────────────────────

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75)
  g.addColorStop(0, "rgba(0,0,0,0)")
  g.addColorStop(1, "rgba(0,0,0,0.55)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  w: number,
  h: number,
  hour: number,
  size: "large" | "mini",
) {
  const fs    = size === "large" ? 13 : 8
  const pad   = size === "large" ? 10 : 4
  const ts    = `${String(hour).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}:${String(new Date().getSeconds()).padStart(2, "0")}`
  const green = "rgba(0,255,136,0.9)"
  const dimG  = "rgba(0,255,136,0.5)"

  ctx.save()
  ctx.font = `bold ${fs}px 'JetBrains Mono', monospace`

  // Camera ID — top left
  ctx.fillStyle = green
  ctx.fillText(camera.id, pad, pad + fs)

  // Timestamp — top right
  const tsW = ctx.measureText(ts).width
  ctx.fillText(ts, w - tsW - pad, pad + fs)

  if (size === "large") {
    // Camera type — bottom left
    ctx.font = `${fs - 2}px monospace`
    ctx.fillStyle = dimG
    ctx.fillText(camera.type.toUpperCase(), pad, h - pad)

    // FOV — bottom center
    const fovTxt = `${camera.fov_h}° FOV`
    const fovW = ctx.measureText(fovTxt).width
    ctx.fillText(fovTxt, w / 2 - fovW / 2, h - pad)
  }

  // REC dot — top right under timestamp
  if (camera.status !== "offline") {
    ctx.fillStyle = "rgba(255,50,50,0.9)"
    ctx.beginPath()
    ctx.arc(w - pad - (size === "large" ? 6 : 4), pad + fs + (size === "large" ? 14 : 8), size === "large" ? 5 : 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Warning badge
  if (camera.status === "warning" && size === "large") {
    ctx.fillStyle = "rgba(255,170,0,0.9)"
    ctx.font = `bold ${fs - 1}px monospace`
    ctx.fillText("⚠ OBSTRUCTION DETECTED", pad, h - pad - 16)
  }

  // Subtle center crosshair (large only)
  if (size === "large") {
    ctx.strokeStyle = "rgba(0,255,136,0.18)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(w / 2 - 18, h / 2); ctx.lineTo(w / 2 + 18, h / 2)
    ctx.moveTo(w / 2, h / 2 - 12); ctx.lineTo(w / 2, h / 2 + 12)
    ctx.stroke()
  }

  ctx.restore()
}

function LoadingOverlay({ cameraId, mini = false }: { cameraId: string; mini?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg/80">
      <span className={`text-dim font-mono ${mini ? "text-[8px]" : "text-xs"}`}>
        {mini ? cameraId : `${cameraId} — loading…`}
      </span>
    </div>
  )
}

// ─── Static feeds layout (used when no walkthrough video is appropriate) ──

function StaticFeedsLayout({
  cameras, selectedCameraId, onSelect, hour,
}: {
  cameras: Camera[]
  selectedCameraId: string | null
  onSelect: (id: string | null) => void
  hour: number
}) {
  const selected = cameras.find((c) => c.id === selectedCameraId) ?? cameras[0]
  const others = cameras.filter((c) => c.id !== selected.id)

  return (
    <div className="w-full h-full flex flex-col bg-bg overflow-hidden">
      <div className="px-4 py-2 border-b border-border">
        <p className="text-dim text-[10px]">
          Synthetic camera previews · no walkthrough video for this scan ·
          <span className="text-text"> Use Digital Twin tab to verify positions in 3D</span>
        </p>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* Featured */}
        <div className="flex-1 p-4 min-w-0">
          <CameraFOVView
            camera={selected}
            width={800}
            height={500}
            className="w-full h-full"
          />
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-cyan font-semibold">{selected.id}</span>
            <span className="text-dim">{selected.type} · {selected.fov_h}° FOV · ${selected.cost_usd}</span>
            <span className="text-dim">·</span>
            <span className="text-dim font-mono">
              ({selected.position[0].toFixed(1)}, {selected.position[1].toFixed(1)}, {selected.position[2].toFixed(1)})
            </span>
          </div>
        </div>

        {/* Side grid */}
        <div className="w-56 flex flex-col gap-1 p-2 overflow-y-auto border-l border-border">
          {others.map((cam) => (
            <button
              key={cam.id}
              onClick={() => onSelect(cam.id)}
              className="block w-full hover:brightness-125 transition-all"
            >
              <CameraFOVView camera={cam} width={208} height={117} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

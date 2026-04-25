"use client"
/**
 * Top-down 2D heatmap of coverage density.
 * Renders via an HTML canvas — no WebGL needed for this view.
 * TODO: replace placeholder gradient with real coverage grid from raycast service.
 */
import { useEffect, useRef } from "react"
import { useSentinel } from "@/store/sentinel"

export default function CoverageMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { scene, cameras } = useSentinel()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !scene) return
    const ctx = canvas.getContext("2d")!
    const W = canvas.width
    const H = canvas.height

    const [bx, by] = [scene.bounds.max[0], scene.bounds.max[1]]
    const sx = W / bx
    const sy = H / by

    ctx.fillStyle = "#0a0c0f"
    ctx.fillRect(0, 0, W, H)

    // Floor
    ctx.fillStyle = "#111418"
    ctx.fillRect(0, 0, W, H)

    // Coverage radial gradients per camera
    for (const cam of cameras) {
      const [cx, cy] = [cam.position[0] * sx, H - cam.position[1] * sy]
      const radius = Math.tan(((cam.fov_h / 2) * Math.PI) / 180) * 5 * ((sx + sy) / 2)
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      const alpha = cam.status === "active" ? 0.18 : 0.06
      grad.addColorStop(0,   `rgba(0,255,136,${alpha})`)
      grad.addColorStop(0.7, `rgba(0,255,136,${alpha * 0.4})`)
      grad.addColorStop(1,   "rgba(0,255,136,0)")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
    }

    // Walls
    ctx.strokeStyle = "#2a3240"
    ctx.lineWidth = 2
    for (const wall of scene.walls) {
      ctx.beginPath()
      ctx.moveTo(wall.from[0] * sx, H - wall.from[1] * sy)
      ctx.lineTo(wall.to[0] * sx, H - wall.to[1] * sy)
      ctx.stroke()
    }

    // Blind spots
    for (const bs of scene.analysis.blind_spots) {
      const [bsx, bsy] = [bs.position[0] * sx, H - bs.position[1] * sy]
      ctx.fillStyle = "rgba(255,68,68,0.25)"
      ctx.beginPath()
      ctx.arc(bsx, bsy, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = "#ff4444"
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Entry points
    for (const ep of scene.entry_points) {
      const [epx, epy] = [ep.position[0] * sx, H - ep.position[1] * sy]
      ctx.fillStyle = ep.type === "door" ? "#ff4444" : "#ffaa00"
      ctx.beginPath()
      ctx.arc(epx, epy, 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [scene, cameras])

  return (
    <div className="w-full h-full flex items-center justify-center bg-bg">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="max-w-full max-h-full rounded"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  )
}

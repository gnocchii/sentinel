"use client"
/**
 * Top-down 2D visualization of K2's importance scores.
 * Each cell is colored by its importance value (0=privacy, 1=critical chokepoint).
 * Walls overlay in dim color, doors as bright dots, room labels float above their centroid.
 */
import { useEffect, useRef } from "react"
import { useSentinel } from "@/store/sentinel"

export default function ImportanceMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { scene, importance } = useSentinel()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const W = canvas.width
    const H = canvas.height

    ctx.fillStyle = "#0a0c0f"
    ctx.fillRect(0, 0, W, H)

    if (!importance || !scene) {
      ctx.fillStyle = "#5a6a7a"
      ctx.font = "14px monospace"
      ctx.fillText("Loading importance map…", 20, H / 2)
      return
    }

    const [bxMin, byMin] = importance.bounds.min
    const [bxMax, byMax] = importance.bounds.max
    const worldW = bxMax - bxMin
    const worldH = byMax - byMin
    const scale = Math.min(W / worldW, H / worldH) * 0.9
    const offsetX = (W - worldW * scale) / 2
    const offsetY = (H - worldH * scale) / 2
    const toScreenX = (x: number) => offsetX + (x - bxMin) * scale
    const toScreenY = (y: number) => offsetY + (byMax - y) * scale  // flip Y for top-down

    // ── Heatmap fill ──
    const grid = importance.grid
    const [gridH, gridW] = importance.shape
    const cellPx = importance.resolution * scale
    for (let r = 0; r < gridH; r++) {
      for (let c = 0; c < gridW; c++) {
        const v = grid[r][c]
        if (v <= 0) continue
        const sx = offsetX + (c * importance.resolution) * scale
        const sy = offsetY + (worldH - (r + 1) * importance.resolution) * scale
        ctx.fillStyle = colorForScore(v)
        ctx.fillRect(sx, sy, cellPx + 0.5, cellPx + 0.5)
      }
    }

    // ── Walls ──
    ctx.strokeStyle = "rgba(120, 140, 165, 0.85)"
    ctx.lineWidth = 1.5
    for (const wall of scene.walls) {
      ctx.beginPath()
      ctx.moveTo(toScreenX(wall.from[0]), toScreenY(wall.from[1]))
      ctx.lineTo(toScreenX(wall.to[0]), toScreenY(wall.to[1]))
      ctx.stroke()
    }

    // ── Doors ──
    for (const ep of scene.entry_points) {
      const door = importance.doors.find((d) => d.id === ep.id)
      const score = door?.score ?? 0.9
      const sx = toScreenX(ep.position[0])
      const sy = toScreenY(ep.position[1])
      ctx.fillStyle = `rgba(255, ${Math.round(255 * (1 - score))}, ${Math.round(120 * (1 - score))}, 0.95)`
      ctx.beginPath()
      ctx.arc(sx, sy, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = "rgba(0,0,0,0.6)"
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // ── Room labels ──
    ctx.font = "bold 11px 'JetBrains Mono', monospace"
    ctx.textAlign = "center"
    for (const room of importance.rooms) {
      const sceneRoom = scene.rooms.find((r) => r.id === room.id)
      if (!sceneRoom) continue
      const cx = (sceneRoom.bounds.min[0] + sceneRoom.bounds.max[0]) / 2
      const cy = (sceneRoom.bounds.min[1] + sceneRoom.bounds.max[1]) / 2
      const sx = toScreenX(cx)
      const sy = toScreenY(cy)
      ctx.fillStyle = "rgba(10,12,15,0.75)"
      const label = `${room.inferred_type} · ${room.score.toFixed(2)}`
      const m = ctx.measureText(label)
      ctx.fillRect(sx - m.width / 2 - 6, sy - 9, m.width + 12, 16)
      ctx.fillStyle = "#ffffff"
      ctx.fillText(label, sx, sy + 3)
    }

    // ── Legend ──
    drawLegend(ctx, W, H)
  }, [scene, importance])

  return (
    <div className="w-full h-full flex flex-col bg-bg">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text">K2 Importance Map</h3>
          <p className="text-[10px] text-dim">
            {importance
              ? `${importance.rooms.length} rooms · ${importance.doors.length} doors · ${importance.meta?.source}`
              : "—"}
          </p>
        </div>
        {importance?.meta?.source === "fallback" && (
          <div className="text-[10px] text-amber-400">fallback scoring (K2 unreachable)</div>
        )}
      </div>
      <div className="flex-1 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={1000}
          height={700}
          className="max-w-full max-h-full"
        />
      </div>
    </div>
  )
}

function colorForScore(v: number): string {
  // Cool blue (low) → cyan → green (mid) → yellow → red (high)
  // RGB stops: 0→[20,30,80], 0.25→[30,140,200], 0.5→[80,220,140], 0.75→[240,220,80], 1.0→[240,80,80]
  const stops: [number, [number, number, number]][] = [
    [0.0, [20, 30, 80]],
    [0.25, [30, 140, 200]],
    [0.5, [80, 220, 140]],
    [0.75, [240, 220, 80]],
    [1.0, [240, 80, 80]],
  ]
  v = Math.max(0, Math.min(1, v))
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i]
    if (v <= t1) {
      const [t0, c0] = stops[i - 1]
      const f = (v - t0) / (t1 - t0)
      const r = Math.round(c0[0] + f * (c1[0] - c0[0]))
      const g = Math.round(c0[1] + f * (c1[1] - c0[1]))
      const b = Math.round(c0[2] + f * (c1[2] - c0[2]))
      return `rgba(${r},${g},${b},0.85)`
    }
  }
  return "rgb(240,80,80)"
}

function drawLegend(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const lw = 200
  const lh = 12
  const x = W - lw - 20
  const y = H - 30
  const grad = ctx.createLinearGradient(x, 0, x + lw, 0)
  for (let i = 0; i <= 10; i++) {
    grad.addColorStop(i / 10, colorForScore(i / 10))
  }
  ctx.fillStyle = grad
  ctx.fillRect(x, y, lw, lh)
  ctx.strokeStyle = "rgba(120,140,165,0.6)"
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, lw, lh)
  ctx.fillStyle = "#aab5c5"
  ctx.font = "10px monospace"
  ctx.textAlign = "left"
  ctx.fillText("0 (privacy)", x, y - 4)
  ctx.textAlign = "right"
  ctx.fillText("1 (chokepoint)", x + lw, y - 4)
}

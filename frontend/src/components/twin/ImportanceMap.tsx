"use client"
/**
 * Top-down 2D visualization of K2's importance scores.
 * Each cell is colored by its importance value (0=privacy, 1=critical chokepoint).
 * Walls overlay in dim color, doors as bright dots, room labels float above their centroid.
 */
import { useEffect, useRef, useState } from "react"
import { useSentinel } from "@/store/sentinel"
import { fetchImportance } from "@/lib/api"

export default function ImportanceMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scene = useSentinel((s) => s.scene)
  const sceneId = useSentinel((s) => s.sceneId)
  const importance = useSentinel((s) => s.importance)
  const setImportance = useSentinel((s) => s.setImportance)
  const pushActivity = useSentinel((s) => s.pushActivity)
  const startLoading = useSentinel((s) => s.startLoading)
  const stopLoading = useSentinel((s) => s.stopLoading)

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const fetchedFor = useRef<string | null>(null)

  // Auto-fetch importance once per scene if it's missing
  useEffect(() => {
    if (!sceneId || importance || fetchedFor.current === sceneId) return
    fetchedFor.current = sceneId
    setBusy(true)
    setError(null)
    startLoading("importance", "Loading importance map")
    fetchImportance(sceneId)
      .then((imp) => {
        setImportance(imp)
        if (!imp || !imp.grid || !imp.grid.length) {
          setError("Importance payload was empty — try Recompute")
        }
      })
      .catch((e) => {
        console.error("[importance] fetch failed", e)
        setError(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`)
        pushActivity({
          severity: "warning",
          title: "Importance map fetch failed",
          body: e instanceof Error ? e.message : String(e),
        })
      })
      .finally(() => {
        setBusy(false)
        stopLoading("importance")
      })
  }, [sceneId, importance, setImportance, pushActivity, startLoading, stopLoading])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = "#0a0c0f"
    ctx.fillRect(0, 0, W, H)

    if (!importance || !scene) return
    const grid = importance.grid
    if (!grid || !grid.length || !grid[0]?.length) return

    const [bxMin, byMin] = importance.bounds.min
    const [bxMax, byMax] = importance.bounds.max
    const worldW = bxMax - bxMin
    const worldH = byMax - byMin
    if (worldW <= 0 || worldH <= 0) return

    const scale = Math.min(W / worldW, H / worldH) * 0.9
    const offsetX = (W - worldW * scale) / 2
    const offsetY = (H - worldH * scale) / 2
    const toScreenX = (x: number) => offsetX + (x - bxMin) * scale
    const toScreenY = (y: number) => offsetY + (byMax - y) * scale

    const [gridH, gridW] = importance.shape
    const cellPx = importance.resolution * scale
    for (let r = 0; r < gridH; r++) {
      for (let c = 0; c < gridW; c++) {
        const v = grid[r]?.[c] ?? 0
        if (v <= 0) continue
        const sx = offsetX + (c * importance.resolution) * scale
        const sy = offsetY + (worldH - (r + 1) * importance.resolution) * scale
        ctx.fillStyle = colorForScore(v)
        ctx.fillRect(sx, sy, cellPx + 0.5, cellPx + 0.5)
      }
    }

    ctx.strokeStyle = "rgba(120, 140, 165, 0.85)"
    ctx.lineWidth = 1.5
    for (const wall of scene.walls) {
      ctx.beginPath()
      ctx.moveTo(toScreenX(wall.from[0]), toScreenY(wall.from[1]))
      ctx.lineTo(toScreenX(wall.to[0]), toScreenY(wall.to[1]))
      ctx.stroke()
    }

    for (const ep of scene.entry_points) {
      const door = importance.doors.find((d) => d.id === ep.id)
      const score = door?.score ?? 0.9
      const sx = toScreenX(ep.position[0])
      const sy = toScreenY(ep.position[1])
      ctx.fillStyle = `rgba(137, 180, 250, ${0.5 + score * 0.5})`
      ctx.beginPath()
      ctx.arc(sx, sy, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = "rgba(0,0,0,0.6)"
      ctx.lineWidth = 1
      ctx.stroke()
    }

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

    drawLegend(ctx, W, H)
  }, [scene, importance])

  const empty = !importance || !importance.grid?.length

  return (
    <div className="w-full h-full flex flex-col bg-transparent">
      <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text tracking-tight">Importance Map</h3>
          <p className="text-[10px] text-dim truncate">
            {importance && !empty
              ? `${importance.rooms.length} rooms · ${importance.doors.length} doors · source: ${importance.meta?.source}`
              : sceneId
                ? (busy ? "Loading…" : error ? "Error" : "No data")
                : "Upload a scene to compute"}
          </p>
        </div>
        {importance?.meta?.source === "fallback" && (
          <span className="text-[10px] text-amber shrink-0">fallback scoring</span>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        <canvas
          ref={canvasRef}
          width={1000}
          height={700}
          className="max-w-full max-h-full"
        />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-bg/80 backdrop-blur-md border border-white/[0.06] rounded-lg px-4 py-3 text-center pointer-events-auto max-w-sm">
              <p className="text-text text-sm font-medium mb-1">
                {!sceneId ? "No scene loaded" : busy ? "Computing importance map…" : error ? "Importance map unavailable" : "No importance data"}
              </p>
              <p className="text-dim text-[11px]">
                {error ?? (sceneId ? "Click Recompute to ask K2 for fresh scoring." : "Upload a USDZ to begin.")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function colorForScore(v: number): string {
  // All-blue ramp (low → high): deep navy → mid blue → bright cyan-blue
  const stops: [number, [number, number, number]][] = [
    [0.0,  [16, 24, 56]],
    [0.25, [40, 70, 140]],
    [0.5,  [80, 130, 210]],
    [0.75, [137, 180, 250]],
    [1.0,  [200, 230, 255]],
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
  return "rgba(200,230,255,0.85)"
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

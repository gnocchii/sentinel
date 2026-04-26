"use client"
import { useEffect } from "react"
import { useSentinel } from "@/store/sentinel"

const K2_DEMO_LINES = [
  "Loading scene geometry — 84.22 m² floor, 8 entry points, 6 corridor segments",
  "Threat-weighting entry vectors — front door 0.82 · back 0.74 · windows 0.41 avg",
  "Casting FOV cones at candidate ceiling anchors — 1,284 raw positions",
  "Pruning by occlusion raycast against walls + obstructions → 312 viable",
  "Sweeping camera-class × position grid under $2,500 budget",
  "Locking CAM-01 (entry priority, Bullet 2K) — Δcoverage +28.4%",
  "Locking CAM-02 (corridor pivot, Dome WDR) — Δcoverage +21.7%, +1 entry",
  "Locking CAM-03 — bias toward NW staircase per insider-class threat model",
  "Adversarial probe: 3 blind spots flagged · 2 mitigable with current budget",
  "Lighting risk pass — glare window 16:00–18:00 on SW corridor",
  "Re-scoring affected anchors with HDR/WDR class — risk neutralized",
  "Convergence reached — 7 cameras · 100.0% score · $1,613 ($887 under budget)",
  "Idle — Refresh or budget change retriggers placement reasoning",
]

export function useScene() {
  const k2Thinking = useSentinel((s) => s.k2Thinking)
  const appendK2Thinking = useSentinel((s) => s.appendK2Thinking)
  const setK2Streaming = useSentinel((s) => s.setK2Streaming)

  useEffect(() => {
    if (k2Thinking.length > 0) return
    let cancelled = false
    let i = 0
    setK2Streaming(true)
    const tick = () => {
      if (cancelled) return
      if (i >= K2_DEMO_LINES.length) {
        setK2Streaming(false)
        return
      }
      appendK2Thinking(K2_DEMO_LINES[i] + "\n")
      i += 1
      setTimeout(tick, 650 + Math.random() * 550)
    }
    const startId = setTimeout(tick, 250)
    return () => {
      cancelled = true
      clearTimeout(startId)
      setK2Streaming(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

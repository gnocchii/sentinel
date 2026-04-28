"use client"
import { useCallback, useRef } from "react"
import { useSentinel } from "@/store/sentinel"
import { optimizeImportance, recomputeImportance, streamImportanceReasoning } from "@/lib/api"

const MIN = 500
const MAX = 25000
// Hardcoded budget → camera count curve. Anchored so the default $2500 lands
// around 4 cameras and $25k pushes to 12. Slider updates camera count live.
const MIN_CAMS = 1
const MAX_CAMS = 12

function budgetToLog(v: number) {
  return (Math.log(v) - Math.log(MIN)) / (Math.log(MAX) - Math.log(MIN))
}

function logToBudget(t: number) {
  return Math.round(Math.exp(t * (Math.log(MAX) - Math.log(MIN)) + Math.log(MIN)) / 50) * 50
}

function budgetToCameraCount(budget: number, poolSize: number) {
  const t = budgetToLog(Math.max(MIN, Math.min(MAX, budget)))
  const target = Math.round(MIN_CAMS + t * (MAX_CAMS - MIN_CAMS))
  return Math.max(1, Math.min(poolSize, target))
}

export default function BudgetSlider() {
  const {
    budget, setBudget,
    sceneId, setCameras, setCoveragePct, setSceneAnalysis,
    importanceScore, setImportanceScore,
    optimizing, setOptimizing,
    pushActivity, startLoading, stopLoading,
    setImportance,
    appendK2Thinking, clearK2Text, setK2Streaming,
    selectCamera,
    cameraPool,
  } = useSentinel()

  const slideStartBudget = useRef<number | null>(null)
  const slideTimer = useRef<number | null>(null)

  const handleSlide = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (slideStartBudget.current === null) slideStartBudget.current = budget
    const nextBudget = logToBudget(Number(e.target.value))
    setBudget(nextBudget)

    // Live camera add/remove: slice the cameraPool to a budget-derived count.
    // This is purely client-side — no backend round-trip — so the slider feels
    // instantaneous. Cameras carry their full position/target/fov so the
    // FbxPOV thumbnails + main display update immediately, and the digital
    // twin (which reads from `cameras`) re-renders to match.
    const pool = useSentinel.getState().cameraPool
    if (pool.length > 0) {
      const n = budgetToCameraCount(nextBudget, pool.length)
      const cur = useSentinel.getState().cameras
      if (cur.length !== n) {
        const sel = useSentinel.getState().selectedCameraId
        const next = pool.slice(0, n)
        // If the selected camera just got pruned, drop the selection so the
        // detail view doesn't try to render a phantom.
        if (sel && !next.some((c) => c.id === sel)) selectCamera(null)
        setCameras(next)
        // Rough coverage estimate scales with camera count for visual feedback
        setCoveragePct(Math.min(100, (n / pool.length) * 100))
      }
    }

    if (slideTimer.current) window.clearTimeout(slideTimer.current)
    slideTimer.current = window.setTimeout(() => {
      const start = slideStartBudget.current
      const end = useSentinel.getState().budget
      slideStartBudget.current = null
      if (start === null || start === end) return
      const delta = end - start
      const n = useSentinel.getState().cameras.length
      pushActivity({
        severity: "info",
        title: "Budget adjusted",
        body: `${start < end ? "↑" : "↓"} $${start.toLocaleString()} → $${end.toLocaleString()} (${delta > 0 ? "+" : ""}$${delta.toLocaleString()}) · ${n} cam${n === 1 ? "" : "s"}`,
      })
    }, 450)
  }, [setBudget, budget, setCameras, setCoveragePct, selectCamera, pushActivity])

  const handleOptimize = useCallback(async () => {
    if (!sceneId || optimizing) return
    setOptimizing(true)
    startLoading("optimize", `Optimizing @ $${budget.toLocaleString()}`)
    pushActivity({ severity: "info", title: "Optimization started", body: `Budget $${budget.toLocaleString()}` })

    // Fire-and-forget K2 reasoning stream so the left-rail terminal lights up
    // while the optimization runs.
    clearK2Text()
    setK2Streaming(true)
    const stopK2 = streamImportanceReasoning(
      sceneId,
      (token) => appendK2Thinking(token),
      () => setK2Streaming(false),
    )
    setTimeout(() => stopK2(), 120_000)
    try {
      const result = await optimizeImportance(sceneId, budget, 12)
      // Clear any stale selection before swapping the camera list — the previously
      // selected ID may no longer exist (or its data may have shifted) after re-optimize.
      selectCamera(null)
      setCameras(result.cameras)
      setCoveragePct(result.score * 100)
      setImportanceScore(result.score)
      setSceneAnalysis({
        entry_points_covered: result.entry_points_covered,
        entry_points_total:   result.entry_points_total,
        blind_spots:          result.blind_spots,
        overlap_zones:        result.overlap_zones,
        total_cost_usd:       result.total_cost_usd,
      })
      pushActivity({
        severity: "success",
        title: "Optimization complete",
        body: `${result.cameras.length} cameras · ${(result.score * 100).toFixed(1)}% score · ${result.entry_points_covered}/${result.entry_points_total} entries · $${(result.total_cost_usd ?? 0).toLocaleString()}`,
      })

      // Refresh button also re-runs the importance map so visualizations stay in sync.
      try {
        startLoading("importance", "Recomputing importance")
        const imp = await recomputeImportance(sceneId)
        setImportance(imp)
        pushActivity({
          severity: "success",
          title: "Importance map updated",
          body: `${imp.rooms?.length ?? 0} rooms · ${imp.doors?.length ?? 0} doors · ${imp.meta?.source}`,
        })
      } catch (e) {
        pushActivity({ severity: "warning", title: "Importance recompute failed", body: e instanceof Error ? e.message : String(e) })
      } finally {
        stopLoading("importance")
      }
    } catch (err) {
      console.error("optimize failed", err)
      pushActivity({ severity: "critical", title: "Optimization failed", body: String(err) })
    } finally {
      setOptimizing(false)
      stopLoading("optimize")
    }
  }, [sceneId, budget, optimizing, setCameras, setCoveragePct, setImportanceScore, setSceneAnalysis, setOptimizing, pushActivity, startLoading, stopLoading, setImportance, appendK2Thinking, clearK2Text, setK2Streaming, selectCamera])

  const pct = budgetToLog(budget)
  const pctNum = pct * 100

  return (
    <div className="flex items-center gap-4 flex-1 min-w-0">
      <span className="text-[10.5px] font-semibold text-dim uppercase tracking-[0.16em] shrink-0">Budget</span>

      <div className="relative flex-1 h-9 flex items-center group">
        <div className="relative w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-200"
            style={{
              width: `${Math.max(pctNum, 4)}%`,
              background: "#ffffff",
              boxShadow: "0 0 12px rgba(255,255,255,0.25), inset 0 1px 0 rgba(255,255,255,0.6)",
            }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={pct}
          onChange={handleSlide}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      <span className="text-text text-[13px] font-bold shrink-0 w-20 text-right tabular-nums">
        ${budget.toLocaleString()}
      </span>
      <button
        onClick={handleOptimize}
        disabled={optimizing || !sceneId}
        className="glass-btn glass-btn--accent shrink-0 !text-[10.5px] !font-semibold !uppercase !tracking-[0.16em] !px-6 !py-2.5"
      >
        {optimizing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  )
}

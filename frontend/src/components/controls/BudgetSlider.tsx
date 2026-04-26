"use client"
import { useCallback } from "react"
import { useSentinel } from "@/store/sentinel"
import { optimizeImportance } from "@/lib/api"

const MIN = 500
const MAX = 25000

function budgetToLog(v: number) {
  return (Math.log(v) - Math.log(MIN)) / (Math.log(MAX) - Math.log(MIN))
}

function logToBudget(t: number) {
  return Math.round(Math.exp(t * (Math.log(MAX) - Math.log(MIN)) + Math.log(MIN)) / 50) * 50
}

export default function BudgetSlider() {
  const {
    budget, setBudget,
    sceneId, setCameras, setCoveragePct,
    importanceScore, setImportanceScore,
    optimizing, setOptimizing,
  } = useSentinel()

  const handleSlide = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBudget(logToBudget(Number(e.target.value)))
  }, [setBudget])

  const handleOptimize = useCallback(async () => {
    if (!sceneId || optimizing) return
    setOptimizing(true)
    try {
      const result = await optimizeImportance(sceneId, budget, 12)
      setCameras(result.cameras)
      setCoveragePct(result.score * 100)
      setImportanceScore(result.score)
    } catch (err) {
      console.error("optimize failed", err)
      alert(`Optimize failed: ${err}`)
    } finally {
      setOptimizing(false)
    }
  }, [sceneId, budget, optimizing, setCameras, setCoveragePct, setImportanceScore, setOptimizing])

  const pct = budgetToLog(budget)

  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <span className="text-dim text-[10px] shrink-0">BUDGET</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={pct}
        onChange={handleSlide}
        className="flex-1 accent-cyan h-1 cursor-pointer"
      />
      <span className="text-cyan text-xs font-semibold shrink-0 w-20 text-right">
        ${budget.toLocaleString()}
      </span>
      <button
        onClick={handleOptimize}
        disabled={optimizing || !sceneId}
        className="px-3 py-1 rounded text-xs border border-cyan/40 text-cyan hover:bg-cyan/10 transition-colors disabled:opacity-50 shrink-0"
      >
        {optimizing ? "Optimizing…" : "Optimize Cameras"}
      </button>
      {importanceScore > 0 && (
        <span className="text-green text-xs font-mono shrink-0">
          {(importanceScore * 100).toFixed(1)}%
        </span>
      )}
    </div>
  )
}

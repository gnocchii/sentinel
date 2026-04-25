"use client"
import { useCallback, useRef } from "react"
import { useSentinel } from "@/store/sentinel"
import { optimizeCameras } from "@/lib/api"
import { useK2Stream } from "@/hooks/useK2Stream"

const MIN = 500
const MAX = 25000

function budgetToLog(v: number) {
  return (Math.log(v) - Math.log(MIN)) / (Math.log(MAX) - Math.log(MIN))
}

function logToBudget(t: number) {
  return Math.round(Math.exp(t * (Math.log(MAX) - Math.log(MIN)) + Math.log(MIN)) / 50) * 50
}

export default function BudgetSlider() {
  const { budget, setBudget, setCameras, setCoveragePct, scene } = useSentinel()
  const { runBudgetTradeoff } = useK2Stream()
  const prevBudget = useRef(budget)

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const newBudget = logToBudget(Number(e.target.value))
      setBudget(newBudget)

      if (!scene) return
      try {
        const result = await optimizeCameras(scene.id, newBudget)
        setCameras(result.cameras)
        setCoveragePct(result.coverage_pct)
        runBudgetTradeoff(newBudget, prevBudget.current)
        prevBudget.current = newBudget
      } catch (err) {
        console.error("budget optimize failed", err)
      }
    },
    [scene, setBudget, setCameras, setCoveragePct, runBudgetTradeoff]
  )

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
        onChange={handleChange}
        className="flex-1 accent-cyan h-1 cursor-pointer"
      />
      <span className="text-cyan text-xs font-semibold shrink-0 w-20 text-right">
        ${budget.toLocaleString()}
      </span>
    </div>
  )
}

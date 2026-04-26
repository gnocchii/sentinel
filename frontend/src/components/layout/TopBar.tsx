"use client"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSentinel } from "@/store/sentinel"
import { recomputeImportance, streamImportanceReasoning, exportReport, optimizeImportance } from "@/lib/api"

export default function TopBar() {
  const {
    scene, setImportance, sceneId,
    appendK2Text, clearK2Text, setK2Streaming,
    budget,
    pushActivity, startLoading, stopLoading,
    setCameras, setCoveragePct, setSceneAnalysis,
    setImportanceScore, setOptimizing, optimizing,
  } = useSentinel()
  const [reasoning, setReasoning] = useState(false)
  const [exporting, setExporting] = useState(false)

  const alerts = scene?.analysis.lighting_risks.length ?? 0

  const autoRanFor = useRef<string | null>(null)
  const cameras = useSentinel((s) => s.cameras)

  const runOptimize = useCallback(async (id: string) => {
    if (optimizing) return
    setOptimizing(true)
    startLoading("optimize", `Optimizing @ $${budget.toLocaleString()}`)
    pushActivity({ severity: "info", title: "Auto-optimization started", body: `Budget $${budget.toLocaleString()}` })
    try {
      const result = await optimizeImportance(id, budget, 12)
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
        title: "Cameras placed",
        body: `${result.cameras.length} cameras · ${(result.score * 100).toFixed(1)}% score · ${result.entry_points_covered}/${result.entry_points_total} entries · $${(result.total_cost_usd ?? 0).toLocaleString()}`,
      })
    } catch (err) {
      console.error("[auto-optimize] failed", err)
      pushActivity({ severity: "critical", title: "Auto-optimization failed", body: String(err) })
    } finally {
      setOptimizing(false)
      stopLoading("optimize")
    }
  }, [budget, optimizing, setOptimizing, setCameras, setCoveragePct, setImportanceScore, setSceneAnalysis, pushActivity, startLoading, stopLoading])

  // Auto-run optimize whenever a scene is loaded with no cameras yet (covers
  // both fresh uploads and pages that mount after a scene was already set).
  useEffect(() => {
    if (!sceneId || !scene) return
    if (cameras.length > 0) return
    if (autoRanFor.current === sceneId) return
    if (optimizing) return
    autoRanFor.current = sceneId
    runOptimize(sceneId)
  }, [sceneId, scene, cameras.length, optimizing, runOptimize])

  const handleReason = () => {
    if (!sceneId) return
    clearK2Text()
    setK2Streaming(true)
    setReasoning(true)
    startLoading("k2-stream", "K2 reasoning")
    pushActivity({ severity: "info", title: "K2 reasoning stream started" })
    const stop = streamImportanceReasoning(
      sceneId,
      appendK2Text,
      () => {
        setK2Streaming(false)
        setReasoning(false)
        stopLoading("k2-stream")
        pushActivity({ severity: "success", title: "K2 reasoning complete", body: "Importance map updated" })
        recomputeImportance(sceneId).then(setImportance).catch(() => {})
      },
    )
    setTimeout(() => stop(), 120_000)
  }

  const handleExportPdf = async () => {
    if (!sceneId) return
    setExporting(true)
    startLoading("export-pdf", "Generating report PDF")
    try {
      await exportReport(sceneId, budget)
      pushActivity({ severity: "success", title: "PDF report exported" })
    } catch (e) {
      console.error(e)
      pushActivity({ severity: "critical", title: "PDF export failed", body: String(e) })
    } finally {
      setExporting(false)
      stopLoading("export-pdf")
    }
  }

  return (
    <header className="grid grid-cols-3 items-center px-8 py-4 shrink-0">
      {/* Left — empty */}
      <div />

      {/* Center — favicon, navigates back to landing */}
      <div className="flex items-center justify-center">
        <Link href="/" aria-label="Back to landing" className="block transition-transform hover:scale-105">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/favicon.png"
            alt="Sentinel"
            className="w-8 h-8 rounded-md object-cover"
            style={{ boxShadow: "0 0 14px -2px rgba(137,180,250,0.45)" }}
          />
        </Link>
      </div>

      {/* Right — alerts only */}
      <div className="flex items-center justify-end gap-2">
        {alerts > 0 && <Pill color="amber">{alerts} alert{alerts > 1 ? "s" : ""}</Pill>}
      </div>
    </header>
  )
}

function Pill({ color, children, pulse }: { color: string; children: React.ReactNode; pulse?: boolean }) {
  const dot: Record<string, string> = {
    green: "bg-green shadow-[0_0_8px_rgba(166,227,161,0.7)]",
    cyan:  "bg-cyan shadow-[0_0_8px_rgba(137,180,250,0.7)]",
    amber: "bg-amber shadow-[0_0_8px_rgba(250,179,135,0.7)]",
    dim:   "bg-dim",
  }
  return (
    <span className="flex items-center gap-2 text-[11px] font-medium text-text/80 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] backdrop-blur-md">
      <span className={`w-1.5 h-1.5 rounded-full ${dot[color] ?? "bg-dim"} ${pulse ? "animate-pulse" : ""}`} />
      {children}
    </span>
  )
}

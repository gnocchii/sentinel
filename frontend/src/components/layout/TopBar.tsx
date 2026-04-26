"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSentinel } from "@/store/sentinel"
import { uploadUsdz, fetchScene, fetchImportance, recomputeImportance, streamImportanceReasoning, exportReport, optimizeImportance } from "@/lib/api"

export default function TopBar() {
  const {
    scene, setScene, setImportance, setSceneId, sceneId,
    appendK2Text, clearK2Text, setK2Streaming,
    setFeedsFbxUrl, feedsFbxUrl,
    budget,
    pushActivity, startLoading, stopLoading,
    setCameras, setCoveragePct, setSceneAnalysis,
    setImportanceScore, setOptimizing, optimizing,
  } = useSentinel()
  const fileRef = useRef<HTMLInputElement>(null)
  const fbxRef  = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
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

  const handleUpload = async (file: File) => {
    setUploading(true)
    startLoading("upload-usdz", `Parsing ${file.name}`)
    pushActivity({ severity: "info", title: "USDZ upload started", body: file.name })
    try {
      const id = "polycam_scan"
      await uploadUsdz(file, id)
      setSceneId(id)
      const s = await fetchScene(id)
      setScene(s)
      const imp = await fetchImportance(id)
      setImportance(imp)
      pushActivity({
        severity: "success",
        title: "Scene loaded",
        body: `${s.cameras.length} cameras · ${s.floor_area_m2}m² · ${s.rooms?.length ?? 0} rooms`,
      })
    } catch (e) {
      console.error(e)
      pushActivity({ severity: "critical", title: "USDZ upload failed", body: String(e) })
    } finally {
      setUploading(false)
      stopLoading("upload-usdz")
    }
  }

  const handleUploadFbx = (file: File) => {
    const url = URL.createObjectURL(file)
    setFeedsFbxUrl(url)
    pushActivity({ severity: "success", title: "FBX texture loaded", body: file.name })
  }

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
      {/* Left — favicon */}
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/favicon.png"
          alt="Sentinel"
          className="w-7 h-7 rounded-md object-cover"
          style={{ boxShadow: "0 0 14px -2px rgba(137,180,250,0.45)" }}
        />
        <div className="h-3.5 w-px bg-white/10" />
        <span className="text-dim text-[11px] font-mono tracking-tight">
          v0.1 <span className="text-muted/70 mx-1">·</span> {scene?.name ?? "no scene"}
        </span>
      </div>

      {/* Center — primary actions */}
      <div className="flex items-center justify-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".usdz"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleUpload(f)
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className={scene ? "glass-btn glass-btn--accent" : "glass-btn"}
        >
          {uploading ? "Parsing…" : scene ? "USDZ ✓" : "Upload USDZ"}
        </button>
        <input
          ref={fbxRef}
          type="file"
          accept=".fbx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleUploadFbx(f)
            e.target.value = ""
          }}
        />
        <button
          onClick={() => fbxRef.current?.click()}
          className={feedsFbxUrl ? "glass-btn glass-btn--accent" : "glass-btn"}
          title="Textured FBX rendered in Camera Feeds + Point Cloud tabs"
        >
          {feedsFbxUrl ? "FBX ✓" : "Upload FBX"}
        </button>
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

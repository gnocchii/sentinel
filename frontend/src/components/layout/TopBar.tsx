"use client"
import { useRef, useState } from "react"
import { useSentinel } from "@/store/sentinel"
import { uploadUsdz, fetchScene, fetchImportance, recomputeImportance, streamImportanceReasoning, exportReport } from "@/lib/api"

export default function TopBar() {
  const {
    scene, setScene, setImportance, setSceneId, sceneId,
    appendK2Text, clearK2Text, setK2Streaming,
    setFeedsFbxUrl, feedsFbxUrl,
    budget,
  } = useSentinel()
  const fileRef = useRef<HTMLInputElement>(null)
  const fbxRef  = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [reasoning, setReasoning] = useState(false)
  const [exporting, setExporting] = useState(false)

  const alerts = scene?.analysis.lighting_risks.length ?? 0

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const id = "polycam_scan"
      await uploadUsdz(file, id)
      setSceneId(id)
      const s = await fetchScene(id)
      setScene(s)
      const imp = await fetchImportance(id)
      setImportance(imp)
    } catch (e) {
      console.error(e)
      alert(`Upload failed: ${e}`)
    } finally {
      setUploading(false)
    }
  }

  const handleUploadFbx = (file: File) => {
    const url = URL.createObjectURL(file)
    setFeedsFbxUrl(url)
  }

  const handleReason = () => {
    if (!sceneId) return
    clearK2Text()
    setK2Streaming(true)
    setReasoning(true)
    const stop = streamImportanceReasoning(
      sceneId,
      appendK2Text,
      () => {
        setK2Streaming(false)
        setReasoning(false)
        recomputeImportance(sceneId).then(setImportance).catch(() => {})
      },
    )
    setTimeout(() => stop(), 120_000)
  }

  const handleExportPdf = async () => {
    if (!sceneId) return
    setExporting(true)
    try {
      await exportReport(sceneId, budget)
    } catch (e) {
      console.error(e)
      alert(`PDF export failed: ${e}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <header className="grid grid-cols-3 items-center px-8 py-4 shrink-0">
      {/* Left — wordmark */}
      <div className="flex items-center gap-3">
        <span
          className="text-text text-[15px] font-bold tracking-[0.32em]"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          SENTINEL
        </span>
        <div className="h-3.5 w-px bg-white/10" />
        <span className="text-dim text-[11px] font-mono tracking-tight">
          v0.1 <span className="text-muted/70 mx-1">·</span> {scene?.name ?? "loading…"}
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
          className="glass-btn"
        >
          {uploading ? "Parsing…" : "Upload USDZ"}
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
        <button
          onClick={handleReason}
          disabled={reasoning || !sceneId}
          className="glass-btn glass-btn--accent"
        >
          {reasoning ? "Streaming…" : "Stream K2"}
        </button>
        <button
          onClick={handleExportPdf}
          disabled={exporting || !sceneId}
          className="glass-btn"
        >
          {exporting ? "Exporting…" : "Export PDF"}
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

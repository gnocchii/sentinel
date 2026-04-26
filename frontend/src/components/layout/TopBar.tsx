"use client"
import { useRef, useState } from "react"
import { useSentinel } from "@/store/sentinel"
import { uploadUsdz, fetchScene, fetchImportance, recomputeImportance, streamImportanceReasoning } from "@/lib/api"

export default function TopBar() {
  const { scene, cameras, k2Streaming, setScene, setImportance, setSceneId, sceneId, appendK2Text, clearK2Text, setK2Streaming, setFeedsFbxUrl, feedsFbxUrl } = useSentinel()
  const fileRef = useRef<HTMLInputElement>(null)
  const fbxRef  = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [reasoning, setReasoning] = useState(false)

  const alerts = scene?.analysis.lighting_risks.length ?? 0
  const onlineCameras = cameras.filter((c) => c.status !== "offline").length

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const id = "polycam_scan"
      await uploadUsdz(file, id)
      setSceneId(id)
      const s = await fetchScene(id)
      setScene(s)
      // Trigger importance compute (cached after first run)
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
    console.log("[FBX] selected", file.name, file.size, "bytes")
    const url = URL.createObjectURL(file)
    setFeedsFbxUrl(url)
    console.log("[FBX] blob URL:", url)
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
        // After streaming, fetch the parsed importance grid
        recomputeImportance(sceneId).then(setImportance).catch(() => {})
      },
    )
    // safety: stop after 2 minutes
    setTimeout(() => stop(), 120_000)
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-cyan font-semibold tracking-widest text-sm">SENTINEL</span>
        <span className="text-dim text-xs">v0.1 · {scene?.name ?? "Loading…"}</span>
      </div>

      <div className="flex items-center gap-3 text-xs">
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
          className="px-2.5 py-1 rounded border border-cyan/30 text-cyan hover:bg-cyan/10 transition-colors disabled:opacity-50"
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
            e.target.value = ""  // allow re-selecting the same file
          }}
        />
        <button
          onClick={() => fbxRef.current?.click()}
          className="px-2.5 py-1 rounded border border-cyan/30 text-cyan hover:bg-cyan/10 transition-colors"
          title="Textured FBX rendered in Camera Feeds + Point Cloud tabs — does not affect placement calculations"
        >
          {feedsFbxUrl ? "FBX Loaded ✓" : "Upload FBX"}
        </button>
        <button
          onClick={handleReason}
          disabled={reasoning || !sceneId}
          className="px-2.5 py-1 rounded border border-cyan/30 text-cyan hover:bg-cyan/10 transition-colors disabled:opacity-50"
        >
          {reasoning ? "K2 Reasoning…" : "Stream K2 Importance"}
        </button>

        <Pill color="green">{onlineCameras} Cameras Online</Pill>
        <Pill color={k2Streaming ? "cyan" : "dim"}>
          {k2Streaming ? "K2 Reasoning…" : "K2 Think V2 Ready"}
        </Pill>
        {alerts > 0 && <Pill color="amber">{alerts} Alert{alerts > 1 ? "s" : ""}</Pill>}
      </div>
    </header>
  )
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  const dot: Record<string, string> = {
    green: "bg-green",
    cyan: "bg-cyan",
    amber: "bg-amber",
    dim: "bg-dim",
  }
  return (
    <span className="flex items-center gap-1.5 text-text">
      <span className={`w-1.5 h-1.5 rounded-full ${dot[color] ?? "bg-dim"}`} />
      {children}
    </span>
  )
}

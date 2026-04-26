"use client"

import { useState } from "react"
import type { ChangeEvent } from "react"
import { fetchScanPointCloud, fetchScanStatus, uploadScanPly } from "@/lib/api"
import { useSentinel } from "@/store/sentinel"

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function ScanUploadPanel() {
  const { setPointCloud, setActiveTab, pushActivity, startLoading, stopLoading, setLoadingProgress } = useSentinel()
  const [scanId, setScanId] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "done" | "failed">("idle")
  const [message, setMessage] = useState("Export a LiDAR point cloud as .ply and upload it.")

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".ply")) {
      setStatus("failed")
      setMessage("Please upload a .ply point cloud file")
      return
    }

    startLoading("upload-ply", `Uploading ${file.name}`)
    pushActivity({ severity: "info", title: "LiDAR scan upload started", body: `${file.name} · ${formatBytes(file.size)}` })
    try {
      setStatus("uploading")
      setMessage(`Uploading ${file.name} (${formatBytes(file.size)})…`)

      const uploaded = await uploadScanPly(file)
      setScanId(uploaded.scan_id)
      setStatus(uploaded.status === "done" ? "processing" : uploaded.status)
      setMessage("Processing point cloud…")

      const maxAttempts = 40
      for (let i = 0; i < maxAttempts; i++) {
        setLoadingProgress("upload-ply", Math.min(95, 10 + (i / maxAttempts) * 85))
        const s = await fetchScanStatus(uploaded.scan_id)
        if (s.status === "done") {
          const pointCloud = await fetchScanPointCloud(uploaded.scan_id)
          setPointCloud(pointCloud)
          setActiveTab("point-cloud")
          setStatus("done")
          setMessage(`Loaded ${pointCloud.count.toLocaleString()} points from ${s.filename}`)
          pushActivity({
            severity: "success",
            title: "Point cloud ingested",
            body: `${pointCloud.count.toLocaleString()} pts · ${s.filename}`,
          })
          stopLoading("upload-ply")
          return
        }
        if (s.status === "failed") {
          setStatus("failed")
          setMessage(s.error ?? "Processing failed")
          pushActivity({ severity: "critical", title: "Scan processing failed", body: s.error ?? "Unknown" })
          stopLoading("upload-ply")
          return
        }
        await new Promise((r) => setTimeout(r, 1200))
      }

      setStatus("failed")
      setMessage("Timed out while waiting for processing to complete")
      pushActivity({ severity: "warning", title: "Scan processing timed out" })
      stopLoading("upload-ply")
    } catch (err) {
      setStatus("failed")
      setMessage(err instanceof Error ? err.message : "Upload failed")
      pushActivity({ severity: "critical", title: "LiDAR upload failed", body: err instanceof Error ? err.message : String(err) })
      stopLoading("upload-ply")
    }
  }

  return (
    <section className="px-5 pb-5 space-y-3">
      <label className="block">
        <input
          type="file"
          accept=".ply"
          className="block w-full text-[11px] text-dim file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-white/10 file:bg-white/[0.04] file:text-text/90 file:font-medium file:cursor-pointer hover:file:bg-white/[0.08]"
          onChange={onPickFile}
        />
      </label>

      <div className="text-[11px] leading-relaxed text-text/70 break-words">{message}</div>

      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="text-text/80 capitalize">{status}</span>
        </div>
        {scanId && <span className="text-[10px] text-dim font-mono truncate max-w-[60%]">{scanId}</span>}
      </div>
    </section>
  )
}

function StatusDot({ status }: { status: "idle" | "uploading" | "processing" | "done" | "failed" }) {
  const klass =
    status === "done"
      ? "bg-green"
      : status === "failed"
      ? "bg-red"
      : status === "uploading" || status === "processing"
      ? "bg-amber"
      : "bg-dim"

  return <span className={`w-1.5 h-1.5 rounded-full ${klass}`} />
}

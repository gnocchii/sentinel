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
  const { setPointCloud, setActiveTab } = useSentinel()
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

    try {
      setStatus("uploading")
      setMessage(`Uploading ${file.name} (${formatBytes(file.size)})…`)

      const uploaded = await uploadScanPly(file)
      setScanId(uploaded.scan_id)
      setStatus(uploaded.status === "done" ? "processing" : uploaded.status)
      setMessage("Processing point cloud…")

      const maxAttempts = 40
      for (let i = 0; i < maxAttempts; i++) {
        const s = await fetchScanStatus(uploaded.scan_id)
        if (s.status === "done") {
          const pointCloud = await fetchScanPointCloud(uploaded.scan_id)
          setPointCloud(pointCloud)
          setActiveTab("point-cloud")
          setStatus("done")
          setMessage(`Loaded ${pointCloud.count.toLocaleString()} points from ${s.filename}`)
          return
        }
        if (s.status === "failed") {
          setStatus("failed")
          setMessage(s.error ?? "Processing failed")
          return
        }
        await new Promise((r) => setTimeout(r, 1200))
      }

      setStatus("failed")
      setMessage("Timed out while waiting for processing to complete")
    } catch (err) {
      setStatus("failed")
      setMessage(err instanceof Error ? err.message : "Upload failed")
    }
  }

  return (
    <section className="p-4 space-y-3">
      <h2 className="text-dim text-xs tracking-widest uppercase">LiDAR Upload</h2>

      <label className="block text-xs text-text">
        <span className="block mb-1 text-dim">Upload .ply scan</span>
        <input
          type="file"
          accept=".ply"
          className="block w-full text-xs file:mr-3 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-cyan/20 file:text-cyan"
          onChange={onPickFile}
        />
      </label>

      <div className="text-[11px] leading-relaxed text-dim break-words">{message}</div>

      <div className="flex items-center gap-2 text-[11px]">
        <StatusDot status={status} />
        <span className="uppercase tracking-wide">{status}</span>
      </div>

      {scanId && <div className="text-[10px] text-dim">scan_id: {scanId}</div>}
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

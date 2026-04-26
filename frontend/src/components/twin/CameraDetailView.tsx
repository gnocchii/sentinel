"use client"
/**
 * CameraDetailView — the main-display view that takes over when a feed is
 * selected from the right rail. Shows the chosen camera's POV (large) on the
 * left and a metadata bento (Position / FOV / Cost / Status / Type / Cap) on
 * the right.
 */

import { useSentinel } from "@/store/sentinel"
import CameraPreview from "./CameraPreview"
import type { Camera } from "@/lib/types"

export default function CameraDetailView() {
  const cameras = useSentinel((s) => s.cameras)
  const selectedCameraId = useSentinel((s) => s.selectedCameraId)
  const cam = cameras.find((c) => c.id === selectedCameraId)

  if (!cam) return null

  return (
    <div className="w-full h-full flex flex-col gap-4 p-4 overflow-hidden">
      <div className="flex items-baseline gap-2 shrink-0">
        <span className="text-text text-[14px] font-semibold tracking-tight">{cam.id}</span>
        <span className="text-dim text-[11px]">· {cam.fov_h}° FOV</span>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_11rem] gap-3 overflow-hidden">
        {/* Left column: POV (fills available space) + Identity below */}
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
          <div className="relative rounded-xl overflow-hidden border border-cyan/30 ring-1 ring-cyan/20 bg-black w-full flex-1 min-h-0">
            <CameraPreview camera={cam} size="large" />
          </div>

          <BentoSection title="Identity" cols={3}>
            <Cell label="ID" value={cam.id} mono fill />
            <Cell label="Label" value={cam.label || "—"} fill />
            <Cell label="Type" value={cam.type} fill />
          </BentoSection>
        </div>

        {/* Right column: Geometry, Spec */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          <BentoSection title="Geometry">
            <Cell label="Position" value={cam.position.map((v) => v.toFixed(2)).join(", ")} mono />
            <Cell label="Target" value={cam.target.map((v) => v.toFixed(2)).join(", ")} mono />
            <Cell label="FOV H/V" value={`${cam.fov_h}° / ${cam.fov_v}°`} mono />
          </BentoSection>

          <BentoSection title="Spec">
            <Cell label="Cost" value={`$${cam.cost_usd.toLocaleString()}`} />
            <Cell
              label="Status"
              value={cam.status}
              accent={cam.status === "warning" ? "amber" : cam.status === "offline" ? "red" : "green"}
            />
            <Cell label="Locked" value={cam.locked ? "yes" : "no"} accent={cam.locked ? "amber" : undefined} />
          </BentoSection>
        </div>
      </div>
    </div>
  )
}

function BentoSection({
  title, children, cols = 2,
}: { title: string; children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  const colsClass = cols === 3 ? "grid-cols-3" : cols === 1 ? "grid-cols-1" : "grid-cols-2"
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-3 shrink-0">
      <div className="text-[9.5px] text-dim uppercase tracking-[0.16em] mb-2">{title}</div>
      <div className={`grid ${colsClass} gap-1.5`}>{children}</div>
    </div>
  )
}

function Cell({
  label, value, mono, accent, fill,
}: {
  label: string; value: string; mono?: boolean; accent?: "amber" | "red" | "green"; fill?: boolean
}) {
  const accentClass =
    accent === "amber" ? "text-amber" :
    accent === "red"   ? "text-red"   :
    accent === "green" ? "text-green" : "text-text"
  // `fill` = single grid cell (used in 3-col Identity row); default = span 2 cols.
  const spanClass = fill ? "" : "col-span-2"
  return (
    <div className={`rounded-md bg-black/20 border border-white/[0.04] px-2.5 py-2 ${spanClass}`}>
      <div className="text-[8.5px] text-dim uppercase tracking-[0.14em]">{label}</div>
      <div className={`text-[12px] mt-0.5 truncate ${mono ? "font-mono" : ""} ${accentClass}`}>{value}</div>
    </div>
  )
}


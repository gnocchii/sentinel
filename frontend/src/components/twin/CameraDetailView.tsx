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

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_22rem] gap-4">
        {/* POV view — large */}
        <div className="relative rounded-xl overflow-hidden border border-cyan/30 ring-1 ring-cyan/20 bg-black">
          <CameraPreview camera={cam} size="large" />
        </div>

        {/* Metadata bento */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto scroll-thin pr-1">
          <BentoSection title="Identity">
            <Cell label="ID" value={cam.id} mono />
            <Cell label="Label" value={cam.label || "—"} />
            <Cell label="Type" value={cam.type} />
          </BentoSection>

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

          <BentoSection title="Capabilities">
            <Capability on={cam.ir_capable} label="IR Night" />
            <Capability on={cam.hdr_capable} label="HDR / WDR" />
            <Capability on={!cam.locked} label="Reposition" />
          </BentoSection>
        </div>
      </div>
    </div>
  )
}

function BentoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-3">
      <div className="text-[9.5px] text-dim uppercase tracking-[0.16em] mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  )
}

function Cell({
  label, value, mono, accent,
}: {
  label: string; value: string; mono?: boolean; accent?: "amber" | "red" | "green"
}) {
  const accentClass =
    accent === "amber" ? "text-amber" :
    accent === "red"   ? "text-red"   :
    accent === "green" ? "text-green" : "text-text"
  return (
    <div className="rounded-md bg-black/20 border border-white/[0.04] px-2.5 py-2 col-span-2">
      <div className="text-[8.5px] text-dim uppercase tracking-[0.14em]">{label}</div>
      <div className={`text-[12px] mt-0.5 truncate ${mono ? "font-mono" : ""} ${accentClass}`}>{value}</div>
    </div>
  )
}

function Capability({ on, label }: { on: boolean; label: string }) {
  return (
    <div className={`col-span-2 rounded-md px-2.5 py-2 border text-[11px] flex items-center justify-between ${
      on ? "bg-cyan/10 border-cyan/25 text-cyan" : "bg-black/20 border-white/[0.04] text-dim/70"
    }`}>
      <span>{label}</span>
      <span className="text-[10px] font-mono">{on ? "ENABLED" : "—"}</span>
    </div>
  )
}

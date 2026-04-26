"use client"
/**
 * CameraPOVPanel — "see through the eyes of your future security system."
 *
 * Appears in the right rail when a camera is selected.
 * Replaces the live feeds grid with the full simulated FOV view
 * for the selected camera + a mini-grid of the others.
 */

import { useSentinel } from "@/store/sentinel"
import CameraFOVView from "@/components/twin/CameraFOVView"

export default function CameraPOVPanel() {
  const { selectedCameraId, cameras, selectCamera } = useSentinel()
  const selectedCam = cameras.find((c) => c.id === selectedCameraId)

  if (!selectedCam) return null

  const others = cameras.filter((c) => c.id !== selectedCameraId)

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-cyan text-xs font-semibold">{selectedCam.id}</span>
          <span className="text-dim text-[10px]">{selectedCam.type} · {selectedCam.fov_h}° FOV</span>
        </div>
        <button
          onClick={() => selectCamera(null)}
          className="text-dim hover:text-text text-[10px] transition-colors"
        >
          ✕ close
        </button>
      </div>

      {/* Main POV view */}
      <CameraFOVView
        camera={selectedCam}
        width={288}
        height={162}
        className="w-full rounded border border-border"
      />

      {/* Camera metadata strip */}
      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        <MetaBadge label="Position" value={selectedCam.position.map(v => v.toFixed(1)).join(", ")} />
        <MetaBadge label="FOV H/V"  value={`${selectedCam.fov_h}° / ${selectedCam.fov_v}°`} />
        <MetaBadge label="Cost"     value={`$${selectedCam.cost_usd}`} />
        {selectedCam.ir_capable  && <CapBadge label="IR Night"   color="purple" />}
        {selectedCam.hdr_capable && <CapBadge label="HDR / WDR"  color="cyan" />}
        {selectedCam.locked      && <CapBadge label="Locked"     color="amber" />}
      </div>

      {/* Other camera mini-grid */}
      {others.length > 0 && (
        <>
          <p className="text-dim text-[10px] uppercase tracking-wider">Other cameras</p>
          <div className="grid grid-cols-2 gap-1.5">
            {others.map((cam) => (
              <button
                key={cam.id}
                onClick={() => selectCamera(cam.id)}
                className="relative rounded overflow-hidden border border-border hover:border-cyan/40 transition-colors"
              >
                <CameraFOVView camera={cam} width={132} height={74} />
                <span className="absolute bottom-1 left-1.5 text-[9px] text-green font-semibold bg-bg/60 px-1 rounded">
                  {cam.id}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 rounded px-1.5 py-1">
      <div className="text-dim text-[9px] uppercase tracking-wider">{label}</div>
      <div className="text-text font-mono truncate">{value}</div>
    </div>
  )
}

function CapBadge({ label, color }: { label: string; color: string }) {
  const colors: Record<string, string> = {
    cyan:   "bg-cyan/10 text-cyan border-cyan/20",
    amber:  "bg-amber/10 text-amber border-amber/20",
    purple: "bg-purple/10 text-purple border-purple/20",
  }
  return (
    <div className={`rounded px-1.5 py-1 border text-[9px] font-semibold ${colors[color] ?? ""}`}>
      {label}
    </div>
  )
}

"use client"
import { useSentinel } from "@/store/sentinel"
import CameraFOVView from "@/components/twin/CameraFOVView"
import type { Camera } from "@/lib/types"

export default function LiveFeedsPanel() {
  const { cameras, selectedCameraId, selectCamera } = useSentinel()

  return (
    <section className="p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-dim text-xs tracking-widest uppercase">Live Feeds</h2>
        <span className="text-dim text-[10px]">click to inspect</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {cameras.map((cam) => (
          <FeedTile
            key={cam.id}
            cam={cam}
            selected={cam.id === selectedCameraId}
            onClick={() => selectCamera(cam.id === selectedCameraId ? null : cam.id)}
          />
        ))}
      </div>
    </section>
  )
}

function FeedTile({ cam, selected, onClick }: { cam: Camera; selected: boolean; onClick: () => void }) {
  const isObstructed = cam.id === "CAM-03"

  return (
    <button
      onClick={onClick}
      className={`relative aspect-video rounded overflow-hidden border text-left transition-all
        ${selected ? "border-cyan/60 ring-1 ring-cyan/30" : "border-border hover:border-muted"}
        ${cam.status === "warning" ? "border-amber/40" : ""}`}
    >
      {/* Simulated camera feed */}
      <CameraFOVView camera={cam} width={132} height={74} />

      {/* Obstruction badge on top */}
      {isObstructed && (
        <div className="absolute bottom-1 left-1 right-1 border border-red/60 rounded text-[8px] text-red px-1 py-0.5 text-center bg-bg/60">
          OBSTRUCTION
        </div>
      )}
    </button>
  )
}

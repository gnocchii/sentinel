"use client"
import { useSentinel } from "@/store/sentinel"
import CameraPreview from "@/components/twin/CameraPreview"
import type { Camera } from "@/lib/types"

/**
 * CCTV-style live feeds. Always renders a 2-col grid of every camera. Layout
 * never changes on tap — clicking a tile selects that camera (which the main
 * display picks up via store.selectedCameraId). Selected tile gets a cyan ring.
 */
export default function LiveFeedsPanel() {
  const cameras = useSentinel((s) => s.cameras)
  const selectedCameraId = useSentinel((s) => s.selectedCameraId)
  const selectCamera = useSentinel((s) => s.selectCamera)
  const optimizing = useSentinel((s) => s.optimizing)

  if (cameras.length === 0) {
    return (
      <section className="px-4 pb-4 h-full flex flex-col">
        <div className="flex flex-col gap-2 flex-1 overflow-y-auto scroll-thin pr-0.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonTile key={i} index={i} pulse={optimizing} />
          ))}
        </div>
        <p className="text-[10px] text-dim/80 mt-3 text-center shrink-0">
          {optimizing ? "Synthesizing camera placement…" : "Waiting for scene…"}
        </p>
      </section>
    )
  }

  return (
    <section className="h-full min-h-0 p-2">
      <div className="h-full grid grid-cols-2 grid-rows-3 gap-1.5">
        {(() => { const s = cameras.slice(1, 7); return [s[s.length-1], ...s.slice(1,-1), s[0]]; })().map((cam) => (
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
  return (
    <button
      onClick={onClick}
      className={`relative w-full h-full rounded-md overflow-hidden border text-left transition-all bg-black
        ${selected
          ? "border-cyan/60 ring-2 ring-cyan/40 shadow-[0_0_20px_-4px_rgba(137,180,250,0.6)]"
          : "border-white/[0.06] hover:border-cyan/30 hover:ring-1 hover:ring-cyan/15"}`}
    >
      <CameraPreview camera={cam} size="mini" />
    </button>
  )
}

function SkeletonTile({ index, pulse }: { index: number; pulse: boolean }) {
  return (
    <div className="relative h-56 shrink-0 rounded-md overflow-hidden border border-white/[0.05] bg-black/60">
      <div
        className={`absolute inset-0 ${pulse ? "skeleton" : ""}`}
        style={!pulse ? { backgroundImage: "repeating-linear-gradient(0deg,transparent 0,transparent 2px,rgba(0,255,136,0.04) 2px,rgba(0,255,136,0.04) 3px)" } : undefined}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="cctv-chip opacity-40">CAM-{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="absolute top-1.5 right-1.5">
        <span className="text-[9px] font-mono text-dim/60">— OFFLINE —</span>
      </div>
    </div>
  )
}

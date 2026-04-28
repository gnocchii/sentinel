"use client"
import { useSentinel } from "@/store/sentinel"
import CameraSnapshot from "@/components/twin/CameraSnapshot"
import type { Camera } from "@/lib/types"

/**
 * CCTV-style live feeds. Always renders a 2-col grid of every camera.
 *  - Single click: select that camera; stay on the current tab (every tab
 *    already reacts to selectedCameraId).
 *  - Double click: select + jump to the Camera Feeds tab so the main display
 *    shows the chosen camera large.
 */
export default function LiveFeedsPanel() {
  const cameras = useSentinel((s) => s.cameras)
  const selectedCameraId = useSentinel((s) => s.selectedCameraId)
  const selectCamera = useSentinel((s) => s.selectCamera)
  const setActiveTab = useSentinel((s) => s.setActiveTab)
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

  // Render the first 6 cameras in their natural order. Previous code sliced
  // [1..7) and shuffled the result — confusing and silently dropped cameras[0].
  const tiles = cameras.slice(0, 6)

  return (
    <section className="h-full min-h-0 p-2">
      <div className="h-full grid grid-cols-2 grid-rows-3 gap-1.5">
        {tiles.map((cam, idx) => (
          <FeedTile
            key={cam.id}
            cam={cam}
            index={idx}
            selected={cam.id === selectedCameraId}
            onClick={() => selectCamera(cam.id)}
            onDoubleClick={() => {
              selectCamera(cam.id)
              setActiveTab("camera-feeds")
            }}
          />
        ))}
      </div>
    </section>
  )
}

function FeedTile({
  cam, index, selected, onClick, onDoubleClick,
}: {
  cam: Camera; index: number; selected: boolean
  onClick: () => void; onDoubleClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title="Click to select · double-click to open in main display"
      className={`relative w-full h-full rounded-md overflow-hidden border text-left transition-all bg-black
        ${selected
          ? "border-cyan/60 ring-2 ring-cyan/40 shadow-[0_0_20px_-4px_rgba(137,180,250,0.6)]"
          : "border-white/[0.06] hover:border-cyan/30 hover:ring-1 hover:ring-cyan/15"}`}
    >
      {/* CameraSnapshot mounts FbxPOV briefly, captures one frame, then shows
          a static image — only one thumbnail canvas alive at a time. Sidesteps
          the per-page WebGL context cap that was blanking older tiles. */}
      <CameraSnapshot camera={cam} index={index} />
      <span className="absolute top-1 left-1.5 text-[9px] font-mono text-white/85 drop-shadow-md pointer-events-none">
        {cam.id}
      </span>
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

"use client"
import { useSentinel } from "@/store/sentinel"
import type { Camera } from "@/lib/types"

const STATUS_COLOR: Record<string, string> = {
  active:  "bg-green/80",
  warning: "bg-amber/80",
  offline: "bg-red/70",
}

export default function CameraListPanel() {
  const { cameras, selectedCameraId, selectCamera } = useSentinel()

  return (
    <section className="px-3 pb-4 space-y-1">
      {cameras.map((cam) => (
        <CameraCard
          key={cam.id}
          cam={cam}
          selected={cam.id === selectedCameraId}
          onClick={() => selectCamera(cam.id === selectedCameraId ? null : cam.id)}
        />
      ))}
    </section>
  )
}

function CameraCard({ cam, selected, onClick }: { cam: Camera; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-all
        ${selected
          ? "bg-white/[0.06] border border-white/10"
          : "bg-transparent border border-transparent hover:bg-white/[0.03]"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLOR[cam.status]}`} />
      <span className="font-mono font-medium text-text/90 w-16 shrink-0 text-[11px]">{cam.id}</span>
      <span className="text-dim truncate flex-1">{cam.type}</span>
      <span className="text-dim shrink-0 font-mono text-[10px] tabular-nums">{cam.fov_h}°</span>
    </button>
  )
}

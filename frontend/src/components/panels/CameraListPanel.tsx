"use client"
import { useSentinel } from "@/store/sentinel"
import type { Camera } from "@/lib/types"

const STATUS_COLOR: Record<string, string> = {
  active: "bg-green",
  warning: "bg-amber",
  offline: "bg-red",
}

export default function CameraListPanel() {
  const { cameras, selectedCameraId, selectCamera } = useSentinel()

  return (
    <section className="p-4 space-y-2">
      <h2 className="text-dim text-xs tracking-widest uppercase">
        Cameras <span className="text-text ml-1">{cameras.length}</span>
      </h2>
      <div className="space-y-1">
        {cameras.map((cam) => (
          <CameraCard
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

function CameraCard({ cam, selected, onClick }: { cam: Camera; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors
        ${selected ? "bg-cyan/10 border border-cyan/30" : "bg-muted/30 border border-transparent hover:bg-muted/60"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLOR[cam.status]}`} />
      <span className="font-semibold text-text w-14 shrink-0">{cam.id}</span>
      <span className="text-dim truncate flex-1">{cam.type}</span>
      <span className="text-dim shrink-0">{cam.fov_h}°</span>
      {cam.locked && <span className="text-amber text-[10px]">🔒</span>}
    </button>
  )
}

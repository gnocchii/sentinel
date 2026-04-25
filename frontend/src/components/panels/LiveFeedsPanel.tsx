"use client"
import { useSentinel } from "@/store/sentinel"

export default function LiveFeedsPanel() {
  const { cameras, selectedCameraId, selectCamera } = useSentinel()

  return (
    <section className="p-4 space-y-2">
      <h2 className="text-dim text-xs tracking-widest uppercase">Live Feeds</h2>
      <div className="grid grid-cols-2 gap-1.5">
        {cameras.map((cam) => (
          <FeedTile
            key={cam.id}
            camId={cam.id}
            status={cam.status}
            selected={cam.id === selectedCameraId}
            onClick={() => selectCamera(cam.id === selectedCameraId ? null : cam.id)}
          />
        ))}
      </div>
    </section>
  )
}

function FeedTile({
  camId, status, selected, onClick,
}: {
  camId: string; status: string; selected: boolean; onClick: () => void
}) {
  const isObstructed = camId === "CAM-03"  // hardcoded demo obstruction

  return (
    <button
      onClick={onClick}
      className={`relative aspect-video rounded overflow-hidden border text-left transition-all
        ${selected ? "border-cyan/60" : "border-border hover:border-muted"}
        ${status === "warning" ? "border-amber/40" : ""}`}
    >
      {/* Placeholder "video" */}
      <div className="absolute inset-0 bg-gradient-to-br from-muted/40 to-bg flex flex-col justify-between p-1">
        <div className="flex items-center gap-1">
          <span className={`w-1 h-1 rounded-full ${status === "active" ? "bg-green" : status === "warning" ? "bg-amber" : "bg-dim"}`} />
          <span className="text-[9px] text-dim">{camId}</span>
          <span className="text-[9px] text-dim ml-auto">REC</span>
        </div>

        {isObstructed && (
          <div className="border border-red/60 rounded text-[9px] text-red px-1 py-0.5 text-center">
            OBSTRUCTION
          </div>
        )}

        <span className="text-[8px] text-dim self-end">
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </button>
  )
}

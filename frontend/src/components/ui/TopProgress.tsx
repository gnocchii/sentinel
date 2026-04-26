"use client"
import { useSentinel } from "@/store/sentinel"

export default function TopProgress() {
  const loading = useSentinel((s) => s.loading)
  const entries = Object.entries(loading)
  const active = entries.length > 0
  const labels = entries.map(([, v]) => v.label).join(" · ")
  const determinate = entries.find(([, v]) => typeof v.progress === "number")
  const pct = determinate ? Math.max(2, Math.min(100, determinate[1].progress!)) : null

  return (
    <div
      aria-hidden={!active}
      className={`fixed top-0 left-0 right-0 z-50 transition-opacity duration-200 ${
        active ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="relative h-[2px] w-full bg-white/[0.04] overflow-hidden">
        {pct !== null ? (
          <div
            className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-out"
            style={{
              width: `${pct}%`,
              background: "#89b4fa",
              boxShadow: "0 0 14px rgba(137,180,250,0.7)",
            }}
          />
        ) : (
          <div
            className="absolute inset-y-0 w-1/3 progress-indeterminate"
            style={{
              background: "linear-gradient(90deg,transparent,#89b4fa,transparent)",
              boxShadow: "0 0 14px rgba(137,180,250,0.7)",
            }}
          />
        )}
      </div>
      {active && (
        <div className="absolute top-2 right-4 flex items-center gap-2 px-2.5 py-1 rounded-full bg-bg/80 backdrop-blur-md border border-white/[0.06] text-[10px] text-dim font-mono tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse shadow-[0_0_8px_rgba(137,180,250,0.7)]" />
          {labels}
        </div>
      )}
    </div>
  )
}

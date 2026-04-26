"use client"
import { useSentinel } from "@/store/sentinel"

export default function CoveragePanel() {
  const { coveragePct, scene } = useSentinel()
  const analysis = scene?.analysis
  const blindSpots = analysis?.blind_spots ?? []
  const overlapZones = analysis?.overlap_zones ?? 0
  const epCovered = analysis?.entry_points_covered ?? 0
  const epTotal = analysis?.entry_points_total ?? 0

  return (
    <section className="px-5 pt-3 pb-4 space-y-3">
      <div className="space-y-2">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[40px] leading-[0.95] tracking-[-0.04em] text-text tabular-nums">
            {coveragePct.toFixed(1)}
          </span>
          <span className="text-dim/80 text-[14px] font-medium tracking-tight">%</span>
        </div>
        <div className="w-full bg-white/[0.04] rounded-full h-[3px] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${coveragePct}%`,
              background: "#89b4fa",
              boxShadow: "0 0 12px rgba(137,180,250,0.5)",
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px rounded-lg overflow-hidden bg-white/[0.04]">
        <Stat label="Entry" value={`${epCovered}/${epTotal}`} />
        <Stat label="Blind" value={blindSpots.length.toString()} />
        <Stat label="Overlap" value={overlapZones.toString()} />
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg/40 px-3 py-2.5">
      <div className="text-[10px] text-dim uppercase tracking-[0.1em]">{label}</div>
      <div className="text-[15px] font-semibold text-text tabular-nums mt-0.5">{value}</div>
    </div>
  )
}

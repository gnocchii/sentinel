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
    <section className="p-4 space-y-4">
      <h2 className="text-dim text-xs tracking-widest uppercase">Coverage Analysis</h2>

      {/* Hero coverage number */}
      <div className="space-y-1">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-semibold text-cyan">{coveragePct.toFixed(1)}</span>
          <span className="text-dim text-lg mb-1">%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className="bg-cyan h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${coveragePct}%` }}
          />
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Metric label="Entry Points" value={`${epCovered} / ${epTotal}`} color={epCovered === epTotal ? "green" : "amber"} />
        <Metric label="Blind Spots" value={blindSpots.length.toString()} color={blindSpots.length === 0 ? "green" : "amber"} />
        <Metric label="Overlap Zones" value={overlapZones.toString()} color="dim" />
        <Metric label="Floor Area" value={`${scene?.floor_area_m2 ?? 0} m²`} color="dim" />
      </div>

      {/* Blind spot list */}
      {blindSpots.length > 0 && (
        <div className="space-y-1">
          {blindSpots.map((bs) => (
            <div key={bs.id} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${bs.severity === "high" ? "bg-red" : bs.severity === "medium" ? "bg-amber" : "bg-dim"}`} />
              <span className="text-text truncate">{bs.reason}</span>
              <span className="text-dim ml-auto shrink-0">{bs.area_m2}m²</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = { green: "text-green", amber: "text-amber", dim: "text-dim", red: "text-red" }
  return (
    <div className="bg-muted/40 rounded px-2 py-1.5">
      <div className="text-dim text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`font-semibold text-sm ${colorMap[color] ?? "text-text"}`}>{value}</div>
    </div>
  )
}

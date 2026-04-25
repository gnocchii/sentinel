"use client"
import { useSentinel } from "@/store/sentinel"

export default function LightingPanel() {
  const { scene, lightingData, simulationHour } = useSentinel()
  const risks = scene?.analysis.lighting_risks ?? []

  // Get current hour quality for each camera
  const hourSnapshot = lightingData.map((cl) => ({
    id: cl.camera_id,
    quality: cl.hourly[simulationHour]?.quality ?? "good",
  }))

  const nightCoverage = lightingData.filter((cl) =>
    scene?.cameras.find((c) => c.id === cl.camera_id)?.ir_capable
  ).length

  return (
    <section className="p-4 space-y-3">
      <h2 className="text-dim text-xs tracking-widest uppercase">Lighting Risk</h2>

      {risks.length === 0 ? (
        <p className="text-dim text-xs">No risks detected</p>
      ) : (
        <div className="space-y-2">
          {risks.map((r) => (
            <div key={`${r.camera_id}-${r.window_id}`} className="bg-amber/10 border border-amber/20 rounded p-2 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" />
                <span className="font-semibold text-amber">{r.camera_id}</span>
                <span className="text-dim">— {r.type}</span>
              </div>
              <div className="text-[10px] text-dim">
                {r.risk_window.start_hour}:00 – {r.risk_window.end_hour}:00
              </div>
              <div className="text-[10px] text-text leading-relaxed">{r.mitigation}</div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-dim">
        Night coverage: <span className="text-text">{nightCoverage} IR cameras</span>
      </div>

      {/* Current hour quality dots */}
      {hourSnapshot.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hourSnapshot.map(({ id, quality }) => (
            <span
              key={id}
              title={`${id}: ${quality}`}
              className={`w-2 h-2 rounded-full ${quality === "critical" ? "bg-red" : quality === "warning" ? "bg-amber" : quality === "dark" ? "bg-purple" : "bg-green"}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}

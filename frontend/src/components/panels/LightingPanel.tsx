"use client"
import { useSentinel } from "@/store/sentinel"

export default function LightingPanel() {
  const { scene, lightingData, simulationHour } = useSentinel()
  const risks = scene?.analysis.lighting_risks ?? []

  const hourSnapshot = lightingData.map((cl) => ({
    id: cl.camera_id,
    quality: cl.hourly[simulationHour]?.quality ?? "good",
  }))

  const nightCoverage = lightingData.filter((cl) =>
    scene?.cameras.find((c) => c.id === cl.camera_id)?.ir_capable
  ).length

  return (
    <section className="px-5 pb-5 space-y-3">
      {risks.length === 0 ? (
        <div className="text-[11px] text-dim">No risks detected</div>
      ) : (
        <div className="space-y-1.5">
          {risks.map((r) => (
            <div
              key={`${r.camera_id}-${r.window_id}`}
              className="rounded-lg border border-white/5 bg-white/[0.025] p-2.5 space-y-1"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="w-1 h-1 rounded-full bg-amber/80 shrink-0" />
                <span className="font-mono font-medium text-text/90">{r.camera_id}</span>
                <span className="text-dim">— {r.type}</span>
                <span className="ml-auto text-[10px] text-dim font-mono tabular-nums">
                  {r.risk_window.start_hour}:00–{r.risk_window.end_hour}:00
                </span>
              </div>
              <div className="text-[11px] text-text/70 leading-relaxed">{r.mitigation}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5 -mx-1 px-1 pt-2">
        <span className="text-dim">Night coverage</span>
        <span className="text-text/90 tabular-nums">{nightCoverage} IR cameras</span>
      </div>

      {hourSnapshot.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-dim tabular-nums">Hour {simulationHour}:00 quality</div>
          <div className="flex flex-wrap gap-1.5">
            {hourSnapshot.map(({ id, quality }) => (
              <span
                key={id}
                title={`${id}: ${quality}`}
                className={`w-1.5 h-1.5 rounded-full ${
                  quality === "critical" ? "bg-red/80" : quality === "warning" ? "bg-amber/80" : quality === "dark" ? "bg-purple/80" : "bg-green/70"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

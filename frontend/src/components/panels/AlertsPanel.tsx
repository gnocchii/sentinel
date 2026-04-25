"use client"
import { useSentinel } from "@/store/sentinel"

// Hardcoded demo alerts — replace with real-time feed later
const DEMO_ALERTS = [
  { id: "a1", severity: "warning", title: "Obstruction Detected", body: "CAM-03 FOV partially blocked — verify mount", time: "02:14" },
  { id: "a2", severity: "info",    title: "Glare Warning",         body: "CAM-04 glare in 23 min (14:00–16:30)", time: "13:37" },
  { id: "a3", severity: "success", title: "Re-analysis Complete",  body: "Coverage re-computed after budget change", time: "13:35" },
]

const SEV_COLORS: Record<string, string> = {
  warning: "border-amber/40 bg-amber/5",
  info:    "border-cyan/30 bg-cyan/5",
  success: "border-green/30 bg-green/5",
  critical:"border-red/40 bg-red/5",
}
const SEV_DOT: Record<string, string> = {
  warning: "bg-amber", info: "bg-cyan", success: "bg-green", critical: "bg-red",
}

export default function AlertsPanel() {
  return (
    <section className="p-4 space-y-2 max-h-48 overflow-y-auto">
      <h2 className="text-dim text-xs tracking-widest uppercase">
        Alerts <span className="ml-1 text-amber font-semibold">{DEMO_ALERTS.length}</span>
      </h2>
      {DEMO_ALERTS.map((a) => (
        <div key={a.id} className={`rounded border px-2 py-1.5 text-xs space-y-0.5 ${SEV_COLORS[a.severity]}`}>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEV_DOT[a.severity]}`} />
            <span className="font-semibold text-text">{a.title}</span>
            <span className="text-dim ml-auto">{a.time}</span>
          </div>
          <p className="text-dim pl-3">{a.body}</p>
        </div>
      ))}
    </section>
  )
}

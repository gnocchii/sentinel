"use client"
import { useSentinel } from "@/store/sentinel"

export default function TopBar() {
  const { scene, cameras, k2Streaming } = useSentinel()
  const alerts = scene?.analysis.lighting_risks.length ?? 0
  const onlineCameras = cameras.filter((c) => c.status !== "offline").length

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-cyan font-semibold tracking-widest text-sm">SENTINEL</span>
        <span className="text-dim text-xs">v0.1 · {scene?.name ?? "Loading…"}</span>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <Pill color="green">{onlineCameras} Cameras Online</Pill>
        <Pill color={k2Streaming ? "cyan" : "dim"}>
          {k2Streaming ? "K2 Reasoning…" : "K2 Think V2 Ready"}
        </Pill>
        {alerts > 0 && <Pill color="amber">{alerts} Alert{alerts > 1 ? "s" : ""}</Pill>}
      </div>
    </header>
  )
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  const dot: Record<string, string> = {
    green: "bg-green",
    cyan: "bg-cyan",
    amber: "bg-amber",
    dim: "bg-dim",
  }
  return (
    <span className="flex items-center gap-1.5 text-text">
      <span className={`w-1.5 h-1.5 rounded-full ${dot[color] ?? "bg-dim"}`} />
      {children}
    </span>
  )
}

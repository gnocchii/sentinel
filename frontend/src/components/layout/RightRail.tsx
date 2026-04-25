"use client"
import LiveFeedsPanel from "@/components/panels/LiveFeedsPanel"
import AlertsPanel from "@/components/panels/AlertsPanel"
import K2Panel from "@/components/panels/K2Panel"

export default function RightRail() {
  return (
    <aside className="w-80 flex flex-col border-l border-border bg-surface shrink-0 overflow-hidden">
      <LiveFeedsPanel />
      <div className="border-t border-border mx-3" />
      <AlertsPanel />
      <div className="border-t border-border mx-3 mt-auto" />
      <K2Panel />
    </aside>
  )
}

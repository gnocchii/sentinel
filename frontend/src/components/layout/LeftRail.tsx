"use client"
import CoveragePanel from "@/components/panels/CoveragePanel"
import AlertsPanel from "@/components/panels/AlertsPanel"
import K2ReasoningPanel from "@/components/panels/K2ReasoningPanel"
import BentoCard from "@/components/ui/BentoCard"
import TerminalFrame from "@/components/ui/TerminalFrame"

export default function LeftRail() {
  return (
    <aside className="w-[20rem] shrink-0 flex flex-col gap-3 min-h-0">
      <BentoCard title="Coverage" className="shrink-0">
        <CoveragePanel />
      </BentoCard>

      <TerminalFrame
        title="activity.log"
        status="streaming"
        className="shrink-0"
        bodyClassName="overflow-y-auto scroll-thin max-h-48"
      >
        <AlertsPanel />
      </TerminalFrame>

      <TerminalFrame
        title="k2.reasoning"
        status="stream"
        className="flex-1 min-h-0"
        bodyClassName="overflow-y-auto scroll-thin"
      >
        <K2ReasoningPanel />
      </TerminalFrame>
    </aside>
  )
}

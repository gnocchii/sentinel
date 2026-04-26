"use client"
import { useSentinel } from "@/store/sentinel"
import CoveragePanel from "@/components/panels/CoveragePanel"
import AlertsPanel from "@/components/panels/AlertsPanel"
import K2ReasoningPanel from "@/components/panels/K2ReasoningPanel"
import BentoCard from "@/components/ui/BentoCard"
import TerminalFrame from "@/components/ui/TerminalFrame"

export default function LeftRail() {
  const { sceneId } = useSentinel()

  if (!sceneId) {
    return <aside className="w-72 border-r border-border bg-surface shrink-0" />
  }

  return (
    <aside className="w-[20rem] shrink-0 flex flex-col gap-3 min-h-0">
      <BentoCard title="Coverage" className="shrink-0">
        <CoveragePanel />
      </BentoCard>

      <TerminalFrame
        title="activity.log"
        className="flex-1 min-h-0 basis-0"
        bodyClassName="flex-1 min-h-0 overflow-y-auto scroll-thin"
      >
        <AlertsPanel />
      </TerminalFrame>

      <TerminalFrame
        title="k2.reasoning"
        className="flex-1 min-h-0 basis-0"
        bodyClassName="flex-1 min-h-0 overflow-y-auto scroll-thin"
      >
        <K2ReasoningPanel />
      </TerminalFrame>
    </aside>
  )
}

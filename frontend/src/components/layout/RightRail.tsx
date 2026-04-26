"use client"
import LiveFeedsPanel from "@/components/panels/LiveFeedsPanel"
import BentoCard from "@/components/ui/BentoCard"
import { useSentinel } from "@/store/sentinel"

export default function RightRail() {
  const cameras = useSentinel((s) => s.cameras)
  const selectedCameraId = useSentinel((s) => s.selectedCameraId)
  const optimizing = useSentinel((s) => s.optimizing)

  const action = cameras.length > 0
    ? `${cameras.length} cam${cameras.length > 1 ? "s" : ""}${selectedCameraId ? " · 1 selected" : ""}`
    : optimizing ? "synthesizing…" : "no scene"

  return (
    <aside className="w-[22rem] shrink-0 flex flex-col gap-3 min-h-0">
      <BentoCard
        title="Live Feeds"
        action={action}
        className="flex-1 min-h-0"
        bodyClassName="flex-1 min-h-0 overflow-hidden"
      >
        <LiveFeedsPanel />
      </BentoCard>
    </aside>
  )
}

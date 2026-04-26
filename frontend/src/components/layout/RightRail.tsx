"use client"
import LiveFeedsPanel from "@/components/panels/LiveFeedsPanel"
import BentoCard from "@/components/ui/BentoCard"

export default function RightRail() {
  const titleNode = (
    <span className="flex items-center gap-2">
      <span className="relative flex w-2 h-2">
        <span className="absolute inline-flex w-full h-full rounded-full bg-red opacity-70 animate-ping" />
        <span className="relative inline-flex w-2 h-2 rounded-full bg-red shadow-[0_0_8px_rgba(243,139,168,0.8)]" />
      </span>
      <span>Live Feeds</span>
    </span>
  )

  return (
    <aside className="w-[22rem] shrink-0 flex flex-col gap-3 min-h-0">
      <BentoCard
        title={titleNode}
        className="flex-1 min-h-0"
        bodyClassName="flex-1 min-h-0 overflow-hidden"
      >
        <LiveFeedsPanel />
      </BentoCard>
    </aside>
  )
}

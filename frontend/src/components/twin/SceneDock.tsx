"use client"
import { useSentinel } from "@/store/sentinel"
import type { TwinTab } from "@/lib/types"
import BudgetSlider from "@/components/controls/BudgetSlider"
import TimeScrubber from "@/components/controls/TimeScrubber"

const TABS: { id: TwinTab; label: string }[] = [
  { id: "camera-feeds",   label: "Camera Feeds" },
  { id: "digital-twin",   label: "Digital Twin" },
  { id: "point-cloud",    label: "Point Cloud" },
  { id: "coverage-map",   label: "Coverage Map" },
  { id: "threat-path",    label: "Threat Path" },
  { id: "mesh-optimizer", label: "Mesh Optimizer" },
  { id: "importance-map", label: "Importance Map" },
  { id: "what-if",        label: "What-If" },
]

export default function SceneDock() {
  const { activeTab, setActiveTab } = useSentinel()
  return (
    <div className="px-5 py-3 space-y-3">
      <div className="flex items-center gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all
              ${activeTab === t.id
                ? "bg-white/[0.08] text-text border border-white/[0.12]"
                : "text-dim hover:text-text/90 hover:bg-white/[0.03] border border-transparent"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex gap-6 items-center">
        <BudgetSlider />
        {activeTab === "digital-twin" && <TimeScrubber />}
      </div>
    </div>
  )
}

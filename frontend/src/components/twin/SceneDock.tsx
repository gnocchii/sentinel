"use client"
import { useSentinel } from "@/store/sentinel"
import type { TwinTab } from "@/lib/types"
import BudgetSlider from "@/components/controls/BudgetSlider"

const TABS: { id: TwinTab; label: string }[] = [
  { id: "importance-map", label: "Importance Map" },
  { id: "digital-twin",   label: "Digital Twin" },
  { id: "camera-feeds",   label: "Camera Feeds" },
  { id: "point-cloud",    label: "Point Cloud" },
  { id: "threat-path",    label: "Threat Path" },
]

export default function SceneDock() {
  const activeTab = useSentinel((s) => s.activeTab)
  const setActiveTab = useSentinel((s) => s.setActiveTab)
  const selectCamera = useSentinel((s) => s.selectCamera)
  const selectedCameraId = useSentinel((s) => s.selectedCameraId)

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="flex items-stretch gap-1.5">
        {TABS.map((t) => {
          const active = activeTab === t.id && !selectedCameraId
          return (
            <button
              key={t.id}
              onClick={() => {
                if (selectedCameraId) selectCamera(null)
                setActiveTab(t.id)
              }}
              className={`flex-1 px-4 py-2.5 rounded-lg uppercase tracking-[0.16em] text-[10.5px] font-semibold transition-all
                ${active
                  ? "bg-white/[0.08] text-text border border-white/[0.12]"
                  : "text-dim hover:text-text/90 hover:bg-white/[0.03] border border-transparent"
                }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <div className="flex gap-6 items-center">
        <BudgetSlider />
      </div>
    </div>
  )
}

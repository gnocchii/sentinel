"use client"
import { useSentinel } from "@/store/sentinel"
import type { TwinTab } from "@/lib/types"
import DigitalTwin from "./DigitalTwin"
import PointCloudView from "./PointCloudView"
import CoverageMap from "./CoverageMap"
import ThreatPath from "./ThreatPath"
import CameraFeedsGrid from "./CameraFeedsGrid"
import BudgetSlider from "@/components/controls/BudgetSlider"
import TimeScrubber from "@/components/controls/TimeScrubber"

const TABS: { id: TwinTab; label: string }[] = [
  { id: "camera-feeds",  label: "Camera Feeds" },
  { id: "digital-twin",  label: "Digital Twin" },
  { id: "point-cloud",   label: "Point Cloud" },
  { id: "coverage-map",  label: "Coverage Map" },
  { id: "threat-path",   label: "Threat Path" },
]

export default function SceneViewer() {
  const { activeTab, setActiveTab } = useSentinel()

  return (
    <div className="flex flex-col h-full">
      {/* Viewport */}
      <div className="flex-1 relative bg-bg overflow-hidden">
        {activeTab === "camera-feeds"  && <CameraFeedsGrid />}
        {activeTab === "digital-twin"  && <DigitalTwin />}
        {activeTab === "point-cloud"   && <PointCloudView />}
        {activeTab === "coverage-map"  && <CoverageMap />}
        {activeTab === "threat-path"   && <ThreatPath />}
      </div>

      {/* Bottom controls */}
      <div className="border-t border-border bg-surface px-4 py-2 space-y-2 shrink-0">
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1 rounded text-xs transition-colors
                ${activeTab === t.id
                  ? "bg-cyan/15 text-cyan border border-cyan/30"
                  : "text-dim hover:text-text border border-transparent"
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
    </div>
  )
}

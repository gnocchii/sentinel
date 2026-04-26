"use client"
import { useSentinel } from "@/store/sentinel"
import DigitalTwin from "./DigitalTwin"
import PointCloudView from "./PointCloudView"
import CoverageMap from "./CoverageMap"
import ThreatPath from "./ThreatPath"
import CameraFeedsGrid from "./CameraFeedsGrid"
import MeshOptimizer from "./MeshOptimizer"
import ImportanceMap from "./ImportanceMap"
import WhatIfEditor from "./WhatIfEditor"

export default function SceneViewer() {
  const { activeTab } = useSentinel()
  return (
    <div className="w-full h-full relative bg-transparent overflow-hidden">
      {activeTab === "camera-feeds"   && <CameraFeedsGrid />}
      {activeTab === "digital-twin"   && <DigitalTwin />}
      {activeTab === "point-cloud"    && <PointCloudView />}
      {activeTab === "coverage-map"   && <CoverageMap />}
      {activeTab === "threat-path"    && <ThreatPath />}
      {activeTab === "mesh-optimizer" && <MeshOptimizer />}
      {activeTab === "importance-map" && <ImportanceMap />}
      {activeTab === "what-if"        && <WhatIfEditor />}
    </div>
  )
}

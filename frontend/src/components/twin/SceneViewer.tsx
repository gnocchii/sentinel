"use client"
import { useEffect } from "react"
import { useSentinel } from "@/store/sentinel"
import DigitalTwinCoverage from "./DigitalTwinCoverage"
import PointCloudView from "./PointCloudView"
import ThreatPath from "./ThreatPath"
import ImportanceMap from "./ImportanceMap"
import CameraDetailView from "./CameraDetailView"

export default function SceneViewer() {
  const activeTab = useSentinel((s) => s.activeTab)
  const selectedCameraId = useSentinel((s) => s.selectedCameraId)
  const cameras = useSentinel((s) => s.cameras)
  const selectCamera = useSentinel((s) => s.selectCamera)

  // Auto-select first camera when Camera Feeds tab is active and nothing is
  // selected yet, so the user lands on a populated POV + metadata view.
  useEffect(() => {
    if (activeTab === "camera-feeds" && !selectedCameraId && cameras.length > 0) {
      selectCamera(cameras[0].id)
    }
  }, [activeTab, selectedCameraId, cameras, selectCamera])

  if (selectedCameraId) return <div className="w-full h-full"><CameraDetailView /></div>

  return (
    <div className="w-full h-full relative bg-transparent overflow-hidden">
      {activeTab === "digital-twin"   && <DigitalTwinCoverage />}
      {activeTab === "point-cloud"    && <PointCloudView />}
      {activeTab === "threat-path"    && <ThreatPath />}
      {activeTab === "importance-map" && <ImportanceMap />}
      {activeTab === "camera-feeds"   && (
        <div className="w-full h-full flex items-center justify-center">
          <p className="text-dim text-sm">No cameras yet — run Refresh to populate.</p>
        </div>
      )}
    </div>
  )
}

"use client"
import { useSentinel } from "@/store/sentinel"
import CoveragePanel from "@/components/panels/CoveragePanel"
import CameraListPanel from "@/components/panels/CameraListPanel"
import LightingPanel from "@/components/panels/LightingPanel"
import ScanUploadPanel from "@/components/panels/ScanUploadPanel"

export default function LeftRail() {
  const { sceneId } = useSentinel()

  if (!sceneId) {
    return <aside className="w-72 border-r border-border bg-surface shrink-0" />
  }

  return (
    <aside className="w-72 flex flex-col gap-0 border-r border-border bg-surface overflow-y-auto shrink-0">
      <CoveragePanel />
      <Divider />
      <CameraListPanel />
      <Divider />
      <LightingPanel />
      <Divider />
      <ScanUploadPanel />
    </aside>
  )
}

function Divider() {
  return <div className="border-t border-border mx-3" />
}

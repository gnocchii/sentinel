"use client"
import CoveragePanel from "@/components/panels/CoveragePanel"
import CameraListPanel from "@/components/panels/CameraListPanel"
import LightingPanel from "@/components/panels/LightingPanel"

export default function LeftRail() {
  return (
    <aside className="w-72 flex flex-col gap-0 border-r border-border bg-surface overflow-y-auto shrink-0">
      <CoveragePanel />
      <Divider />
      <CameraListPanel />
      <Divider />
      <LightingPanel />
    </aside>
  )
}

function Divider() {
  return <div className="border-t border-border mx-3" />
}

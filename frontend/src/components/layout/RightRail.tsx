"use client"
import LiveFeedsPanel from "@/components/panels/LiveFeedsPanel"
import AlertsPanel from "@/components/panels/AlertsPanel"
import CameraPOVPanel from "@/components/panels/CameraPOVPanel"
import { useSentinel } from "@/store/sentinel"

export default function RightRail() {
  const { selectedCameraId } = useSentinel()

  return (
    <aside className="w-80 flex flex-col border-l border-border bg-surface shrink-0 overflow-y-auto overflow-x-hidden">
      {selectedCameraId ? (
        <>
          <CameraPOVPanel />
          <div className="border-t border-border mx-3" />
        </>
      ) : (
        <>
          <LiveFeedsPanel />
          <div className="border-t border-border mx-3" />
          <AlertsPanel />
        </>
      )}
    </aside>
  )
}

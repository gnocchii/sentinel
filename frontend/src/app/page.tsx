"use client"
import { useScene } from "@/hooks/useScene"
import TopBar from "@/components/layout/TopBar"
import LeftRail from "@/components/layout/LeftRail"
import RightRail from "@/components/layout/RightRail"
import SceneViewer from "@/components/twin/SceneViewer"

export default function Home() {
  useScene()  // loads scene + pointcloud + lighting on mount

  return (
    <div className="flex flex-col h-screen w-screen bg-bg overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftRail />
        <main className="flex-1 relative overflow-hidden">
          <SceneViewer />
        </main>
        <RightRail />
      </div>
    </div>
  )
}

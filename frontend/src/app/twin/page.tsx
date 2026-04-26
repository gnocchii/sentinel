"use client"
import { useScene } from "@/hooks/useScene"
import TopBar from "@/components/layout/TopBar"
import LeftRail from "@/components/layout/LeftRail"
import RightRail from "@/components/layout/RightRail"
import SceneViewer from "@/components/twin/SceneViewer"
import TopProgress from "@/components/ui/TopProgress"

export default function TwinDashboard() {
  useScene()

  return (
    <div className="flex flex-col h-screen w-screen bg-bg overflow-hidden">
      {/* ambient background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(120,140,180,0.07), transparent 60%), radial-gradient(ellipse 60% 50% at 50% 110%, rgba(140,120,180,0.05), transparent 60%), #0a0c10",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.018]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <TopProgress />
      <TopBar />

      <div className="flex flex-1 gap-4 px-8 pb-6 pt-2 overflow-hidden">
        <LeftRail />
        <main className="flex-1 min-w-0 flex">
          <div className="bento-card flex-1 min-h-0 overflow-hidden">
            <SceneViewer />
          </div>
        </main>
        <RightRail />
      </div>
    </div>
  )
}

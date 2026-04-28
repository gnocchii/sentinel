"use client"
import { useScene } from "@/hooks/useScene"
import TopBar from "@/components/layout/TopBar"
import LeftRail from "@/components/layout/LeftRail"
import RightRail from "@/components/layout/RightRail"
import SceneViewer from "@/components/twin/SceneViewer"
import SceneDock from "@/components/twin/SceneDock"
import TerminalFrame from "@/components/ui/TerminalFrame"
import BentoCard from "@/components/ui/BentoCard"
import TopProgress from "@/components/ui/TopProgress"

export default function TwinDashboard() {
  useScene()

  return (
    <div className="flex flex-col h-screen w-screen bg-bg overflow-hidden relative">
      <TopProgress />
      {/* Static gradient bg — Grainient was eating a WebGL context, which combined
          with the FbxPOV thumbnails was tripping the browser's per-page WebGL
          context cap and blanking out the oldest live-feed tiles. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(137,180,250,0.10), transparent 60%), radial-gradient(ellipse 60% 50% at 50% 110%, rgba(180,140,220,0.07), transparent 60%), linear-gradient(180deg, #0a0c12 0%, #08090f 100%)",
        }}
      />

      <TopBar />

      <div className="flex flex-1 gap-4 px-8 pb-6 pt-2 overflow-hidden">
        <LeftRail />
        <main className="flex-1 min-w-0 flex flex-col gap-3">
          <TerminalFrame
            className="flex-1 min-h-0"
            bodyClassName="flex-1 min-h-0"
          >
            <SceneViewer />
          </TerminalFrame>
          <BentoCard className="shrink-0" tilt={false}>
            <SceneDock />
          </BentoCard>
        </main>
        <RightRail />
      </div>
    </div>
  )
}

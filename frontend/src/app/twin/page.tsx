"use client"
import { useScene } from "@/hooks/useScene"
import TopBar from "@/components/layout/TopBar"
import LeftRail from "@/components/layout/LeftRail"
import RightRail from "@/components/layout/RightRail"
import SceneViewer from "@/components/twin/SceneViewer"
import SceneDock from "@/components/twin/SceneDock"
import TerminalFrame from "@/components/ui/TerminalFrame"
import BentoCard from "@/components/ui/BentoCard"
import Grainient from "@/components/ui/Grainient"
import TopProgress from "@/components/ui/TopProgress"

export default function TwinDashboard() {
  useScene()

  return (
    <div className="flex flex-col h-screen w-screen bg-bg overflow-hidden relative">
      <TopProgress />
      <div className="pointer-events-none fixed inset-0 -z-10">
        <Grainient
          color1="#1e2a52"
          color2="#89b4fa"
          color3="#3b5998"
          timeSpeed={0.18}
          warpStrength={1.0}
          warpFrequency={4.0}
          warpAmplitude={60.0}
          blendSoftness={0.12}
          rotationAmount={420.0}
          noiseScale={1.6}
          grainAmount={0.05}
          contrast={1.0}
          saturation={0.85}
          zoom={0.95}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(17,17,27,0.55) 0%, rgba(11,11,18,0.7) 100%)" }}
        />
      </div>

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

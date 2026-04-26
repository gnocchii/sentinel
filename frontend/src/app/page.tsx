"use client"
import dynamic from "next/dynamic"
import SentinelHero from "@/components/landing/SentinelHero"

// Three.js + ASCII canvas — client only, no SSR.
const BeckmanAscii = dynamic(() => import("@/components/landing/BeckmanAscii"), { ssr: false })

export default function Home() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <div className="sh-ascii-bg">
        <BeckmanAscii glbUrl="/beckman.glb" />
      </div>
      <SentinelHero />
    </div>
  )
}

"use client"
import { useRef } from "react"
import { Html } from "@react-three/drei"
import { useSentinel } from "@/store/sentinel"
import type { Camera } from "@/lib/types"

const STATUS_COLOR: Record<string, string> = {
  active:  "#00ff88",
  warning: "#ffaa00",
  offline: "#ff4444",
}

export default function CameraNode({ camera, selected }: { camera: Camera; selected: boolean }) {
  const { selectCamera } = useSentinel()
  const color = STATUS_COLOR[camera.status] ?? "#5a6a7a"

  return (
    <group position={camera.position as [number, number, number]}>
      {/* Camera body */}
      <mesh onClick={() => selectCamera(selected ? null : camera.id)}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 1.2 : 0.4}
        />
      </mesh>

      {/* Selection ring */}
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.25, 0.32, 24]} />
          <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={0.8} side={2} />
        </mesh>
      )}

      {/* Label */}
      {selected && (
        <Html distanceFactor={8} position={[0, 0, 0.4]}>
          <div className="bg-surface border border-cyan/30 rounded px-2 py-1 text-[10px] text-cyan whitespace-nowrap">
            {camera.label} · {camera.type} · ${camera.cost_usd}
          </div>
        </Html>
      )}
    </group>
  )
}

"use client"
import { useMemo } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import { useSentinel } from "@/store/sentinel"

export default function PointCloudView() {
  const { pointCloud } = useSentinel()

  return (
    <Canvas camera={{ position: [6, -8, 10], fov: 50 }} className="w-full h-full">
      <color attach="background" args={["#0a0c0f"]} />
      {pointCloud ? (
        <PointCloud points={pointCloud.points} />
      ) : (
        <mesh>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshBasicMaterial color="gray" />
        </mesh>
      )}
      <OrbitControls makeDefault target={[6, 4, 0]} />
    </Canvas>
  )
}

function PointCloud({ points }: { points: number[][] }) {
  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(points.length * 3)
    const colors = new Float32Array(points.length * 3)
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      positions[i * 3]     = p[0]
      positions[i * 3 + 1] = p[1]
      positions[i * 3 + 2] = p[2]
      colors[i * 3]     = p[3] ?? 0.5
      colors[i * 3 + 1] = p[4] ?? 0.5
      colors[i * 3 + 2] = p[5] ?? 0.5
    }
    return { positions, colors }
  }, [points])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color"    args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} vertexColors sizeAttenuation />
    </points>
  )
}

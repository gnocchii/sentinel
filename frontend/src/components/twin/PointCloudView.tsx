"use client"
import { useMemo } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { useSentinel } from "@/store/sentinel"

export default function PointCloudView() {
  const { pointCloud, scene } = useSentinel()

  const center = useMemo<[number, number, number]>(() => {
    if (!scene) return [0, 0, 0]
    const b = scene.bounds
    return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, 0]
  }, [scene])

  const camPos = useMemo<[number, number, number]>(() => {
    if (!scene) return [10, -10, 10]
    const b = scene.bounds
    const span = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1])
    const dist = span * 1.1 + 4
    return [center[0] + dist * 0.6, center[1] - dist, dist * 0.9]
  }, [scene, center])

  if (!pointCloud) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg text-center p-8">
        <div className="space-y-2 max-w-md">
          <p className="text-text text-sm">No point cloud available</p>
          <p className="text-dim text-xs">
            Point clouds are generated for scenes with full geometry (the Avery House demo).
            Polycam scans show their geometry directly in the <span className="text-cyan">Digital Twin</span> tab.
          </p>
        </div>
      </div>
    )
  }

  return (
    <Canvas
      camera={{ position: camPos, fov: 50 }}
      className="w-full h-full"
      gl={{ antialias: true, powerPreference: "default" }}
    >
      <color attach="background" args={["#0a0c0f"]} />
      <PointCloud points={pointCloud.points} />
      <OrbitControls makeDefault target={center} />
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

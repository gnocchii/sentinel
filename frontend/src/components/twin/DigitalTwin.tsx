"use client"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Grid, Environment } from "@react-three/drei"
import { useSentinel } from "@/store/sentinel"
import CameraNode from "./CameraNode"
import FOVCone from "./FOVCone"
import type { Scene } from "@/lib/types"

export default function DigitalTwin() {
  const { scene } = useSentinel()

  return (
    <Canvas
      camera={{ position: [6, -8, 10], fov: 50 }}
      className="w-full h-full"
    >
      <color attach="background" args={["#0a0c0f"]} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 10, 10]} intensity={0.5} />

      {scene && <SceneGeometry scene={scene} />}

      <Grid
        position={[0, 0, -0.01]}
        args={[20, 20]}
        cellColor="#1e2530"
        sectionColor="#2a3240"
        fadeDistance={30}
        infiniteGrid
      />
      <OrbitControls makeDefault target={[6, 4, 0]} />
    </Canvas>
  )
}

function SceneGeometry({ scene }: { scene: Scene }) {
  const { cameras, selectedCameraId } = useSentinel()
  const bounds = scene.bounds

  return (
    <group>
      {/* Floor plane */}
      <mesh position={[(bounds.max[0]) / 2, (bounds.max[1]) / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[bounds.max[0], bounds.max[1]]} />
        <meshStandardMaterial color="#111418" opacity={0.8} transparent />
      </mesh>

      {/* Walls */}
      {scene.walls.map((wall) => (
        <WallMesh key={wall.id} wall={wall} />
      ))}

      {/* Entry points — glowing markers */}
      {scene.entry_points.map((ep) => (
        <mesh key={ep.id} position={ep.position as [number, number, number]}>
          <sphereGeometry args={[0.15, 8, 8]} />
          <meshStandardMaterial color={ep.type === "door" ? "#ff4444" : "#ffaa00"} emissive={ep.type === "door" ? "#ff2222" : "#aa6600"} emissiveIntensity={0.5} />
        </mesh>
      ))}

      {/* Cameras + FOV cones */}
      {cameras.map((cam) => (
        <group key={cam.id}>
          <CameraNode camera={cam} selected={cam.id === selectedCameraId} />
          <FOVCone camera={cam} selected={cam.id === selectedCameraId} />
        </group>
      ))}
    </group>
  )
}

function WallMesh({ wall }: { wall: { from: number[]; to: number[]; height: number } }) {
  const [x0, y0] = wall.from
  const [x1, y1] = wall.to
  const length = Math.hypot(x1 - x0, y1 - y0)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const angle = Math.atan2(y1 - y0, x1 - x0)

  return (
    <mesh position={[cx, cy, wall.height / 2]} rotation={[0, 0, angle]}>
      <boxGeometry args={[length, 0.15, wall.height]} />
      <meshStandardMaterial color="#1e2530" transparent opacity={0.7} />
    </mesh>
  )
}

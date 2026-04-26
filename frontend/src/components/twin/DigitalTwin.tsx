"use client"
import { useMemo } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Grid } from "@react-three/drei"
import { useSentinel } from "@/store/sentinel"
import { SceneShell, CameraReframer, sceneView } from "./SceneShell"

export default function DigitalTwin() {
  const { scene } = useSentinel()
  const view = useMemo(() => sceneView(scene), [scene])

  return (
    <Canvas
      camera={{ position: view.camPos, fov: 45 }}
      className="w-full h-full"
      gl={{ antialias: true, powerPreference: "default" }}
      shadows
    >
      <color attach="background" args={["#070a0e"]} />
      <fog attach="fog" args={["#070a0e", 30, 90]} />

      {/* Three-point lighting */}
      <ambientLight intensity={0.35} />
      <hemisphereLight args={["#5a7aaa", "#0b0e14", 0.5]} />
      <directionalLight
        position={[15, 15, 25]}
        intensity={1.2}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-20, -10, 18]} intensity={0.45} color="#5b8fb9" />
      <pointLight position={[view.center[0], view.center[1], 6]} intensity={0.6} color="#3a8ec3" distance={40} />

      <CameraReframer center={view.center} camPos={view.camPos} />

      {scene && <SceneShell scene={scene} />}

      <Grid
        position={[view.center[0], view.center[1], -0.01]}
        args={[80, 80]}
        cellColor="#1a2129"
        sectionColor="#27313e"
        fadeDistance={80}
        fadeStrength={1.5}
        infiniteGrid
      />
      <OrbitControls makeDefault target={view.center} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  )
}

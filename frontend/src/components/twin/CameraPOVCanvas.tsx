"use client"
/**
 * CameraPOVCanvas — clean realistic POV render of the 3D scene.
 */

import { useEffect, useRef, useState } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { SceneShell } from "./SceneShell"
import { useSentinel } from "@/store/sentinel"
import type { Camera } from "@/lib/types"

function POVCameraSetup({ cam }: { cam: Camera }) {
  const { camera } = useThree() as { camera: THREE.PerspectiveCamera }
  useEffect(() => {
    camera.up.set(0, 0, 1)
    camera.position.set(cam.position[0], cam.position[1], cam.position[2])
    camera.lookAt(cam.target[0], cam.target[1], cam.target[2])
    camera.fov  = cam.fov_v ?? 70  // Three.js camera.fov is VERTICAL — match the placed cam
    camera.near = 0.05
    camera.far  = 200
    camera.updateProjectionMatrix()
  }, [
    cam.position[0], cam.position[1], cam.position[2],
    cam.target[0], cam.target[1], cam.target[2],
    cam.fov_v, camera,
  ])
  return null
}

type CaptureRef = { current: (() => Promise<Blob | null>) | null }

function FrameCapture({ captureRef }: { captureRef: CaptureRef }) {
  const { gl } = useThree()
  useEffect(() => {
    captureRef.current = () =>
      new Promise<Blob | null>((resolve) => gl.domElement.toBlob(resolve, "image/png"))
    return () => { captureRef.current = null }
  }, [gl, captureRef])
  return null
}

interface Props {
  camera: Camera
  hour: number
  size?: "large" | "mini"
  captureRef?: CaptureRef
}

export default function CameraPOVCanvas({ camera, hour, size = "large", captureRef }: Props) {
  const { scene } = useSentinel()
  if (!scene) return <div className="w-full h-full bg-black" />

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <Canvas
        camera={{ position: camera.position, fov: camera.fov_v ?? 70, near: 0.05, far: 200 }}
        gl={{ antialias: true, powerPreference: "default", preserveDrawingBuffer: true }}
        dpr={size === "mini" ? [1, 1.25] : [1, 2]}
        frameloop={size === "mini" ? "demand" : "always"}
      >
        <color attach="background" args={["#2a3038"]} />

        {/* Strong ambient = bright baseline everywhere, no dark corners */}
        <ambientLight intensity={1.2} color="#f0f4f8" />
        {/* Hemisphere adds gentle top-vs-bottom variation */}
        <hemisphereLight args={["#ffffff", "#b8c0c8", 0.6]} />
        {/* Two opposing soft directionals — creates subtle shadow differentiation */}
        {/* without leaving any side pitch dark */}
        <directionalLight position={[10, 10, 15]} intensity={0.5} color="#fff5e0" />
        <directionalLight position={[-10, -10, 12]} intensity={0.35} color="#e8eef8" />

        <POVCameraSetup cam={camera} />
        {captureRef && <FrameCapture captureRef={captureRef} />}
        <SceneShell
          scene={scene}
          showCameras={false}
          showFOV={false}
          showEntryPoints={false}
          showWalls={false}
          floorOpacity={1.0}
        />
      </Canvas>

      {/* Subtle vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.5) 100%)",
        }}
      />

      {/* Minimal HUD — only on tile thumbnails; the detail view labels the camera in its own header */}
      {size === "mini" && <Hud camera={camera} hour={hour} size={size} />}
    </div>
  )
}

function Hud({ camera, hour, size }: { camera: Camera; hour: number; size: "large" | "mini" }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const fontClass = size === "large" ? "text-[11px]" : "text-[8px]"
  const ts = `${String(hour).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`

  return (
    <div className={`absolute inset-0 p-2 pointer-events-none flex flex-col justify-between font-mono text-white/90 ${fontClass}`}>
      <div className="flex justify-between">
        <span className="font-semibold drop-shadow-md">{camera.id}</span>
        <span className="opacity-80 drop-shadow-md tabular-nums">{ts}</span>
      </div>
      <div className="flex justify-between items-end">
        <span className="opacity-70 drop-shadow-md">{camera.type.toUpperCase()}</span>
        {camera.status !== "offline" && (
          <span className="flex items-center gap-1 drop-shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {size === "large" && <span className="text-red-500 text-[10px]">REC</span>}
          </span>
        )}
      </div>
    </div>
  )
}

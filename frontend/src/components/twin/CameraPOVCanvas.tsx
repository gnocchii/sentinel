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

// Push the rendered camera slightly forward into the room so we don't get
// jammed against the wall it's mounted on. Demo-only nudge.
function adjustedPosition(cam: Camera): [number, number, number] {
  const dx = cam.target[0] - cam.position[0]
  const dy = cam.target[1] - cam.position[1]
  const dz = cam.target[2] - cam.position[2]
  const len = Math.hypot(dx, dy, dz) || 1
  const ux = dx / len, uy = dy / len, uz = dz / len
  const push = 0.9
  return [
    cam.position[0] + ux * push,
    cam.position[1] + uy * push,
    cam.position[2] + uz * push,
  ]
}

function POVCameraSetup({ cam }: { cam: Camera }) {
  const { camera } = useThree() as { camera: THREE.PerspectiveCamera }
  useEffect(() => {
    const pos = adjustedPosition(cam)
    camera.up.set(0, 0, 1)
    camera.position.set(pos[0], pos[1], pos[2])
    camera.lookAt(cam.target[0], cam.target[1], 1.2)
    // Wide-angle so we see context — typical security cam is 90–110° horizontal
    camera.fov = 70
    camera.near = 0.3
    camera.far = 60
    camera.updateProjectionMatrix()
  }, [cam.position[0], cam.position[1], cam.position[2], cam.target[0], cam.target[1], cam.target[2], camera])
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

  const midZ = (scene.bounds.min[2] + scene.bounds.max[2]) / 2
  const camAtMid: Camera = {
    ...camera,
    position: [camera.position[0], camera.position[1], midZ],
  }

  const startPos = adjustedPosition(camAtMid)

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <Canvas
        camera={{ position: startPos, fov: 70, near: 0.3, far: 60 }}
        gl={{ antialias: true, powerPreference: "default", preserveDrawingBuffer: true }}
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

        <POVCameraSetup cam={camAtMid} />
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

      {/* Minimal HUD */}
      <Hud camera={camera} hour={hour} size={size} />
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

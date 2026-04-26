"use client"
/**
 * FbxPOV — render an uploaded FBX through a security camera's POV.
 * Used by Camera Feeds when an FBX has been uploaded. Calculations still
 * come from the parsed USDZ scene; this is purely a visualization swap.
 */

import { Suspense, useEffect } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import * as THREE from "three"
import FbxModel from "./FbxModel"
import { useSentinel } from "@/store/sentinel"
import type { Camera } from "@/lib/types"

function adjustedPosition(cam: Camera): [number, number, number] {
  const dx = cam.target[0] - cam.position[0]
  const dy = cam.target[1] - cam.position[1]
  const dz = cam.target[2] - cam.position[2]
  const len = Math.hypot(dx, dy, dz) || 1
  const push = 0.5
  return [
    cam.position[0] + (dx / len) * push,
    cam.position[1] + (dy / len) * push,
    cam.position[2] + (dz / len) * push,
  ]
}

function POVCameraSetup({ cam }: { cam: Camera }) {
  const { camera } = useThree() as { camera: THREE.PerspectiveCamera }
  const sceneBounds = useSentinel((s) => s.scene?.bounds)
  useEffect(() => {
    const pos = adjustedPosition(cam)
    camera.up.set(0, 0, 1)
    camera.position.set(pos[0], pos[1], pos[2])

    // Constraint A: POV must contain the mesh. Override the security cam's
    // stored target — aim the rendered camera at the scene centroid (and at
    // floor Z so the artificial floor is also in frame).
    if (sceneBounds) {
      const cx = (sceneBounds.min[0] + sceneBounds.max[0]) / 2
      const cy = (sceneBounds.min[1] + sceneBounds.max[1]) / 2
      camera.lookAt(cx, cy, sceneBounds.min[2])
    } else {
      camera.lookAt(cam.target[0], cam.target[1], cam.target[2])
    }

    camera.fov  = Math.max(cam.fov_h ?? 90, 100)  // wide enough to fit the mesh
    camera.near = 0.05
    camera.far  = 200
    camera.updateProjectionMatrix()
  }, [cam.position[0], cam.position[1], cam.position[2], cam.fov_h, camera, sceneBounds])
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
  url: string
  scale?: number
  captureRef?: CaptureRef
}

export default function FbxPOV({ camera, url, scale = 1, captureRef }: Props) {
  const startPos = adjustedPosition(camera)
  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <Canvas
        camera={{ position: startPos, fov: 70, near: 0.05, far: 200 }}
        gl={{ antialias: true, powerPreference: "default", preserveDrawingBuffer: true }}
      >
        <color attach="background" args={["#05070a"]} />
        <ambientLight intensity={1.0} color="#f0f4f8" />
        <hemisphereLight args={["#ffffff", "#404048", 0.6]} />
        <directionalLight position={[10, 10, 15]} intensity={0.8} color="#fff5e0" />
        <directionalLight position={[-10, -10, 12]} intensity={0.4} color="#e8eef8" />
        <POVCameraSetup cam={camera} />
        {captureRef && <FrameCapture captureRef={captureRef} />}
        <Suspense fallback={null}>
          <FbxModel url={url} scale={scale} />
        </Suspense>
      </Canvas>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  )
}

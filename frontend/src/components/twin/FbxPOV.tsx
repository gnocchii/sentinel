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
import type { Camera } from "@/lib/types"

function POVCameraSetup({ cam }: { cam: Camera }) {
  const { camera } = useThree() as { camera: THREE.PerspectiveCamera }
  useEffect(() => {
    camera.up.set(0, 0, 1)
    camera.position.set(cam.position[0], cam.position[1], cam.position[2])
    camera.lookAt(cam.target[0], cam.target[1], cam.target[2])
    camera.fov  = cam.fov_v ?? 70   // Three.js camera.fov is VERTICAL — match the placed cam
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
  url: string
  scale?: number
  captureRef?: CaptureRef
}

export default function FbxPOV({ camera, url, scale = 1, captureRef }: Props) {
  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <Canvas
        camera={{ position: camera.position, fov: camera.fov_v ?? 70, near: 0.05, far: 200 }}
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

"use client"
/**
 * Shared scene geometry — walls, floor, obstructions, entry points, cameras+FOV.
 * Used inside both <DigitalTwin> and <CoverageMap3D>.
 *
 * Includes the imperative camera-reframer so the WebGL Canvas only mounts once
 * per parent (avoids context leaks).
 */

import { useEffect, useMemo, useRef } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import CameraNode from "./CameraNode"
import FOVCone from "./FOVCone"
import { useSentinel } from "@/store/sentinel"
import type { Scene } from "@/lib/types"

export function sceneView(scene: Scene | null) {
  if (!scene) return { center: [0, 0, 0] as [number, number, number], camPos: [10, -10, 10] as [number, number, number] }
  const b = scene.bounds
  const cx = (b.min[0] + b.max[0]) / 2
  const cy = (b.min[1] + b.max[1]) / 2
  const sx = b.max[0] - b.min[0]
  const sy = b.max[1] - b.min[1]
  const span = Math.max(sx, sy)
  // Pull back enough that the long axis fits, then offset diagonally with a softer pitch
  const dist = span * 0.7 + 6
  return {
    center: [cx, cy, 1.0] as [number, number, number],
    camPos: [cx + dist * 0.4, cy - dist * 0.85, dist * 0.55] as [number, number, number],
  }
}

export function CameraReframer({ center, camPos }: { center: [number, number, number]; camPos: [number, number, number] }) {
  const { camera, controls } = useThree() as { camera: THREE.PerspectiveCamera; controls: any }
  const lastKey = useRef("")
  const key = `${center.join(",")}|${camPos.join(",")}`

  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    camera.position.set(camPos[0], camPos[1], camPos[2])
    camera.lookAt(center[0], center[1], center[2])
    camera.updateProjectionMatrix()
    if (controls && (controls as any).target) {
      ;(controls as any).target.set(center[0], center[1], center[2])
      ;(controls as any).update?.()
    }
  }, [key, camera, controls, camPos, center])

  return null
}

interface SceneShellProps {
  scene: Scene
  showCameras?: boolean
  showFOV?: boolean
  floorOpacity?: number
}

export function SceneShell({ scene, showCameras = true, showFOV = true, floorOpacity = 0.85 }: SceneShellProps) {
  const { cameras, selectedCameraId } = useSentinel()
  const b = scene.bounds
  const cx = (b.min[0] + b.max[0]) / 2
  const cy = (b.min[1] + b.max[1]) / 2
  const sx = b.max[0] - b.min[0]
  const sy = b.max[1] - b.min[1]

  return (
    <group>
      {/* Floor */}
      <mesh position={[cx, cy, 0]}>
        <planeGeometry args={[sx, sy]} />
        <meshStandardMaterial color="#1a1f26" opacity={floorOpacity} transparent />
      </mesh>

      {/* Walls */}
      {scene.walls.map((wall) => <WallMesh key={wall.id} wall={wall} />)}

      {/* Obstructions */}
      {(scene.obstructions ?? []).map((obs) => <ObstructionMesh key={obs.id} obs={obs} />)}

      {/* Doors / windows */}
      {scene.entry_points.map((ep) => (
        <mesh key={ep.id} position={ep.position as [number, number, number]}>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshStandardMaterial
            color={ep.type === "door" ? "#ff5566" : "#ffaa00"}
            emissive={ep.type === "door" ? "#ff2244" : "#aa6600"}
            emissiveIntensity={0.7}
          />
        </mesh>
      ))}

      {/* Cameras + FOV */}
      {showCameras && cameras.map((cam) => (
        <group key={cam.id}>
          <CameraNode camera={cam} selected={cam.id === selectedCameraId} />
          {showFOV && <FOVCone camera={cam} selected={cam.id === selectedCameraId} />}
        </group>
      ))}
    </group>
  )
}

function WallMesh({ wall }: { wall: { from: number[]; to: number[]; height: number } }) {
  const [x0, y0] = wall.from
  const [x1, y1] = wall.to
  const length = Math.hypot(x1 - x0, y1 - y0)
  if (length < 0.05) return null
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const angle = Math.atan2(y1 - y0, x1 - x0)
  return (
    <mesh position={[cx, cy, wall.height / 2]} rotation={[0, 0, angle]}>
      <boxGeometry args={[length, 0.15, wall.height]} />
      <meshStandardMaterial color="#3a4452" emissive="#1a2530" emissiveIntensity={0.2} />
    </mesh>
  )
}

function ObstructionMesh({ obs }: { obs: { id: string; bounds: { min: number[]; max: number[] } } }) {
  const b = obs.bounds
  const cx = (b.min[0] + b.max[0]) / 2
  const cy = (b.min[1] + b.max[1]) / 2
  const cz = (b.min[2] + b.max[2]) / 2
  const sx = Math.max(0.05, b.max[0] - b.min[0])
  const sy = Math.max(0.05, b.max[1] - b.min[1])
  const sz = Math.max(0.05, b.max[2] - b.min[2])
  return (
    <mesh position={[cx, cy, cz]}>
      <boxGeometry args={[sx, sy, sz]} />
      <meshStandardMaterial color="#5a6a82" opacity={0.85} transparent />
    </mesh>
  )
}

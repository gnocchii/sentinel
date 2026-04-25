"use client"
import { useMemo } from "react"
import * as THREE from "three"
import type { Camera } from "@/lib/types"

const STATUS_COLOR: Record<string, string> = {
  active:  "#00ff88",
  warning: "#ffaa00",
  offline: "#ff4444",
}

export default function FOVCone({ camera, selected }: { camera: Camera; selected: boolean }) {
  const color = STATUS_COLOR[camera.status] ?? "#5a6a7a"

  // Build a cone mesh oriented toward the camera target
  const { position, quaternion, length } = useMemo(() => {
    const pos = new THREE.Vector3(...camera.position)
    const target = new THREE.Vector3(...camera.target)
    const dir = target.clone().sub(pos)
    const length = dir.length()
    dir.normalize()

    // ConeGeometry points along +Y by default, we want it along the direction vector
    const up = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir)

    // Position cone so its tip is at the camera, base points toward target
    const midPoint = pos.clone().add(dir.clone().multiplyScalar(length / 2))

    return { position: midPoint, quaternion: q, length }
  }, [camera.position, camera.target])

  const radius = Math.tan(THREE.MathUtils.degToRad(camera.fov_h / 2)) * length

  return (
    <mesh
      position={position}
      quaternion={quaternion}
    >
      <coneGeometry args={[radius, length, 16, 1, true]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={selected ? 0.18 : 0.07}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

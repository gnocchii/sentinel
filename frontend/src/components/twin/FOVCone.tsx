"use client"
/**
 * FOV cone visualization.
 *
 * Two render modes to keep multi-camera scenes legible:
 *   - Selected → filled translucent cone (you see exactly where this one looks)
 *   - Unselected → thin wireframe outline only (so the scene isn't a green soup)
 *
 * The cone always points from camera.position toward camera.target with the
 * apex AT the camera (cone tip at origin, base out toward target).
 */

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

  const { position, quaternion, length, radius } = useMemo(() => {
    const pos = new THREE.Vector3(...camera.position)
    const target = new THREE.Vector3(...camera.target)
    const dir = target.clone().sub(pos)
    const length = dir.length()
    if (length < 1e-3) return { position: pos, quaternion: new THREE.Quaternion(), length: 0, radius: 0 }
    dir.normalize()
    const up = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir)
    const midPoint = pos.clone().add(dir.clone().multiplyScalar(length / 2))
    const radius = Math.tan(THREE.MathUtils.degToRad(camera.fov_h / 2)) * length
    return { position: midPoint, quaternion: q, length, radius }
  }, [camera.position, camera.target, camera.fov_h])

  if (length < 1e-3) return null

  if (!selected) {
    // Wireframe outline — three radial segments forming a thin "Y" shape so you can see direction
    return <ConeOutline position={position} quaternion={quaternion} length={length} radius={radius} color={color} />
  }

  return (
    <mesh position={position} quaternion={quaternion}>
      <coneGeometry args={[radius, length, 32, 1, true]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.18}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

function ConeOutline({
  position, quaternion, length, radius, color,
}: {
  position: THREE.Vector3; quaternion: THREE.Quaternion; length: number; radius: number; color: string
}) {
  // Build line segments from apex (-length/2 along Y) to 4 evenly-spaced points on the base circle (+length/2)
  const points = useMemo(() => {
    const apex = new THREE.Vector3(0, -length / 2, 0)
    const base: THREE.Vector3[] = []
    const N = 4
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      base.push(new THREE.Vector3(Math.cos(a) * radius, length / 2, Math.sin(a) * radius))
    }
    // Spokes from apex to base + a base ring
    const segs: number[] = []
    for (const p of base) {
      segs.push(apex.x, apex.y, apex.z, p.x, p.y, p.z)
    }
    for (let i = 0; i < N; i++) {
      const a = base[i]
      const b = base[(i + 1) % N]
      segs.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
    return new Float32Array(segs)
  }, [length, radius])

  return (
    <lineSegments position={position} quaternion={quaternion}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={0.35} />
    </lineSegments>
  )
}

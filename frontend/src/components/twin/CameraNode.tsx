"use client"
/**
 * Procedural 3D security-camera mesh, shape varies by camera type:
 *   - Bullet 2K    → cylindrical bullet camera with a lens cone, mount arm to ceiling
 *   - Dome 4K/WDR/IR → hemisphere dome on a flush ceiling base
 *   - PTZ          → spherical pan-tilt-zoom on a stem
 *
 * The whole rig is oriented to point along (target - position).
 * A small status LED on the side glows green/amber/red and gets brighter when selected.
 */

import { useMemo } from "react"
import { Html } from "@react-three/drei"
import * as THREE from "three"
import { useSentinel } from "@/store/sentinel"
import type { Camera } from "@/lib/types"

const STATUS_COLOR: Record<string, string> = {
  active:  "#00ff88",
  warning: "#ffaa00",
  offline: "#ff4444",
}

export default function CameraNode({ camera, selected }: { camera: Camera; selected: boolean }) {
  const { selectCamera } = useSentinel()
  const led = STATUS_COLOR[camera.status] ?? "#5a6a7a"
  const ledIntensity = selected ? 2.4 : 1.0

  // Quaternion to rotate body so its "forward" (+Y in local space) aims at target
  const quat = useMemo(() => {
    const dir = new THREE.Vector3(
      camera.target[0] - camera.position[0],
      camera.target[1] - camera.position[1],
      camera.target[2] - camera.position[2],
    ).normalize()
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  }, [camera.position, camera.target])

  return (
    <group
      position={camera.position as [number, number, number]}
      quaternion={quat}
      onClick={(e) => { e.stopPropagation(); selectCamera(selected ? null : camera.id) }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer" }}
      onPointerOut={() => { document.body.style.cursor = "default" }}
    >
      {camera.type === "PTZ" ? (
        <PTZBody />
      ) : camera.type.startsWith("Dome") ? (
        <DomeBody />
      ) : (
        <BulletBody />
      )}

      {/* Status LED — small emissive sphere on side */}
      <mesh position={[0.06, -0.12, 0.05]}>
        <sphereGeometry args={[0.022, 8, 8]} />
        <meshStandardMaterial color={led} emissive={led} emissiveIntensity={ledIntensity} toneMapped={false} />
      </mesh>

      {/* Selection ring on the floor below the camera */}
      {selected && <SelectionRing color="#00d4ff" />}

      {/* Hover/selected label */}
      {selected && (
        <Html distanceFactor={9} position={[0, 0, 0.55]} center occlude>
          <div className="bg-bg/90 border border-cyan/40 rounded px-2 py-1 text-[10px] text-cyan whitespace-nowrap font-mono">
            {camera.label} · {camera.type} · ${camera.cost_usd}
          </div>
        </Html>
      )}
    </group>
  )
}

// ─── Bullet body: classic cylindrical security cam with lens ─────

function BulletBody() {
  return (
    <group>
      {/* Vertical mount stem to ceiling */}
      <mesh position={[0, 0, 0.18]}>
        <cylinderGeometry args={[0.022, 0.022, 0.36, 8]} />
        <meshStandardMaterial color="#4a5363" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.36]}>
        <cylinderGeometry args={[0.06, 0.06, 0.025, 16]} />
        <meshStandardMaterial color="#39414e" metalness={0.7} roughness={0.35} />
      </mesh>

      {/* Body cylinder along +Y (forward) */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.34, 16]} />
        <meshStandardMaterial color="#cdd6df" metalness={0.55} roughness={0.35} />
      </mesh>

      {/* Lens hood — narrower cylinder at front */}
      <mesh position={[0, 0.20, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.06, 16]} />
        <meshStandardMaterial color="#1a1f26" metalness={0.7} roughness={0.4} />
      </mesh>

      {/* Glass lens */}
      <mesh position={[0, 0.235, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.045, 24]} />
        <meshPhysicalMaterial color="#0a141c" metalness={0.2} roughness={0.05} clearcoat={1} reflectivity={1} />
      </mesh>

      {/* Mid-body badge ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.072, 0.005, 8, 24]} />
        <meshStandardMaterial color="#5b6573" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  )
}

// ─── Dome body: hemisphere flush to ceiling ──────────────────────

function DomeBody() {
  return (
    <group>
      {/* Flat mounting plate */}
      <mesh position={[0, 0, 0.04]}>
        <cylinderGeometry args={[0.13, 0.13, 0.025, 24]} />
        <meshStandardMaterial color="#cdd6df" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Dome — open hemisphere pointing down */}
      <mesh position={[0, 0, 0.025]} rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[0.11, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#0e1620" metalness={0.1} roughness={0.05}
          clearcoat={1} reflectivity={0.9} transmission={0.15} thickness={0.5}
        />
      </mesh>

      {/* Inner camera (visible through dome) */}
      <mesh position={[0, 0.01, -0.02]}>
        <sphereGeometry args={[0.045, 16, 12]} />
        <meshStandardMaterial color="#222a35" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.045, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.022, 16]} />
        <meshPhysicalMaterial color="#000810" metalness={0.2} roughness={0.05} clearcoat={1} />
      </mesh>
    </group>
  )
}

// ─── PTZ body: sphere on stem, can pan/tilt ──────────────────────

function PTZBody() {
  return (
    <group>
      {/* Mount cylinder to ceiling */}
      <mesh position={[0, 0, 0.16]}>
        <cylinderGeometry args={[0.04, 0.04, 0.32, 12]} />
        <meshStandardMaterial color="#4a5363" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Pan/tilt sphere head */}
      <mesh>
        <sphereGeometry args={[0.115, 24, 18]} />
        <meshPhysicalMaterial
          color="#0e1620" metalness={0.4} roughness={0.15}
          clearcoat={1} reflectivity={0.9}
        />
      </mesh>

      {/* Equator highlight ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.116, 0.006, 8, 32]} />
        <meshStandardMaterial color="#9aa6b5" metalness={0.8} roughness={0.25} />
      </mesh>

      {/* Lens window */}
      <mesh position={[0, 0.115, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.04, 24]} />
        <meshPhysicalMaterial color="#000810" metalness={0.1} roughness={0.04} clearcoat={1} />
      </mesh>
    </group>
  )
}

// ─── Selection ring on floor under selected camera ───────────────

function SelectionRing({ color }: { color: string }) {
  // Hovers just above the floor (z=0). Camera position has its own z; ring offsets to z=−camZ
  // We can't easily know camera z here — instead emit the ring at the camera's local origin and
  // use a small downward offset. The ring is a flat torus on XY plane.
  return (
    <mesh position={[0, 0, -0.001]} rotation={[0, 0, 0]}>
      <torusGeometry args={[0.32, 0.012, 8, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} />
    </mesh>
  )
}

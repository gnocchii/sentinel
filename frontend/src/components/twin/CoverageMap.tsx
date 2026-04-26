"use client"
/**
 * 3D Coverage Map.
 *
 * Reuses the same scene mesh as the Digital Twin (walls, floor, furniture, doors,
 * cameras + FOV cones), then overlays a per-camera coverage layer.
 *
 * Each camera gets a unique hue. The cells it actually sees (through walls,
 * past furniture — same raycast as the optimizer) are rendered as a single
 * InstancedMesh of low-opacity colored tiles on the floor. Tiles overlap
 * additively so cells covered by multiple cameras visibly accumulate brightness.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Grid } from "@react-three/drei"
import * as THREE from "three"
import { useSentinel } from "@/store/sentinel"
import { fetchCoverage3D } from "@/lib/api"
import { SceneShell, CameraReframer, sceneView } from "./SceneShell"
import type { Coverage3DPayload, CameraCoverage3D } from "@/lib/types"

export default function CoverageMap() {
  const { scene, cameras, sceneId } = useSentinel()
  const [coverage, setCoverage] = useState<Coverage3DPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const view = useMemo(() => sceneView(scene), [scene])

  // Fetch when scene + cameras both available, refetch when camera list changes
  useEffect(() => {
    if (!sceneId || !cameras || cameras.length === 0) {
      setCoverage(null)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchCoverage3D(sceneId, cameras, 0.25)
      .then((c) => { if (!cancelled) setCoverage(c) })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sceneId, cameras])

  const cameraColors = useMemo(() => {
    const out: Record<string, string> = {}
    cameras.forEach((c, i) => {
      const hue = (i * 360) / Math.max(1, cameras.length)
      out[c.id] = `hsl(${hue}, 80%, 60%)`
    })
    return out
  }, [cameras])

  if (!scene) return null

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ position: view.camPos, fov: 45 }}
        className="w-full h-full"
        gl={{ antialias: true, powerPreference: "default" }}
      >
        <color attach="background" args={["#070a0e"]} />
        <fog attach="fog" args={["#070a0e", 30, 90]} />

        <ambientLight intensity={0.35} />
        <hemisphereLight args={["#5a7aaa", "#0b0e14", 0.5]} />
        <directionalLight position={[15, 15, 25]} intensity={1.0} />
        <directionalLight position={[-20, -10, 18]} intensity={0.4} color="#5b8fb9" />

        <CameraReframer center={view.center} camPos={view.camPos} />
        {/* Hide FOV cones in coverage map — the per-camera floor tiles convey it */}
        <SceneShell scene={scene} floorOpacity={0.6} showFOV={false} />

        {coverage && coverage.cameras.map((cam) => (
          <CoverageLayer
            key={cam.id}
            camCoverage={cam}
            color={cameraColors[cam.id] ?? "#00ff88"}
            bounds={coverage.bounds}
            resolution={coverage.resolution}
          />
        ))}

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

      {/* Overlay: status + legend */}
      <div className="absolute top-3 left-3 bg-bg/80 border border-border rounded px-3 py-2 text-xs space-y-1 max-w-xs">
        <div className="flex items-center gap-2">
          <span className="text-text font-semibold">3D Coverage</span>
          {loading && <span className="text-dim text-[10px]">computing…</span>}
        </div>
        {coverage ? (
          <>
            <div className="text-dim">
              {coverage.coverage_pct.toFixed(1)}% floor coverage
              {" · "}
              {coverage.covered_cells} / {coverage.total_cells} cells
            </div>
            <div className="space-y-0.5 pt-1 border-t border-border max-h-48 overflow-y-auto">
              {coverage.cameras.map((cam) => (
                <div key={cam.id} className="flex items-center gap-1.5 text-[10px]">
                  <span
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{ background: cameraColors[cam.id] }}
                  />
                  <span className="text-text font-mono">{cam.id}</span>
                  <span className="text-dim">{cam.type}</span>
                  <span className="text-dim ml-auto">{cam.covered_count} cells</span>
                </div>
              ))}
            </div>
          </>
        ) : cameras.length === 0 ? (
          <p className="text-dim text-[10px]">
            No cameras placed yet — click <span className="text-cyan">Optimize Cameras</span> below.
          </p>
        ) : (
          <p className="text-dim text-[10px]">Loading coverage…</p>
        )}
      </div>
    </div>
  )
}

// ─── Per-camera InstancedMesh of coverage tiles ──────────────────

function CoverageLayer({
  camCoverage, color, bounds, resolution,
}: {
  camCoverage: CameraCoverage3D
  color: string
  bounds: { min: [number, number]; max: [number, number] }
  resolution: number
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const count = camCoverage.covered_cells.length

  useEffect(() => {
    const m = meshRef.current
    if (!m) return
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      const [col, row] = camCoverage.covered_cells[i]
      const x = bounds.min[0] + (col + 0.5) * resolution
      const y = bounds.min[1] + (row + 0.5) * resolution
      // Slight z offset per camera index (using a hash from id) so overlapping tiles z-fight less
      matrix.makeTranslation(x, y, 0.02)
      m.setMatrixAt(i, matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }, [camCoverage, bounds, resolution, count])

  if (count === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      // Disable raycasting so tiles don't intercept clicks meant for camera nodes
      raycast={() => null}
    >
      <planeGeometry args={[resolution * 1.05, resolution * 1.05]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.18}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  )
}

"use client"
/**
 * Merged Digital Twin + Coverage Map.
 *
 * Renders the full 3D scene (walls, floor, doors, obstructions, cameras + FOV cones)
 * AND overlays per-camera floor coverage tiles. A toggle in the corner lets you
 * hide either layer; clicking a camera node selects it (handled by CameraNode).
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Grid } from "@react-three/drei"
import * as THREE from "three"
import { useSentinel } from "@/store/sentinel"
import { fetchCoverage3D } from "@/lib/api"
import { SceneShell, CameraReframer, sceneView } from "./SceneShell"
import type { Coverage3DPayload, CameraCoverage3D } from "@/lib/types"

// Cameras intentionally hidden from the digital-twin overlay (the mesh shows
// duplicate FOV/coverage for these in the same hallway as another camera).
const TWIN_HIDDEN_CAMERA_IDS = new Set(["CAM-07"])

export default function DigitalTwinCoverage() {
  const { scene, cameras, sceneId } = useSentinel()
  const [coverage, setCoverage] = useState<Coverage3DPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [showCoverage, setShowCoverage] = useState(true)
  const [showFOV, setShowFOV] = useState(true)
  const view = useMemo(() => sceneView(scene), [scene])

  // Filter cameras for the twin view so CAM-07 (and any future hidden ids)
  // don't render their FOV cone, coverage tiles, or legend entry.
  const visibleCameras = useMemo(
    () => cameras.filter((c) => !TWIN_HIDDEN_CAMERA_IDS.has(c.id)),
    [cameras],
  )

  useEffect(() => {
    if (!sceneId || !visibleCameras || visibleCameras.length === 0) {
      setCoverage(null)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchCoverage3D(sceneId, visibleCameras, 0.25)
      .then((c) => { if (!cancelled) setCoverage(c) })
      .catch((e) => console.error("coverage fetch failed", e))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sceneId, visibleCameras])

  const cameraColors = useMemo(() => {
    const out: Record<string, string> = {}
    visibleCameras.forEach((c, i) => {
      const hue = (i * 360) / Math.max(1, visibleCameras.length)
      out[c.id] = `hsl(${hue}, 80%, 60%)`
    })
    return out
  }, [visibleCameras])

  if (!scene) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-dim text-sm">Upload a USDZ scene to view the digital twin</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ position: view.camPos, fov: 45 }}
        className="w-full h-full"
        gl={{ antialias: true, powerPreference: "default" }}
        shadows
      >
        <color attach="background" args={["#070a0e"]} />
        <fog attach="fog" args={["#070a0e", 30, 90]} />

        <ambientLight intensity={0.35} />
        <hemisphereLight args={["#5a7aaa", "#0b0e14", 0.5]} />
        <directionalLight position={[15, 15, 25]} intensity={1.0} castShadow />
        <directionalLight position={[-20, -10, 18]} intensity={0.4} color="#5b8fb9" />

        <CameraReframer center={view.center} camPos={view.camPos} />

        <SceneShell
          scene={scene}
          floorOpacity={0.7}
          showFOV={showFOV}
          hiddenCameraIds={TWIN_HIDDEN_CAMERA_IDS}
        />

        {showCoverage && coverage && coverage.cameras.map((cam) => (
          <CoverageLayer
            key={cam.id}
            camCoverage={cam}
            color={cameraColors[cam.id] ?? "#89b4fa"}
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

      {/* Top-left status / legend */}
      <div className="absolute top-3 left-3 bg-bg/80 backdrop-blur-md border border-white/[0.06] rounded-lg px-3 py-2 text-xs space-y-1.5 max-w-[15rem]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-text font-semibold tracking-tight">Twin · Coverage</span>
          {loading && <span className="text-dim text-[10px]">computing…</span>}
        </div>
        {coverage && (
          <div className="text-dim text-[10.5px] tabular-nums">
            {coverage.coverage_pct.toFixed(1)}% · {coverage.covered_cells}/{coverage.total_cells} cells
          </div>
        )}
        <div className="flex gap-1 pt-1">
          <button
            onClick={() => setShowCoverage((v) => !v)}
            className={`flex-1 px-2 py-1 rounded text-[10px] border transition-colors ${
              showCoverage ? "bg-cyan/10 border-cyan/30 text-cyan" : "bg-white/[0.02] border-white/[0.06] text-dim"
            }`}
          >
            Coverage
          </button>
          <button
            onClick={() => setShowFOV((v) => !v)}
            className={`flex-1 px-2 py-1 rounded text-[10px] border transition-colors ${
              showFOV ? "bg-cyan/10 border-cyan/30 text-cyan" : "bg-white/[0.02] border-white/[0.06] text-dim"
            }`}
          >
            FOV
          </button>
        </div>
        {coverage && coverage.cameras.length > 0 && (
          <div className="space-y-0.5 pt-1.5 border-t border-white/[0.06] max-h-40 overflow-y-auto scroll-thin">
            {coverage.cameras.map((cam) => (
              <div key={cam.id} className="flex items-center gap-1.5 text-[10px]">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: cameraColors[cam.id] }} />
                <span className="text-text font-mono">{cam.id}</span>
                <span className="text-dim ml-auto tabular-nums">{cam.covered_count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

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
      matrix.makeTranslation(x, y, 0.02)
      m.setMatrixAt(i, matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }, [camCoverage, bounds, resolution, count])

  if (count === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} raycast={() => null}>
      <planeGeometry args={[resolution * 1.05, resolution * 1.05]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.22}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  )
}

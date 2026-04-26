"use client"
import { useState, useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Grid } from "@react-three/drei"
import * as THREE from "three"
import { useSentinel } from "@/store/sentinel"
import { runWhatIf } from "@/lib/api"
import { SceneShell, CameraReframer, sceneView } from "./SceneShell"
import type { EntryPoint } from "@/lib/types"

interface WhatIfResult {
  cameras: object[]
  coverage_pct: number
  total_cost_usd: number
  entry_points_covered: number
  entry_points_total: number
  blind_spots: object[]
  removed_entry_ids: string[]
  orig_coverage_pct: number
  delta_coverage_pct: number
  delta_camera_count: number
}

export default function WhatIfEditor() {
  const { scene, sceneId, budget } = useSentinel()
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<WhatIfResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const view = useMemo(() => sceneView(scene), [scene])

  if (!scene) return null

  const toggleEntry = (id: string) => {
    setRemovedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setResult(null)
    setError(null)
  }

  const handleRun = async () => {
    if (!sceneId) return
    setRunning(true)
    setError(null)
    try {
      const res = await runWhatIf(sceneId, [...removedIds], budget)
      setResult(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(false)
    }
  }

  const handleReset = () => {
    setRemovedIds(new Set())
    setResult(null)
    setError(null)
  }

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
        <SceneShell scene={scene} showFOV={false} showCameras showEntryPoints={false} />

        {scene.entry_points.map(ep => (
          <WhatIfEntryPoint
            key={ep.id}
            ep={ep}
            removed={removedIds.has(ep.id)}
            onClick={() => toggleEntry(ep.id)}
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

      {/* Controls overlay */}
      <div className="absolute top-3 left-3 bg-bg/85 border border-border rounded px-3 py-2 text-xs space-y-2 max-w-[260px] backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-text font-semibold">What-If Editor</span>
          {removedIds.size > 0 && (
            <button onClick={handleReset} className="text-[10px] text-dim hover:text-text">
              Reset
            </button>
          )}
        </div>

        <p className="text-dim text-[10px]">
          Click entry points to block them, then run analysis to see how camera placement adapts.
        </p>

        {scene.entry_points.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {scene.entry_points.map(ep => {
              const removed = removedIds.has(ep.id)
              return (
                <div
                  key={ep.id}
                  onClick={() => toggleEntry(ep.id)}
                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer border select-none transition-colors ${
                    removed
                      ? "border-border/30 bg-border/5 text-dim"
                      : "border-border text-text hover:border-cyan/40"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      removed ? "bg-dim" : ep.type === "door" ? "bg-red" : "bg-amber"
                    }`}
                  />
                  <span className={removed ? "line-through" : ""}>{ep.label}</span>
                  <span className="text-dim ml-auto text-[9px]">{ep.type}</span>
                  {removed && (
                    <span className="text-amber text-[9px] font-medium shrink-0">BLOCKED</span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {removedIds.size > 0 && (
          <button
            onClick={handleRun}
            disabled={running}
            className="w-full py-1.5 rounded border border-cyan/40 bg-cyan/10 text-cyan hover:bg-cyan/20 disabled:opacity-50 transition-colors"
          >
            {running ? "Analyzing…" : `Run Analysis (${removedIds.size} blocked)`}
          </button>
        )}

        {error && (
          <p className="text-red text-[10px]">Error: {error}</p>
        )}

        {result && (
          <div className="pt-1.5 border-t border-border space-y-1.5">
            <p className="text-text font-medium text-[10px] uppercase tracking-wide">Result</p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
              <span className="text-dim">Coverage</span>
              <span className={result.delta_coverage_pct >= 0 ? "text-green" : "text-red"}>
                {result.coverage_pct.toFixed(1)}%
                <span className="text-dim ml-1">
                  ({result.delta_coverage_pct >= 0 ? "+" : ""}{result.delta_coverage_pct.toFixed(1)}%)
                </span>
              </span>

              <span className="text-dim">Cameras</span>
              <span className="text-text">
                {result.cameras.length}
                {result.delta_camera_count !== 0 && (
                  <span className={result.delta_camera_count > 0 ? "text-amber" : "text-green"}>
                    {" "}({result.delta_camera_count > 0 ? "+" : ""}{result.delta_camera_count})
                  </span>
                )}
              </span>

              <span className="text-dim">Cost</span>
              <span className="text-text">${result.total_cost_usd.toFixed(0)}</span>

              <span className="text-dim">Entries covered</span>
              <span className="text-text">
                {result.entry_points_covered}/{result.entry_points_total}
              </span>
            </div>

            {result.blind_spots.length > 0 && (
              <p className="text-amber text-[10px]">
                {result.blind_spots.length} blind spot{result.blind_spots.length !== 1 ? "s" : ""} detected
              </p>
            )}

            {result.delta_coverage_pct < -5 && (
              <p className="text-red text-[10px]">
                Coverage dropped significantly — consider adding cameras near blocked entries.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Entry point sphere — dim/cross out when blocked ─────────────

function WhatIfEntryPoint({
  ep,
  removed,
  onClick,
}: {
  ep: EntryPoint
  removed: boolean
  onClick: () => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    const mat = meshRef.current?.material as THREE.MeshStandardMaterial | undefined
    if (!mat) return
    if (!removed) {
      mat.emissiveIntensity = 0.4 + 0.15 * Math.abs(Math.sin(Date.now() / 600))
    } else {
      mat.emissiveIntensity = 0
    }
  })

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[ep.position[0], ep.position[1], 0.4]}
        onClick={(e) => { e.stopPropagation(); onClick() }}
      >
        <sphereGeometry args={[0.32, 16, 16]} />
        <meshStandardMaterial
          color={removed ? "#2a2a2a" : ep.type === "door" ? "#ff5566" : "#ffaa00"}
          emissive={removed ? "#000000" : ep.type === "door" ? "#ff2244" : "#aa6600"}
          emissiveIntensity={removed ? 0 : 0.4}
          opacity={removed ? 0.25 : 1.0}
          transparent
        />
      </mesh>

      {/* X marker when blocked */}
      {removed && (
        <>
          <mesh position={[ep.position[0], ep.position[1], 0.75]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.55, 0.07, 0.07]} />
            <meshBasicMaterial color="#ff4444" />
          </mesh>
          <mesh position={[ep.position[0], ep.position[1], 0.75]} rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.55, 0.07, 0.07]} />
            <meshBasicMaterial color="#ff4444" />
          </mesh>
        </>
      )}
    </group>
  )
}

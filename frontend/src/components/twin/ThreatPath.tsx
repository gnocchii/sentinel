"use client"
import { useEffect, useState, useRef, useMemo } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Grid, Line } from "@react-three/drei"
import * as THREE from "three"
import { useSentinel } from "@/store/sentinel"
import { fetchThreatPaths } from "@/lib/api"
import { SceneShell, CameraReframer, sceneView } from "./SceneShell"
import type { ThreatPath, EntryPoint } from "@/lib/types"

const THREAT_COLORS: Record<string, string> = {
  burglar: "#ff8800",
  pro:     "#ff2244",
  insider: "#ffcc00",
}

export default function ThreatPathView() {
  const { scene, cameras, sceneId, activeThreatEntry, setActiveThreatEntry, threatPaths, setThreatPaths } = useSentinel()
  const [loading, setLoading] = useState(false)
  const view = useMemo(() => sceneView(scene), [scene])

  useEffect(() => {
    if (!sceneId || !scene) return
    setLoading(true)
    fetchThreatPaths(sceneId)
      .then(setThreatPaths)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [sceneId, scene, cameras, setThreatPaths])

  if (!scene) return null

  const entryPoints = scene.entry_points
  const visiblePaths = activeThreatEntry
    ? threatPaths.filter(p => p.entry_id === activeThreatEntry)
    : threatPaths

  const breachCameraIds = new Set(visiblePaths.flatMap(p => p.breach_cameras))

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
        <SceneShell scene={scene} showFOV={false} showCameras={true} />

        {visiblePaths.map(tp => (
          <AnimatedPath
            key={`${tp.entry_id}-${tp.threat_model}`}
            path={tp.path}
            color={THREAT_COLORS[tp.threat_model] ?? "#ff8800"}
          />
        ))}

        {entryPoints.map(ep => (
          <ClickableEntryPoint
            key={ep.id}
            ep={ep}
            active={ep.id === activeThreatEntry}
            onClick={() => setActiveThreatEntry(ep.id === activeThreatEntry ? null : ep.id)}
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

      {/* Overlay */}
      <div className="absolute top-3 left-3 bg-bg/85 border border-border rounded px-3 py-2 text-xs space-y-2 max-w-xs backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-text font-semibold">Threat Paths</span>
          {loading && <span className="text-dim animate-pulse text-[10px]">computing…</span>}
        </div>

        <div className="flex gap-3 text-[10px] text-dim">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 inline-block rounded" style={{ background: "#ff8800" }} />
            burglar
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 inline-block rounded" style={{ background: "#ff2244" }} />
            pro
          </span>
        </div>

        <p className="text-dim text-[10px]">
          Paths avoid camera coverage. Click an entry point to filter.
        </p>

        <div className="flex flex-wrap gap-1">
          {entryPoints.map(ep => (
            <button
              key={ep.id}
              onClick={() => setActiveThreatEntry(ep.id === activeThreatEntry ? null : ep.id)}
              className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                activeThreatEntry === ep.id
                  ? "bg-red/20 border-red/50 text-red"
                  : "border-border text-dim hover:text-text"
              }`}
            >
              {ep.label}
            </button>
          ))}
          {activeThreatEntry && (
            <button
              onClick={() => setActiveThreatEntry(null)}
              className="px-2 py-0.5 rounded text-[10px] border border-border text-dim hover:text-text"
            >
              All
            </button>
          )}
        </div>

        {breachCameraIds.size > 0 && (
          <div className="pt-1.5 border-t border-border">
            <p className="text-amber text-[10px] font-medium mb-0.5">Cameras on attacker path:</p>
            <div className="flex flex-wrap gap-1">
              {[...breachCameraIds].map(id => (
                <span
                  key={id}
                  className="text-[10px] text-red font-mono border border-red/30 bg-red/10 rounded px-1"
                >
                  {id}
                </span>
              ))}
            </div>
          </div>
        )}

        {visiblePaths.length === 0 && !loading && (
          <p className="text-dim text-[10px]">No paths — optimize cameras first.</p>
        )}
      </div>
    </div>
  )
}

// ─── Animated path line + ghost sphere ───────────────────────────

function AnimatedPath({ path, color }: { path: [number, number][]; color: string }) {
  const ghostRef = useRef<THREE.Mesh>(null)
  const tRef = useRef(Math.random()) // stagger start positions

  const points = useMemo(
    () => path.map(([x, y]) => new THREE.Vector3(x, y, 0.15)),
    [path]
  )

  const curve = useMemo(
    () => points.length >= 2 ? new THREE.CatmullRomCurve3(points) : null,
    [points]
  )

  useFrame((_, delta) => {
    if (!ghostRef.current || !curve) return
    tRef.current = (tRef.current + delta * 0.1) % 1
    const pos = curve.getPoint(tRef.current)
    ghostRef.current.position.copy(pos)
    const mat = ghostRef.current.material as THREE.MeshBasicMaterial
    mat.opacity = 0.4 + 0.5 * Math.abs(Math.sin(tRef.current * Math.PI * 6))
  })

  if (points.length < 2) return null

  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={2}
        opacity={0.75}
        transparent
      />
      {curve && (
        <mesh ref={ghostRef} position={points[0]}>
          <sphereGeometry args={[0.15, 10, 10]} />
          <meshBasicMaterial color={color} transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  )
}

// ─── Clickable entry point with pulse animation ───────────────────

function ClickableEntryPoint({
  ep,
  active,
  onClick,
}: {
  ep: EntryPoint
  active: boolean
  onClick: () => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (!meshRef.current) return
    const mat = meshRef.current.material as THREE.MeshStandardMaterial
    if (active) {
      mat.emissiveIntensity = 0.6 + 0.4 * Math.abs(Math.sin(Date.now() / 250))
    } else {
      mat.emissiveIntensity = 0.35
    }
  })

  return (
    <mesh
      ref={meshRef}
      position={[ep.position[0], ep.position[1], 0.4]}
      onClick={(e) => { e.stopPropagation(); onClick() }}
    >
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshStandardMaterial
        color={active ? "#ff2244" : ep.type === "door" ? "#ff5566" : "#ffaa00"}
        emissive={active ? "#ff0022" : ep.type === "door" ? "#ff2244" : "#aa6600"}
        emissiveIntensity={active ? 1.0 : 0.35}
      />
    </mesh>
  )
}

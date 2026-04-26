"use client"

import { useState, useRef, useCallback } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// ─── Types ───────────────────────────────────────────────────────

interface K2Camera {
  id: string
  position_xyz: [number, number, number]
  pan_deg: number
  tilt_deg: number
  fov_h_deg: number
  fov_v_deg: number
  type?: string
  rationale?: string
}

interface OptResult {
  scan_id: string
  cameras: K2Camera[]
  coverage_pct: number
  n_coverage_points: number
  n_covered: number
  heatmap_png_b64: string
  floorplan_png_b64: string
  heatmap: {
    coverage_points: [number, number, number][]
    covered_mask: boolean[]
    floor_bounds: { xmin: number; xmax: number; ymin: number; ymax: number }
    floor_z: number
  }
  manifest: {
    scene_metadata: {
      estimated_floor_area_m2: number
      estimated_ceiling_height_m: number
    }
  }
}

// ─── Floor plan image ────────────────────────────────────────────
// The backend renders the actual mesh geometry (wall edges projected top-down)
// with camera FOV wedges overlaid.  We just display the resulting PNG.

function FloorPlanImage({ b64 }: { b64: string }) {
  if (!b64) return (
    <div className="flex items-center justify-center h-full text-dim text-xs">
      Floor plan not available
    </div>
  )
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`data:image/png;base64,${b64}`}
      alt="Floor plan with camera placements"
      className="max-w-full max-h-full object-contain"
    />
  )
}

// ─── Upload form ─────────────────────────────────────────────────

function UploadForm({ onResult }: { onResult: (r: OptResult) => void }) {
  const [file, setFile]       = useState<File | null>(null)
  const [n, setN]             = useState(5)
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState("")
  const [error, setError]     = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = useCallback(async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setStatus("Uploading mesh…")

    const form = new FormData()
    form.append("file", file)
    form.append("n_cameras", String(n))
    form.append("coverage_resolution", "0.5")
    form.append("camera_height", "2.5")
    form.append("n_candidates", String(Math.max(n * 2, 12)))

    try {
      setStatus("Analyzing geometry + running K2 Think V2 reasoning…")
      const res = await fetch(`${API_URL}/spatial/optimize-from-mesh`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      onResult(await res.json())
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
      setStatus("")
    }
  }, [file, n, onResult])

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
      <div className="text-center space-y-1">
        <h2 className="text-text text-lg font-mono tracking-wide">Mesh Camera Optimizer</h2>
        <p className="text-dim text-xs">
          Upload a 3D mesh → K2 Think V2 reasons about placement → greedy raycasting selects optimal cameras
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        {/* File drop zone */}
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-border hover:border-cyan/50 rounded-lg p-8
                     text-center transition-colors group"
        >
          <div className="space-y-2">
            <div className="text-2xl text-dim group-hover:text-cyan transition-colors">⬆</div>
            {file ? (
              <div>
                <p className="text-cyan text-sm font-mono">{file.name}</p>
                <p className="text-dim text-xs">{(file.size / 1e6).toFixed(1)} MB</p>
              </div>
            ) : (
              <>
                <p className="text-dim text-sm">Click to upload mesh</p>
                <p className="text-dim/60 text-xs">.usdz  .obj  .glb  .gltf  .ply  .stl</p>
              </>
            )}
          </div>
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".usdz,.obj,.glb,.gltf,.ply,.stl,.off"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        {/* N cameras */}
        <div className="flex items-center gap-3">
          <label className="text-dim text-xs w-32 shrink-0">Number of cameras</label>
          <input
            type="number"
            min={1} max={20}
            value={n}
            onChange={(e) => setN(Math.max(1, Math.min(20, Number(e.target.value))))}
            className="flex-1 bg-bg border border-border rounded px-3 py-1.5
                       text-cyan font-mono text-sm focus:outline-none focus:border-cyan/60"
          />
        </div>

        {/* Submit */}
        <button
          onClick={submit}
          disabled={!file || loading}
          className="w-full py-2 rounded border font-mono text-sm transition-colors
                     border-cyan/40 text-cyan hover:bg-cyan/10
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Running…" : "Optimize Camera Placement"}
        </button>

        {status && (
          <div className="flex items-center gap-2 text-dim text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse shrink-0" />
            {status}
            <span className="text-dim/50">(may take ~30–60 s)</span>
          </div>
        )}
        {error && (
          <p className="text-red-400 text-xs font-mono bg-red-500/10 border border-red-500/20 rounded p-2">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Results view ────────────────────────────────────────────────

function ResultsView({ result, onReset }: { result: OptResult; onReset: () => void }) {
  const [view, setView] = useState<"floorplan" | "heatmap">("floorplan")
  const meta = result.manifest.scene_metadata

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-surface shrink-0">
        <button onClick={onReset} className="text-dim text-xs hover:text-text transition-colors">
          ← New Upload
        </button>
        <div className="flex gap-4 text-xs font-mono">
          <span className="text-cyan">{result.coverage_pct}% covered</span>
          <span className="text-dim">{result.cameras.length} cameras</span>
          <span className="text-dim">{result.n_covered}/{result.n_coverage_points} pts</span>
          <span className="text-dim">{meta.estimated_floor_area_m2} m²</span>
        </div>
        <div className="ml-auto flex gap-1">
          {(["floorplan", "heatmap"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 py-0.5 rounded text-xs border transition-colors
                ${view === v
                  ? "bg-cyan/15 text-cyan border-cyan/30"
                  : "text-dim border-transparent hover:text-text"}`}
            >
              {v === "floorplan" ? "Floor Plan" : "Heatmap"}
            </button>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Viewport — both views are backend-rendered PNGs */}
        <div className="flex-1 relative bg-[#080d11] overflow-hidden flex items-center justify-center p-4">
          <FloorPlanImage
            b64={view === "floorplan" ? result.floorplan_png_b64 : result.heatmap_png_b64}
          />
        </div>

        {/* Camera list sidebar */}
        <div className="w-48 border-l border-border bg-surface overflow-y-auto shrink-0">
          <div className="p-3 space-y-2">
            <h3 className="text-dim text-[10px] uppercase tracking-widest">Placed Cameras</h3>
            {result.cameras.map((cam) => (
              <div key={cam.id} className="rounded border border-border/60 bg-bg/60 p-2 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-cyan text-xs font-mono font-bold">{cam.id}</span>
                  <span className="text-dim text-[9px]">{cam.type ?? "Dome"}</span>
                </div>
                <div className="text-[9px] text-dim font-mono space-y-0.5">
                  <div>pan {cam.pan_deg}°  tilt {cam.tilt_deg}°</div>
                  <div>FOV {cam.fov_h_deg}×{cam.fov_v_deg}°</div>
                </div>
                {cam.rationale && (
                  <p className="text-[9px] text-dim/70 italic leading-snug line-clamp-3">
                    {cam.rationale}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────

export default function MeshOptimizer() {
  const [result, setResult] = useState<OptResult | null>(null)

  return result
    ? <ResultsView result={result} onReset={() => setResult(null)} />
    : <UploadForm onResult={setResult} />
}

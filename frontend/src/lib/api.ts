import type {
  Scene,
  PointCloudData,
  CameraLighting,
  ThreatPath,
  Camera,
  ScanUploadResponse,
  ScanStatus,
  ImportancePayload,
  Coverage3DPayload,
  BlindSpot,
} from "./types"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`)
  return res.json()
}

// ─── Scene ───────────────────────────────────────────────────────

export const fetchScene = (sceneId: string) =>
  get<Scene>(`/scene/${sceneId}`)

export const fetchPointCloud = (sceneId: string) =>
  get<PointCloudData>(`/scene/${sceneId}/pointcloud`)

export const fetchLatestScanPointCloud = () =>
  get<PointCloudData>("/scans/latest/pointcloud")

export async function uploadScanPly(file: File): Promise<ScanUploadResponse> {
  const form = new FormData()
  form.append("file", file)

  const res = await fetch(`${BASE}/scans/upload`, {
    method: "POST",
    body: form,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`POST /scans/upload → ${res.status} ${text}`)
  }

  return res.json()
}

export const fetchScanStatus = (scanId: string) =>
  get<ScanStatus>(`/scans/${scanId}/status`)

export const fetchScanPointCloud = (scanId: string) =>
  get<PointCloudData>(`/scans/${scanId}/pointcloud`)


// ─── Cameras ─────────────────────────────────────────────────────

export const optimizeCameras = (sceneId: string, budgetUsd: number, lockedIds: string[] = []) =>
  post<{ cameras: Camera[]; coverage_pct: number; total_cost_usd: number }>(
    "/cameras/optimize",
    { scene_id: sceneId, budget_usd: budgetUsd, locked_camera_ids: lockedIds }
  )

export const fetchThreatPaths = (sceneId: string, targetRoom = "server_room") =>
  get<ThreatPath[]>(`/cameras/${sceneId}/threat-paths?target_room=${targetRoom}`)

// ─── Importance map ──────────────────────────────────────────────

export const fetchImportance = (sceneId: string) =>
  get<ImportancePayload>(`/importance/${sceneId}`)

export const recomputeImportance = (sceneId: string) =>
  post<ImportancePayload>(`/importance/${sceneId}/recompute`, {})

export function streamImportanceReasoning(
  sceneId: string,
  onToken: (t: string) => void,
  onDone: () => void,
) {
  const es = new EventSource(`${BASE}/importance/${sceneId}/stream`)
  es.onmessage = (e) => {
    if (e.data === "[DONE]") { es.close(); onDone(); return }
    onToken(e.data + "\n")
  }
  es.onerror = () => { es.close(); onDone() }
  return () => es.close()
}

export const optimizeImportance = (sceneId: string, budgetUsd: number, maxCameras = 12, refineIters = 0) =>
  post<{
    cameras: Camera[]
    score: number
    total_cost_usd: number
    iterations: { camera_id: string; type: string; position: [number, number, number]; marginal_gain: number; score: number; cost_usd: number }[]
    entry_points_covered: number
    entry_points_total: number
    blind_spots: BlindSpot[]
    overlap_zones: number
    scores: { rooms: Record<string, { score: number; inferred_type: string; reason: string }>, doors: Record<string, { score: number; reason: string }> }
  }>("/cameras/optimize-importance", { scene_id: sceneId, budget_usd: budgetUsd, max_cameras: maxCameras, refine_iters: refineIters })

export async function uploadUsdz(file: File, sceneId = "polycam_scan") {
  const fd = new FormData()
  fd.append("file", file)
  const res = await fetch(`${BASE}/scene/upload-usdz?scene_id=${encodeURIComponent(sceneId)}`, { method: "POST", body: fd })
  if (!res.ok) throw new Error(`upload failed: ${res.status}`)
  return res.json() as Promise<{ scene_id: string; rooms: number; walls: number; doors: number; obstructions: number }>
}

// ─── View refiner ────────────────────────────────────────────────

export async function refineView(blob: Blob, cameraId: string, hour: number): Promise<string> {
  const form = new FormData()
  form.append("image", blob, "frame.png")
  form.append("camera_id", cameraId)
  form.append("hour", String(hour))
  const res = await fetch(`${BASE}/cameras/refine-view`, { method: "POST", body: form })
  if (!res.ok) throw new Error(`POST /cameras/refine-view → ${res.status}`)
  const refined = await res.blob()
  return URL.createObjectURL(refined)
}

// ─── 3D coverage ─────────────────────────────────────────────────

export const fetchCoverage3D = (sceneId: string, cameras: Camera[], resolution = 0.25) =>
  post<Coverage3DPayload>("/cameras/coverage-3d", { scene_id: sceneId, cameras, resolution })

// ─── Lighting ────────────────────────────────────────────────────

export const fetchLighting = (sceneId: string) =>
  get<{ cameras: CameraLighting[] }>(`/lighting/${sceneId}`)

export const fetchLightingAtHour = (sceneId: string, hour: number) =>
  get<{ hour: number; cameras: { camera_id: string; quality: string }[] }>(
    `/lighting/${sceneId}/hour/${hour}`
  )

// ─── K2 SSE streams ──────────────────────────────────────────────

export function streamPlacement(
  sceneId: string,
  budget: number,
  lockedIds: string[],
  onToken: (t: string) => void,
  onDone: () => void
) {
  return _ssePost("/k2/stream-placement", { scene_id: sceneId, budget_usd: budget, locked_camera_ids: lockedIds }, onToken, onDone)
}

export function streamBudgetTradeoff(
  sceneId: string,
  newBudget: number,
  oldBudget: number,
  onToken: (t: string) => void,
  onDone: () => void
) {
  return _ssePost("/k2/stream-budget-tradeoff", { scene_id: sceneId, new_budget: newBudget, old_budget: oldBudget }, onToken, onDone)
}

export function streamLighting(sceneId: string, onToken: (t: string) => void, onDone: () => void) {
  const es = new EventSource(`${BASE}/k2/stream-lighting/${sceneId}`)
  es.onmessage = (e) => {
    if (e.data === "[DONE]") { es.close(); onDone(); return }
    onToken(e.data)
  }
  return () => es.close()
}

function _ssePost(
  path: string,
  body: unknown,
  onToken: (t: string) => void,
  onDone: () => void
): () => void {
  const ctrl = new AbortController()
  ;(async () => {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let buf = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6)
          if (data === "[DONE]") { onDone(); return }
          onToken(data)
        }
      }
    }
  })().catch(() => {})
  return () => ctrl.abort()
}

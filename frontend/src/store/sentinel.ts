import { create } from "zustand"
import type { Scene, Camera, TwinTab, ThreatPath, CameraLighting, PointCloudData, ImportancePayload, SceneAnalysis } from "@/lib/types"

export type Activity = {
  id: string
  ts: number
  severity: "critical" | "warning" | "info" | "success"
  title: string
  body?: string
}

type LoadingEntry = { label: string; progress?: number }

interface SentinelState {
  // ─── Scene ─────────────────────────────────────────────────────
  scene: Scene | null
  setScene: (s: Scene) => void
  setSceneAnalysis: (partial: Partial<SceneAnalysis>) => void

  // ─── Point cloud ───────────────────────────────────────────────
  pointCloud: PointCloudData | null
  setPointCloud: (pc: PointCloudData) => void

  // FBX uploaded as a blob URL — rendered in Camera Feeds + Point Cloud tabs only.
  // Does NOT affect calculations (those still come from the parsed USDZ scene).
  feedsFbxUrl: string | null
  setFeedsFbxUrl: (url: string | null) => void

  // ─── Camera selection ──────────────────────────────────────────
  selectedCameraId: string | null
  selectCamera: (id: string | null) => void

  // ─── Twin tab ──────────────────────────────────────────────────
  activeTab: TwinTab
  setActiveTab: (t: TwinTab) => void

  // ─── Budget slider ─────────────────────────────────────────────
  budget: number
  setBudget: (b: number) => void
  cameras: Camera[]
  setCameras: (c: Camera[]) => void
  // The largest camera set we've ever seen (from any optimize). Budget slider
  // slices from this so dragging the slider can synthesize add/remove without
  // a backend round-trip.
  cameraPool: Camera[]
  setCameraPool: (c: Camera[]) => void
  coveragePct: number
  setCoveragePct: (p: number) => void

  // ─── Time scrubber ─────────────────────────────────────────────
  simulationHour: number          // 0–23
  setSimulationHour: (h: number) => void

  // ─── Lighting ──────────────────────────────────────────────────
  lightingData: CameraLighting[]
  setLightingData: (l: CameraLighting[]) => void

  // ─── Threat paths ──────────────────────────────────────────────
  threatPaths: ThreatPath[]
  setThreatPaths: (p: ThreatPath[]) => void
  activeThreatEntry: string | null
  setActiveThreatEntry: (id: string | null) => void

  // ─── K2 panel ──────────────────────────────────────────────────
  k2Thinking: string
  appendK2Thinking: (t: string) => void
  k2Text: string
  appendK2Text: (t: string) => void
  clearK2Text: () => void
  k2Streaming: boolean
  setK2Streaming: (v: boolean) => void

  // ─── Importance map ───────────────────────────────────────────
  importance: ImportancePayload | null
  setImportance: (i: ImportancePayload | null) => void
  sceneId: string
  setSceneId: (id: string) => void
  importanceScore: number
  setImportanceScore: (s: number) => void
  optimizing: boolean
  setOptimizing: (v: boolean) => void

  // ─── Activity log + global loading ─────────────────────────────
  activities: Activity[]
  pushActivity: (a: Omit<Activity, "id" | "ts"> & { id?: string; ts?: number }) => void
  loading: Record<string, LoadingEntry>
  startLoading: (key: string, label: string, progress?: number) => void
  setLoadingProgress: (key: string, progress: number) => void
  stopLoading: (key: string) => void
}

export const useSentinel = create<SentinelState>((set) => ({
  scene: null,
  setScene: (scene) => set((s) => ({
    scene,
    cameras: scene.cameras,
    // Seed the pool with the scene's cameras if it's larger than what we have.
    cameraPool: scene.cameras.length > s.cameraPool.length ? scene.cameras : s.cameraPool,
    coveragePct: scene.analysis.coverage_pct,
  })),
  setSceneAnalysis: (partial) =>
    set((s) =>
      s.scene
        ? { scene: { ...s.scene, analysis: { ...s.scene.analysis, ...partial } } }
        : {}
    ),

  pointCloud: null,
  setPointCloud: (pointCloud) => set({ pointCloud }),

  feedsFbxUrl: null,
  setFeedsFbxUrl: (feedsFbxUrl) => set((s) => {
    if (s.feedsFbxUrl && s.feedsFbxUrl !== feedsFbxUrl) {
      try { URL.revokeObjectURL(s.feedsFbxUrl) } catch {}
    }
    return { feedsFbxUrl }
  }),

  selectedCameraId: null,
  selectCamera: (selectedCameraId) => set({ selectedCameraId }),

  activeTab: "point-cloud",
  setActiveTab: (activeTab) => set({ activeTab }),

  budget: 2500,
  setBudget: (budget) => set({ budget }),
  cameras: [],
  // Always grow the pool — never shrink it just because the active list shrank.
  // That way the slider can re-add cameras the next time the budget goes up.
  setCameras: (cameras) => set((s) => ({
    cameras,
    cameraPool: cameras.length > s.cameraPool.length ? cameras : s.cameraPool,
  })),
  cameraPool: [],
  setCameraPool: (cameraPool) => set({ cameraPool }),
  coveragePct: 0,
  setCoveragePct: (coveragePct) => set({ coveragePct }),

  simulationHour: 12,
  setSimulationHour: (simulationHour) => set({ simulationHour }),

  lightingData: [],
  setLightingData: (lightingData) => set({ lightingData }),

  threatPaths: [],
  setThreatPaths: (threatPaths) => set({ threatPaths }),
  activeThreatEntry: null,
  setActiveThreatEntry: (activeThreatEntry) => set({ activeThreatEntry }),

  k2Thinking: "",
  appendK2Thinking: (t) => set((s) => ({ k2Thinking: s.k2Thinking + t })),
  k2Text: "",
  appendK2Text: (t) => set((s) => ({ k2Text: s.k2Text + t })),
  clearK2Text: () => set({ k2Thinking: "", k2Text: "" }),
  k2Streaming: false,
  setK2Streaming: (k2Streaming) => set({ k2Streaming }),

  importance: null,
  setImportance: (importance) => set({ importance }),
  sceneId: "",
  setSceneId: (sceneId) => set({ sceneId }),

  importanceScore: 0,
  setImportanceScore: (importanceScore) => set({ importanceScore }),
  optimizing: false,
  setOptimizing: (optimizing) => set({ optimizing }),

  activities: [],
  pushActivity: (a) => set((s) => ({
    activities: [
      {
        id: a.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: a.ts ?? Date.now(),
        severity: a.severity,
        title: a.title,
        body: a.body,
      },
      ...s.activities,
    ].slice(0, 200),  // cap so the panel doesn't grow without bound
  })),
  loading: {},
  startLoading: (key, label, progress) => set((s) => ({
    loading: { ...s.loading, [key]: { label, progress } },
  })),
  setLoadingProgress: (key, progress) => set((s) => {
    const cur = s.loading[key]
    if (!cur) return {}
    return { loading: { ...s.loading, [key]: { ...cur, progress } } }
  }),
  stopLoading: (key) => set((s) => {
    const next = { ...s.loading }
    delete next[key]
    return { loading: next }
  }),
}))

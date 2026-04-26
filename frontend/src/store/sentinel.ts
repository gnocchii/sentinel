import { create } from "zustand"
import type { Scene, Camera, TwinTab, ThreatPath, CameraLighting, PointCloudData, ImportancePayload, SceneAnalysis } from "@/lib/types"

export type ActivitySeverity = "info" | "success" | "warning" | "critical"
export interface Activity {
  id: string
  severity: ActivitySeverity
  title: string
  body?: string
  ts: number
}

export type LoadKey =
  | "upload-usdz"
  | "upload-fbx"
  | "upload-ply"
  | "scene-fetch"
  | "importance"
  | "optimize"
  | "k2-stream"
  | "export-pdf"

interface SentinelState {
  // ─── Activity feed ────────────────────────────────────────────
  activities: Activity[]
  pushActivity: (a: Omit<Activity, "id" | "ts"> & Partial<Pick<Activity, "id" | "ts">>) => void
  clearActivities: () => void

  // ─── Global loading map ───────────────────────────────────────
  loading: Partial<Record<LoadKey, { label: string; progress?: number }>>
  startLoading: (key: LoadKey, label: string) => void
  setLoadingProgress: (key: LoadKey, progress: number) => void
  stopLoading: (key: LoadKey) => void

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
}

export const useSentinel = create<SentinelState>((set) => ({
  activities: [],
  pushActivity: (a) =>
    set((s) => {
      const entry: Activity = {
        id: a.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: a.ts ?? Date.now(),
        severity: a.severity,
        title: a.title,
        body: a.body,
      }
      return { activities: [entry, ...s.activities].slice(0, 60) }
    }),
  clearActivities: () => set({ activities: [] }),

  loading: {},
  startLoading: (key, label) =>
    set((s) => ({ loading: { ...s.loading, [key]: { label, progress: undefined } } })),
  setLoadingProgress: (key, progress) =>
    set((s) =>
      s.loading[key]
        ? { loading: { ...s.loading, [key]: { ...s.loading[key]!, progress } } }
        : {}
    ),
  stopLoading: (key) =>
    set((s) => {
      const next = { ...s.loading }
      delete next[key]
      return { loading: next }
    }),

  scene: null,
  setScene: (scene) => set({ scene, cameras: scene.cameras, coveragePct: scene.analysis.coverage_pct }),
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

  activeTab: "importance-map",
  setActiveTab: (activeTab) => set({ activeTab }),

  budget: 2500,
  setBudget: (budget) => set({ budget }),
  cameras: [],
  setCameras: (cameras) => set({ cameras }),
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
  // Initial sceneId — commented out to start with no scene loaded.
  // sceneId: "avery_house",
  sceneId: "",
  setSceneId: (sceneId) => set({ sceneId }),

  importanceScore: 0,
  setImportanceScore: (importanceScore) => set({ importanceScore }),
  optimizing: false,
  setOptimizing: (optimizing) => set({ optimizing }),
}))

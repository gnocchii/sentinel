import { create } from "zustand"
import type { Scene, Camera, TwinTab, ThreatPath, CameraLighting, PointCloudData, ImportancePayload } from "@/lib/types"

interface SentinelState {
  // ─── Scene ─────────────────────────────────────────────────────
  scene: Scene | null
  setScene: (s: Scene) => void

  // ─── Point cloud ───────────────────────────────────────────────
  pointCloud: PointCloudData | null
  setPointCloud: (pc: PointCloudData) => void

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
  scene: null,
  setScene: (scene) => set({ scene, cameras: scene.cameras, coveragePct: scene.analysis.coverage_pct }),

  pointCloud: null,
  setPointCloud: (pointCloud) => set({ pointCloud }),

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
  sceneId: "avery_house",
  setSceneId: (sceneId) => set({ sceneId }),

  importanceScore: 0,
  setImportanceScore: (importanceScore) => set({ importanceScore }),
  optimizing: false,
  setOptimizing: (optimizing) => set({ optimizing }),
}))

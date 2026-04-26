"use client"
import { useEffect } from "react"
import { useSentinel } from "@/store/sentinel"
import { fetchScene, fetchPointCloud, fetchLighting, fetchImportance } from "@/lib/api"

const DEFAULT_SCENE = process.env.NEXT_PUBLIC_DEFAULT_SCENE ?? "polycam_scan"

export function useScene() {
  const { sceneId, setSceneId, setScene, setPointCloud, setLightingData, setImportance } = useSentinel()

  useEffect(() => {
    if (!sceneId) setSceneId(DEFAULT_SCENE)
  }, [sceneId, setSceneId])

  useEffect(() => {
    if (!sceneId) return
    fetchScene(sceneId).then(setScene).catch(console.error)
    fetchPointCloud(sceneId).then(setPointCloud).catch(() => {})
    fetchLighting(sceneId).then((d) => setLightingData(d.cameras)).catch(() => {})
    fetchImportance(sceneId).then(setImportance).catch(() => {})
  }, [sceneId, setScene, setPointCloud, setLightingData, setImportance])
}

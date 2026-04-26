"use client"
import { useEffect } from "react"
import { useSentinel } from "@/store/sentinel"
import { fetchScene, fetchPointCloud, fetchLighting, fetchLatestScanPointCloud, fetchImportance } from "@/lib/api"

export function useScene() {
  const { sceneId, setScene, setPointCloud, setLightingData, setImportance } = useSentinel()

  useEffect(() => {
    if (!sceneId) return
    fetchScene(sceneId).then(setScene).catch(console.error)
    fetchLatestScanPointCloud()
      .then(setPointCloud)
      .catch(() => fetchPointCloud(sceneId).then(setPointCloud).catch(console.error))
    fetchLighting(sceneId).then((d) => setLightingData(d.cameras)).catch(console.error)
    fetchImportance(sceneId).then(setImportance).catch(() => {})
  }, [sceneId])  // eslint-disable-line react-hooks/exhaustive-deps
}

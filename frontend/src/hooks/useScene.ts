"use client"
import { useEffect } from "react"
import { useSentinel } from "@/store/sentinel"
import { fetchScene, fetchPointCloud, fetchLighting, fetchLatestScanPointCloud } from "@/lib/api"

const DEFAULT_SCENE = process.env.NEXT_PUBLIC_DEFAULT_SCENE ?? "avery_house"

export function useScene(sceneId = DEFAULT_SCENE) {
  const { setScene, setPointCloud, setLightingData } = useSentinel()

  useEffect(() => {
    fetchScene(sceneId).then(setScene).catch(console.error)
    fetchLatestScanPointCloud()
      .then(setPointCloud)
      .catch(() => fetchPointCloud(sceneId).then(setPointCloud).catch(console.error))
    fetchLighting(sceneId).then((d) => setLightingData(d.cameras)).catch(console.error)
  }, [sceneId])  // eslint-disable-line react-hooks/exhaustive-deps
}

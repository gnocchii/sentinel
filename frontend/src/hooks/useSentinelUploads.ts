"use client"

import { useCallback, useState } from "react"
import { fetchImportance, fetchLighting, fetchPointCloud, fetchScene, uploadUsdz } from "@/lib/api"
import { useSentinel } from "@/store/sentinel"

const DEFAULT_SCENE_ID = "polycam_scan"

export function useSentinelUploads() {
  const [uploading, setUploading] = useState(false)
  const scene = useSentinel((state) => state.scene)
  const sceneId = useSentinel((state) => state.sceneId)
  const feedsFbxUrl = useSentinel((state) => state.feedsFbxUrl)
  const setScene = useSentinel((state) => state.setScene)
  const setSceneId = useSentinel((state) => state.setSceneId)
  const setImportance = useSentinel((state) => state.setImportance)
  const setPointCloud = useSentinel((state) => state.setPointCloud)
  const setLightingData = useSentinel((state) => state.setLightingData)
  const setFeedsFbxUrl = useSentinel((state) => state.setFeedsFbxUrl)

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true)

    try {
      await uploadUsdz(file, DEFAULT_SCENE_ID)
      setSceneId(DEFAULT_SCENE_ID)

      const nextScene = await fetchScene(DEFAULT_SCENE_ID)
      setScene(nextScene)

      const nextImportance = await fetchImportance(DEFAULT_SCENE_ID)
      setImportance(nextImportance)

      fetchPointCloud(DEFAULT_SCENE_ID).then(setPointCloud).catch(console.error)
      fetchLighting(DEFAULT_SCENE_ID)
        .then((data) => setLightingData(data.cameras))
        .catch(console.error)
    } catch (error) {
      console.error(error)
    } finally {
      setUploading(false)
    }
  }, [setImportance, setLightingData, setPointCloud, setScene, setSceneId])

  const handleUploadFbx = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    setFeedsFbxUrl(url)
  }, [setFeedsFbxUrl])

  return {
    scene,
    sceneId,
    feedsFbxUrl,
    uploading,
    handleUpload,
    handleUploadFbx,
  }
}

"use client"
import { useCallback, useRef } from "react"
import { useSentinel } from "@/store/sentinel"
import { streamPlacement, streamBudgetTradeoff, streamLighting } from "@/lib/api"

export function useK2Stream() {
  const { appendK2Text, clearK2Text, setK2Streaming, scene } = useSentinel()
  const cancelRef = useRef<(() => void) | null>(null)

  const stop = useCallback(() => {
    cancelRef.current?.()
    setK2Streaming(false)
  }, [setK2Streaming])

  const runPlacement = useCallback(
    (budget: number, lockedIds: string[] = []) => {
      if (!scene) return
      stop()
      clearK2Text()
      setK2Streaming(true)
      cancelRef.current = streamPlacement(
        scene.id, budget, lockedIds,
        appendK2Text,
        () => setK2Streaming(false)
      )
    },
    [scene, stop, clearK2Text, setK2Streaming, appendK2Text]
  )

  const runBudgetTradeoff = useCallback(
    (newBudget: number, oldBudget: number) => {
      if (!scene) return
      stop()
      clearK2Text()
      setK2Streaming(true)
      cancelRef.current = streamBudgetTradeoff(
        scene.id, newBudget, oldBudget,
        appendK2Text,
        () => setK2Streaming(false)
      )
    },
    [scene, stop, clearK2Text, setK2Streaming, appendK2Text]
  )

  const runLighting = useCallback(() => {
    if (!scene) return
    stop()
    clearK2Text()
    setK2Streaming(true)
    cancelRef.current = streamLighting(
      scene.id,
      appendK2Text,
      () => setK2Streaming(false)
    )
  }, [scene, stop, clearK2Text, setK2Streaming, appendK2Text])

  return { runPlacement, runBudgetTradeoff, runLighting, stop }
}

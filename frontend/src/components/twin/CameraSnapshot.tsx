"use client"
/**
 * CameraSnapshot — render a camera POV briefly to a hidden Canvas, capture
 * the first good frame to a static <img>, then unmount the Canvas.
 *
 * Purpose: avoid the per-page WebGL context cap. Mounting 6 live FbxPOV
 * canvases simultaneously (plus the main display) trips Brave/Chrome's limit
 * and the oldest tiles blank out. Snapshots let us show 6+ thumbnails with
 * only 1 active canvas at a time (+ the main display).
 *
 * Tiles take turns mounting based on `index`, so at most one snapshot canvas
 * is alive at any moment. Once captured, the snapshot persists as a static
 * image until the camera's pose changes (re-optimize).
 */

import { useEffect, useRef, useState } from "react"
import { useSentinel } from "@/store/sentinel"
import FbxPOV from "./FbxPOV"
import type { Camera } from "@/lib/types"

const STAGGER_MS = 1200       // gap between each tile starting its capture
const CAPTURE_DELAY_MS = 1500 // initial wait before first capture attempt
const RETRY_MS = 1200         // wait between retries if capture came up empty
const MAX_RETRIES = 8         // ~10s of retries before giving up

// FbxPOV's scene background is #05070a → (5, 7, 10). A "live" capture has
// FBX geometry visible somewhere; an "empty" capture is just the bg color.
// Sampling a 64×64 thumb is fast enough to do per attempt.
async function captureHasGeometry(blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        const W = 64, H = 64
        canvas.width = W
        canvas.height = H
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) { resolve(true); return }
        ctx.drawImage(img, 0, 0, W, H)
        const data = ctx.getImageData(0, 0, W, H).data
        // Look for any pixel that is meaningfully NOT the bg color
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2]
          if (Math.abs(r - 5) > 8 || Math.abs(g - 7) > 8 || Math.abs(b - 10) > 8) {
            resolve(true)
            return
          }
        }
        resolve(false)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(true) }
    img.src = url
  })
}

interface Props {
  camera: Camera
  /** Position in the grid — used to stagger when we attempt to capture. */
  index: number
}

export default function CameraSnapshot({ camera, index }: Props) {
  const feedsFbxUrl = useSentinel((s) => s.feedsFbxUrl)
  const [snap, setSnap] = useState<string | null>(null)
  const [active, setActive] = useState(false)
  const captureRef = useRef<(() => Promise<Blob | null>) | null>(null)

  // Cache key: invalidate the snapshot whenever the camera moves or the FBX changes.
  const key = `${camera.id}:${camera.position.join(",")}:${camera.target.join(",")}:${feedsFbxUrl ?? ""}`

  // Reset on key change
  useEffect(() => {
    setSnap((prev) => {
      if (prev) {
        try { URL.revokeObjectURL(prev) } catch {}
      }
      return null
    })
    setActive(false)
  }, [key])

  // Stagger when we go "active" (mount the canvas) so only one canvas at a time
  useEffect(() => {
    if (snap || !feedsFbxUrl) return
    const t = window.setTimeout(() => setActive(true), index * STAGGER_MS)
    return () => window.clearTimeout(t)
  }, [snap, feedsFbxUrl, index, key])

  // Once active, capture the canvas. Retry until we get a frame that actually
  // has FBX geometry — first-time loads can take 3-5s for a 16MB FBX, so the
  // first capture attempt often comes back as just the scene bg color.
  useEffect(() => {
    if (!active || snap) return
    let cancelled = false
    let timer: number | null = null

    const attempt = async (tries: number) => {
      if (cancelled) return
      const cap = captureRef.current
      if (!cap) {
        timer = window.setTimeout(() => attempt(tries), RETRY_MS)
        return
      }
      try {
        const blob = await cap()
        if (cancelled || !blob) {
          timer = window.setTimeout(() => attempt(tries + 1), RETRY_MS)
          return
        }
        const hasContent = await captureHasGeometry(blob)
        if (cancelled) return
        if (!hasContent && tries < MAX_RETRIES) {
          timer = window.setTimeout(() => attempt(tries + 1), RETRY_MS)
          return
        }
        const url = URL.createObjectURL(blob)
        setSnap(url)
        setActive(false) // unmount the canvas → free the WebGL context
      } catch {
        if (cancelled) return
        if (tries < MAX_RETRIES) {
          timer = window.setTimeout(() => attempt(tries + 1), RETRY_MS)
        } else {
          setActive(false)
        }
      }
    }

    timer = window.setTimeout(() => attempt(0), CAPTURE_DELAY_MS)
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [active, snap])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (snap) {
        try { URL.revokeObjectURL(snap) } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (snap) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={snap} alt={camera.id} className="w-full h-full object-cover" />
  }

  if (active && feedsFbxUrl) {
    return (
      <FbxPOV
        camera={camera}
        url={feedsFbxUrl}
        captureRef={captureRef}
        noVignette
      />
    )
  }

  // Idle state — waiting our turn
  return (
    <div className="w-full h-full bg-black/85 flex items-center justify-center">
      <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
    </div>
  )
}

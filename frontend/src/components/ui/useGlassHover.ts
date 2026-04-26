"use client"
import { useRef, useCallback, type MouseEvent, type RefObject } from "react"

const MAX_TILT = 6.5 // degrees — pronounced glass tilt

export function useGlassHover(opts: { tilt?: boolean } = {}) {
  const tilt = opts.tilt !== false
  const cardRef = useRef<HTMLDivElement>(null)
  const specRef = useRef<HTMLDivElement>(null)

  const onMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const cx = r.width / 2
    const cy = r.height / 2

    // Tilt: invert because we want top-of-card to tilt away when mouse is at top
    if (tilt) {
      const ry = ((x - cx) / cx) * MAX_TILT
      const rx = -((y - cy) / cy) * MAX_TILT
      el.style.transition = "transform 120ms ease-out"
      el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(1.012)`
    }

    // Specular spotlight follows cursor — soft and bluish
    if (specRef.current) {
      specRef.current.style.background = `radial-gradient(360px circle at ${x}px ${y}px, rgba(150,180,255,0.10) 0%, rgba(120,160,230,0.04) 35%, transparent 65%)`
    }
  }, [tilt])

  const onLeave = useCallback(() => {
    const el = cardRef.current
    if (el) {
      el.style.transition = "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)"
      el.style.transform = ""
    }
    if (specRef.current) specRef.current.style.background = ""
  }, [])

  return { cardRef: cardRef as RefObject<HTMLDivElement>, specRef: specRef as RefObject<HTMLDivElement>, onMove, onLeave }
}

"use client"
import type { ReactNode } from "react"
import { useGlassHover } from "./useGlassHover"

type Props = {
  title: string
  status?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  tilt?: boolean
}

export default function TerminalFrame({
  title,
  status,
  children,
  className = "",
  bodyClassName = "",
  tilt = true,
}: Props) {
  const { cardRef, specRef, onMove, onLeave } = useGlassHover({ tilt })

  return (
    <div ref={cardRef} className={`bento-card ${className}`} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="glass-filter" />
      <div className="glass-overlay" />
      <div className="glass-specular" ref={specRef} />
      <div className="glass-content">
        <div className="terminal-titlebar">
          <span className="tl-dot tl-dot--red" />
          <span className="tl-dot tl-dot--yellow" />
          <span className="tl-dot tl-dot--green" />
          <span className="flex-1 text-center font-mono">{title}</span>
          <span className="text-[10px] text-dim">{status}</span>
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto scroll-thin ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  )
}

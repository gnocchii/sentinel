"use client"
import type { ReactNode } from "react"
import { useGlassHover } from "./useGlassHover"

type Props = {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  tilt?: boolean
}

export default function BentoCard({
  title,
  action,
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
        {(title || action) && (
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            {title && (
              <h3 className="text-[10.5px] font-semibold text-dim uppercase tracking-[0.16em]">{title}</h3>
            )}
            {action && <div className="text-[10.5px] text-dim/80 uppercase tracking-[0.12em]">{action}</div>}
          </div>
        )}
        <div className={bodyClassName}>{children}</div>
      </div>
    </div>
  )
}

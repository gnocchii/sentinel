"use client"
/**
 * K2 reasoning stream — terminal-styled view of the K2 chain-of-thought.
 * Lives in the left rail under activity.log. Auto-stream is started by the
 * "Stream K2" call wired into TopBar; this panel just renders whatever has
 * been accumulated in the store, with a tail cursor when actively streaming.
 */
import { useEffect, useRef } from "react"
import { useSentinel } from "@/store/sentinel"

export default function K2ReasoningPanel() {
  const k2Thinking = useSentinel((s) => s.k2Thinking)
  const k2Streaming = useSentinel((s) => s.k2Streaming)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [k2Thinking])

  const lines = (k2Thinking || "").split("\n").filter((l) => l.length > 0)

  return (
    <section
      ref={ref}
      className="px-4 pb-4 pt-2 space-y-1.5 overflow-y-auto scroll-thin h-full"
    >
      {lines.length === 0 ? (
        <div className="term-line">
          <span className="term-time">[--:--:--]</span>
          <span className="term-tag text-cyan">K2  </span>
          <span className="term-msg text-dim">
            {k2Streaming ? "thinking…" : "Idle — Refresh triggers placement reasoning"}
            {k2Streaming && <span className="k2-cursor">▊</span>}
          </span>
        </div>
      ) : (
        lines.map((line, i) => {
          const isLast = i === lines.length - 1
          return (
            <div key={i} className="term-line">
              <span className="term-tag text-cyan shrink-0">K2  </span>
              <span className="term-msg text-dim">
                {line}
                {isLast && !k2Streaming && <span className="k2-cursor ml-1">▊</span>}
              </span>
            </div>
          )
        })
      )}
      {k2Streaming && lines.length > 0 && (
        <div className="term-line">
          <span className="term-tag text-cyan shrink-0">K2  </span>
          <span className="term-msg text-dim">
            <span className="k2-cursor">▊</span>
          </span>
        </div>
      )}
    </section>
  )
}

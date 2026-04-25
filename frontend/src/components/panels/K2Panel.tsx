"use client"
import { useRef, useEffect } from "react"
import { useSentinel } from "@/store/sentinel"

export default function K2Panel() {
  const { k2Text, k2Streaming } = useSentinel()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [k2Text])

  const placeholder = `Awaiting analysis…

Sentinel K2 Think V2 streams placement reasoning, budget tradeoffs, and lighting analysis here in real time.`

  return (
    <section className="flex flex-col p-4 space-y-2 h-56 shrink-0">
      <div className="flex items-center justify-between">
        <h2 className="text-dim text-xs tracking-widest uppercase">K2 Think V2</h2>
        {k2Streaming && (
          <span className="flex items-center gap-1 text-[10px] text-cyan">
            <span className="w-1 h-1 rounded-full bg-cyan animate-pulse" />
            streaming
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto text-[11px] leading-relaxed text-cyan font-mono bg-bg/60 rounded p-2 border border-border"
      >
        {k2Text || <span className="text-dim whitespace-pre-line">{placeholder}</span>}
        {k2Streaming && <span className="k2-cursor text-cyan">▊</span>}
      </div>
    </section>
  )
}

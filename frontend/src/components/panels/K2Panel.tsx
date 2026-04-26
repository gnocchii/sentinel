"use client"
import { useRef, useEffect, useCallback } from "react"
import { useSentinel } from "@/store/sentinel"
import { k2PlacementsToCamera } from "@/lib/k2ToCamera"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export default function K2Panel() {
  const {
    k2Thinking, appendK2Thinking,
    k2Text, appendK2Text, clearK2Text,
    k2Streaming, setK2Streaming,
    setCameras,
  } = useSentinel()

  const thinkRef  = useRef<HTMLDivElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)
  const abortRef  = useRef<AbortController | null>(null)

  useEffect(() => {
    if (thinkRef.current)  thinkRef.current.scrollTop  = thinkRef.current.scrollHeight
  }, [k2Thinking])
  useEffect(() => {
    if (answerRef.current) answerRef.current.scrollTop = answerRef.current.scrollHeight
  }, [k2Text])

  const runK2 = useCallback(async () => {
    if (k2Streaming) {
      abortRef.current?.abort()
      setK2Streaming(false)
      return
    }

    clearK2Text()
    setK2Streaming(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch(`${API_URL}/spatial/place-cameras`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ scene_id: "avery_house", n_cameras: 5 }),
        signal:  abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        appendK2Text(`[Error ${res.status}]: ${err.detail ?? res.statusText}`)
        setK2Streaming(false)
        return
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer    = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const blocks = buffer.split("\n\n")
        buffer = blocks.pop() ?? ""

        for (const block of blocks) {
          const lines = block.split("\n")
          let eventType = ""
          let data = ""
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim()
            else if (line.startsWith("data: "))  data = line.slice(6)
          }
          if (!data) continue

          if (data === "[DONE]") {
            setK2Streaming(false)
            return
          }

          if (eventType === "thinking") {
            appendK2Thinking(data)
          } else if (eventType === "placements") {
            try {
              const result = JSON.parse(data)
              const cams   = k2PlacementsToCamera(result.cameras ?? [])
              setCameras(cams)
              appendK2Text(
                `\n✓ ${cams.length} cameras placed — twin updated (${result.estimated_total_coverage_pct ?? "?"}% coverage)`
              )
            } catch {
              appendK2Text("\n[Could not parse placements JSON]")
            }
          } else if (eventType === "error") {
            appendK2Text(`\n[K2 error]: ${data}`)
          } else {
            appendK2Text(data)
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== "AbortError") {
        appendK2Text(`\n[Network error]: ${(e as Error).message}`)
      }
    } finally {
      setK2Streaming(false)
    }
  }, [k2Streaming, clearK2Text, setK2Streaming, appendK2Thinking, appendK2Text, setCameras])

  return (
    <section className="flex flex-col px-5 pb-5 space-y-2 flex-1 min-h-0">
      <div className="flex items-center justify-end gap-2">
        {k2Streaming && (
          <span className="flex items-center gap-1.5 text-[10px] text-text/70">
            <span className="w-1 h-1 rounded-full bg-text/70 animate-pulse" />
            streaming
          </span>
        )}
        <button
          onClick={runK2}
          className={k2Streaming ? "glass-btn glass-btn--danger" : "glass-btn"}
        >
          {k2Streaming ? "Stop" : "Run Placement"}
        </button>
      </div>

      {/* Thinking box */}
      <div className="flex flex-col flex-1 min-h-0">
        <span className="text-[10px] text-dim uppercase tracking-[0.14em] mb-1.5">Reasoning</span>
        <div
          ref={thinkRef}
          className="flex-1 overflow-y-auto text-[10.5px] leading-relaxed text-dim/85 font-mono bg-black/30 rounded-xl p-3 border border-white/[0.04] italic scroll-thin"
        >
          {k2Thinking
            ? k2Thinking
            : <span className="text-dim/50">K2 chain-of-thought will appear here…</span>}
          {k2Streaming && !k2Text && <span className="text-dim animate-pulse">▊</span>}
        </div>
      </div>

      {/* Answer box */}
      <div className="flex flex-col flex-1 min-h-0">
        <span className="text-[10px] text-dim uppercase tracking-[0.14em] mb-1.5">Placements</span>
        <div
          ref={answerRef}
          className="flex-1 overflow-y-auto text-[11px] leading-relaxed text-cyan/95 font-mono bg-black/30 rounded-xl p-3 border border-cyan/10 scroll-thin"
        >
          {k2Text
            ? k2Text
            : <span className="text-dim">Camera placements will appear here…</span>}
          {k2Streaming && k2Text && <span className="text-cyan animate-pulse">▊</span>}
        </div>
      </div>
    </section>
  )
}

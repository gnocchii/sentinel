"use client"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import SectionHead from "./SectionHead"
import Reconstruction from "./Reconstruction"

const SAMPLES = [
  { id: "avery", label: "avery_house.mp4" },
  { id: "scannet", label: "scannet_0042.bin" },
  { id: "warehouse", label: "warehouse_demo.mp4" },
]

export default function UploadSection() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [drag, setDrag] = useState(false)
  const [trigger, setTrigger] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [label, setLabel] = useState<string | null>(null)

  function kick(name: string) {
    setLabel(name)
    setStatus(`▷ processing ${name}`)
    setTrigger((t) => t + 1)
    // navigate to dashboard after a beat (demo: ~14s reconstruction)
    setTimeout(() => router.push("/twin"), 14000)
  }

  return (
    <section id="upload" className="border-t border-border/60 px-[8vw] py-28">
      <SectionHead
        num="/02"
        title="upload your walkthrough"
        sub="drag a video. or use a phone scan. or pick a sample scene."
      />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 lg:grid-cols-2">
        {/* drop zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            const f = e.dataTransfer.files?.[0]
            if (f) kick(f.name)
          }}
          className={`flex cursor-pointer flex-col items-center gap-3 border border-dashed bg-surface px-8 py-16 text-center transition-all ${
            drag
              ? "border-cyan bg-cyan/[0.04]"
              : "border-border hover:border-cyan hover:bg-cyan/[0.04]"
          }`}
        >
          <div className="mb-2 text-[38px] text-cyan">▢</div>
          <div className="text-base text-text">drop walkthrough.mp4</div>
          <div className="text-xs text-dim">
            or click to browse · max 500MB · h.264 / hevc
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) kick(f.name)
            }}
          />

          <div className="mt-4 text-[11px] tracking-[0.16em] text-dim/60">— or —</div>
          <div className="flex flex-wrap justify-center gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                onClick={(e) => {
                  e.stopPropagation()
                  kick(s.label)
                }}
                className="rounded border border-border px-3 py-2 text-[11px] text-text/80 transition-colors hover:border-cyan hover:text-cyan"
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="mt-2 min-h-4 text-[11px] tracking-wider text-cyan">
            {status}
          </div>
        </div>

        {/* live reconstruction */}
        <Reconstruction trigger={trigger} label={label} />
      </div>
    </section>
  )
}

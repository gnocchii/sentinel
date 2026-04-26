"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useSentinelUploads } from "@/hooks/useSentinelUploads"

const TEXT = "sentinel"
const SUBTITLE = "reasoned surveillance."
const CHARS = "abcdefghijklmnopqrstuvwxyz"
const PRE_HOLD_MS = 600
const STAGGER_MS = 220
const SCRAMBLE_MS = 260
const SCRAMBLE_TICK = 38
// Subtitle starts after the title is fully revealed
const SUBTITLE_DELAY_MS = PRE_HOLD_MS + TEXT.length * STAGGER_MS + 200
const SUBTITLE_STAGGER_MS = 70
const SUBTITLE_SCRAMBLE_MS = 220

type CellStatus = "hidden" | "scrambling" | "revealed"
type Cell = { status: CellStatus; display: string }

function centerOutOrder(len: number) {
  const middle = Math.floor(len / 2)
  const out: number[] = []
  let off = 0
  while (out.length < len) {
    if (off === 0) out.push(middle)
    else {
      if (middle - off >= 0) out.push(middle - off)
      if (middle + off < len) out.push(middle + off)
    }
    off++
  }
  return out.slice(0, len)
}

const randomChar = () => CHARS[Math.floor(Math.random() * CHARS.length)]
// Punctuation/whitespace shouldn't scramble through random letters — pass through
const isLiteral = (ch: string) => ch === " " || !/[a-z]/i.test(ch)

export default function SentinelHero() {
  const router = useRouter()
  const { scene, sceneId, feedsFbxUrl, uploading, handleUpload, handleUploadFbx } = useSentinelUploads()
  const routedRef = useRef(false)

  // Once both files are in, jump into the dashboard
  useEffect(() => {
    if (sceneId && feedsFbxUrl && !routedRef.current) {
      routedRef.current = true
      router.push("/twin")
    }
  }, [sceneId, feedsFbxUrl, router])

  // SVG turbulence seed shimmer
  const [seed, setSeed] = useState(1)
  useEffect(() => {
    const id = setInterval(() => setSeed((s) => (s % 99) + 1), 120)
    return () => clearInterval(id)
  }, [])

  // Per-char status — title
  const [cells, setCells] = useState<Cell[]>(() =>
    TEXT.split("").map(() => ({ status: "hidden", display: "" }))
  )
  // Per-char status — subtitle
  const [subCells, setSubCells] = useState<Cell[]>(() =>
    SUBTITLE.split("").map(() => ({ status: "hidden", display: "" }))
  )

  useEffect(() => {
    const order = centerOutOrder(TEXT.length)
    const intervals: ReturnType<typeof setInterval>[] = []
    const timeouts: ReturnType<typeof setTimeout>[] = []

    order.forEach((idx, i) => {
      const startAt = PRE_HOLD_MS + i * STAGGER_MS

      const beginScramble = setTimeout(() => {
        const scrambleId = setInterval(() => {
          setCells((prev) => {
            const next = prev.slice()
            next[idx] = { status: "scrambling", display: randomChar() }
            return next
          })
        }, SCRAMBLE_TICK)
        intervals.push(scrambleId)

        const settle = setTimeout(() => {
          clearInterval(scrambleId)
          setCells((prev) => {
            const next = prev.slice()
            next[idx] = { status: "revealed", display: TEXT[idx] }
            return next
          })
        }, SCRAMBLE_MS)
        timeouts.push(settle)
      }, startAt)
      timeouts.push(beginScramble)
    })

    // Subtitle scramble — left-to-right, faster, after title
    SUBTITLE.split("").forEach((ch, idx) => {
      const startAt = SUBTITLE_DELAY_MS + idx * SUBTITLE_STAGGER_MS

      const beginScramble = setTimeout(() => {
        if (isLiteral(ch)) {
          setSubCells((prev) => {
            const next = prev.slice()
            next[idx] = { status: "revealed", display: ch }
            return next
          })
          return
        }
        const scrambleId = setInterval(() => {
          setSubCells((prev) => {
            const next = prev.slice()
            next[idx] = { status: "scrambling", display: randomChar() }
            return next
          })
        }, SCRAMBLE_TICK)
        intervals.push(scrambleId)

        const settle = setTimeout(() => {
          clearInterval(scrambleId)
          setSubCells((prev) => {
            const next = prev.slice()
            next[idx] = { status: "revealed", display: ch }
            return next
          })
        }, SUBTITLE_SCRAMBLE_MS)
        timeouts.push(settle)
      }, startAt)
      timeouts.push(beginScramble)
    })

    return () => {
      timeouts.forEach(clearTimeout)
      intervals.forEach(clearInterval)
    }
  }, [])

  return (
    <div className="sh-hero">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <filter id="sentinel-dissolve" x="-6%" y="-18%" width="112%" height="136%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9 0.9"
              numOctaves={1}
              seed={seed}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={2.6}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <h1 className="sh-hero-title" aria-label="sentinel">
        <span className="sh-hero-broken">
          <span className="sh-hero-letters" aria-hidden="true">
            {cells.map((cell, i) => (
              <span key={i} className={`sh-hero-char is-${cell.status}`}>
                {cell.display}
              </span>
            ))}
          </span>
        </span>
        <span className="sh-hero-cursor" aria-hidden="true">_</span>
      </h1>

      <div className="sh-hero-subtitle" aria-label={SUBTITLE}>
        {subCells.map((cell, i) => (
          <span key={i} className={`sh-hero-subchar is-${cell.status}`}>
            {cell.display === " " ? " " : cell.display}
          </span>
        ))}
      </div>

      <GlassPanel
        scene={scene}
        feedsFbxUrl={feedsFbxUrl}
        uploading={uploading}
        handleUpload={handleUpload}
        handleUploadFbx={handleUploadFbx}
      />

    </div>
  )
}

type GlassPanelProps = {
  scene: ReturnType<typeof useSentinelUploads>["scene"]
  feedsFbxUrl: string | null
  uploading: boolean
  handleUpload: (file: File) => void | Promise<void>
  handleUploadFbx: (file: File) => void
}

function GlassPanel({ scene, feedsFbxUrl, uploading, handleUpload, handleUploadFbx }: GlassPanelProps) {
  const [m, setM] = useState({ x: "50%", y: "50%" })
  const fileRef = useRef<HTMLInputElement>(null)
  const fbxRef = useRef<HTMLInputElement>(null)

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setM({ x: `${e.clientX - r.left}px`, y: `${e.clientY - r.top}px` })
  }
  const onLeave = () => setM({ x: "50%", y: "50%" })

  return (
    <div
      className="sh-glass-panel"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ ["--mx" as any]: m.x, ["--my" as any]: m.y }}
    >
      <div className="sh-glass-panel-blur" />
      <div className="sh-glass-panel-tint" />
      <div className="sh-glass-panel-spec" />
      <div className="sh-glass-panel-content">
        <p className="sh-glass-panel-instruction">upload room meshes to deploy</p>
        <input
          ref={fileRef}
          type="file"
          accept=".usdz"
          className="sh-glass-panel-file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleUpload(file)
            e.target.value = ""
          }}
        />
        <input
          ref={fbxRef}
          type="file"
          accept=".fbx"
          className="sh-glass-panel-file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleUploadFbx(file)
            e.target.value = ""
          }}
        />

        <div className="sh-glass-panel-actions">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={scene ? "sh-glass-btn sh-glass-btn--accent" : "sh-glass-btn"}
          >
            {uploading ? "parsing…" : scene ? "usdz loaded" : "upload usdz"}
          </button>
          <button
            type="button"
            onClick={() => fbxRef.current?.click()}
            className={feedsFbxUrl ? "sh-glass-btn sh-glass-btn--accent" : "sh-glass-btn"}
            title="Textured FBX rendered in Camera Feeds + Point Cloud tabs"
          >
            {feedsFbxUrl ? "fbx loaded" : "upload fbx"}
          </button>
        </div>
        <p className="sh-glass-panel-links">
          read our{" "}
          <a
            href="https://github.com/gnocchii/sentinel"
            target="_blank"
            rel="noopener noreferrer"
            className="sh-glass-panel-link"
          >
            github
          </a>{" "}
          or{" "}
          <a
            href="https://devpost.com/software/sentinel-qkt9cn?ref_content=user-portfolio&ref_feature=in_progress"
            target="_blank"
            rel="noopener noreferrer"
            className="sh-glass-panel-link"
          >
            devpost
          </a>
        </p>
      </div>
    </div>
  )
}

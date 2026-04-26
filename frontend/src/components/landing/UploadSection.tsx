"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useSentinelUploads } from "@/hooks/useSentinelUploads"
import SectionHead from "./SectionHead"
import Reconstruction from "./Reconstruction"

export default function UploadSection() {
  const router = useRouter()
  const usdzRef = useRef<HTMLInputElement | null>(null)
  const fbxRef = useRef<HTMLInputElement | null>(null)
  const routedRef = useRef(false)
  const [trigger, setTrigger] = useState(0)
  const [label, setLabel] = useState<string | null>(null)
  const { scene, sceneId, feedsFbxUrl, uploading, handleUpload, handleUploadFbx } = useSentinelUploads()

  useEffect(() => {
    if (!sceneId || !feedsFbxUrl || routedRef.current) return
    routedRef.current = true
    router.push("/twin")
  }, [feedsFbxUrl, router, sceneId])

  function kick(name: string, action: () => void) {
    setLabel(name)
    setTrigger((t) => t + 1)
    action()
  }

  return (
    <section id="upload" className="border-t border-border/60 px-[8vw] py-28">
      <SectionHead
        num="/02"
        title="upload your walkthrough"
        sub="upload the USDZ and FBX here. once both land, sentinel jumps straight into the dashboard."
      />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="glass-panel min-h-[420px]">
          <div className="glass-filter" />
          <div className="glass-overlay" />
          <div className="glass-specular" />
          <div className="glass-content justify-between p-8">
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-cyan/80">
                  Sentinel Ingress
                </div>
                <h3 className="text-[30px] font-medium tracking-[-0.03em] text-text">
                  Load the exact scene and textured model.
                </h3>
              </div>

              <p className="max-w-md text-sm leading-6 text-text/72">
                Use the same two file inputs as the dashboard workflow: first the parsed USDZ for
                geometry and camera reasoning, then the FBX for textured POV rendering.
              </p>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-dim">
                <span className="rounded-full border border-white/10 px-3 py-1">v0.1</span>
                <span className="rounded-full border border-white/10 px-3 py-1">
                  {scene?.name ?? "no scene"}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1">
                  {feedsFbxUrl ? "fbx ready" : "fbx missing"}
                </span>
              </div>
            </div>

            <input
              ref={usdzRef}
              type="file"
              accept=".usdz"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                kick(file.name, () => void handleUpload(file))
                e.target.value = ""
              }}
            />
            <input
              ref={fbxRef}
              type="file"
              accept=".fbx"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                kick(file.name, () => handleUploadFbx(file))
                e.target.value = ""
              }}
            />

            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => usdzRef.current?.click()}
                  disabled={uploading}
                  className={scene ? "glass-btn glass-btn--accent" : "glass-btn"}
                >
                  {uploading ? "Parsing..." : scene ? "USDZ ✓" : "Upload USDZ"}
                </button>
                <button
                  type="button"
                  onClick={() => fbxRef.current?.click()}
                  className={feedsFbxUrl ? "glass-btn glass-btn--accent" : "glass-btn"}
                >
                  {feedsFbxUrl ? "FBX ✓" : "Upload FBX"}
                </button>
              </div>

              <div className="min-h-10 text-sm text-text/74">
                {scene
                  ? `${scene.cameras.length} cameras · ${scene.floor_area_m2}m² · ${scene.rooms?.length ?? 0} rooms`
                  : "Upload both files here, then Sentinel will switch directly into the dashboard."}
              </div>

              <div className="text-[11px] uppercase tracking-[0.16em] text-cyan/80">
                {label ? `latest file · ${label}` : "waiting for scene files"}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel min-h-[420px] overflow-hidden">
          <div className="glass-filter" />
          <div className="glass-overlay" />
          <div className="glass-specular" />
          <div className="glass-content">
            <div className="border-b border-white/6 px-5 py-3 text-[11px] uppercase tracking-[0.2em] text-dim">
              Reconstruction Preview
            </div>
            <div className="flex-1">
              <Reconstruction trigger={trigger} label={label} />
            </div>
            <div className="border-t border-white/6 px-5 py-3 text-[11px] text-dim">
              {sceneId && feedsFbxUrl
                ? "Routing to /twin..."
                : "Dashboard unlocks as soon as both the USDZ and FBX are loaded."}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
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

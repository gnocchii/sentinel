"use client"
import HeroParticles from "./HeroParticles"

const STATS = [
  { num: "$120B+", label: "global physical security market" },
  { num: "779,542", label: "u.s. burglaries in 2024" },
  { num: "83%", label: "burglars check for cameras first" },
  { num: "$50,000", label: "cost of a campus install today" },
]

export default function Hero() {
  return (
    <section className="relative isolate flex min-h-screen items-center px-[8vw] pb-16 pt-32">
      <HeroParticles />

      {/* grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 40%, transparent 30%, black 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 40%, transparent 30%, black 80%)",
        }}
      />
      {/* vignette */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 50% 50%, transparent 30%, rgba(10,12,15,0.6) 80%), linear-gradient(to bottom, transparent 60%, #0a0c0f)",
        }}
      />

      <div className="mx-auto w-full max-w-[1200px]">
        <div className="mb-7 inline-flex items-center gap-2 text-[11px] tracking-[0.12em] text-dim">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan shadow-[0_0_10px_#00d4ff]" />
          v0.1 · hacktech 2026 · caltech
        </div>

        <h1 className="mb-8 font-light leading-[1.04] tracking-tight text-[clamp(44px,7vw,96px)]">
          <span className="block animate-[rise_0.9s_cubic-bezier(0.16,1,0.3,1)_0.1s_both] opacity-0">
            the security architect
          </span>
          <span className="block animate-[rise_0.9s_cubic-bezier(0.16,1,0.3,1)_0.25s_both] opacity-0">
            that ships with
          </span>
          <span className="block animate-[rise_0.9s_cubic-bezier(0.16,1,0.3,1)_0.4s_both] bg-gradient-to-r from-cyan via-white to-cyan bg-[length:200%_100%] bg-clip-text text-transparent opacity-0 [animation:rise_0.9s_cubic-bezier(0.16,1,0.3,1)_0.4s_forwards,sheen_6s_linear_1.4s_infinite]">
            your building.
          </span>
        </h1>

        <p className="mb-10 max-w-xl animate-[rise_1s_cubic-bezier(0.16,1,0.3,1)_0.6s_both] text-[15px] text-text/80 opacity-0">
          scan a space with your phone. <em className="not-italic text-cyan/90">sentinel</em>{" "}
          reconstructs it in 3D, reasons through camera placement with K2 Think V2, and
          renders the view from every camera before you buy a single one.
        </p>

        <div className="mb-20 flex animate-[rise_1s_cubic-bezier(0.16,1,0.3,1)_0.8s_both] gap-3.5 opacity-0">
          <a
            href="#upload"
            className="group inline-flex items-center gap-3 rounded bg-cyan px-5 py-3.5 text-sm font-medium tracking-wider text-bg transition-all hover:-translate-y-px hover:shadow-[0_12px_32px_-8px_rgba(0,212,255,0.6),0_0_0_1px_rgba(0,212,255,0.4)]"
          >
            upload walkthrough
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </a>
          <a
            href="#pipeline"
            className="inline-flex items-center rounded border border-border px-5 py-3.5 text-sm text-text/80 transition-colors hover:border-text hover:text-text"
          >
            how it works
          </a>
        </div>

        <div className="grid animate-[rise_1.2s_cubic-bezier(0.16,1,0.3,1)_1s_both] grid-cols-2 border-y border-border/60 opacity-0 md:grid-cols-4">
          {STATS.map((s, i) => (
            <div
              key={s.num}
              className={`flex flex-col gap-1.5 px-6 py-5 ${i < 3 ? "md:border-r border-border/60" : ""} ${i === 0 ? "border-r border-border/60" : ""} ${i === 1 ? "" : ""}`}
            >
              <span className="text-[28px] font-medium leading-none">{s.num}</span>
              <span className="text-[11px] tracking-wider text-dim">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.3em] text-dim/60">
        scroll · the design is static, until now
      </div>
    </section>
  )
}

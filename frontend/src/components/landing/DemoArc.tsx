import SectionHead from "./SectionHead"

const BEATS = [
  { t: "25s", b: "cold open", d: "$120B market · 779k burglaries · \"design is static\" · sentinel wordmark resolves" },
  { t: "15s", b: "input video plays", d: "pre-recorded phone walkthrough · raw input" },
  { t: "20s", b: "3D reconstruction streams in", d: "point cloud builds particle-by-particle" },
  { t: "20s", b: "spatial understanding overlay", d: "walls, doors, windows, entries light up" },
  { t: "45s", b: "K2 auto-optimizes", d: "cameras spawn one by one with reasoning chain" },
  { t: "40s", b: "budget slider drag", d: "$500 → $25k · cameras spawn/despawn live" },
  { t: "30s", b: "camera POV preview", d: "click a node · render the simulated view" },
  { t: "45s", b: "lighting time-lapse", d: "scrub 24h · glare fires · K2 recommends HDR + IR" },
  { t: "20s", b: "coverage map · honesty beat", d: "click the one blind spot · explain the tradeoff" },
  { t: "15s", b: "closing", d: "\"$1,500 + 2 weeks → 90 seconds. re-scan, re-reason.\"" },
  { t: "45s", b: "Q&A", d: "judges" },
]

export default function DemoArc() {
  return (
    <section id="demo" className="border-t border-border/60 px-[8vw] py-28">
      <SectionHead
        num="/05"
        title="5-minute demo arc"
        sub="eleven beats. no heist. no priority-zone marking. pure pipeline + interaction."
      />

      <ol className="mx-auto max-w-[1000px] border-t border-border/60">
        {BEATS.map((b, i) => (
          <li
            key={i}
            className="grid grid-cols-[60px_1fr] items-baseline gap-x-6 gap-y-1 border-b border-border/60 px-2 py-4 transition-colors hover:bg-surface md:grid-cols-[60px_240px_1fr]"
          >
            <span className="text-xs text-cyan">{b.t}</span>
            <span className="text-sm font-medium text-text">{b.b}</span>
            <span className="col-span-2 text-xs text-dim md:col-span-1">{b.d}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

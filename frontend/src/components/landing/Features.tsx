import SectionHead from "./SectionHead"

const FEATURES = [
  {
    n: "f.01",
    h: "solar / lighting simulation",
    p: "using window normals and latitude, K2 simulates the sun's arc across 24 hours. flags glare windows, shadow blind spots, and dark corners at dusk. recommends IR cameras and HDR schedules per camera.",
    foot: "ship · demo beat",
    dot: "cyan",
  },
  {
    n: "f.02",
    h: "budget slider",
    p: "drag from $500 to $50k. cameras spawn and despawn live. coverage % animates. K2 streams tradeoffs in plain english: which camera to drop, which entry point gains, which zone loses dwell.",
    foot: "ship · interactive",
    dot: "cyan",
  },
  {
    n: "f.03",
    h: "camera POV preview",
    p: "click any camera node. sentinel renders the actual view from that position — angle, FOV, what it would see. see through the eyes of your future security system before buying a single one.",
    foot: "ship · payoff",
    dot: "cyan",
  },
  {
    n: "f.04",
    h: "adversarial threat models",
    p: "three attacker classes — burglar, insider, professional — shape K2's objective function. coverage of area doesn't matter. coverage against people does.",
    foot: "silent · narration",
    dot: "amber",
  },
  {
    n: "f.05",
    h: "privacy zones",
    p: "sentinel auto-segments bathrooms, breakrooms, and private offices. cameras whose FOV intersects get flagged. compliance angle for HIPAA, PCI, GDPR placement constraints.",
    foot: "ship · compliance",
    dot: "cyan",
  },
  {
    n: "f.06",
    h: "blind-spot honesty",
    p: "we don't claim 100%. the coverage map shows every gap, K2 explains the tradeoff (low-priority zone, cost-vs-coverage), and you decide whether to spend more.",
    foot: "ship · trust",
    dot: "cyan",
  },
  {
    n: "f.07",
    h: "what-if reconfiguration",
    p: "move a wall, add a doorway, place a shelf. sentinel re-runs raycast and K2 re-reasons. the static-design problem solved with a drag.",
    foot: "stretch",
    dot: "amber",
  },
  {
    n: "f.08",
    h: "insurance + cost summary",
    p: "estimated premium reduction from your placement. plan saves $2,400 / yr — pays for itself in 8 months. ammunition for the CFO conversation.",
    foot: "stretch",
    dot: "amber",
  },
]

export default function Features() {
  return (
    <section id="features" className="border-t border-border/60 px-[8vw] py-28">
      <SectionHead
        num="/04"
        title="features"
        sub="every part of the system, laid out."
      />

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 border border-border/60 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => {
          const isLastCol = (i + 1) % 4 === 0
          const isLastRow = i >= FEATURES.length - 4
          return (
            <article
              key={i}
              className={`group relative flex flex-col gap-3.5 bg-surface p-7 transition-colors hover:bg-muted/30 ${
                !isLastCol ? "lg:border-r border-border/60" : ""
              } ${!isLastRow ? "lg:border-b border-border/60" : ""} ${
                (i + 1) % 2 === 1 ? "sm:border-r border-border/60" : ""
              } border-b border-border/60`}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{
                  background:
                    "linear-gradient(135deg, transparent 70%, rgba(0,212,255,0.06) 100%)",
                }}
              />
              <div className="text-[10px] tracking-[0.18em] text-dim/70">{f.n}</div>
              <h3 className="text-base font-medium leading-snug">{f.h}</h3>
              <p className="flex-1 text-[12.5px] leading-relaxed text-text/80">{f.p}</p>
              <div className="flex items-center gap-2 border-t border-border/60 pt-3 text-[10px] tracking-wider text-dim/70">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    f.dot === "cyan"
                      ? "bg-cyan shadow-[0_0_6px_#00d4ff]"
                      : "bg-amber shadow-[0_0_6px_#ffaa00]"
                  }`}
                />
                {f.foot}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

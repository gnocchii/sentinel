import SectionHead from "./SectionHead"

const STAGES = [
  {
    n: "stage 01",
    h: "video → 3D point cloud",
    p: "structure-from-motion + depth estimation reconstructs your space from a walkthrough video. no LiDAR. no special hardware. just your phone camera.",
    tag: "SfM · MVS · streaming",
  },
  {
    n: "stage 02",
    h: "point cloud → spatial understanding",
    p: "segmentation labels walls, doors, windows, ceilings, hallways, and entry points. sentinel knows what's a corridor and where the vulnerable access points are.",
    tag: "3D segmentation · entry-point graph",
  },
  {
    n: "stage 03",
    h: "spatial model → K2 reasoning",
    p: "K2 Think V2 reasons through optimal placement using physics, geometry, and security domain knowledge — FOV math, overlap zones, sight-lines, sun position, threat-class adversaries.",
    tag: "K2 Think V2 · semantic priority",
  },
  {
    n: "stage 04",
    h: "placement → simulated camera views",
    p: "for each recommended position we render the actual view from that camera. see through the eyes of your future security system before buying a single one.",
    tag: "POV render · coverage proof",
  },
]

export default function Pipeline() {
  return (
    <section id="pipeline" className="border-t border-border/60 px-[8vw] py-28">
      <SectionHead
        num="/01"
        title="the pipeline"
        sub="video → 3D → spatial understanding → K2 → simulated views. four stages, one phone."
      />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 border border-border/60 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((s, i) => (
          <article
            key={i}
            className={`flex flex-col gap-3.5 bg-surface p-7 transition-colors hover:bg-muted/30 ${
              i < STAGES.length - 1
                ? "border-b border-border/60 sm:border-b-0 sm:[&:nth-child(2n+1)]:border-r lg:border-r"
                : ""
            }`}
          >
            <div className="text-[11px] tracking-[0.16em] text-cyan">{s.n}</div>
            <h3 className="text-[17px] font-medium leading-snug">{s.h}</h3>
            <p className="flex-1 text-[13px] text-text/80">{s.p}</p>
            <div className="border-t border-border/60 pt-3 text-[10px] tracking-wider text-dim/70">
              {s.tag}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

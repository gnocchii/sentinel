const ROWS = [
  "cameras pointed at sky or ground",
  "back doors with no coverage",
  "parking lots that can't read plates",
  "cameras blocked by signage or shelving",
  "designs that don't adapt when the space does",
]

export default function ProblemStrip() {
  return (
    <section className="border-y border-border/60 bg-surface px-[8vw] py-20">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 sm:grid-cols-2 md:grid-cols-5">
        {ROWS.map((r, i) => (
          <div
            key={i}
            className="flex flex-col gap-3.5 border-border/60 px-4 py-6 [&:not(:last-child)]:md:border-r"
          >
            <span className="text-[10px] tracking-[0.2em] text-dim/70">
              [{String(i + 1).padStart(2, "0")}]
            </span>
            <span className="text-[14px] text-text">{r}</span>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-[1200px] text-sm text-dim">
        every blind spot is invisible until the day you pull footage. sentinel finds
        them on day zero.
      </p>
    </section>
  )
}

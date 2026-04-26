export default function SectionHead({
  num,
  title,
  sub,
}: {
  num: string
  title: string
  sub: string
}) {
  return (
    <div className="mx-auto mb-14 grid max-w-[1200px] grid-cols-[auto_1fr] items-baseline gap-x-7 gap-y-1">
      <span className="row-span-2 pt-3 text-[11px] tracking-[0.16em] text-cyan">
        {num}
      </span>
      <h2 className="text-[clamp(28px,4vw,48px)] font-normal tracking-tight">
        {title}
      </h2>
      <p className="text-sm text-dim">{sub}</p>
    </div>
  )
}

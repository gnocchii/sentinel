"use client"
import Link from "next/link"

export default function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 grid grid-cols-[1fr_auto_1fr] items-center border-b border-border/40 bg-bg/80 px-7 py-4 backdrop-blur-xl">
      <div className="flex items-center gap-2.5">
        <span className="text-cyan">▣</span>
        <span className="text-sm font-medium tracking-[0.22em]">SENTINEL</span>
      </div>

      <nav className="hidden gap-6 text-xs text-dim md:flex">
        <a href="#pipeline" className="transition-colors hover:text-cyan">pipeline</a>
        <a href="#upload" className="transition-colors hover:text-cyan">upload</a>
        <a href="#features" className="transition-colors hover:text-cyan">features</a>
        <a href="#demo" className="transition-colors hover:text-cyan">demo</a>
      </nav>

      <div className="flex items-center justify-end gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[11px] text-green md:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-green shadow-[0_0_8px_#00ff88]" />
          K2 Think V2 active
        </span>
        <Link
          href="/twin"
          className="rounded-full border border-border px-3.5 py-2 text-xs transition-all hover:border-cyan hover:text-cyan hover:shadow-[0_0_0_4px_rgba(0,212,255,0.06)]"
        >
          launch dashboard →
        </Link>
      </div>
    </header>
  )
}

"use client"
import { useEffect, useState } from "react"
import { useSentinel, type Activity } from "@/store/sentinel"

const SEV_TAG: Record<Activity["severity"], { label: string; color: string }> = {
  critical: { label: "ALERT", color: "text-red" },
  warning:  { label: "WARN ", color: "text-amber" },
  info:     { label: "INFO ", color: "text-cyan" },
  success:  { label: "OK   ", color: "text-green" },
}

export default function AlertsPanel() {
  const activities = useSentinel((s) => s.activities)
  const [now, setNow] = useState<string | null>(null)

  useEffect(() => {
    const tick = () => setNow(nowStamp())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="px-4 pb-4 pt-2 space-y-1.5">
      {activities.length === 0 ? (
        <div className="term-line">
          <span className="term-time">[{now ?? "--:--:--"}]</span>
          <span className="term-tag text-green">READY</span>
          <span className="term-msg text-dim">
            Awaiting first event<span className="k2-cursor">▊</span>
          </span>
        </div>
      ) : (
        activities.map((a) => {
          const tag = SEV_TAG[a.severity]
          return (
            <div key={a.id} className="term-line">
              <span className="term-time">[{stampOf(a.ts)}]</span>
              <span className={`term-tag ${tag.color}`}>{tag.label}</span>
              <span className="term-msg">
                <span className="text-text">{a.title}</span>
                {a.body && <span className="text-dim"> — {a.body}</span>}
              </span>
            </div>
          )
        })
      )}
    </section>
  )
}

function stampOf(ts: number) {
  const d = new Date(ts)
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => n.toString().padStart(2, "0"))
    .join(":")
}

function nowStamp() {
  return stampOf(Date.now())
}

"use client"
/**
 * A* threat path visualization.
 * Shows attacker routes from entry points to the target zone.
 * TODO: fetch paths from /cameras/{scene_id}/threat-paths and animate.
 */
import { useSentinel } from "@/store/sentinel"

export default function ThreatPath() {
  const { scene, threatPaths, activeThreatEntry, setActiveThreatEntry } = useSentinel()

  if (!scene) return null

  const entryPoints = scene.entry_points

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-bg gap-4 p-8">
      <p className="text-dim text-sm">Select an entry point to visualize the attacker's optimal path to the server room.</p>

      <div className="flex flex-wrap gap-2 justify-center">
        {entryPoints.map((ep) => (
          <button
            key={ep.id}
            onClick={() => setActiveThreatEntry(ep.id === activeThreatEntry ? null : ep.id)}
            className={`px-3 py-1.5 rounded text-xs border transition-colors
              ${activeThreatEntry === ep.id
                ? "bg-red/15 border-red/40 text-red"
                : "border-border text-dim hover:text-text hover:border-muted"
              }`}
          >
            {ep.label} ({ep.type})
          </button>
        ))}
      </div>

      {activeThreatEntry && (
        <div className="text-xs text-dim">
          Threat path from <span className="text-red">{entryPoints.find(e => e.id === activeThreatEntry)?.label}</span>
          {" "}→ server room.{" "}
          <span className="text-text">3D path rendering coming soon — wire up /cameras/{"{scene_id}"}/threat-paths.</span>
        </div>
      )}
    </div>
  )
}

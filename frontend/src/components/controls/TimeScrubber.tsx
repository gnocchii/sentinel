"use client"
import { useSentinel } from "@/store/sentinel"

export default function TimeScrubber() {
  const { simulationHour, setSimulationHour } = useSentinel()

  const label = `${String(simulationHour).padStart(2, "0")}:00`
  const isDawn  = simulationHour >= 5  && simulationHour < 8
  const isDay   = simulationHour >= 8  && simulationHour < 18
  const isDusk  = simulationHour >= 18 && simulationHour < 21
  const isNight = simulationHour < 5   || simulationHour >= 21

  const icon = isDawn ? "🌅" : isDay ? "☀️" : isDusk ? "🌇" : "🌙"

  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <span className="text-dim text-[10px] shrink-0">TIME</span>
      <input
        type="range"
        min={0}
        max={23}
        step={1}
        value={simulationHour}
        onChange={(e) => setSimulationHour(Number(e.target.value))}
        className="flex-1 accent-amber h-1 cursor-pointer"
      />
      <span className="text-amber text-xs font-semibold shrink-0 w-16 text-right">
        {icon} {label}
      </span>
    </div>
  )
}

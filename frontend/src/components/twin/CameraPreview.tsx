"use client"
/**
 * CameraPreview — picks the right renderer for a camera tile or featured view.
 *
 * Priority:
 *   1. Uploaded FBX → FbxPOV (textured render through the camera)
 *   2. Avery House demo scene → CameraFOVView (video walkthrough crop)
 *   3. Anything else → CameraPOVCanvas (real 3D render of the scene from the
 *      camera's position/orientation; this is what the placement logic targets)
 */

import { useSentinel } from "@/store/sentinel"
import CameraPOVCanvas from "./CameraPOVCanvas"
import CameraFOVView from "./CameraFOVView"
import FbxPOV from "./FbxPOV"
import type { Camera } from "@/lib/types"

interface Props {
  camera: Camera
  size?: "mini" | "large"
}

export default function CameraPreview({ camera, size = "mini" }: Props) {
  const sceneId = useSentinel((s) => s.sceneId)
  const feedsFbxUrl = useSentinel((s) => s.feedsFbxUrl)
  const simulationHour = useSentinel((s) => s.simulationHour)

  // Force the inner R3F Canvas to remount whenever the camera identity OR its
  // pose changes — without this, re-optimizing reuses CAM-XX ids with new
  // positions/targets and the canvas never picks up the change. (Mirrors the
  // upstream cam-loading-bug fix on main.)
  const remountKey = `${camera.id}:${camera.position.join(",")}:${camera.target.join(",")}`

  if (feedsFbxUrl) {
    return (
      <div className="relative w-full h-full">
        <FbxPOV key={remountKey} camera={camera} url={feedsFbxUrl} />
        {size === "mini" && <PovHud camera={camera} hour={simulationHour} size={size} />}
      </div>
    )
  }

  if (sceneId === "avery_house") {
    return <CameraFOVView key={remountKey} camera={camera} fill className="w-full h-full" />
  }

  return <CameraPOVCanvas key={remountKey} camera={camera} hour={simulationHour} size={size} />
}

function PovHud({ camera, hour, size }: { camera: Camera; hour: number; size: "mini" | "large" }) {
  const fontClass = size === "large" ? "text-[11px]" : "text-[8px]"
  const ts = `${String(hour).padStart(2, "0")}:00`
  return (
    <div className={`absolute inset-0 p-2 pointer-events-none flex flex-col justify-between font-mono text-white/90 ${fontClass}`}>
      <div className="flex justify-between">
        <span className="font-semibold drop-shadow-md">{camera.id}</span>
        <span className="opacity-80 drop-shadow-md tabular-nums">{ts}</span>
      </div>
      <div className="flex justify-between items-end">
        <span className="opacity-70 drop-shadow-md">{camera.type.toUpperCase()}</span>
        {camera.status !== "offline" && (
          <span className="flex items-center gap-1 drop-shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {size === "large" && <span className="text-red-500 text-[10px]">REC</span>}
          </span>
        )}
      </div>
    </div>
  )
}

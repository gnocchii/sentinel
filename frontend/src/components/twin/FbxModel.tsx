"use client"
/**
 * Loads an FBX from a (blob) URL via drei's useFBX. Clones per-instance so
 * the same model can be mounted in multiple R3F canvases (e.g. one camera
 * tile per camera) without sharing scene-graph state.
 *
 * Auto-fits the FBX to the parsed USDZ scene bounds: rotates Y-up → Z-up,
 * uniformly scales to match the larger XY span, recenters in XY, and drops
 * its floor onto scene.bounds.min.z. This is what makes the cameras (which
 * are placed in scene-space) actually frame the FBX correctly.
 */
import { useFBX } from "@react-three/drei"
import { useMemo } from "react"
import * as THREE from "three"
import { useSentinel } from "@/store/sentinel"

interface Props {
  url: string
  scale?: number       // multiplier on top of the auto-fit scale
  yUpToZUp?: boolean
  autoFit?: boolean    // align bbox to scene.bounds (default: true)
}

export default function FbxModel({ url, scale = 1, yUpToZUp = true, autoFit = true }: Props) {
  const fbx = useFBX(url)
  const sceneBounds = useSentinel((s) => s.scene?.bounds)
  const cloned = useMemo(() => {
    const c = fbx.clone(true)
    // Apply rotation directly on the clone (so subsequent bbox math is in
    // post-rotation space). We won't pass `rotation` as a prop below.
    if (yUpToZUp) c.rotation.set(Math.PI / 2, 0, 0)
    c.updateMatrixWorld(true)

    // Diagnostic: count meshes, materials with valid texture maps, and
    // geometries with vertex colors. Logged once per FBX load.
    let meshes = 0, withMap = 0, withVColor = 0, withBrokenMap = 0
    c.traverse((obj) => {
      const m = obj as THREE.Mesh
      if (!m.isMesh) return
      meshes++
      if ((m.geometry as THREE.BufferGeometry).attributes?.color) withVColor++
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mm of mats) {
        const map = (mm as THREE.MeshStandardMaterial)?.map
        if (map) {
          if ((map.image as { width?: number } | undefined)?.width) withMap++
          else withBrokenMap++
        }
      }
    })
    console.log(
      `[FbxModel] meshes=${meshes} · vertexColored=${withVColor} · loadedTextures=${withMap} · brokenTextures=${withBrokenMap}`,
    )

    // FBX loaded from a blob URL can't resolve relative texture paths, so the
    // original materials' diffuse maps come back broken and render black.
    // We rebuild every material as MeshBasicMaterial (unlit) so geometry is
    // always visible. Color sources, in priority order:
    //   1. vertex colors on the geometry (Polycam mesh-with-vertex-colors)
    //   2. the original material's diffuse map IF its image actually loaded
    //   3. the original material's base color (when not near-black)
    //   4. a neutral grey fallback
    c.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.frustumCulled = false

      const geom = mesh.geometry as THREE.BufferGeometry
      const hasVColor = !!geom.attributes?.color
      const oldMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]

      const newMats = oldMats.map((om) => {
        const mm = om as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial | undefined
        const map = mm?.map ?? null
        const mapValid = !!(map && (map.image as { width?: number } | undefined)?.width)

        const oldColor = mm?.color
        const isNearBlack = oldColor
          ? oldColor.r + oldColor.g + oldColor.b < 0.1
          : true
        const fallbackColor = hasVColor || mapValid
          ? new THREE.Color(0xffffff)
          : isNearBlack
            ? new THREE.Color(0xb8b8b8)
            : oldColor!.clone()

        return new THREE.MeshBasicMaterial({
          color: fallbackColor,
          vertexColors: hasVColor,
          map: mapValid ? map : null,
          side: THREE.DoubleSide,
          toneMapped: false,
        })
      })

      mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0]
    })

    // ── Auto-fit to scene bounds ───────────────────────────────────
    // Compute FBX bbox post-rotation, then uniformly scale + translate so
    // it matches the parsed USDZ scene's footprint and floor elevation.
    if (autoFit && sceneBounds) {
      c.updateMatrixWorld(true)
      const bbox = new THREE.Box3().setFromObject(c)
      const fbxSize = bbox.getSize(new THREE.Vector3())

      const scnSizeX = sceneBounds.max[0] - sceneBounds.min[0]
      const scnSizeY = sceneBounds.max[1] - sceneBounds.min[1]
      const scnCenterX = (sceneBounds.min[0] + sceneBounds.max[0]) / 2
      const scnCenterY = (sceneBounds.min[1] + sceneBounds.max[1]) / 2

      // Uniform fit: match the smaller of the X/Y scale ratios so the FBX
      // sits inside the scene footprint without distorting aspect.
      const sx = scnSizeX / Math.max(fbxSize.x, 1e-3)
      const sy = scnSizeY / Math.max(fbxSize.y, 1e-3)
      const fit = Math.min(sx, sy) * scale
      c.scale.setScalar(fit)
      c.updateMatrixWorld(true)

      const sb = new THREE.Box3().setFromObject(c)
      const sc = sb.getCenter(new THREE.Vector3())
      c.position.set(
        scnCenterX - sc.x,
        scnCenterY - sc.y,
        sceneBounds.min[2] - sb.min.z,
      )
      c.updateMatrixWorld(true)

      console.log(
        `[FbxModel] auto-fit · raw bbox ${fbxSize.x.toFixed(2)}×${fbxSize.y.toFixed(2)}×${fbxSize.z.toFixed(2)}` +
        ` · scene ${scnSizeX.toFixed(2)}×${scnSizeY.toFixed(2)} · scale=${fit.toFixed(4)}`,
      )
    } else if (!autoFit) {
      c.scale.setScalar(scale)
    }

    return c
  }, [fbx, sceneBounds, yUpToZUp, autoFit, scale])

  return <primitive object={cloned} />
}

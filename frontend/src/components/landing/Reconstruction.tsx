"use client"
import { useEffect, useRef, useState } from "react"
import * as THREE from "three"

/**
 * Dummy live reconstruction preview.
 * Particles stream into a shoebox-room shape over ~12s, simulating
 * the SfM → MVS → fusion → segmentation pipeline.
 */
export default function Reconstruction({
  trigger,
  label,
}: {
  trigger: number
  label: string | null
}) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState("awaiting input")
  const [points, setPoints] = useState(0)
  const targetRef = useRef(0)
  const progressRef = useRef(0)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let W = mount.clientWidth
    let H = mount.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H, false)
    renderer.setClearColor(0x000000, 1)
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;"

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x000000, 8, 24)
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100)
    camera.position.set(7, 5, 9)
    camera.lookAt(0, 1, 0)

    const TARGET = 9000
    const targets = new Float32Array(TARGET * 3)
    const colorsT = new Float32Array(TARGET * 3)

    const ROOM_X = 6, ROOM_Z = 5, ROOM_Y = 3
    for (let i = 0; i < TARGET; i++) {
      const r = Math.random()
      let x: number, y: number, z: number
      if (r < 0.22) {
        x = (Math.random() - 0.5) * ROOM_X; y = Math.random() * 0.04
        z = (Math.random() - 0.5) * ROOM_Z
      } else if (r < 0.44) {
        x = (Math.random() - 0.5) * ROOM_X; y = ROOM_Y - Math.random() * 0.04
        z = (Math.random() - 0.5) * ROOM_Z
      } else if (r < 0.6) {
        x = (Math.random() - 0.5) * ROOM_X; y = Math.random() * ROOM_Y
        z = -ROOM_Z / 2 + Math.random() * 0.04
      } else if (r < 0.74) {
        x = (Math.random() - 0.5) * ROOM_X; y = Math.random() * ROOM_Y
        z = ROOM_Z / 2 - Math.random() * 0.04
        if (Math.abs(x) < 0.6 && y < 2.0) x += (x < 0 ? -1 : 1) * 1.4
      } else if (r < 0.87) {
        x = -ROOM_X / 2 + Math.random() * 0.04; y = Math.random() * ROOM_Y
        z = (Math.random() - 0.5) * ROOM_Z
        if (z > -1 && z < 1 && y > 1 && y < 2.4 && Math.random() < 0.7) y = Math.random()
      } else {
        x = ROOM_X / 2 - Math.random() * 0.04; y = Math.random() * ROOM_Y
        z = (Math.random() - 0.5) * ROOM_Z
      }
      targets[i * 3] = x; targets[i * 3 + 1] = y; targets[i * 3 + 2] = z

      const accent = Math.random() < 0.06
      if (accent) {
        colorsT[i * 3] = 0.0; colorsT[i * 3 + 1] = 0.83; colorsT[i * 3 + 2] = 1.0
      } else {
        const lum = 0.55 + Math.random() * 0.35
        colorsT[i * 3] = lum; colorsT[i * 3 + 1] = lum; colorsT[i * 3 + 2] = lum
      }
    }

    const positions = new Float32Array(TARGET * 3)
    const colorsLive = new Float32Array(TARGET * 3)
    const scales = new Float32Array(TARGET)
    for (let i = 0; i < TARGET; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 24
      positions[i * 3 + 1] = (Math.random() - 0.5) * 24
      positions[i * 3 + 2] = (Math.random() - 0.5) * 24
      scales[i] = 0
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geo.setAttribute("aColor", new THREE.BufferAttribute(colorsLive, 3))
    geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1))

    const mat = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: renderer.getPixelRatio() } },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aScale;
        varying vec3 vColor;
        varying float vScale;
        uniform float uPx;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (1.4 + aScale * 1.6) * uPx * (220.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vColor = aColor;
          vScale = aScale;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vScale;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float a = pow(1.0 - d * 2.0, 1.4) * vScale;
          gl_FragColor = vec4(vColor * (0.6 + a), a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const cloud = new THREE.Points(geo, mat)
    scene.add(cloud)

    const grid = new THREE.GridHelper(20, 20, 0x123040, 0x081820)
    grid.position.y = -0.01
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.5
    scene.add(grid)

    const stages = [
      { p: 0.0, label: "awaiting input" },
      { p: 0.05, label: "extracting frames" },
      { p: 0.18, label: "feature matching · sift + superpoint" },
      { p: 0.36, label: "structure-from-motion · solving poses" },
      { p: 0.55, label: "depth estimation · streamvggt v1" },
      { p: 0.75, label: "fusing into point cloud" },
      { p: 0.9, label: "segmenting walls / doors / windows" },
      { p: 1.0, label: "reconstruction complete" },
    ]

    let theta = 0
    let raf = 0
    function tick() {
      theta += 0.0018
      camera.position.x = Math.sin(theta) * 9
      camera.position.z = Math.cos(theta) * 9
      camera.position.y = 5 + Math.sin(theta * 0.5) * 0.4
      camera.lookAt(0, 1.2, 0)

      progressRef.current += (targetRef.current - progressRef.current) * 0.018
      if (Math.abs(targetRef.current - progressRef.current) < 0.001)
        progressRef.current = targetRef.current
      const p = progressRef.current
      const filled = Math.floor(p * TARGET)

      for (let i = 0; i < TARGET; i++) {
        const idx = i * 3
        const want = i < filled
        const tx = want ? targets[idx] : positions[idx]
        const ty = want ? targets[idx + 1] : positions[idx + 1]
        const tz = want ? targets[idx + 2] : positions[idx + 2]
        positions[idx] += (tx - positions[idx]) * 0.04
        positions[idx + 1] += (ty - positions[idx + 1]) * 0.04
        positions[idx + 2] += (tz - positions[idx + 2]) * 0.04
        colorsLive[idx] = colorsT[idx] * (want ? 1 : 0.2)
        colorsLive[idx + 1] = colorsT[idx + 1] * (want ? 1 : 0.2)
        colorsLive[idx + 2] = colorsT[idx + 2] * (want ? 1 : 0.2)
        scales[i] += ((want ? 1 : 0) - scales[i]) * 0.06
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.aColor.needsUpdate = true
      geo.attributes.aScale.needsUpdate = true

      setProgress(p)
      setPoints(filled)
      let s = stages[0]
      for (const x of stages) if (p >= x.p) s = x
      setStage(s.label)

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    function onResize() {
      W = mount.clientWidth
      H = mount.clientHeight
      renderer.setSize(W, H, false)
      camera.aspect = W / H
      camera.updateProjectionMatrix()
    }
    window.addEventListener("resize", onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", onResize)
      mount.removeChild(renderer.domElement)
      geo.dispose()
      mat.dispose()
      renderer.dispose()
    }
  }, [])

  // kick reconstruction on trigger change
  useEffect(() => {
    if (trigger > 0) {
      progressRef.current = 0
      targetRef.current = 1.0
    }
  }, [trigger])

  return (
    <div className="border border-border bg-surface flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[11px] tracking-widest text-dim">
        <span className="text-cyan">live reconstruction</span>
        <span>
          {points.toLocaleString()} pts · {(progress * 100).toFixed(0)}%
        </span>
      </div>
      <div ref={mountRef} className="h-80 bg-black" />
      <div className="flex items-center gap-4 border-t border-border px-4 py-3 text-[11px] text-dim">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-gradient-to-r from-cyan to-cyan/70 transition-all duration-300"
            style={{
              width: `${progress * 100}%`,
              boxShadow: "0 0 12px #00d4ff",
            }}
          />
        </div>
        <span>{label ? `${label} · ${stage}` : stage}</span>
      </div>
    </div>
  )
}

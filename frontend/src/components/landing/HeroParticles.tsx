"use client"
import { useEffect, useRef } from "react"
import * as THREE from "three"
import { SimplexNoise } from "three/addons/math/SimplexNoise.js"

/**
 * Hero particle background — port of fading-star/nebulaSketch.
 * 3D simplex flow-field, additive blend, cyan/violet recolor.
 */
export default function HeroParticles() {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let W = mount.clientWidth
    let H = mount.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H, false)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;"

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0, 10)
    camera.position.z = 1

    const COUNT = 16000
    const NOISE_STEPS = 6
    const TAU = Math.PI * 2
    const SEED_RADIUS = 280

    const simplex = new SimplexNoise()

    const X = new Float32Array(COUNT)
    const Y = new Float32Array(COUNT)
    const VX = new Float32Array(COUNT)
    const VY = new Float32Array(COUNT)
    const L = new Float32Array(COUNT)
    const TTL = new Float32Array(COUNT)
    const VC = new Float32Array(COUNT)

    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    const alphas = new Float32Array(COUNT)

    function reset(i: number) {
      const theta = Math.random() * TAU
      const r = Math.random() * SEED_RADIUS
      X[i] = r * Math.cos(theta)
      Y[i] = r * Math.sin(theta)
      VX[i] = 0
      VY[i] = 0
      L[i] = 0
      TTL[i] = 100 + Math.random() * 200
      VC[i] = 1 + Math.random() * 9
    }
    for (let i = 0; i < COUNT; i++) reset(i)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3))
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1))

    const mat = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: renderer.getPixelRatio() }, uSize: { value: 2.4 } },
      vertexShader: `
        uniform float uPx;
        uniform float uSize;
        attribute vec3 aColor;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * uPx;
          vColor = aColor;
          vAlpha = aAlpha;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float f = pow(1.0 - d * 2.0, 1.2);
          float a = f * vAlpha;
          gl_FragColor = vec4(vColor * a * 1.8, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const points = new THREE.Points(geo, mat)
    scene.add(points)

    let tick = 0
    let raf = 0

    function step() {
      tick++
      const halfW = W / 2
      const halfH = H / 2
      const t = tick * 0.00025

      for (let i = 0; i < COUNT; i++) {
        const l = (L[i] += 1)
        const ttl = TTL[i]
        let x = X[i]
        let y = Y[i]

        const alive =
          l < ttl && x > -halfW + 1 && x < halfW - 1 && y > -halfH + 1 && y < halfH - 1
        if (!alive) {
          reset(i)
          positions[i * 3] = X[i]
          positions[i * 3 + 1] = Y[i]
          positions[i * 3 + 2] = 0
          alphas[i] = 0
          continue
        }

        const n = simplex.noise3d(x * 0.0025, y * 0.00125, t) * TAU * NOISE_STEPS
        let vx = VX[i]
        let vy = VY[i]
        const vc = VC[i]
        vx += (Math.cos(n) * vc - vx) * 0.015
        vy += (Math.sin(n) * vc - vy) * 0.015
        x += vx
        y += vy
        X[i] = x
        Y[i] = y
        VX[i] = vx
        VY[i] = vy

        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = 0

        // cyan/violet gradient by life
        const phase = l / ttl
        const cyan = 1 - phase * 0.4
        const violet = phase * 0.5
        colors[i * 3] = violet * 0.5
        colors[i * 3 + 1] = cyan * 0.55
        colors[i * 3 + 2] = 0.7 + cyan * 0.3

        alphas[i] = Math.sin((Math.PI * l) / ttl)
      }

      geo.attributes.position.needsUpdate = true
      geo.attributes.aColor.needsUpdate = true
      geo.attributes.aAlpha.needsUpdate = true
    }

    function loop() {
      step()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()

    function onResize() {
      W = mount.clientWidth
      H = mount.clientHeight
      renderer.setSize(W, H, false)
      camera.left = -W / 2
      camera.right = W / 2
      camera.top = H / 2
      camera.bottom = -H / 2
      camera.updateProjectionMatrix()
      mat.uniforms.uPx.value = renderer.getPixelRatio()
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

  return <div ref={mountRef} className="absolute inset-0 -z-10" />
}

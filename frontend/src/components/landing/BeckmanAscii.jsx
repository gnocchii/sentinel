"use client"
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import { Video2Ascii } from '@/lib/video2ascii.mjs'

export default function BeckmanAscii({ glbUrl = '/beckman.glb' }) {
  const wrapRef = useRef(null)

  useEffect(() => {
    const W = 1280, H = 720
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    canvas.style.cssText =
      'position:absolute;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0;pointer-events:none;'
    document.body.appendChild(canvas)

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(1)
    renderer.setSize(W, H, false)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.6
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    scene.fog = new THREE.Fog(0x000000, 400, 1200)

    const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 2000)

    scene.add(new THREE.HemisphereLight(0xff5cc8, 0x4a00b8, 0.9))
    const sun = new THREE.DirectionalLight(0xffffff, 0.35)
    sun.position.set(120, 300, 90)
    scene.add(sun)
    const rim = new THREE.DirectionalLight(0xffffff, 0.15)
    rim.position.set(-200, 150, -200)
    scene.add(rim)

    const NEON = [
      0xff2bd6,
      0x00f0ff,
      0xb700ff,
      0x39ff14,
      0xff6a00,
      0xffd400,
    ]
    const neonLights = NEON.map((color, i) => {
      const l = new THREE.PointLight(color, 36, 1200, 0.6)
      l.userData.phase = (i / NEON.length) * Math.PI * 2
      l.userData.r = 80 + (i % 3) * 40
      l.userData.h = 14 + (i * 9) % 36
      scene.add(l)
      return l
    })

    const BECKMAN = new THREE.Vector3(-17.95, 1.76, 16.85)
    const ORBIT_RADIUS = 230
    const ORBIT_HEIGHT = 70
    const ORBIT_PERIOD = 32
    const LOOK_TARGET = new THREE.Vector3(BECKMAN.x, BECKMAN.y - 22, BECKMAN.z)

    const loader = new GLTFLoader()
    loader.load(glbUrl, (gltf) => {
      const model = gltf.scene
      const bbox = new THREE.Box3().setFromObject(model)
      const center = bbox.getCenter(new THREE.Vector3())
      model.position.x -= center.x
      model.position.z -= center.z
      model.position.y -= bbox.min.y
      model.traverse((node) => {
        if (node.isMesh && node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material]
          for (const m of mats) {
            if (m.color) m.color.lerp(new THREE.Color(0xffffff), 0.5)
            if ('roughness' in m) m.roughness = 0.35
            if ('metalness' in m) m.metalness = 0.25
            m.needsUpdate = true
          }
        }
      })
      scene.add(model)
    }, undefined, (err) => console.error('[beckman.glb load error]', err))

    let sentinelMesh = null

    camera.position.set(BECKMAN.x + ORBIT_RADIUS, BECKMAN.y + ORBIT_HEIGHT, BECKMAN.z)
    camera.lookAt(BECKMAN)
    renderer.render(scene, camera)

    const stream = canvas.captureStream(30)

    let raf = 0
    const t0 = performance.now()
    const tick = (now) => {
      const t = (now - t0) / 1000
      const angle = (t / ORBIT_PERIOD) * Math.PI * 2
      camera.position.set(
        BECKMAN.x + Math.cos(angle) * ORBIT_RADIUS,
        BECKMAN.y + ORBIT_HEIGHT,
        BECKMAN.z + Math.sin(angle) * ORBIT_RADIUS,
      )
      camera.lookAt(LOOK_TARGET)
      if (sentinelMesh) sentinelMesh.lookAt(camera.position)
      for (const l of neonLights) {
        const a = l.userData.phase + t * 0.3
        l.position.set(
          BECKMAN.x + Math.cos(a) * l.userData.r,
          BECKMAN.y + l.userData.h + Math.sin(t * 0.6 + l.userData.phase) * 6,
          BECKMAN.z + Math.sin(a) * l.userData.r,
        )
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    let videoEl = null
    let attached = false
    const tryPlay = () => {
      if (!videoEl) return
      if (videoEl.paused) videoEl.play().catch(() => {})
    }
    const kickResize = () => {
      const inner = wrapRef.current?.querySelector('.video-to-ascii > div')
      if (inner) {
        const prev = inner.style.width
        inner.style.width = '99.999%'
        requestAnimationFrame(() => {
          requestAnimationFrame(() => { inner.style.width = prev })
        })
      }
      window.dispatchEvent(new Event('resize'))
    }
    const attach = () => {
      if (attached) return true
      const v = wrapRef.current?.querySelector('video')
      if (!v) return false
      videoEl = v
      v.srcObject = stream
      v.removeAttribute('src')
      v.muted = true
      v.playsInline = true
      v.autoplay = true
      const onLoaded = () => { kickResize(); tryPlay() }
      const onPlaying = () => { kickResize() }
      v.addEventListener('loadedmetadata', onLoaded, { once: true })
      v.addEventListener('playing', onPlaying, { once: true })
      tryPlay()
      attached = true
      setTimeout(kickResize, 200)
      setTimeout(kickResize, 600)
      setTimeout(kickResize, 1500)
      return true
    }
    const attachInterval = setInterval(() => { if (attach()) clearInterval(attachInterval) }, 50)

    const onUserKick = () => tryPlay()
    const onVisibility = () => { if (!document.hidden) tryPlay() }
    document.addEventListener('pointerdown', onUserKick)
    document.addEventListener('keydown', onUserKick)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onUserKick)

    const watchdog = setInterval(() => {
      if (!videoEl) return
      if (videoEl.paused || videoEl.readyState < 2) tryPlay()
    }, 1000)

    let lastUserMove = performance.now()
    let idleRaf = 0
    const IDLE_DELAY = 1800
    const onRealMove = () => {
      lastUserMove = performance.now()
      if (idleRaf) { cancelAnimationFrame(idleRaf); idleRaf = 0 }
    }
    window.addEventListener('mousemove', onRealMove, { passive: true })

    const SWEEP_PERIOD_MS = 14000
    const SWEEPS = 3
    const idleStart = performance.now()
    const idleTick = (now) => {
      if (now - lastUserMove > IDLE_DELAY) {
        const container = wrapRef.current?.querySelector('.video-to-ascii > div')
        if (container) {
          const rect = container.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            const padX = rect.width * 0.08
            const padY = rect.height * 0.12
            const innerW = rect.width  - padX * 2
            const innerH = rect.height - padY * 2

            const u = ((now - idleStart) % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS
            const yPhase = u * 2
            const yBase = yPhase <= 1 ? yPhase : 2 - yPhase
            const yT = 0.5 - 0.5 * Math.cos(yBase * Math.PI)
            const y = rect.top + padY + innerH * yT
            const xT = 0.5 + 0.5 * Math.sin(u * SWEEPS * Math.PI * 2)
            const x = rect.left + padX + innerW * xT

            container.dispatchEvent(new MouseEvent('mousemove', {
              clientX: x, clientY: y, bubbles: true, cancelable: true,
            }))
          }
        }
      }
      idleRaf = requestAnimationFrame(idleTick)
    }
    idleRaf = requestAnimationFrame(idleTick)

    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(idleRaf)
      window.removeEventListener('mousemove', onRealMove)
      clearInterval(attachInterval)
      clearInterval(watchdog)
      document.removeEventListener('pointerdown', onUserKick)
      document.removeEventListener('keydown', onUserKick)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onUserKick)
      renderer.dispose()
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
    }
  }, [glbUrl])

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%' }}>
      <Video2Ascii
        src=""
        numColumns={240}
        charset="detailed"
        colored={true}
        brightness={0.7}
        highlight={45}
        autoPlay={true}
        isPlaying={true}
        enableMouse={true}
        trailLength={120}
      />
    </div>
  )
}

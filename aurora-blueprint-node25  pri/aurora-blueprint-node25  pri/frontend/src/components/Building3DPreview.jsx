// src/components/Building3DPreview.jsx
import React, { useEffect, useRef, useState } from "react"
import * as THREE from "three"

/**
 * 3D Building Preview
 * Supports:
 *  - Per-room surface colors: floor, leftWall, rightWall, ceiling
 *  - Export PNG without black screen (preserveDrawingBuffer enabled)
 *  - Automatic layout based on blueprint bounding boxes
 */

function Building3DPreview({
  areas = [],
  colorsById = {},
  surfaceColorsById = {},
  imageWidth,
  imageHeight,
}) {
  const canvasRef = useRef(null)
  const [mode, setMode] = useState("ai") // ai | original

  useEffect(() => {
    if (!canvasRef.current || !areas.length) return

    /* ---------------------------------------------------
     * Compute blueprint bounds for positioning rooms
     * --------------------------------------------------- */
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity

    areas.forEach((area) => {
      const b = area.bbox || {}
      if (!b.width || !b.height) return
      minX = Math.min(minX, b.x)
      minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.width)
      maxY = Math.max(maxY, b.y + b.height)
    })

    const planWidth = maxX - minX
    const planHeight = maxY - minY
    const maxDim = Math.max(planWidth, planHeight) || 1
    const scale = maxDim / 6

    /* ---------------------------------------------------
     * Setup Three.js renderer
     * --------------------------------------------------- */
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      preserveDrawingBuffer: true, // ❤️ FIX: enable PNG export
      alpha: false,
    })
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    renderer.setClearColor("#f3f4f6", 1) // ❤️ FIX: no transparent bg

    const W = canvasRef.current.clientWidth || 800
    const H = canvasRef.current.clientHeight || 360
    renderer.setSize(W, H, false)

    /* ---------------------------------------------------
     * Scene / Camera / Lights
     * --------------------------------------------------- */
    const scene = new THREE.Scene()
    scene.background = new THREE.Color("#f3f4f6")

    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100)
    camera.position.set(4, 4, 4)
    camera.lookAt(0, 0.6, 0)

    const ambient = new THREE.AmbientLight(0xffffff, 0.95)
    const dir = new THREE.DirectionalLight(0xffffff, 0.9)
    dir.position.set(6, 7, 5)
    scene.add(ambient, dir)

    const root = new THREE.Group()
    scene.add(root)

    /* ---------------------------------------------------
     * Ground Slab
     * --------------------------------------------------- */
    const slabGeom = new THREE.BoxGeometry(planWidth / scale + 0.9, 0.05, planHeight / scale + 0.9)
    const slabMat = new THREE.MeshPhongMaterial({ color: "#e5e7eb", shininess: 4 })
    const slab = new THREE.Mesh(slabGeom, slabMat)
    slab.position.y = -0.03
    root.add(slab)

    /* ---------------------------------------------------
     * Building Shell
     * --------------------------------------------------- */
    const shellW = planWidth / scale
    const shellD = planHeight / scale
    const shellH = 1.2

    const shellGeom = new THREE.BoxGeometry(shellW, shellH, shellD)
    const shellMat = new THREE.MeshPhongMaterial({
      color: "#d4d4d8",
      transparent: true,
      opacity: 0.78,
    })
    const building = new THREE.Mesh(shellGeom, shellMat)
    building.position.y = shellH / 2
    root.add(building)

    /* ---------------------------------------------------
     * Rooms (colored blocks with faces)
     * --------------------------------------------------- */
    const roomEntries = []

    areas.forEach((area) => {
      const b = area.bbox
      if (!b || !b.width || !b.height) return

      const w = Math.max(0.01, b.width / scale)
      const d = Math.max(0.01, b.height / scale)
      const h = Math.max(0.4, Math.min(1.2, Math.min(w, d) * 0.45))

      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2

      const worldX = (cx - (minX + planWidth / 2)) / scale
      const worldZ = -(cy - (minY + planHeight / 2)) / scale

      const defaultCol = colorsById[area.id] || "#c6b49a"
      const surf = surfaceColorsById[area.id] || {}
      const floorCol = surf.floor || defaultCol
      const leftCol = surf.leftWall || shadeHex(defaultCol, -0.12)
      const rightCol = surf.rightWall || shadeHex(defaultCol, -0.20)
      const ceilCol = surf.ceiling || shadeHex(defaultCol, +0.18)

      const mats = [
        new THREE.MeshPhongMaterial({ color: rightCol }), // +X
        new THREE.MeshPhongMaterial({ color: leftCol }),  // -X
        new THREE.MeshPhongMaterial({ color: ceilCol }),  // +Y ceiling
        new THREE.MeshPhongMaterial({ color: floorCol }), // -Y floor
        new THREE.MeshPhongMaterial({ color: shadeHex(defaultCol, -0.05) }), // +Z
        new THREE.MeshPhongMaterial({ color: shadeHex(defaultCol, -0.08) }), // -Z
      ]

      const geom = new THREE.BoxGeometry(w, h, d)
      const mesh = new THREE.Mesh(geom, mats)
      mesh.position.set(worldX, h / 2, worldZ)
      root.add(mesh)

      roomEntries.push({ geom, mats, mesh })
    })

    /* ---------------------------------------------------
     * Animation
     * --------------------------------------------------- */
    let frame = 0
    let raf
    const animate = () => {
      raf = requestAnimationFrame(animate)
      frame++
      root.rotation.y += 0.0035
      renderer.render(scene, camera)
    }
    animate()

    /* ---------------------------------------------------
     * Resize Handler
     * --------------------------------------------------- */
    const onResize = () => {
      const Wn = canvasRef.current.clientWidth || W
      const Hn = canvasRef.current.clientHeight || H
      camera.aspect = Wn / Hn
      camera.updateProjectionMatrix()
      renderer.setSize(Wn, Hn, false)
    }
    window.addEventListener("resize", onResize)

    /* ---------------------------------------------------
     * Cleanup
     * --------------------------------------------------- */
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", onResize)

      roomEntries.forEach((r) => {
        r.geom.dispose()
        r.mats.forEach((m) => m.dispose())
        root.remove(r.mesh)
      })

      slabGeom.dispose()
      slabMat.dispose()
      shellGeom.dispose()
      shellMat.dispose()
      renderer.dispose()
    }
  }, [areas, surfaceColorsById, colorsById, imageWidth, imageHeight, mode])

  if (!areas.length) return null

  /* ---------------------------------------------------
   * Download button
   * --------------------------------------------------- */
  const downloadPng = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement("a")
    link.download = "building-3d.png"
    link.href = canvas.toDataURL("image/png")
    link.click()
  }

  return (
    <div className="mt-10 bg-white rounded-3xl shadow-lg p-6">
      <div className="flex justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">3D Building Preview</h2>
          <p className="text-[11px] text-slate-500">
            Drag to rotate · Scroll to zoom · Surface colors fully applied.
          </p>
        </div>

        <button
          type="button"
          onClick={downloadPng}
          className="px-4 py-1 text-xs rounded-full bg-slate-900 text-white font-semibold"
        >
          Download PNG
        </button>
      </div>

      <div className="w-full h-72 bg-slate-100 rounded-2xl overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  )
}

/* ---------------------------------------------------
 * Color helpers
 * --------------------------------------------------- */
function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function hexToRgb(hex) {
  hex = hex.replace("#", "")
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("")
  const num = parseInt(hex, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    clamp(r).toString(16).padStart(2, "0") +
    clamp(g).toString(16).padStart(2, "0") +
    clamp(b).toString(16).padStart(2, "0")
  )
}

function shadeHex(hex, amount = 0.1) {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex(r + 255 * amount, g + 255 * amount, b + 255 * amount)
}

export default Building3DPreview

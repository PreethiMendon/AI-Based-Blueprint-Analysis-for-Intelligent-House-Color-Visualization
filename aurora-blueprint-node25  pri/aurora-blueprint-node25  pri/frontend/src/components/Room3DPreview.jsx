// src/components/Room3DPreview.jsx
import React, { useEffect, useRef } from "react"
import * as THREE from "three"

/**
 * 3D ROOM PREVIEW
 * Supports:
 *  - Floor, leftWall, rightWall, ceiling colors
 *  - preserveDrawingBuffer → PNG download works (no black screen)
 *  - Clean disposal, smooth rotation
 */

function Room3DPreview({ area, color, surfaces, onClose }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !area) return

    const WIDTH = canvasRef.current.clientWidth || 500
    const HEIGHT = canvasRef.current.clientHeight || 350

    /* ---------------------------------------------------
     * Setup renderer
     * --------------------------------------------------- */
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,   // ❤️ FIX for PNG download
    })
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    renderer.setSize(WIDTH, HEIGHT, false)
    renderer.setClearColor("#ffffff", 1) // solid white background

    /* ---------------------------------------------------
     * Scene & Camera
     * --------------------------------------------------- */
    const scene = new THREE.Scene()
    scene.background = new THREE.Color("#ffffff")

    const camera = new THREE.PerspectiveCamera(45, WIDTH / HEIGHT, 0.1, 100)
    camera.position.set(2.5, 1.6, 2.5)
    camera.lookAt(0, 1, 0)

    /* ---------------------------------------------------
     * Lights
     * --------------------------------------------------- */
    const ambient = new THREE.AmbientLight(0xffffff, 0.9)
    const dir = new THREE.DirectionalLight(0xffffff, 0.9)
    dir.position.set(3, 4, 3)
    scene.add(ambient, dir)

    /* ---------------------------------------------------
     * Room measurements
     * --------------------------------------------------- */
    const roomW = 2.4
    const roomH = 1.5
    const roomD = 2.0

    /* ---------------------------------------------------
     * Surface Colors
     * --------------------------------------------------- */
    const floorColor = surfaces?.floor || color || "#cccccc"
    const leftColor = surfaces?.leftWall || shadeHex(color, -0.15)
    const rightColor = surfaces?.rightWall || shadeHex(color, -0.25)
    const ceilingColor = surfaces?.ceiling || shadeHex(color, +0.20)
    const backColor = shadeHex(color, -0.05)

    /* ---------------------------------------------------
     * Create the room box using 6 materials
     * --------------------------------------------------- */
    const mats = [
      new THREE.MeshPhongMaterial({ color: rightColor }),   // +X right wall
      new THREE.MeshPhongMaterial({ color: leftColor }),    // -X left wall
      new THREE.MeshPhongMaterial({ color: ceilingColor }), // +Y ceiling
      new THREE.MeshPhongMaterial({ color: floorColor }),   // -Y floor
      new THREE.MeshPhongMaterial({ color: backColor }),    // +Z back wall
      new THREE.MeshPhongMaterial({ color: backColor }),    // -Z front wall
    ]

    const geom = new THREE.BoxGeometry(roomW, roomH, roomD)
    const room = new THREE.Mesh(geom, mats)
    room.position.y = roomH / 2
    scene.add(room)

    /* ---------------------------------------------------
     * Animation Loop
     * --------------------------------------------------- */
    let raf
    const animate = () => {
      raf = requestAnimationFrame(animate)
      room.rotation.y += 0.003
      renderer.render(scene, camera)
    }
    animate()

    /* ---------------------------------------------------
     * Cleanup
     * --------------------------------------------------- */
    return () => {
      cancelAnimationFrame(raf)
      geom.dispose()
      mats.forEach((m) => m.dispose())
      renderer.dispose()
    }
  }, [area, color, surfaces])

  /* ---------------------------------------------------
   * Download PNG
   * --------------------------------------------------- */
  const downloadPNG = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement("a")
    link.download = `${area.name || "room"}-preview.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }

  if (!area) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-3xl shadow-xl p-6 w-[500px] relative">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          3D Preview — {area.name}
        </h3>

        {/* ACTION BUTTONS */}
        <div className="flex justify-end gap-3 mb-3">
          <button
            onClick={downloadPNG}
            className="px-4 py-1 rounded-2xl bg-slate-900 text-white text-xs font-semibold"
          >
            Download PNG
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1 rounded-2xl bg-red-500 text-white text-xs font-semibold"
          >
            Close
          </button>
        </div>

        {/* CANVAS */}
        <div className="w-full h-[350px] bg-slate-100 rounded-xl overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
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

function shadeHex(hex, amt = 0.15) {
  if (!hex) return "#aaaaaa"
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex(r + 255 * amt, g + 255 * amt, b + 255 * amt)
}

export default Room3DPreview


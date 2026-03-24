// src/App.jsx
import React, { useState } from "react"
import axios from "axios"

import BlueprintCanvas from "./components/BlueprintCanvas"
import RoomList from "./components/RoomList"
import UploadPanel from "./components/UploadPanel"
import Room3DPreview from "./components/Room3DPreview"
import Building3DPreview from "./components/Building3DPreview"
import ColorSelectionPanel from "./components/ColorSelectionPanel"
import DownloadOptions from "./components/DownloadOptions"
import TotalBudget from "./components/TotalBudget"

/* ----------------- Small color helpers (local, safe) ----------------- */
function clamp(v, a = 0, b = 255) {
  return Math.max(a, Math.min(b, Math.round(v)))
}
function hexToRgb(hex) {
  if (!hex) return { r: 128, g: 128, b: 128 }
  let h = hex.replace("#", "")
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  const num = parseInt(h, 16)
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
function shiftHueFallback(hex, frac) {
  const c = hexToRgb(hex || "#888888")
  const adj = (v) => clamp(v + Math.round(255 * frac * 0.45))
  return rgbToHex(adj(c.r), adj(c.g), adj(c.b))
}

/* ----------------- Palettes & AI helpers ----------------- */

const SHADES_PER_PALETTE = 50

function generateShades(lightHex, darkHex, count) {
  const s = hexToRgb(lightHex)
  const e = hexToRgb(darkHex)
  const out = []
  if (!count || count <= 1) return [lightHex]
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const r = s.r + (e.r - s.r) * t
    const g = s.g + (e.g - s.g) * t
    const b = s.b + (e.b - s.b) * t
    out.push(rgbToHex(r, g, b))
  }
  return out
}

/* ----------------- UPDATED 15-TONE PALETTE ----------------- */
function getPalettesForArea(name = "") {
  const n = (name || "").toLowerCase()

  const warm = {
    title: "Warm Embrace",
    colors: generateShades("#FFF8EC", "#AD3900", SHADES_PER_PALETTE),
  }
  const cozyNeutrals = {
    title: "Cozy Neutrals",
    colors: generateShades("#F7F4ED", "#281D12", SHADES_PER_PALETTE),
  }
  const coolBreeze = {
    title: "Cool Breeze",
    colors: generateShades("#F3FAFF", "#0F3868", SHADES_PER_PALETTE),
  }
  const sereneNight = {
    title: "Serene Night",
    colors: generateShades("#F6F4FF", "#351F77", SHADES_PER_PALETTE),
  }
  const spaFresh = {
    title: "Spa Fresh",
    colors: generateShades("#F2FBF7", "#0F4637", SHADES_PER_PALETTE),
  }
  const cleanWhite = {
    title: "Clean Minimal",
    colors: generateShades("#FFFFFF", "#111827", SHADES_PER_PALETTE),
  }

  /* ---- NEW 9 TONES ---- */
  const forestHaven = {
    title: "Forest Haven",
    colors: generateShades("#EEF7EC", "#144D1A", SHADES_PER_PALETTE),
  }
  const sunsetGlow = {
    title: "Sunset Glow",
    colors: generateShades("#FFE9D9", "#A33A00", SHADES_PER_PALETTE),
  }
  const royalHeritage = {
    title: "Royal Heritage",
    colors: generateShades("#F4EEFF", "#2E0066", SHADES_PER_PALETTE),
  }
  const mistyLavender = {
    title: "Misty Lavender",
    colors: generateShades("#F8F4FF", "#4B1B7A", SHADES_PER_PALETTE),
  }
  const deepOcean = {
    title: "Deep Ocean",
    colors: generateShades("#EAF8FF", "#002F5F", SHADES_PER_PALETTE),
  }
  const frostedMint = {
    title: "Frosted Mint",
    colors: generateShades("#EDFFF4", "#004D33", SHADES_PER_PALETTE),
  }
  const modernUrban = {
    title: "Modern Urban",
    colors: generateShades("#F2F2F2", "#2C2C2C", SHADES_PER_PALETTE),
  }
  const rusticClay = {
    title: "Rustic Clay",
    colors: generateShades("#FFF2E6", "#7A3B00", SHADES_PER_PALETTE),
  }
  const goldenHour = {
    title: "Golden Hour",
    colors: generateShades("#FFF7E1", "#B27300", SHADES_PER_PALETTE),
  }

  return [
    warm,
    cozyNeutrals,
    coolBreeze,
    sereneNight,
    spaFresh,
    cleanWhite,
    forestHaven,
    sunsetGlow,
    royalHeritage,
    mistyLavender,
    deepOcean,
    frostedMint,
    modernUrban,
    rusticClay,
    goldenHour,
  ]
}

/* deterministic lightweight hash -> 32-bit int */
function hashStringToInt(str) {
  let h = 2166136261 >>> 0
  if (!str) return h
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}
function seededRandom01(seed) {
  let x = (seed >>> 0) || 1
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  x = x >>> 0
  return (x % 1000000) / 1000000
}

/* pickPaletteForArea unchanged */
function pickPaletteForArea(areaName, variantIndex = 0, blueprintSeed = 0) {
  const opts = getPalettesForArea(areaName)
  if (!opts || opts.length === 0) return { title: "AI Palette", colors: [] }
  const selector = ((blueprintSeed || 0) + variantIndex) >>> 0
  const baseIdx = selector % opts.length
  const base = opts[baseIdx]
  const hueShift = (seededRandom01(selector) - 0.5) * 0.12
  const shifted = base.colors.map((c, idx) => {
    const s = selector + idx * 17
    const localShift = (seededRandom01(s) - 0.5) * 0.12 + hueShift
    try {
      return shiftHueFallback(c, localShift)
    } catch (e) {
      return c
    }
  })
  return { title: `${base.title} (v${baseIdx + 1})`, colors: shifted }
}

/* AI shading by room size */
function chooseShadeByRoomSize(area, colors, imageWidth, imageHeight) {
  if (!area || !area.bbox || !colors?.length || !imageWidth || !imageHeight) {
    return (colors && colors[Math.floor(colors.length / 2)]) || "#A0AEC0"
  }
  const box = (area.bbox.width || 0) * (area.bbox.height || 0)
  const imgArea = imageWidth * imageHeight || 1
  const rawRatio = box / imgArea
  const normalized = Math.max(0, Math.min(rawRatio / 0.35, 1))
  const maxIndex = colors.length - 1
  const idx = Math.round(normalized * maxIndex)
  return colors[idx] ?? colors[maxIndex]
}

/* ----------------- App ----------------- */

function App() {
  const [hasStarted, setHasStarted] = useState(false)
  const [userName, setUserName] = useState("")
  const [imageUrl, setImageUrl] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [selectedAreaId, setSelectedAreaId] = useState(null)

  const [colorsById, setColorsById] = useState({})
  const [surfaceColorsById, setSurfaceColorsById] = useState({})

  const [paletteArea, setPaletteArea] = useState(null)
  const [paletteName, setPaletteName] = useState("")
  const [paletteColors, setPaletteColors] = useState([])
  const [paletteVariant, setPaletteVariant] = useState(0)

  const [paletteTarget, setPaletteTarget] = useState("floor")
  const SURFACE_ORDER = ["floor", "leftWall", "rightWall", "ceiling"]

  const [blueprintSeed, setBlueprintSeed] = useState(0)
  const [previewArea, setPreviewArea] = useState(null)

  const [showBuilding3D, setShowBuilding3D] = useState(false)
  const [showBudget, setShowBudget] = useState(false)

  const handleExit = () => {
    setHasStarted(false)
    setUserName("")
    setImageUrl(null)
    setAnalysis(null)
    setLoading(false)
    setError("")
    setSelectedAreaId(null)
    setColorsById({})
    setSurfaceColorsById({})
    setPreviewArea(null)
    setPaletteArea(null)
    setPaletteName("")
    setPaletteColors([])
    setPaletteVariant(0)
    setPaletteTarget("floor")
    setBlueprintSeed(0)
    setShowBuilding3D(false)
    setShowBudget(false)
    window.scrollTo(0, 0)
  }

  /* -------- upload + analysis -------- */
  const handleUpload = async (file) => {
    if (!file) return
    setError("")
    setLoading(true)
    setSelectedAreaId(null)
    setPreviewArea(null)
    setColorsById({})
    setSurfaceColorsById({})
    setPaletteArea(null)
    setShowBuilding3D(false)
    setShowBudget(false)

    try {
      const form = new FormData()
      form.append("blueprint", file)
      const uploadRes = await axios.post("/api/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      const url = uploadRes.data.url
      setImageUrl(url)

      const seed = hashStringToInt(url || "") % 1000000
      setBlueprintSeed(seed)

      const analyzeRes = await axios.post("/api/analyze", { url })
      setAnalysis(analyzeRes.data)

      const detectedAreas = analyzeRes.data.areas || []
      if (detectedAreas.length > 0) {
        const first = detectedAreas[0]
        setSelectedAreaId(first.id)
        const initialVariant = (seed + (first.id || 0)) % 1000
        const p = pickPaletteForArea(first.name, initialVariant, seed)
        setPaletteVariant(initialVariant)
        setPaletteArea(first)
        setPaletteTarget("floor")
        setPaletteName(p.title)
        setPaletteColors(p.colors)
      }
    } catch (e) {
      console.error(e)
      setError("Failed to analyze blueprint. Please check your backend.")
      setAnalysis(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectArea = (id) => {
    setSelectedAreaId(id)
  }

  const handleOpenColorSelection = (area) => {
    if (!area) return
    const initialVariant = (blueprintSeed + (area.id || 0)) % 1000
    const p = pickPaletteForArea(area.name, initialVariant, blueprintSeed)
    setPaletteVariant(initialVariant)
    setPaletteArea(area)
    setPaletteTarget("floor")
    setPaletteName(p.title)
    setPaletteColors(p.colors)
  }

  const handleRegeneratePalette = () => {
    if (!paletteArea) return
    setPaletteVariant((prev) => {
      const next = (prev || 0) + 1
      const p = pickPaletteForArea(paletteArea.name, next, blueprintSeed || 0)
      setPaletteName(p.title)
      setPaletteColors(p.colors)
      return next
    })
  }

  const handleApplyPaletteColor = (swatchColor = null) => {
    if (!paletteArea || !paletteColors.length) return
    const imgW = analysis?.width || 1
    const imgH = analysis?.height || 1

    const chosen =
      swatchColor || chooseShadeByRoomSize(paletteArea, paletteColors, imgW, imgH)

    setSurfaceColorsById((prev) => {
      const prevEntry = prev[paletteArea.id] || {}
      const updatedEntry = { ...prevEntry, [paletteTarget]: chosen }
      return { ...prev, [paletteArea.id]: updatedEntry }
    })

    if (paletteTarget === "floor") {
      setColorsById((prev) => ({ ...prev, [paletteArea.id]: chosen }))
    }

    const curIndex = SURFACE_ORDER.indexOf(paletteTarget)
    const nextIndex = curIndex + 1

    if (nextIndex < SURFACE_ORDER.length) {
      const nextSurface = SURFACE_ORDER[nextIndex]
      const nextVariant = (paletteVariant || 0) + 1
      const p = pickPaletteForArea(paletteArea.name, nextVariant, blueprintSeed || 0)
      setPaletteVariant(nextVariant)
      setPaletteTarget(nextSurface)
      setPaletteName(p.title)
      setPaletteColors(p.colors)
      return
    }

    if (paletteTarget === "ceiling") {
      setPreviewArea(paletteArea)
      setSelectedAreaId(paletteArea.id)
      setPaletteArea(null)
      setPaletteTarget("floor")
    }
  }

  const areas = analysis?.areas || []
  const currentColor =
    previewArea && colorsById[previewArea.id]
      ? colorsById[previewArea.id]
      : previewArea
      ? "#A0AEC0"
      : "#A0AEC0"

  const currentSurfaces =
    previewArea && surfaceColorsById[previewArea.id]
      ? surfaceColorsById[previewArea.id]
      : null

  /* -------- UI render -------- */
  if (!hasStarted) {
    const canStart = userName.trim().length > 0

    return (
      <div className="w-full max-w-xl mx-auto py-12 px-4">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl shadow-md mb-4">
            🏢
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1 text-center">
            Blueprint Vision
          </h1>
          <p className="text-sm text-slate-500 text-center">
            ✨ AI-Powered Color Visualization
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-lg p-8">
          <p className="text-sm font-semibold text-slate-800 mb-3">
            Welcome! What should we call you?
          </p>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Enter your name"
            className="w-full mb-5 px-4 py-3 rounded-2xl border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
          />

          <button
            type="button"
            disabled={!canStart}
            onClick={() => setHasStarted(true)}
            className={`w-full py-3 rounded-2xl text-sm font-semibold text-white shadow ${
              canStart
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-blue-300 cursor-not-allowed"
            }`}
          >
            Begin Analysis
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl mx-auto py-8 px-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold text-slate-900">
            Hi {userName || "Guest"},
          </h1>
          <p className="text-xs text-slate-500">
            Blueprint Vision · AI-Based Blueprint Analysis for Intelligent House
            Color Visualization
          </p>
        </div>
      </div>

      <UploadPanel onUpload={handleUpload} loading={loading} />

      {error && (
        <div className="mt-4 px-4 py-2 rounded-lg bg-red-100 text-red-700 text-sm">
          {error}
        </div>
      )}

      {analysis && (
        <>
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-6 items-start">
            <BlueprintCanvas
              imageUrl={imageUrl}
              analysis={analysis}
              selectedAreaId={selectedAreaId}
              onSelectArea={handleSelectArea}
              colors={colorsById}
            />

            <RoomList
              areas={areas}
              selectedAreaId={selectedAreaId}
              onSelectArea={handleSelectArea}
              onColorizeArea={handleOpenColorSelection}
              colors={colorsById}
            />
          </div>

          {paletteArea && (
            <ColorSelectionPanel
              area={paletteArea}
              paletteName={paletteName}
              colors={paletteColors}
              target={paletteTarget}
              onBack={() => setPaletteArea(null)}
              onRegenerate={handleRegeneratePalette}
              onApply={(col) => handleApplyPaletteColor(col)}
            />
          )}

          {previewArea && (
            <Room3DPreview
              area={previewArea}
              color={currentColor}
              surfaces={currentSurfaces}
              onClose={() => setPreviewArea(null)}
            />
          )}

          {areas.length > 0 && (
            <>
              <div className="mt-6 flex flex-wrap gap-4 justify-center">
                <button
                  type="button"
                  onClick={() => setShowBuilding3D((p) => !p)}
                  className="px-6 py-2 rounded-2xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 shadow"
                >
                  {showBuilding3D ? "Hide 3D Preview" : "View 3D Preview"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowBudget((p) => !p)}
                  className="px-6 py-2 rounded-2xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 shadow"
                >
                  {showBudget ? "Hide Budget" : "Show Budget"}
                </button>
              </div>

              {showBuilding3D && (
                <Building3DPreview
                  areas={areas}
                  colorsById={colorsById}
                  surfaceColorsById={surfaceColorsById}
                  imageWidth={analysis?.width}
                  imageHeight={analysis?.height}
                />
              )}

              {showBudget && (
                <TotalBudget areas={areas} colorsById={colorsById} />
              )}
            </>
          )}

          <DownloadOptions analysis={analysis} colorsById={colorsById} />
        </>
      )}

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
        <button
          type="button"
          onClick={handleExit}
          className="px-6 py-3 rounded-2xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 shadow-lg"
        >
          Exit
        </button>
      </div>
    </div>
  )
}

export default App

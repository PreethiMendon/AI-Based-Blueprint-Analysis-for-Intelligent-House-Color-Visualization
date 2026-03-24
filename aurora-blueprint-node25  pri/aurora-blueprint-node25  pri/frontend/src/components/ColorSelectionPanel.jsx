// src/components/ColorSelectionPanel.jsx
import React from "react"

function ColorSelectionPanel({
  area,
  paletteName,
  colors = [],
  target = "floor", // "floor" | "leftWall" | "rightWall" | "ceiling"
  onBack,
  onRegenerate,
  onApply,
}) {
  if (!area) return null

  const targetLabel = (() => {
    switch (target) {
      case "leftWall":
        return "Left Wall"
      case "rightWall":
        return "Right Wall"
      case "ceiling":
        return "Ceiling"
      default:
        return "Floor"
    }
  })()

  return (
    <div className="mt-8 bg-white rounded-3xl shadow-lg p-6 sm:p-8">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">
            Color Selection – {targetLabel}
          </h2>
          <p className="text-sm text-slate-500">
            AI-generated palette for{" "}
            <span className="font-semibold text-slate-800">
              {area.name || "Selected Area"}
            </span>{" "}
            ({targetLabel})
          </p>
        </div>

        <button
          type="button"
          onClick={onRegenerate}
          className="px-4 py-2 rounded-2xl bg-orange-500 text-white text-xs sm:text-sm font-semibold shadow hover:bg-orange-600"
        >
          ⟳ Regenerate
        </button>
      </div>

      {/* Palette title */}
      <p className="text-sm font-semibold text-slate-800 mb-3">
        {paletteName || "AI Palette"}
      </p>

      {/* Tone grid */}
      <div className="grid grid-cols-3 gap-4">
        {colors.map((col, idx) => (
          <div key={idx} className="p-3 border rounded-lg">
            <div
              onClick={() => onApply(col)}
              style={{ background: col }}
              className="w-full h-14 rounded-lg cursor-pointer border"
              title={col}
            />
            <div className="mt-2 text-xs text-slate-600">{col}</div>
          </div>
        ))}
      </div>

      {/* Buttons */}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onBack} className="px-4 py-2 border rounded">Back to Areas</button>
        <button onClick={() => onApply(colors[Math.floor(colors.length/2)] ?? '#FFFFFF')} className="px-6 py-2 bg-blue-600 text-white rounded">Apply Color</button>
      </div>
    </div>
  )
}

export default ColorSelectionPanel

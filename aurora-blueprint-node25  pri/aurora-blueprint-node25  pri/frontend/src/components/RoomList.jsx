// src/components/RoomList.jsx
import React from 'react'

function getAreaTypeIcon(name = '') {
  const n = name.toLowerCase()
  if (n.includes('kitchen')) return '🍽️'
  if (n.includes('bath') || n.includes('ensuite')) return '🛁'
  if (n.includes('bed')) return '🛏️'
  if (n.includes('living')) return '🏠'
  return '📐'
}

function RoomList({ areas, selectedAreaId, onSelectArea, onColorizeArea, colors }) {
  const handlePreviewClick = () => {
    if (!areas.length) return
    const area =
      areas.find((a) => a.id === selectedAreaId) || areas[0]
    onColorizeArea?.(area)
  }

  return (
    <div className="bg-white rounded-3xl shadow-lg p-5 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-blue-600 text-lg">🏙️</span>
        <h2 className="text-lg font-semibold text-slate-900">
          Detected Areas
        </h2>
      </div>

      {areas.length === 0 ? (
        <p className="text-sm text-slate-400">
          No areas detected yet. Upload a blueprint to analyze.
        </p>
      ) : (
        <div className="space-y-3 flex-1 overflow-auto">
          {areas.map((area) => {
            const selected = area.id === selectedAreaId
            const color = colors?.[area.id] || '#1D4ED8'
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => onSelectArea?.(area.id)}
                className={`w-full text-left px-4 py-3 rounded-2xl flex items-center gap-3 
                  transition-colors
                  ${selected ? 'bg-blue-50' : 'bg-slate-50 hover:bg-slate-100'}`}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xl"
                  style={{ backgroundColor: color }}
                >
                  {getAreaTypeIcon(area.name)}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-900">
                    {area.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    Click to colorize
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={handlePreviewClick}
        className="mt-4 w-full py-3 rounded-2xl bg-slate-900 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-60"
        disabled={areas.length === 0}
      >
        <span>👁️</span>
        <span>View 3D Preview</span>
      </button>
    </div>
  )
}

export default RoomList

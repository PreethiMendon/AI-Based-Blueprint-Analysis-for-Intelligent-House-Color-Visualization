// src/components/BlueprintCanvas.jsx
import React from 'react'

function getAreaTypeIcon(name = '') {
  const n = name.toLowerCase()
  if (n.includes('kitchen')) return '🍽️'
  if (n.includes('bath') || n.includes('ensuite')) return '🛁'
  if (n.includes('bed')) return '🛏️'
  if (n.includes('living')) return '🏠'
  return '📐'
}

function BlueprintCanvas({ imageUrl, analysis, selectedAreaId, onSelectArea, colors }) {
  const areas = analysis?.areas || []
  const imgWidth = analysis?.width || 1
  const imgHeight = analysis?.height || 1

  return (
    <div className="bg-white rounded-3xl shadow-lg p-4">
      {!imageUrl ? (
        <div className="h-[360px] flex items-center justify-center text-slate-400 text-sm">
          Upload a blueprint to start analysis
        </div>
      ) : (
        <div className="flex justify-center">
          <div className="relative inline-block bg-slate-50 rounded-2xl overflow-hidden">
            <img
              src={imageUrl}
              alt="Blueprint"
              className="max-h-[480px] w-auto block"
            />

            {/* Overlay icons */}
            {areas.map((area) => {
              const xPct = (area.iconPosition.x / imgWidth) * 100
              const yPct = (area.iconPosition.y / imgHeight) * 100
              const selected = area.id === selectedAreaId
              const color = colors?.[area.id] || '#1D4ED8' // default blue

              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => onSelectArea?.(area.id)}
                  style={{
                    position: 'absolute',
                    left: `${xPct}%`,
                    top: `${yPct}%`,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: color,
                  }}
                  className={`w-16 h-16 rounded-2xl shadow-lg flex items-center justify-center 
                    text-2xl text-white border-4 border-white/80
                    hover:scale-105 transition-transform
                    ${selected ? 'ring-4 ring-blue-300' : ''}`}
                >
                  <span>{getAreaTypeIcon(area.name)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default BlueprintCanvas

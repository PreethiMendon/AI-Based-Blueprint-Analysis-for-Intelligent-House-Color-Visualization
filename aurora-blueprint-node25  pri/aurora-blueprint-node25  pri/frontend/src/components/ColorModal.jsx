// frontend/src/components/ColorModal.jsx
import React, {useMemo, useState} from 'react'
import { generatePalettes } from '../utils/colorUtils'

export default function ColorModal({area, currentColor, onClose, onApply, regeneratePalettes}) {
  const [seed, setSeed] = useState(currentColor || '#3B82F6')
  const [count, setCount] = useState(12)
  const palettes = useMemo(()=> generatePalettes(seed, count), [seed, count])

  function handlePick(color){
    onApply(color)
  }

  function handleRegenerate(){
    // small randomness by shifting seed hue slightly
    const newSeed = seed === '#3B82F6' ? '#10B981' : seed // trivial jitter
    setSeed(x => shiftSeed(x))
    // helper to jitter hue:
    function shiftSeed(s){
      // rotate minorly
      const rnd = Math.random()*0.15 - 0.075
      // use generatePalettes to get new list and pick first color as new seed
      const p = generatePalettes(s, 3)
      return p[0][0]
    }
  }

  return (
    <div style={{position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.35)', zIndex:80}} className="flex items-center justify-center p-6">
      <div className="w-[900px] max-h-[88vh] overflow-auto bg-white rounded-2xl p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-50 text-blue-700">
              ✨
            </div>
            <h3 className="mt-3 text-2xl font-semibold">Color Selection</h3>
            <p className="text-sm text-slate-500 mt-1">AI-generated palette for <strong>{area?.name}</strong></p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleRegenerate} className="px-4 py-2 rounded bg-orange-400 text-white">Regenerate</button>
            <button onClick={onClose} className="px-4 py-2 border rounded">Close</button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          {palettes.map((pal,pi)=>(
            <div key={pi} className="p-3 border rounded-lg">
              <div className="flex gap-2">
                {pal.map((c,ci)=>(
                  <div key={ci} onClick={()=>handlePick(c)} style={{background:c}} className="w-14 h-14 rounded-lg cursor-pointer border" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border rounded">Back to Areas</button>
          <button onClick={()=>handlePick(currentColor||'#FFFFFF')} className="px-6 py-2 bg-blue-600 text-white rounded">Apply Color</button>
        </div>
      </div>
    </div>
  )
}

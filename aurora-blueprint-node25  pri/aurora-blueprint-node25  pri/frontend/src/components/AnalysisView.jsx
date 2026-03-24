// frontend/src/components/AnalysisView.jsx
import React, {useEffect, useState} from 'react'
import axios from 'axios'
import BlueprintCanvas from './BlueprintCanvas'
import ColorModal from './ColorModal'
import BuildingViewer from './BuildingViewer'
import { generatePalettes } from '../utils/colorUtils'

export default function AnalysisView({blueprintUrl}) {
  const [loading,setLoading] = useState(true)
  const [areas,setAreas] = useState([])
  const [colorMap,setColorMap] = useState({})
  const [showColorFor, setShowColorFor] = useState(null)
  const [view3d, setView3d] = useState(false)

  useEffect(()=>{
    async function analyze(){
      setLoading(true)
      try{
        const res = await axios.post('/api/analyze', { url: blueprintUrl })
        const a = res.data.areas || []
        // map small normalized positions for markers
        const markers = a.map((it, idx) => ({
          ...it,
          xPct: Math.min(90, Math.max(10, (it.x/1000*100 + (Math.random()*8-4)))),
          yPct: Math.min(90, Math.max(10, (it.y/1000*100 + (Math.random()*8-4)))),
        }))
        setAreas(markers)
        const map={}
        markers.forEach((m,i)=> map[m.id] = m.suggested_color || generatePalettes('#3B82F6',1)[0][2] )
        setColorMap(map)
      }catch(e){
        console.error(e); alert('Analysis failed')
      }finally{ setLoading(false) }
    }
    if(blueprintUrl) analyze()
  },[blueprintUrl])

  function openColor(id){ setShowColorFor(id) }
  function applyColor(id, color){ setColorMap(prev=> ({...prev, [id]: color })) }
  function regeneratePalettesFor(id){
    // optional hook to regenerate server-side later
    return generatePalettes(colorMap[id]||'#3B82F6', 12)
  }

  return (
    <div className="p-6 grid grid-cols-3 gap-6">
      <div className="col-span-2 bg-white rounded-2xl p-6 shadow">
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="loading-spinner" />
            <div className="ml-4 text-slate-500">Analyzing Blueprint...</div>
          </div>
        ) : (
          <>
            <BlueprintCanvas src={blueprintUrl} markers={areas} />
            <div className="mt-4 flex items-center justify-between">
              <div className="text-slate-700 font-medium">Detected areas: {areas.length}</div>
              <div className="flex gap-3">
                <button className="px-4 py-2 border rounded" onClick={()=>setView3d(v=>!v)}>{view3d ? 'Hide 3D' : 'View 3D Preview'}</button>
              </div>
            </div>
            {view3d && <div className="mt-4 border rounded p-2"><BuildingViewer areas={areas} colorMap={colorMap} /></div>}
          </>
        )}
      </div>

      <aside className="bg-white rounded-2xl p-6 shadow">
        <h3 className="text-lg font-semibold">Detected Areas</h3>
        <div className="mt-4 space-y-3">
          {areas.map(a=>(
            <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
              <div>
                <div className="font-medium">{a.name || `Area ${a.id}`}</div>
                <div className="text-xs text-slate-500">Click to colorize</div>
              </div>
              <div className="flex items-center gap-2">
                <div style={{width:36,height:36,background: colorMap[a.id]||'#fff'}} className="rounded-md border" />
                <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={()=>openColor(a.id)}>Colorize</button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {showColorFor && (
        <ColorModal
          area={areas.find(x=>x.id===showColorFor)}
          currentColor={colorMap[showColorFor]}
          onClose={()=>setShowColorFor(null)}
          onApply={(c)=>{ applyColor(showColorFor,c); setShowColorFor(null) }}
          regeneratePalettes={()=>regeneratePalettesFor(showColorFor)}
        />
      )}
    </div>
  )
}

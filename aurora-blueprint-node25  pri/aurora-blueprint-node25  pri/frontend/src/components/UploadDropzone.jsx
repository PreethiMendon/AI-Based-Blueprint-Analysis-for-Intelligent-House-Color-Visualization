// frontend/src/components/UploadDropzone.jsx
import React, {useRef, useState} from 'react'
import axios from 'axios'

export default function UploadDropzone({userName, onUploaded}) {
  const fileRef = useRef()
  const [preview, setPreview] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [uploading, setUploading] = useState(false)

  function handleFiles(f){
    if(!f) return
    const file = f
    setFileName(file.name)
    setPreview(URL.createObjectURL(file))
  }

  function onDrop(e){
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    handleFiles(f)
  }
  function onPick(e){
    const f = e.target.files[0]
    handleFiles(f)
  }

  async function uploadAndAnalyze(){
    if(!fileRef.current?.files?.[0] && !preview) return alert('Choose a file first')
    const file = fileRef.current?.files?.[0] || null
    // if preview exists but fileRef empty (user dropped), we must attach that file
    setUploading(true)
    const fd = new FormData()
    if(file) fd.append('blueprint', file)
    else {
      // fallback: fetch blob from preview URL (rare)
      const resp = await fetch(preview)
      const blob = await resp.blob()
      fd.append('blueprint', blob, fileName || 'upload.png')
    }
    try{
      const res = await axios.post('/api/upload', fd, { headers: {'Content-Type':'multipart/form-data'} })
      onUploaded(res.data.url)
    }catch(e){
      console.error(e); alert('Upload failed')
    }finally{ setUploading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-8">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-slate-900">Welcome, {userName.split(' ')[0]}!</h2>
        <p className="text-slate-500 mt-2">Upload your blueprint to begin the AI analysis</p>

        <div onDrop={onDrop} onDragOver={(e)=>e.preventDefault()} className="mt-8 bg-white rounded-2xl shadow-lg p-8">
          {!preview ? (
            <div className="p-12 border-2 border-dashed rounded-xl text-center text-slate-500">
              <div className="text-4xl mb-4">⬆</div>
              <div className="text-lg font-medium">Drop your blueprint here</div>
              <div className="text-sm mt-2">or click to browse your files</div>
              <div className="mt-6"><input ref={fileRef} type="file" accept="image/*,.pdf" onChange={onPick} /></div>
            </div>
          ) : (
            <div className="rounded-xl p-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <img src={preview} alt="preview" className="w-full object-contain max-h-[520px] rounded" />
              </div>
              <div className="mt-4 flex gap-4">
                <button className="flex-1 px-6 py-3 border rounded-lg" onClick={()=>{ setPreview(null); setFileName(null); fileRef.current.value = ''}}>Choose Different File</button>
                <button className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg" onClick={uploadAndAnalyze} disabled={uploading}>{uploading ? 'Uploading...' : 'Analyze Blueprint'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

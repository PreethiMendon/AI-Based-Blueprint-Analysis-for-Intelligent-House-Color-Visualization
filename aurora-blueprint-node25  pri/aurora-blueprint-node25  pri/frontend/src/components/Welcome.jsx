// frontend/src/components/Welcome.jsx
import React, {useState} from 'react'

export default function Welcome({onContinue}) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  function start(e){
    e.preventDefault()
    if(!name.trim()) return
    setLoading(true)
    // small animation delay to mimic screenshot flow
    setTimeout(()=> {
      setLoading(false)
      onContinue(name.trim())
    }, 700)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-gradient-to-b from-slate-50 to-slate-100 p-8">
      <div className="mt-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-700 text-white shadow-lg">
          {/* icon */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18"/></svg>
        </div>
        <h1 className="mt-6 text-4xl font-extrabold text-slate-900">Blueprint Vision</h1>
        <p className="mt-2 text-slate-500">AI-Powered Color Visualization</p>
      </div>

      <div className="mt-12 w-full max-w-xl bg-white rounded-2xl p-8 shadow-lg">
        <label className="text-slate-700 font-medium">Welcome! What should we call you?</label>
        <form onSubmit={start} className="mt-4">
          <div className="border rounded-lg p-3 focus-within:ring-2 focus-within:ring-blue-400">
            <input className="w-full outline-none text-lg" placeholder="Enter your name" value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <button className="mt-6 w-full bg-blue-400 hover:bg-blue-500 text-white py-3 rounded-lg font-semibold" disabled={loading}>
            {loading ? 'Beginning...' : 'Begin Analysis'}
          </button>
        </form>

        <div className="mt-6 border-t pt-4 flex justify-between text-sm text-slate-500">
          <div className="text-center w-1/3"><div className="text-blue-600 font-bold">AI</div><div>Powered</div></div>
          <div className="text-center w-1/3"><div className="text-orange-400 font-bold">3D</div><div>Models</div></div>
          <div className="text-center w-1/3"><div className="text-blue-700 font-bold">Smart</div><div>Analysis</div></div>
        </div>
      </div>
    </div>
  )
}

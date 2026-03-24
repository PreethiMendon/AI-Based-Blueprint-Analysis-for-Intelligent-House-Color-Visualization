// src/components/UploadPanel.jsx
import React, { useRef, useState, useEffect } from 'react'

function UploadPanel({ onUpload, loading }) {
  const inputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  // cleanup object URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const openFilePicker = () => {
    inputRef.current?.click()
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // clear previous preview url
    if (previewUrl) URL.revokeObjectURL(previewUrl)

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleAnalyze = () => {
    if (!selectedFile || loading) return
    onUpload?.(selectedFile)
  }

  const handleClear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(null)
    setPreviewUrl(null)
    // also reset input so the same file can be chosen again
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleChooseDifferent = () => {
    openFilePicker()
  }

  // ---------- UI ----------

  // 1) No file selected yet -> small card with "Choose File"
  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center">
        <div className="bg-white shadow-md rounded-2xl px-6 py-4 flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-800">
              Upload Blueprint
            </span>
            <span className="text-xs text-slate-500">
              PNG / JPG floor plan image
            </span>
          </div>
          <button
            type="button"
            onClick={openFilePicker}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Processing…' : 'Choose File'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>
    )
  }

  // 2) File selected -> big preview + two buttons + close X (like your screenshot)
  return (
    <div className="bg-white rounded-3xl shadow-lg p-4">
      {/* Close X in top-right */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleClear}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 text-lg"
          aria-label="Clear selected blueprint"
        >
          ×
        </button>
      </div>

      {/* Blueprint preview */}
      <div className="flex justify-center mb-4">
        <div className="bg-slate-50 rounded-2xl overflow-hidden max-h-[480px]">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Selected blueprint preview"
              className="block max-h-[480px] w-auto"
            />
          )}
        </div>
      </div>

      {/* Buttons row */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <button
          type="button"
          onClick={handleChooseDifferent}
          className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 text-slate-800 text-sm font-semibold hover:bg-slate-200"
        >
          Choose Different File
        </button>

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loading}
          className="flex-1 px-4 py-3 rounded-2xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60"
        >
          {loading ? 'Analyzing…' : 'Analyze Blueprint'}
        </button>
      </div>

      {/* hidden input (still needed for changing file) */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}

export default UploadPanel

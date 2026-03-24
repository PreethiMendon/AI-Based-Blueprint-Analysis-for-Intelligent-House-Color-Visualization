// src/components/DownloadOptions.jsx
import React from "react"

function DownloadOptions({ analysis, colorsById }) {

  const handleDownloadSummary = () => {
    const areas = analysis?.areas || []
    let text = "INTERIOR DESIGN COLOR SUMMARY\n\n"

    areas.forEach((area) => {
      const c = colorsById[area.id]
      text += `${area.name || "Room"} : ${c || "No tone selected"}\n`
    })

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "Color-Summary.txt"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mt-8 bg-white rounded-3xl shadow-lg p-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-1">
        Download Options
      </h2>

      <p className="text-[11px] text-slate-500 mb-4">
        Save your color selections as a summary – ideal for interior designers.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleDownloadSummary}
          className="px-4 py-2 rounded-2xl text-xs font-semibold 
                     bg-slate-900 text-white hover:bg-slate-800"
        >
          Download Color Summary (TXT)
        </button>
      </div>
    </div>
  )
}

export default DownloadOptions

// src/components/TotalBudget.jsx
import React, { useMemo } from "react"

const PAINT_BRANDS = {
  "Asian Paints": { matte: 220, satin: 300, luxury: 450, premium: 600 },
  "Dulux":       { matte: 240, satin: 320, luxury: 480, premium: 650 },
  "Nippon":      { matte: 210, satin: 290, luxury: 410, premium: 580 },
  "Berger":      { matte: 200, satin: 310, luxury: 430, premium: 590 },
}

const COVERAGE_SQFT_PER_LITRE = 140
const DEFAULT_COATS = 2

// auto-suggest finish by room type (same logic as in App.jsx)
function suggestFinishForRoom(name = "") {
  const n = name.toLowerCase()
  if (n.includes("living") || n.includes("hall")) return "luxury"
  if (n.includes("bed")) return "satin"
  if (n.includes("kitchen")) return "premium"
  if (n.includes("bath") || n.includes("ensuite")) return "premium"
  return "matte"
}

export default function TotalBudget({ areas = [], colorsById = {} }) {
  const { perRoomRows, brandTotals, totalLitresByBrand } = useMemo(() => {
    const perRoom = []
    const brandTotalsInner = {}
    const litresByBrand = {}

    areas.forEach((area) => {
      const color = colorsById[area.id]
      if (!color) return // only include rooms where AI color was selected

      const finish = suggestFinishForRoom(area.name)
      const a =
        (area.bbox?.width || 0) * (area.bbox?.height || 0)

      const litres = (a * DEFAULT_COATS) / COVERAGE_SQFT_PER_LITRE

      const brandCost = {}
      Object.entries(PAINT_BRANDS).forEach(([brand, pricing]) => {
        const price = pricing[finish] ?? pricing.matte
        const cost = litres * price

        brandCost[brand] = cost
        brandTotalsInner[brand] = (brandTotalsInner[brand] || 0) + cost
        litresByBrand[brand] = (litresByBrand[brand] || 0) + litres
      })

      perRoom.push({
        name: area.name || "Area",
        finish,
        color,
        litres,
        brandCost,
      })
    })

    return {
      perRoomRows: perRoom,
      brandTotals: brandTotalsInner,
      totalLitresByBrand: litresByBrand,
    }
  }, [areas, colorsById])

  const hasData = perRoomRows.length > 0
  if (!hasData) return null

  const handleDownloadReport = () => {
    const lines = []

    lines.push("Blueprint Paint Budget Summary")
    lines.push("--------------------------------")
    lines.push("Per-brand totals (approx.):")
    Object.keys(PAINT_BRANDS).forEach((brand) => {
      const total = brandTotals[brand] || 0
      const litres = totalLitresByBrand[brand] || 0
      lines.push(
        `  • ${brand}: ~₹${Math.round(total)} (${litres.toFixed(2)} L)`
      )
    })

    lines.push("")
    lines.push("Per-room details (rooms with selected tones):")
    perRoomRows.forEach((row) => {
      lines.push(
        `  • ${row.name} – finish: ${row.finish}, tone: ${row.color}, approx. ${row.litres.toFixed(
          2
        )} L`
      )
    })

    lines.push("")
    lines.push(
      "*All values are rough estimates for comparison between brands; actual store prices may vary."
    )

    const text = lines.join("\n")

    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "paint_budget_summary.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Total Paint Budget (All Selected Rooms)
          </h2>
          <p className="text-xs text-slate-500">
            Uses AI-suggested finishes per room (living = luxury, bedrooms = satin,
            kitchen/bath = premium, others = matte).
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadReport}
          className="px-4 py-2 rounded-2xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shadow"
        >
          Download Budget Report
        </button>
      </div>

      {/* Brand totals */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs sm:text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Brand</th>
              <th className="text-right py-2">Total Litres</th>
              <th className="text-right py-2">Estimated Cost</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(PAINT_BRANDS).map((brand) => {
              const total = brandTotals[brand] || 0
              const litres = totalLitresByBrand[brand] || 0
              return (
                <tr key={brand} className="border-b last:border-0">
                  <td className="py-2">{brand}</td>
                  <td className="text-right py-2">
                    {litres.toFixed(2)} L
                  </td>
                  <td className="text-right py-2 font-semibold">
                    ₹{Math.round(total)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Per-room summary */}
      <div className="mt-3">
        <p className="text-xs font-semibold text-slate-700 mb-1">
          Room-wise breakdown (rooms where a color has been selected):
        </p>
        <ul className="text-[11px] text-slate-600 space-y-1">
          {perRoomRows.map((row, idx) => (
            <li key={idx}>
              • {row.name} – finish{" "}
              <span className="font-semibold">{row.finish}</span>, tone{" "}
              <span className="font-mono">{row.color}</span>, approx.{" "}
              {row.litres.toFixed(2)} L
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

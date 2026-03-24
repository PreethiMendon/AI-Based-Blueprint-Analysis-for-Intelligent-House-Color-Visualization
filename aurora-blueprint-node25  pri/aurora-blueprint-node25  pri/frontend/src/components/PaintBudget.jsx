// src/components/PaintBudget.jsx
import React from "react"

const PAINT_BRANDS = {
  "Asian Paints": { matte: 220, satin: 300, luxury: 450, premium: 600 },
  "Dulux":       { matte: 240, satin: 320, luxury: 480, premium: 650 },
  "Nippon":      { matte: 210, satin: 290, luxury: 410, premium: 580 },
  "Berger":      { matte: 200, satin: 310, luxury: 430, premium: 590 },
}

const COVERAGE_SQFT_PER_LITRE = 140 // approx coverage
const DEFAULT_COATS = 2

export default function PaintBudget({
  roomName = "Room",
  area = 0,           // blueprint bbox area in "pseudo sqft"
  color = "#ffffff",
  finish = "matte",   // matte | satin | luxury | premium
  coats = DEFAULT_COATS,
}) {
  if (!area) return null

  const litresNeeded = (area * coats) / COVERAGE_SQFT_PER_LITRE

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mt-6">
      <h2 className="text-lg font-bold text-slate-900 mb-1">
        Paint Budget – {roomName}
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        AI tone selected:{" "}
        <span
          className="inline-block w-3 h-3 rounded-full align-middle mr-1"
          style={{ backgroundColor: color }}
        />
        <span className="font-semibold">{color}</span> · Suggested finish:{" "}
        <span className="font-semibold capitalize">{finish}</span> · {coats} coats
      </p>

      <table className="w-full text-xs sm:text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Brand</th>
            <th className="text-right py-2">₹/L</th>
            <th className="text-right py-2">Litres</th>
            <th className="text-right py-2">Est. Cost</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(PAINT_BRANDS).map(([brand, pricing]) => {
            const price = pricing[finish] ?? pricing.matte
            const total = Math.ceil(litresNeeded * price)

            return (
              <tr key={brand} className="border-b last:border-0">
                <td className="py-2">{brand}</td>
                <td className="text-right py-2">₹{price}</td>
                <td className="text-right py-2">
                  {litresNeeded.toFixed(2)} L
                </td>
                <td className="text-right py-2 font-semibold">
                  ₹{total}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="mt-2 text-[11px] text-slate-500">
        * Coverage and prices are approximate for budgeting and comparison between
        brands. Final cost may vary at store.
      </p>
    </div>
  )
}

import React from "react";

// Blue rounded square that looks like your UI
const baseClass =
  "flex items-center justify-center w-16 h-16 rounded-2xl bg-[#1554D1] text-white text-2xl shadow-lg shadow-blue-200";

// Map room name -> icon (emoji used as simple white pictogram)
function getIconChar(name = "") {
  const n = name.toLowerCase();

  if (n.includes("living")) return "🏠";       // Living Room
  if (n.includes("kitchen")) return "🍽️";     // Kitchen
  if (n.includes("master") && n.includes("bed")) return "🛏️"; // Master Bedroom
  if (n.includes("bedroom")) return "🛏️";     // Other bedrooms
  if (n.includes("bath")) return "🛁";         // Bathroom / Ensuite
  if (n.includes("laundry")) return "🧺";      // Laundry (if detected)
  if (n.includes("closet")) return "👗";       // Closet / Walk-in

  // default icon
  return "🏠";
}

export default function AreaIcon({ name }) {
  const icon = getIconChar(name);
  return <div className={baseClass}>{icon}</div>;
}

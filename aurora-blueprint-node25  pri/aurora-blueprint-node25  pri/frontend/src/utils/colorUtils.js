// frontend/src/utils/colorUtils.js
// Simple palette generator — deterministic + random variations.
// Returns an array of palettes; each palette is an array of 5 hex colors.

function clamp(v,min,max){ return Math.max(min, Math.min(max, v)) }
function hexToRgb(hex){
  hex = hex.replace('#','')
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('')
  const n = parseInt(hex,16)
  return [(n>>16)&255, (n>>8)&255, n&255]
}
function rgbToHex(r,g,b){
  return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')
}
function lighten(hex, pct){
  const [r,g,b] = hexToRgb(hex)
  return rgbToHex(clamp(Math.round(r + (255-r)*pct),0,255),
                  clamp(Math.round(g + (255-g)*pct),0,255),
                  clamp(Math.round(b + (255-b)*pct),0,255))
}
function darken(hex, pct){
  const [r,g,b] = hexToRgb(hex)
  return rgbToHex(clamp(Math.round(r*(1-pct)),0,255),
                  clamp(Math.round(g*(1-pct)),0,255),
                  clamp(Math.round(b*(1-pct)),0,255))
}
function shiftHue(hex, shift){
  // lightweight hue shift via HSL conversion
  const [r,g,b] = hexToRgb(hex).map(v => v/255)
  const max = Math.max(r,g,b), min = Math.min(r,g,b)
  let h=0,s=0,l=(max+min)/2
  if(max!==min){
    const d = max-min
    s = l>0.5 ? d/(2-max-min) : d/(max+min)
    switch(max){
      case r: h = (g-b)/d + (g<b?6:0); break
      case g: h = (b-r)/d + 2; break
      case b: h = (r-g)/d + 4; break
    }
    h /= 6
  }
  h = (h + shift) % 1
  // HSL->RGB
  function hue2rgb(p,q,t){
    if(t<0) t+=1
    if(t>1) t-=1
    if(t<1/6) return p+(q-p)*6*t
    if(t<1/2) return q
    if(t<2/3) return p+(q-p)*(2/3-t)*6
    return p
  }
  let r2,g2,b2
  if(s===0){ r2=g2=b2=l } else {
    const q = l<0.5 ? l*(1+s) : l+s-l*s
    const p = 2*l-q
    r2 = hue2rgb(p,q,h+1/3)
    g2 = hue2rgb(p,q,h)
    b2 = hue2rgb(p,q,h-1/3)
  }
  return rgbToHex(Math.round(r2*255), Math.round(g2*255), Math.round(b2*255))
}

export function generatePalettes(seedHex='#3B82F6', count=12){
  // seed is used to produce different palettes
  const base = seedHex
  const palettes = []
  for(let i=0;i<count;i++){
    // three palette types: monochrome, warm, cool, complementary, triad
    const type = i % 6
    let p = []
    if(type===0){ // monochrome tints
      p = [lighten(base,0.9), lighten(base,0.6), base, darken(base,0.2), darken(base,0.4)]
    } else if(type===1){ // warm shift
      p = [lighten(shiftHue(base,0.05),0.85), lighten(shiftHue(base,0.08),0.55), shiftHue(base,0.12), darken(shiftHue(base,0.15),0.12), darken(shiftHue(base,0.18),0.2)]
    } else if(type===2){ // cool shift
      p = [lighten(shiftHue(base,0.55),0.8), lighten(shiftHue(base,0.4),0.5), shiftHue(base,0.33), darken(shiftHue(base,0.28),0.15), darken(shiftHue(base,0.23),0.25)]
    } else if(type===3){ // complementary
      p = [lighten(base,0.8), shiftHue(base,0.5), lighten(shiftHue(base,0.5),0.6), darken(base,0.15), darken(shiftHue(base,0.5),0.2)]
    } else if(type===4){ // triadic
      p = [lighten(shiftHue(base,0.33),0.8), lighten(base,0.6), shiftHue(base,0.66), darken(shiftHue(base,0.66),0.12), darken(base,0.18)]
    } else { // neutral + accent
      p = [ '#F3F4F6', lighten(base,0.6), base, shiftHue(base,0.2), '#111827' ]
    }
    // small deterministic jolt per palette
    p = p.map((c,idx)=> shiftHue(c, ((i*7+idx) % 12)/360 ))
    palettes.push(p)
  }
  return palettes
}

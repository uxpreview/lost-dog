// Dev only: top-down render of the generated world, for checking geography.
import { World } from '../engine/world'
import type { Chapter, WorldData } from '../engine/types'
import worldData from '../data/world.json'
import c1 from '../data/ch1.json'
import c2 from '../data/ch2.json'
import c3 from '../data/ch3.json'
import c4 from '../data/ch4.json'

const t0 = performance.now()
const w = new World(worldData as unknown as WorldData, [c1, c2, c3, c4] as unknown as Chapter[])
const ms = performance.now() - t0
const cv = document.getElementById('c') as HTMLCanvasElement
cv.width = w.nx
cv.height = w.nz
const g = cv.getContext('2d')!
const img = g.createImageData(w.nx, w.nz)
for (let j = 0; j < w.nz; j++)
  for (let i = 0; i < w.nx; i++) {
    const k = j * w.nx + i
    const h = w.h[k]
    let r: number, gg: number, b: number
    if (h < 0) { r = 40; gg = 90 + h * 3; b = 140 + h * 3 }
    else { const t = Math.min(1, h / 55); r = 90 + t * 160; gg = 120 + t * 110; b = 70 + t * 120 }
    // hillshade
    const hx = w.h[k + 1] - w.h[k - 1] || 0
    const shade = Math.max(0.5, Math.min(1.3, 1 - hx * 0.08))
    r *= shade; gg *= shade; b *= shade
    if (w.walkK[k] > 0.95) { r = 250; gg = 240; b = 200 }
    if (w.wet[k] > 0) { r = 60; gg = 160; b = 170 }
    if (w.road[k] > 0) { r = 120; gg = 120; b = 120 }
    if (w.wall[k] > 0.5) { r *= 0.8; gg *= 0.7; b *= 0.7 }
    const o = k * 4
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255
  }
g.putImageData(img, 0, 0)
;(window as any).__ms = ms
document.title = 'built ' + ms.toFixed(0) + 'ms'

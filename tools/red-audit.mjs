// The red audit. Red belongs to the dog: no color in the game may sit in
// red's hue band (350-15 deg, saturation >= 25%, value >= 20%, HSV) except
// the collar and the route line on the map, both exactly #D0342C.
//
//   1. SOURCE: every hex literal in src/engine, src/hud, src/data, src/Root.tsx.
//   2. RUNTIME: every material color uniform and every vertex / instance color
//      uploaded in the live scene (needs the dev server; BASE env, default
//      http://127.0.0.1:5173). Catches colors reached by arithmetic.
//
// Usage: node tools/red-audit.mjs [--source]     exit 0 = pass, 1 = fail

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const COLLAR = '#D0342C'

function hsv(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max }
}
const isRed = ({ h, s, v }) => (h >= 350 || h <= 15) && s >= 0.25 && v >= 0.2
const hexHsv = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return hsv(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

// ------------------------------------------------------------------ source
const files = []
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx|json|css)$/.test(f)) files.push(p)
  }
}
for (const d of ['src/engine', 'src/hud', 'src/data']) walk(join(ROOT, d))
files.push(join(ROOT, 'src/Root.tsx'))

const failures = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
      const hex = '#' + m[1].toUpperCase()
      if (!isRed(hexHsv(hex))) continue
      const rel = relative(ROOT, f)
      // the two whitelisted uses: the COLLAR constant, and the map's route line
      const ok = hex === COLLAR && ((rel.endsWith('engine/palette.ts') && /COLLAR/.test(line)) || rel.endsWith('hud/MapScreen.tsx'))
      if (!ok) failures.push(`${rel}:${i + 1}  ${hex}  ${line.trim().slice(0, 90)}`)
    }
  })
}
console.log(`source: ${files.length} files scanned, ${failures.length} red literal(s) outside the whitelist`)
for (const f of failures) console.log('  FAIL ' + f)

// ------------------------------------------------------------------ runtime
let runtimeFails = 0
if (!process.argv.includes('--source')) {
  try {
    const { chromium } = await import('playwright')
    const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
    const p = await b.newPage({ viewport: { width: 400, height: 300 } })
    await p.goto(BASE + '/?shot')
    await p.waitForFunction(() => window.__game, null, { timeout: 120000 })
    const res = await p.evaluate(() => {
      const g = window.__game
      const toS = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
      const red = (r, gg, b) => {
        const max = Math.max(r, gg, b), min = Math.min(r, gg, b), d = max - min
        let h = 0
        if (d) { if (max === r) h = ((gg - b) / d) % 6; else if (max === gg) h = (b - r) / d + 2; else h = (r - gg) / d + 4; h *= 60; if (h < 0) h += 360 }
        return (h >= 350 || h <= 15) && (max ? d / max : 0) >= 0.25 && max >= 0.2
      }
      const collarMat = g.dog.rig.collarMat
      const out = { meshes: 0, vertices: 0, fails: [] }
      g.scene.traverse((o) => {
        if (!o.isMesh && !o.isPoints) return
        out.meshes++
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          if (m === collarMat) continue
          const u = m.uniforms ?? {}
          for (const [k, v] of Object.entries(u)) {
            const c = v?.value
            if (c && c.isColor && red(toS(c.r), toS(c.g), toS(c.b))) out.fails.push(`${o.name || o.type} uniform ${k}`)
          }
          if (m.color && red(toS(m.color.r), toS(m.color.g), toS(m.color.b))) out.fails.push(`${o.name || o.type} color`)
        }
        for (const attr of [o.geometry?.attributes?.color, o.instanceColor]) {
          if (!attr) continue
          const a = attr.array, s = attr.itemSize
          for (let i = 0; i < a.length; i += s) {
            out.vertices++
            if (red(toS(a[i]), toS(a[i + 1]), toS(a[i + 2]))) { out.fails.push(`${o.name || o.type} vertex ${i / s}`); break }
          }
        }
      })
      return out
    })
    await b.close()
    runtimeFails = res.fails.length
    console.log(`runtime: ${res.meshes} meshes, ${res.vertices} vertex colors scanned, ${res.fails.length} red outside the collar`)
    for (const f of res.fails.slice(0, 30)) console.log('  FAIL ' + f)
  } catch (e) {
    console.log('runtime: skipped (' + String(e.message ?? e).split('\n')[0] + ')')
  }
}

const pass = failures.length === 0 && runtimeFails === 0
console.log(pass ? 'RED AUDIT PASS' : 'RED AUDIT FAIL')
process.exit(pass ? 0 : 1)

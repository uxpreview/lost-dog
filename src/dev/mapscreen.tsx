/**
 * Dev harness for the route map. Query params:
 *   ?ch=0|1|3   chapter that just ended
 *   &final=1    the whole day
 *   &noroute=1  hide the route dots (for the red audit)
 *   &seed=N     wander seed
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MapScreen } from '../hud/MapScreen'
import ch1 from '../data/ch1.json'
import ch2 from '../data/ch2.json'
import ch3 from '../data/ch3.json'
import ch4 from '../data/ch4.json'

type Pt = [number, number]
const q = new URLSearchParams(location.search)
const chapter = Number(q.get('ch') ?? 0)
const final = q.get('final') === '1'
const seed = Number(q.get('seed') ?? 3)

function rng(s: number) {
  let a = s >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The dog's route, walked by a boy: ~2m samples, lateral wander, a few side trips. */
function walk(main: number[][], s: number): Pt[] {
  const r = rng(s)
  const pts: Pt[] = []
  for (let i = 1; i < main.length; i++) {
    const a = main[i - 1]
    const b = main[i]
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(1, Math.ceil(d / 2))
    for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  pts.push([main[main.length - 1][0], main[main.length - 1][1]])
  const ph1 = r() * 10
  const ph2 = r() * 10
  const out: Pt[] = []
  let excursion = 0
  let exDir = 1
  let exLen = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const l = Math.hypot(dx, dz) || 1
    const nx = -dz / l
    const nz = dx / l
    const u = i / pts.length
    const edge = Math.min(1, i / 8, (pts.length - 1 - i) / 8)
    let off = (Math.sin(i * 0.09 + ph1) * 2.2 + Math.sin(i * 0.23 + ph2) * 0.9) * edge
    if (excursion <= 0 && r() < 0.012 && u > 0.05 && u < 0.92) {
      exLen = 10 + Math.floor(r() * 14)
      excursion = exLen
      exDir = r() < 0.5 ? -1 : 1
    }
    if (excursion > 0) {
      const p = 1 - excursion / exLen
      off += Math.sin(p * Math.PI) * (6 + exLen * 0.5) * exDir
      excursion--
    }
    out.push([pts[i][0] + nx * off + (r() - 0.5) * 0.5, pts[i][1] + nz * off + (r() - 0.5) * 0.5])
  }
  return out
}

const chs = [ch1, ch2, ch3, ch4]
const routes: Partial<Record<'ch1' | 'ch2' | 'ch3' | 'ch4', Pt[]>> = {}
const last = final ? 3 : chapter
chs.forEach((c, i) => {
  if (i <= last) routes[`ch${i + 1}` as 'ch1'] = walk(c.main, seed * 31 + i)
})
const passed = chs.flatMap((c, i) => (i <= last ? c.landmarks.map((l) => l.id) : []))

if (q.get('noroute') === '1') {
  const st = document.createElement('style')
  st.textContent = '.lwh-route{display:none}'
  document.head.appendChild(st)
}

function Harness() {
  const [open, setOpen] = useState(true)
  const [n, setN] = useState(0)
  ;(window as unknown as { __mapDone: number }).__mapDone = n
  return (
    <>
      {open ? (
        <MapScreen
          key={n}
          routes={routes}
          chapter={final ? 3 : chapter}
          passed={passed}
          final={final}
          onDone={() => {
            setOpen(false)
            setN((v) => v + 1)
          }}
        />
      ) : (
        <button style={{ margin: 20, font: '16px system-ui' }} onClick={() => setOpen(true)}>
          reopen
        </button>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)

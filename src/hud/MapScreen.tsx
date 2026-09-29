/**
 * The route map. A hand-drawn paper map of the coast, as if the boy drew it
 * later, with the day so far as a dotted line in collar red.
 *
 * Everything is procedural SVG in world meters (x east, z south; plan view maps
 * x to the right and z down). No image files, no text, no icons. The only red
 * in the whole screen is the route dots.
 *
 * Camera: on wide screens the whole sheet is shown. When the screen is too
 * narrow to show the sheet legibly (portrait phones), the sheet is shown at a
 * scale that fits its height and the view pans along the coast, following the
 * pen; in the final map it pulls back to the whole coast at the end.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, RefObject } from 'react'
import worldJson from '../data/world.json'
import ch1Json from '../data/ch1.json'
import ch2Json from '../data/ch2.json'
import ch3Json from '../data/ch3.json'
import ch4Json from '../data/ch4.json'
import './map.css'

export interface MapScreenProps {
  /** The boy's actual walked path per chapter, world [x, z] samples (~2m apart). Keys 'ch1'..'ch4'. Missing = not walked. */
  routes: Partial<Record<'ch1' | 'ch2' | 'ch3' | 'ch4', [number, number][]>>
  /** 0-based index of the chapter that just ended (0 = canyon, 1 = town, 3 = shore/final). */
  chapter: number
  /** Landmark ids the player actually passed. Only these get their little drawing. */
  passed: string[]
  /** true after the last chapter: draw the WHOLE day in one continuous sequence. */
  final: boolean
  /** Called when the player dismisses (any key / click / tap), only allowed after the drawing finishes. */
  onDone: () => void
}

// ---------------------------------------------------------------- data types

interface WorldData {
  coast: number[][]
  hills: { _name: string; path: number[][]; radius: number; falloff: number }[]
  valleys: { path: number[][]; soften?: { at: number[]; radius: number }[] }[]
  rivers: { _name: string; dry?: boolean; path: number[][] }[]
  roads: { path: number[][]; width: number }[]
  cliffPath: number[][]
}
interface Landmark { id: string; at: number[]; r: number; glyph: string }
interface ChapterData {
  id: string
  main: number[][]
  landmarks: Landmark[]
  areas?: { _name: string; circle?: number[]; poly?: number[][] }[]
  town?: {
    center: number[]
    radius: number
    exclude: number[][]
    wall: number[][]
    gates: number[][]
    tower?: number[]
  }
  home?: { gate: number[]; house: number[] }
}

const WORLD = worldJson as unknown as WorldData
const CHAPTERS = [ch1Json, ch2Json, ch3Json, ch4Json] as unknown as ChapterData[]
const KEYS = ['ch1', 'ch2', 'ch3', 'ch4'] as const

// ---------------------------------------------------------------- palette
// Warm paper, warm ink, flattened game palette. Nothing here sits in the red
// hue band (350..15). The route color is the only exception, by law.

const ROUTE = '#D0342C'
const PAPER = '#F1E6CF'
const INK = '#4A4038'
const INK_SOFT = '#6E6152'
const SEA = '#9CC4BE'
const SEA_DEEP = '#7DAEAB'
const SEA_EDGE = '#5A8E8F'
const SHALLOW = '#C3DDD2'
const RIVER = '#5E9BA0'
const ROOF = '#C4763F'
const ROOF_SHADE = '#A9612F'
const ROOF_LIGHT = '#D28F55'
const WALL = '#F4EAD5'
const WALL_SHADE = '#DCCAA6'
const STONE = '#D8CBAE'
const WOOD = '#B88E5C'
const PINE = '#7F9161'
const PINE_DARK = '#66784D'
const CYPRESS = '#5E7049'
const OCHRE = '#D9BF8C'
const SAGE = '#A7B283'
const SAND = '#C9AE7C'
const ROAD = '#9A948A'
const GLOW = '#F2B950'
const MUSTARD = '#DDB25C'
const PALE_BLUE = '#9DB9C6'

// ---------------------------------------------------------------- the sheet

const PX0 = -1000
const PZ0 = -458
const PX1 = 212
const PZ1 = 206
const PW = PX1 - PX0
const PH = PZ1 - PZ0
const PCX = (PX0 + PX1) / 2
const PCZ = (PZ0 + PZ1) / 2
/** The drawn frame, inset from the paper edge. */
const FI = 17
const FX0 = PX0 + FI
const FZ0 = PZ0 + FI
const FX1 = PX1 - FI
const FZ1 = PZ1 - FI

// ---------------------------------------------------------------- utilities

type P = [number, number]
type Rand = () => number

function mulberry(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function noise1(r: Rand): (x: number) => number {
  const n = 256
  const v = Array.from({ length: n }, () => r() * 2 - 1)
  return (x: number) => {
    const i = Math.floor(x)
    const f = x - i
    const a = v[((i % n) + n) % n]
    const b = v[(((i + 1) % n) + n) % n]
    const u = f * f * (3 - 2 * f)
    return a + (b - a) * u
  }
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const smooth01 = (v: number) => {
  const x = clamp(v, 0, 1)
  return x * x * (3 - 2 * x)
}
const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3)
const easeInOutCubic = (v: number) => {
  const x = clamp(v, 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
const easeOutBack = (v: number) => {
  const x = clamp(v, 0, 1)
  const c1 = 2.2
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1])
const f1 = (n: number) => (Math.round(n * 10) / 10).toString()
const pt = (p: P) => `${f1(p[0])},${f1(p[1])}`

/** Linear densify of rows of numbers (all components interpolated). */
function densifyRows(rows: number[][], step: number): number[][] {
  const out: number[][] = [rows[0].slice()]
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]
    const b = rows[i]
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(1, Math.ceil(d / step))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      out.push(a.map((v, j) => v + ((b[j] ?? v) - v) * t))
    }
  }
  return out
}
const densify = (pts: P[], step: number): P[] => densifyRows(pts, step).map((r) => [r[0], r[1]] as P)

function cumLen(pts: P[]): number[] {
  const L = [0]
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + dist(pts[i - 1], pts[i]))
  return L
}

function normals(pts: P[]): P[] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const l = Math.hypot(dx, dz) || 1
    return [-dz / l, dx / l] as P
  })
}

/** A pen line: densified and pushed sideways by smooth noise. */
function wobble(pts: P[], amp: number, wl: number, r: Rand, step?: number): P[] {
  const d = densify(pts, step ?? Math.max(0.8, wl / 5))
  const ns = normals(d)
  const nz = noise1(r)
  const L = cumLen(d)
  const o1 = r() * 100
  const o2 = r() * 100
  return d.map((p, i) => {
    const o = nz(o1 + L[i] / wl) * amp + nz(o2 + L[i] / (wl * 0.27)) * amp * 0.3
    return [p[0] + ns[i][0] * o, p[1] + ns[i][1] * o] as P
  })
}

/** Catmull-Rom through points, emitted as cubic segments from pts[0]. */
function curveSeg(pts: P[], closed = false): string {
  const n = pts.length
  if (n < 2) return ''
  if (n === 2) return `L${pt(pts[1])}`
  let s = ''
  const get = (i: number): P => (closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)])
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    s += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`
  }
  return s
}
const curve = (pts: P[], closed = false) => `M${pt(pts[0])}${curveSeg(pts, closed)}${closed ? 'Z' : ''}`
const poly = (pts: P[], closed = false) => `M${pts.map(pt).join('L')}${closed ? 'Z' : ''}`

/** A variable-width ink stroke, as a filled outline. Pressure wanders; ends taper. */
function inkStroke(pts: P[], w: number, r: Rand, o: { vary?: number; taper?: number; wl?: number } = {}): string {
  const d = densify(pts, 1.6)
  if (d.length < 2) return ''
  const ns = normals(d)
  const L = cumLen(d)
  const tot = L[L.length - 1]
  const nz = noise1(r)
  const off = r() * 50
  const taper = o.taper ?? 6
  const vary = o.vary ?? 0.35
  const left: P[] = []
  const right: P[] = []
  for (let i = 0; i < d.length; i++) {
    let ww = w * (1 + vary * nz(off + L[i] / (o.wl ?? 16)))
    if (taper > 0) ww *= 0.3 + 0.7 * smooth01(Math.min(L[i], tot - L[i]) / taper)
    ww = Math.max(ww, w * 0.12) / 2
    left.push([d[i][0] + ns[i][0] * ww, d[i][1] + ns[i][1] * ww])
    right.push([d[i][0] - ns[i][0] * ww, d[i][1] - ns[i][1] * ww])
  }
  right.reverse()
  return `M${pt(left[0])}${curveSeg(left)}L${pt(right[0])}${curveSeg(right)}Z`
}

/** Broken pen strokes along a line: short dashes of varying length. */
function brokenLine(pts: P[], r: Rand, dash: [number, number], gap: [number, number]): string {
  const d = densify(pts, 1.2)
  const L = cumLen(d)
  const tot = L[L.length - 1]
  let s = ''
  let at = r() * gap[1]
  let j = 0
  while (at < tot) {
    const len = dash[0] + r() * (dash[1] - dash[0])
    const seg: P[] = []
    while (j < d.length && L[j] < at) j++
    let k = j
    while (k < d.length && L[k] <= at + len) seg.push(d[k++])
    if (seg.length >= 2) s += poly(seg)
    at += len + gap[0] + r() * (gap[1] - gap[0])
  }
  return s
}

function offsetLine(pts: P[], off: number): P[] {
  const ns = normals(pts)
  return pts.map((p, i) => [p[0] + ns[i][0] * off, p[1] + ns[i][1] * off] as P)
}

/** An irregular watercolor blob around a path: a noisy capsule. */
function blob(path: P[], R: number, r: Rand, rough = 0.22): P[] {
  const d = densify(path, Math.max(4, R / 5))
  const ns = normals(d)
  const nz = noise1(r)
  const o = r() * 100
  let per = 0
  const step = Math.max(4, R / 5)
  const rad = () => R * (1 + rough * nz(o + per / (R * 0.8)) + rough * 0.35 * nz(o * 1.9 + per / (R * 0.22)))
  const out: P[] = []
  const push = (p: P, dx: number, dz: number) => {
    const rr = rad()
    out.push([p[0] + dx * rr, p[1] + dz * rr])
    per += step
  }
  for (let i = 0; i < d.length; i++) push(d[i], ns[i][0], ns[i][1])
  const K = 8
  const nE = ns[ns.length - 1]
  const tE: P = [nE[1], -nE[0]]
  for (let k = 1; k < K; k++) {
    const a = (k / K) * Math.PI
    push(d[d.length - 1], nE[0] * Math.cos(a) + tE[0] * Math.sin(a), nE[1] * Math.cos(a) + tE[1] * Math.sin(a))
  }
  for (let i = d.length - 1; i >= 0; i--) push(d[i], -ns[i][0], -ns[i][1])
  const nS = ns[0]
  const tS: P = [nS[1], -nS[0]]
  for (let k = 1; k < K; k++) {
    const a = (k / K) * Math.PI
    push(d[0], -nS[0] * Math.cos(a) - tS[0] * Math.sin(a), -nS[1] * Math.cos(a) - tS[1] * Math.sin(a))
  }
  return out
}

/** Painter's layers: overlapping items go to later layers, so each layer can be one path. */
function layers<T extends { box: number[] }>(items: T[]): T[][] {
  const lay: number[] = []
  const out: T[][] = []
  items.forEach((it, i) => {
    let l = 0
    for (let j = 0; j < i; j++) {
      const b = items[j].box
      if (lay[j] >= l && it.box[0] < b[2] && it.box[2] > b[0] && it.box[1] < b[3] && it.box[3] > b[1]) l = lay[j] + 1
    }
    lay.push(l)
    ;(out[l] ??= []).push(it)
  })
  return out
}

function rdp(pts: P[], eps: number): P[] {
  if (pts.length < 3) return pts.slice()
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const A = pts[a]
    const B = pts[b]
    const dx = B[0] - A[0]
    const dz = B[1] - A[1]
    const l2 = dx * dx + dz * dz
    let best = -1
    let bi = -1
    for (let i = a + 1; i < b; i++) {
      const p = pts[i]
      let dd: number
      if (l2 === 0) dd = dist(p, A)
      else {
        const t = clamp(((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / l2, 0, 1)
        dd = Math.hypot(p[0] - (A[0] + dx * t), p[1] - (A[1] + dz * t))
      }
      if (dd > best) {
        best = dd
        bi = i
      }
    }
    if (best > eps && bi > 0) {
      keep[bi] = 1
      stack.push([a, bi], [bi, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

function chaikin(pts: P[], iters: number): P[] {
  let p = pts
  for (let k = 0; k < iters; k++) {
    if (p.length < 3) return p
    const q: P[] = [p[0]]
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i]
      const b = p[i + 1]
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    q.push(p[p.length - 1])
    p = q
  }
  return p
}

function distToPolyline(p: P, line: P[]): number {
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    const A = line[i - 1]
    const B = line[i]
    const dx = B[0] - A[0]
    const dz = B[1] - A[1]
    const l2 = dx * dx + dz * dz
    const t = l2 === 0 ? 0 : clamp(((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / l2, 0, 1)
    const d = Math.hypot(p[0] - (A[0] + dx * t), p[1] - (A[1] + dz * t))
    if (d < best) best = d
  }
  return best
}

function inPoly(p: P, poly: P[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0]
    const zi = poly[i][1]
    const xj = poly[j][0]
    const zj = poly[j][1]
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

function coastZ(x: number): number {
  const c = WORLD.coast
  if (x <= c[0][0]) return c[0][1]
  for (let i = 1; i < c.length; i++) {
    if (x <= c[i][0]) {
      const t = (x - c[i - 1][0]) / (c[i][0] - c[i - 1][0])
      return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t
    }
  }
  return c[c.length - 1][1]
}

const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${f1(cx - rx)},${f1(cy)}A${f1(rx)},${f1(ry)} 0 1 0 ${f1(cx + rx)},${f1(cy)}A${f1(rx)},${f1(ry)} 0 1 0 ${f1(cx - rx)},${f1(cy)}Z`

// ---------------------------------------------------------------- paper grain

/** A tileable fibrous paper texture, generated once at runtime. */
function makeGrain(): string {
  if (typeof document === 'undefined') return ''
  const S = 320
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')
  if (!g) return ''
  const r = mulberry(7)
  const wraps = [-S, 0, S]
  // soft mottling
  for (let i = 0; i < 70; i++) {
    const x = r() * S
    const y = r() * S
    const rad = 30 + r() * 70
    const dark = r() < 0.55
    const a = 0.008 + r() * 0.016
    for (const ox of wraps)
      for (const oy of wraps) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad)
        gr.addColorStop(0, dark ? `rgba(150,112,64,${a})` : `rgba(255,251,238,${a * 2})`)
        gr.addColorStop(1, 'rgba(0,0,0,0)')
        g.fillStyle = gr
        g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2)
      }
  }
  // fibers
  g.lineCap = 'round'
  for (let i = 0; i < 1500; i++) {
    const x = r() * S
    const y = r() * S
    const len = 3 + r() * 16
    const ang = r() * Math.PI * 2
    const bend = (r() - 0.5) * len * 0.5
    const dark = r() < 0.62
    g.strokeStyle = dark ? `rgba(112,84,50,${0.035 + r() * 0.07})` : `rgba(255,253,244,${0.12 + r() * 0.2})`
    g.lineWidth = 0.35 + r() * 0.8
    const ex = Math.cos(ang) * len
    const ey = Math.sin(ang) * len
    for (const ox of wraps)
      for (const oy of wraps) {
        const sx = x + ox
        const sy = y + oy
        if (sx + Math.abs(ex) < -2 || sx - Math.abs(ex) > S + 2 || sy + Math.abs(ey) < -2 || sy - Math.abs(ey) > S + 2) continue
        g.beginPath()
        g.moveTo(sx, sy)
        g.quadraticCurveTo(sx + ex / 2 - (ey / len) * bend, sy + ey / 2 + (ex / len) * bend, sx + ex, sy + ey)
        g.stroke()
      }
  }
  // specks
  for (let i = 0; i < 420; i++) {
    const x = r() * S
    const y = r() * S
    g.fillStyle = `rgba(92,70,44,${0.08 + r() * 0.2})`
    g.beginPath()
    g.arc(x, y, 0.3 + r() * 0.7, 0, Math.PI * 2)
    g.fill()
  }
  return c.toDataURL('image/png')
}

// ---------------------------------------------------------------- glyphs

interface Part { d: string; f?: string; s?: boolean; w?: number; c?: string }

function pineParts(x: number, z: number, s: number, r: Rand): Part[] {
  const lean = (r() - 0.5) * 2.2 * s
  const tx = x + lean
  const tz = z - 5.2 * s
  const cw = (9 + r() * 2.5) * s
  const chh = (3.6 + r() * 1.0) * s
  const cy = tz - chh * 0.35
  const L: P = [tx - cw / 2, cy + chh * 0.18]
  const R: P = [tx + cw / 2, cy + chh * 0.1]
  const bumps = 4
  let top = ''
  for (let i = 0; i < bumps; i++) {
    const x0 = R[0] - (cw * i) / bumps
    const x1 = R[0] - (cw * (i + 1)) / bumps
    const edge = i === 0 || i === bumps - 1
    const hy = cy - chh * (edge ? 0.35 : 0.62) * (0.8 + r() * 0.3)
    const endY = i === bumps - 1 ? L[1] : cy - chh * 0.22
    top += `Q${f1((x0 + x1) / 2)},${f1(hy)} ${f1(x1)},${f1(endY)}`
  }
  const canopy = `M${pt(L)}Q${f1(tx)},${f1(cy + chh * 0.62)} ${pt(R)}${top}Z`
  const under = `M${f1(L[0] + cw * 0.12)},${f1(cy + chh * 0.28)}Q${f1(tx)},${f1(cy + chh * 0.6)} ${f1(R[0] - cw * 0.1)},${f1(cy + chh * 0.2)}Q${f1(tx)},${f1(cy + chh * 0.38)} ${f1(L[0] + cw * 0.12)},${f1(cy + chh * 0.28)}Z`
  const trunk = `M${f1(x)},${f1(z)}Q${f1(x + lean * 0.2)},${f1(z - 2.8 * s)} ${f1(tx)},${f1(cy + chh * 0.3)}`
  const branch = `M${f1(x + lean * 0.55)},${f1(z - 3.2 * s)}L${f1(x + lean * 0.55 + (lean > 0 ? -1.6 : 1.6) * s)},${f1(cy + chh * 0.34)}`
  return [
    { d: trunk + branch, s: true, w: 0.55 * s },
    { d: canopy, f: PINE },
    { d: under, f: PINE_DARK },
    { d: canopy, s: true, w: 0.42 * s },
  ]
}

/** Landmark drawings, authored around (0,0) about 20 units across, y down. */
function glyphParts(kind: string): Part[] {
  const r = mulberry(kind.length * 97 + kind.charCodeAt(0))
  switch (kind) {
    case 'pool':
      return [
        { d: 'M-9,0C-9,-5 -3,-6.8 2,-6.2C7.5,-5.6 10,-2 9,2C8,6.2 2,6.8 -3,6.2C-7.5,5.6 -9,3 -9,0Z', f: '#A6CBC4' },
        { d: 'M-5.5,-1.8C-3.8,-3 -1.8,-3 0,-1.8M1,2C2.6,1 4.3,1 5.8,2', s: true, w: 0.6, c: SEA_EDGE },
        { d: 'M-9,0C-9,-5 -3,-6.8 2,-6.2C7.5,-5.6 10,-2 9,2C8,6.2 2,6.8 -3,6.2C-7.5,5.6 -9,3 -9,0Z', s: true, w: 0.8 },
        { d: 'M-12.5,5.5L-10.5,3.8M-11,7.8L-8.8,6.6M10.4,-4.8L12.6,-6.2', s: true, w: 0.55 },
      ]
    case 'ford': {
      const stones: Part[] = []
      const xs = [-8.4, -4.3, -0.2, 3.9, 8]
      for (const x of xs) {
        const d = ell(x, (r() - 0.5) * 1.2, 1.7 + r() * 0.5, 1.25 + r() * 0.35)
        stones.push({ d, f: STONE }, { d, s: true, w: 0.6 })
      }
      return [
        { d: 'M-6,-9C-7,-5 -5,-3 -6.2,0C-7.4,3 -5.4,6 -6.4,9M2,-9C1,-5 3,-3 1.8,0C0.6,3 2.6,6 1.6,9M9.5,-8C8.5,-5 10.3,-3 9.3,0', s: true, w: 0.55, c: SEA_EDGE },
        ...stones,
      ]
    }
    case 'log':
      return [
        { d: 'M-5,-7C-4,-4 -6,-2 -5,1M5,-1C6,2 4,4 5,7', s: true, w: 0.5, c: SEA_EDGE },
        { d: 'M-10,-2.1L8.4,-2.4C9.8,-2.4 10.6,-1.2 10.6,0C10.6,1.2 9.8,2.3 8.4,2.3L-10,2.1Z', f: WOOD },
        { d: 'M-10,-2.1L8.4,-2.4C9.8,-2.4 10.6,-1.2 10.6,0C10.6,1.2 9.8,2.3 8.4,2.3L-10,2.1', s: true, w: 0.7 },
        { d: ell(-10, 0, 1.3, 2.1), f: '#DCC08F' },
        { d: ell(-10, 0, 1.3, 2.1) + ell(-10, 0, 0.45, 0.8), s: true, w: 0.55 },
        { d: 'M-6,-0.7L-1.5,-0.9M1,0.8L6.2,0.6M3.5,-2.3L5.2,-5.2L6.6,-5.6', s: true, w: 0.5 },
      ]
    case 'rim': {
      const st: [number, number, number, number][] = [
        [0, 4.4, 5.4, 2.4],
        [0.6, 0.6, 4.1, 2.0],
        [-0.3, -2.9, 3.1, 1.7],
        [0.3, -5.6, 2.0, 1.2],
      ]
      const parts: Part[] = [{ d: 'M-9,6.6C-4,7.6 4,7.6 9,6.4', s: true, w: 0.6 }]
      for (const [x, y, rx, ry] of st) {
        const d = ell(x, y, rx, ry)
        parts.push({ d, f: STONE }, { d, s: true, w: 0.65 })
      }
      parts.push({ d: 'M-2,5.1L1.8,5.4M-1.2,1.2L1.6,1.3', s: true, w: 0.4 })
      return parts
    }
    case 'gate': {
      const body = 'M-7.2,6.5L-7.2,-2A7.2,7.2 0 0 1 7.2,-2L7.2,6.5L3.6,6.5L3.6,-1.4A3.6,3.6 0 0 0 -3.6,-1.4L-3.6,6.5Z'
      return [
        { d: body, f: STONE },
        { d: body, s: true, w: 0.75 },
        { d: 'M0,-9.2L0,-5M-5.4,-6.3L-2.7,-4M5.4,-6.3L2.7,-4M-7.2,1.5L-3.6,1.5M3.6,1.5L7.2,1.5M-9.5,6.5L9.5,6.5', s: true, w: 0.5 },
      ]
    }
    case 'market': {
      const canopyClosed = `M-10,0.2L-8.5,-4.5L8.5,-4.5L10,0.2` + Array.from({ length: 8 }, (_, i) => `Q${f1(10 - i * 2.5 - 1.25)},2.6 ${f1(10 - (i + 1) * 2.5)},0.2`).join('') + 'Z'
      const stripes = [-5.5, -1, 3.5]
        .map((x) => `M${f1(x - 1.4)},-4.5L${f1(x + 1.4)},-4.5L${f1(x + 1.9)},0.4L${f1(x - 1.6)},0.4Z`)
        .join('')
      return [
        { d: 'M-8.8,0.5L-8.8,8M8.8,0.5L8.8,8', s: true, w: 0.7 },
        { d: canopyClosed, f: MUSTARD },
        { d: stripes, f: '#F4EAD2' },
        { d: canopyClosed, s: true, w: 0.7 },
        { d: 'M-7,5L7,5M-7,5L-7,8M7,5L7,8', s: true, w: 0.55 },
        { d: ell(-4, 4, 1.2, 0.8) + ell(-1, 4.1, 1.1, 0.8) + ell(3, 4, 1.3, 0.8), f: '#E8C96A' },
      ]
    }
    case 'boat':
      return [
        { d: 'M-11,6.8Q-8.5,5.4 -6,6.8T-1,6.8T4,6.8T9,6.8', s: true, w: 0.55, c: SEA_EDGE },
        { d: 'M-9.5,1L9.5,1Q7.6,5 0,5Q-7.6,5 -9.5,1Z', f: '#6F9DB0' },
        { d: 'M-9.5,1L9.5,1Q7.6,5 0,5Q-7.6,5 -9.5,1Z', s: true, w: 0.7 },
        { d: 'M0.9,-8.6L7.2,-0.2L0.9,-0.2Z', f: '#F6EEDD' },
        { d: 'M0,1L0,-9.6M0.9,-8.6L7.2,-0.2L0.9,-0.2Z', s: true, w: 0.6 },
      ]
    case 'fountain':
      return [
        { d: 'M0,-3.5Q-4.5,-7.5 -6.5,1.4M0,-3.5Q4.5,-7.5 6.5,1.4M0,-3.5Q-2,-6 -3,1.2M0,-3.5Q2,-6 3,1.2', s: true, w: 0.5, c: SEA_EDGE },
        { d: 'M-8,2L8,2L6.4,6.5L-6.4,6.5Z', f: STONE },
        { d: ell(0, 2, 8, 1.8), f: '#A6CBC4' },
        { d: 'M-8,2L-6.4,6.5L6.4,6.5L8,2' + ell(0, 2, 8, 1.8) + 'M0,1.4L0,-4', s: true, w: 0.65 },
        { d: ell(-7.4, -1.2, 0.35, 0.5) + ell(7.2, -0.6, 0.35, 0.5), f: SEA_EDGE },
      ]
    case 'washing':
      return [
        { d: 'M-10,7.5L-10,-6.5M10,7.5L10,-6.5M-10,-5.4Q0,-1.4 10,-5.4', s: true, w: 0.6 },
        { d: 'M-7.6,-4.1L-4.4,-3.4L-4.7,1.6L-7.9,1.1Z', f: '#F6EEDD' },
        { d: 'M-2.4,-2.9L1.6,-2.8L2.2,-1.5L1.3,-1.1L1.2,2.6L-2.2,2.6L-2.3,-1.1L-3.2,-1.5Z', f: PALE_BLUE },
        { d: 'M3.6,-3.3L7.4,-4.1L6.6,0.8L4.4,-0.6Z', f: MUSTARD },
        { d: 'M-7.6,-4.1L-4.4,-3.4L-4.7,1.6L-7.9,1.1ZM-2.4,-2.9L1.6,-2.8L2.2,-1.5L1.3,-1.1L1.2,2.6L-2.2,2.6L-2.3,-1.1L-3.2,-1.5ZM3.6,-3.3L7.4,-4.1L6.6,0.8L4.4,-0.6Z', s: true, w: 0.45 },
      ]
    case 'chapel':
      return [
        { d: 'M-6,6.5L-6,-0.8L6,-0.8L6,6.5Z', f: WALL },
        { d: 'M-7.6,-0.2L0,-6.6L7.6,-0.2Z', f: ROOF },
        { d: 'M-1.7,-5.3L-1.7,-10.2L1.7,-10.2L1.7,-5.3Z', f: WALL },
        {
          d: 'M-6,6.5L-6,-0.8M6,-0.8L6,6.5M-8,6.5L8,6.5M-7.6,-0.2L0,-6.6L7.6,-0.2ZM-1.7,-5.3L-1.7,-10.2L1.7,-10.2L1.7,-5.3M-2.3,-10.2L0,-12L2.3,-10.2M-0.7,-6.6L-0.7,-8.2A0.7,0.7 0 0 1 0.7,-8.2L0.7,-6.6M-1.4,6.5L-1.4,3.4A1.4,1.4 0 0 1 1.4,3.4L1.4,6.5',
          s: true,
          w: 0.6,
        },
        { d: 'M-4.2,1.6L-4.2,3.4L-3,3.4L-3,1.6ZM3,1.6L3,3.4L4.2,3.4L4.2,1.6Z', f: INK },
      ]
    case 'plank':
      return [
        { d: 'M-5.5,-9L-4,-6L-6,-3L-4.2,0L-6.2,3L-4.5,6L-5.8,9L-2.6,9L-1.8,6L-3,3L-1.4,0L-3.2,-3L-1.4,-6L-2.4,-9Z', f: '#8C7B66' },
        { d: 'M5.5,-9L4,-6L6,-3L4.2,0L6.2,3L4.5,6L5.8,9L2.6,9L1.8,6L3,3L1.4,0L3.2,-3L1.4,-6L2.4,-9Z', f: '#8C7B66' },
        { d: 'M-5.5,-9L-4,-6L-6,-3L-4.2,0L-6.2,3L-4.5,6L-5.8,9M5.5,-9L4,-6L6,-3L4.2,0L6.2,3L4.5,6L5.8,9', s: true, w: 0.65 },
        { d: 'M-9.5,-1.3L9.5,-1.5L9.6,1.4L-9.4,1.3Z', f: '#CFAE78' },
        { d: 'M-9.5,-1.3L9.5,-1.5L9.6,1.4L-9.4,1.3ZM-8,0L-4,0.1M2,-0.1L7,0', s: true, w: 0.6 },
      ]
    case 'wall': {
      const parts: Part[] = []
      let dd = ''
      for (let row = 0; row < 2; row++) {
        let x = -10 + (row ? 1.4 : 0)
        while (x < 9.5) {
          const w = 2.2 + r() * 1.4
          dd += ell(x + w / 2, row ? -0.2 : 2.4, w / 2, 1.3 + r() * 0.2)
          x += w + 0.1
        }
      }
      dd += ell(-6, -2.6, 1.4, 1.1) + ell(-2.8, -2.8, 1.5, 1.1) + ell(4.5, -2.7, 1.6, 1.1)
      parts.push({ d: dd, f: STONE }, { d: dd, s: true, w: 0.5 })
      parts.push({ d: 'M-11,4.2C-4,5 4,5 11,4', s: true, w: 0.5 })
      return parts
    }
    case 'pine':
      return pineParts(0, 7, 1.45, r)
    case 'wave':
      return [
        { d: 'M-10,3.5C-6,3.5 -4.5,-5.5 2,-5.5C6.5,-5.5 8.5,-2 6.5,0.3C4.8,2 2.2,0.8 3.2,-1.6', s: true, w: 0.8, c: SEA_EDGE },
        { d: 'M-4,3.5C-1.5,3 0.5,0.5 2.5,1', s: true, w: 0.55, c: SEA_EDGE },
        { d: 'M-12,7Q-9.5,5.6 -7,7T-2,7T3,7T8,7T13,7', s: true, w: 0.55, c: SEA_EDGE },
      ]
    case 'jetty': {
      let planks = ''
      for (let y = -9; y <= 9; y += 2.4) planks += `M-2.1,${f1(y)}L2.1,${f1(y + 0.1)}`
      return [
        { d: 'M-6,-2Q-4.5,-3 -3,-2M3,4Q4.5,3 6,4M-6,8Q-4.5,7 -3,8M3,-6Q4.5,-7 6,-6', s: true, w: 0.45, c: SEA_EDGE },
        { d: 'M-2.1,-10.5L2.1,-10.5L2.1,10.5L-2.1,10.5Z', f: '#CFAE78' },
        { d: 'M-2.1,-10.5L2.1,-10.5L2.1,10.5L-2.1,10.5Z' + planks, s: true, w: 0.5 },
        { d: ell(-2.6, -6, 0.6, 0.6) + ell(2.6, -6, 0.6, 0.6) + ell(-2.6, 2, 0.6, 0.6) + ell(2.6, 2, 0.6, 0.6) + ell(-2.6, 9.4, 0.6, 0.6) + ell(2.6, 9.4, 0.6, 0.6), f: INK },
      ]
    }
    case 'shrine':
      // a stone post with a little roof, flowers at its foot
      return [
        { d: 'M-2.4,7L-2.4,-3.6L2.4,-3.6L2.4,7Z', f: STONE },
        { d: 'M-3.6,-3.4L0,-7.4L3.6,-3.4Z', f: ROOF },
        { d: 'M-1.2,-2.2L-1.2,0.8L1.2,0.8L1.2,-2.2Z', f: INK },
        { d: 'M-2.4,7L-2.4,-3.6L2.4,-3.6L2.4,7M-3.6,-3.4L0,-7.4L3.6,-3.4ZM-6,7L6,7', s: true, w: 0.6 },
        { d: ell(4.4, 5.6, 0.9, 0.9) + ell(5.8, 4.6, 0.8, 0.8), f: MUSTARD },
        { d: 'M4.4,6.5L4.4,7M5.8,5.4L5.8,7', s: true, w: 0.4 },
      ]
    case 'swimrock':
      // a flat rock in the river, rings round it
      return [
        { d: 'M-10,4Q-7,2.6 -4,4T2,4T8,4M-8,-5Q-5.5,-6.2 -3,-5M4,-6Q6.5,-7.2 9,-6', s: true, w: 0.5, c: SEA_EDGE },
        { d: 'M-7.5,1.6C-7,-1.8 -2,-3.2 3,-2.8C7,-2.4 8.4,-0.6 7.6,1.4C5.4,2.6 -5,3 -7.5,1.6Z', f: STONE },
        { d: 'M-7.5,1.6C-7,-1.8 -2,-3.2 3,-2.8C7,-2.4 8.4,-0.6 7.6,1.4C5.4,2.6 -5,3 -7.5,1.6ZM-3,-0.6L2,-1', s: true, w: 0.6 },
      ]
    case 'kiln':
      // a charcoal burner's mound and a stack of cut wood
      return [
        { d: 'M-9,5C-8,-2 -2,-5 1,-5C4,-5 8,-1 8.5,5Z', f: '#8A7D6A' },
        { d: 'M-9,5C-8,-2 -2,-5 1,-5C4,-5 8,-1 8.5,5M-11,5L11,5M-1,-5.4Q0,-8 -1.4,-10M1.2,-5.2Q2.6,-7.8 1.6,-9.6', s: true, w: 0.55 },
        { d: ell(6.6, 3.2, 1, 1) + ell(8.6, 3.2, 1, 1) + ell(7.6, 1.4, 1, 1), f: WOOD },
        { d: ell(6.6, 3.2, 1, 1) + ell(8.6, 3.2, 1, 1) + ell(7.6, 1.4, 1, 1), s: true, w: 0.45 },
      ]
    case 'rockpool':
      // rocks at the tide line holding a pool, and a crab
      return [
        { d: ell(0, 1, 6.5, 3.4), f: SHALLOW },
        { d: ell(-7, 0, 2.6, 2.2) + ell(6.4, -1, 2.4, 2.4) + ell(-1.5, -3.6, 2.8, 1.8) + ell(2.5, 4.6, 2.6, 1.6), f: STONE },
        { d: ell(-7, 0, 2.6, 2.2) + ell(6.4, -1, 2.4, 2.4) + ell(-1.5, -3.6, 2.8, 1.8) + ell(2.5, 4.6, 2.6, 1.6), s: true, w: 0.55 },
        { d: 'M-2,1.4L-3,0.4M2,1.4L3,0.4M-1.6,2.2L-2.8,2.8M1.6,2.2L2.8,2.8' + ell(0, 1.6, 1.4, 0.9), s: true, w: 0.45 },
      ]
    case 'home':
      return [
        { d: 'M-9,4.5L-5,4.5M5,4.5L9,4.5M-9,1.5L-5,1.5M5,1.5L9,1.5M-9,6.5L-9,0M9,6.5L9,0', s: true, w: 0.45 },
        { d: 'M-5,7L-5,-1.8M5,7L5,-1.8M-3.2,6L-3.2,-0.4M-1.1,6L-1.1,-0.9M1.1,6L1.1,-0.9M3.2,6L3.2,-0.4M-5,1L5,1M-5,4.4L5,4.4', s: true, w: 0.55 },
        { d: ell(-5, -2.3, 0.8, 0.6) + ell(5, -2.3, 0.8, 0.6), f: INK },
      ]
    default:
      return [{ d: ell(0, 0, 2, 2), s: true, w: 0.6 }]
  }
}

/** Glyphs the route passes through: centred on the route, and turned to it. */
const ON_ROUTE: Record<string, 'align' | 'upright'> = {
  ford: 'align',
  log: 'align',
  plank: 'align',
  gate: 'upright',
  wall: 'upright',
  home: 'upright',
}

// ---------------------------------------------------------------- base map

interface BaseMap {
  paper: string
  frame: string
  frameClip: string
  landWash: string
  hillWashes: { d: string; c: string; e: string; o: number }[]
  floorWash: { d: string; w: number }
  sea: string
  seaDeep: string
  seaEdge: string
  shallows: string
  ripples: { d: string; o: number }[]
  waves: string
  sand: string
  rivers: string
  riverEdge: string
  ravine: string
  ravineTicks: string
  hachures: string
  hachureSoft: string
  canyonEdge: string
  tufts: string
  fieldWalls: string
  olives: string
  roadA: string
  roadB: string
  bridge: string
  cliffPath: string
  wall: string
  towers: string
  quay: string
  houses: { walls: string; shade: string; roofs: string; roofsB: string; roofShade: string; ink: string; windows: string }[]
  pines: Part[][]
  cypresses: string
  home: { wall: string; roof: string; ink: string; window: P; door: string; chimney: string }
  creases: { dark: string; light: string }
  stains: { x: number; z: number; r: number }[]
}

let baseCache: BaseMap | null = null

function buildBase(): BaseMap {
  if (baseCache) return baseCache
  const r = mulberry(1337)

  // paper: a slightly deckled sheet
  const corners: P[] = [
    [PX0 + 1, PZ0 + 2],
    [PX1 - 2, PZ0],
    [PX1, PZ1 - 1],
    [PX0, PZ1],
  ]
  const paperPts = wobble([...corners, corners[0]], 1.1, 7, r, 2.5)
  const paper = poly(paperPts, true)
  const framePts = wobble(
    [
      [FX0, FZ0],
      [FX1, FZ0 + 1],
      [FX1 + 0.5, FZ1],
      [FX0 - 0.5, FZ1 - 0.5],
      [FX0, FZ0],
    ],
    0.9,
    30,
    r,
    3,
  )
  const frame = inkStroke(framePts, 1.1, r, { vary: 0.3, taper: 0 })
  const frameClip = poly(framePts, true)

  // coast
  const coast: P[] = WORLD.coast.map((c) => [c[0], c[1]] as P)
  coast.unshift([PX0 - 30, coastZ(PX0)])
  coast.push([PX1 + 30, coastZ(PX1)])
  const coastInk = wobble(coast, 1.3, 26, r, 2.5)

  // land wash: the painted area, shy of the frame on three sides
  const inset = 5
  const washCoast = wobble(coast, 2.2, 30, r, 4).filter((p) => p[0] > FX0 + inset && p[0] < FX1 - inset)
  const landWashPts: P[] = [
    ...washCoast,
    ...wobble(
      [
        [FX1 - inset, washCoast[washCoast.length - 1][1]],
        [FX1 - inset - 2, FZ0 + inset],
        [FX0 + inset, FZ0 + inset + 1],
        [FX0 + inset, washCoast[0][1]],
      ],
      2.4,
      40,
      r,
      6,
    ),
  ]
  const landWash = curve(landWashPts, true)

  // hills: soft washes
  const hillWashes: BaseMap['hillWashes'] = []
  for (const h of WORLD.hills) {
    const path = h.path.map((p) => [p[0], p[1]] as P)
    const pine = h._name === 'pine ridge'
    const R = h.radius + h.falloff * (pine ? 0.45 : 0.3)
    const c = pine ? SAGE : OCHRE
    const e = pine ? '#8E9B69' : '#C8A569'
    hillWashes.push({ d: curve(blob(path, R, r, 0.2), true), c, e, o: pine ? 0.36 : 0.26 })
    hillWashes.push({ d: curve(blob(offsetLine(densify(path, 8), R * 0.12), R * 0.62, r, 0.28), true), c, e, o: pine ? 0.2 : 0.14 })
  }

  // canyon: tapered hachures down both walls
  const val = WORLD.valleys[0]
  const vrows = densifyRows(val.path, 1.45)
  const vpts = vrows.map((v) => [v[0], v[1]] as P)
  const vns = normals(vpts)
  const floorWash = { d: curve(wobble(vpts, 2, 40, r, 4)), w: 2 * 24 }
  let hach = ''
  let hachSoft = ''
  const edges: [P[], P[]] = [[], []]
  const soft = val.soften ?? []
  const lenNoise = [noise1(r), noise1(r)]
  let arc = 0
  for (let i = 0; i < vrows.length; i++) {
    const [cx, cz, , hw] = vrows[i]
    if (i > 0) arc += dist(vpts[i - 1], vpts[i])
    for (let side = -1; side <= 1; side += 2) {
      const n = vns[i]
      const bx = cx + n[0] * hw * side
      const bz = cz + n[1] * hw * side
      if (bz > coastZ(bx) - 4) continue
      if (i % 2 === 0) edges[side < 0 ? 0 : 1].push([bx, bz])
      let softness = 0
      for (const s of soft) softness = Math.max(softness, 1 - Math.hypot(bx - s.at[0], bz - s.at[1]) / (s.radius * 1.4))
      softness = clamp(softness, 0, 1)
      if (softness > 0.25 && r() < softness * 0.8) continue
      if (r() < 0.12) continue
      const ln = lenNoise[side < 0 ? 0 : 1](arc / 22)
      const len = (8.5 + 6 * ln + r() * 4.5) * (1 - softness * 0.65)
      const ang = (r() - 0.5) * 0.3
      const dx = n[0] * side
      const dz = n[1] * side
      const ux = dx * Math.cos(ang) - dz * Math.sin(ang)
      const uz = dx * Math.sin(ang) + dz * Math.cos(ang)
      const w0 = 0.42 + r() * 0.22
      const a0: P = [bx + ux * 0.4 - uz * w0, bz + uz * 0.4 + ux * w0]
      const a1: P = [bx + ux * 0.4 + uz * w0, bz + uz * 0.4 - ux * w0]
      const tip: P = [bx + ux * len, bz + uz * len]
      const seg = `M${pt(a0)}L${pt(tip)}L${pt(a1)}Z`
      if (softness > 0.25 || len < 7) hachSoft += seg
      else hach += seg
    }
  }
  const canyonEdge = inkStroke(wobble(edges[0], 0.8, 14, r, 2), 0.95, r) + inkStroke(wobble(edges[1], 0.8, 14, r, 2), 0.95, r)

  // sea
  const seaPts: P[] = [...wobble(coast, 1.8, 30, r, 3).map((p) => [p[0], p[1] + 1.2] as P), [PX1 + 30, PZ1 + 30], [PX0 - 30, PZ1 + 30]]
  const sea = curve(seaPts, true)
  const deepLine = wobble(offsetLine(densify(coast, 6), 24), 5, 50, r, 5)
  const seaDeep = curve([...deepLine, [PX1 + 30, PZ1 + 30], [PX0 - 30, PZ1 + 30]], true)
  const seaEdge = inkStroke(coastInk, 1.45, r, { vary: 0.45, taper: 0 })
  const shallows = curve(wobble(offsetLine(densify(coast, 4), 5), 1.5, 30, r, 4))
  const ripples: BaseMap['ripples'] = []
  const offs = [6.5, 13, 21]
  offs.forEach((o, k) => {
    const line = wobble(offsetLine(densify(coast, 3), o), 0.8 + k * 0.5, 30, r, 3)
    ripples.push({ d: brokenLine(line, r, [10, 34 - k * 6], [3, 9 + k * 5]), o: 0.55 - k * 0.14 })
  })
  let waves = ''
  let placed = 0
  for (let tries = 0; tries < 600 && placed < 34; tries++) {
    const x = FX0 + 20 + r() * (FX1 - FX0 - 40)
    const z = coastZ(x) + 34 + r() * (FZ1 - coastZ(x) - 44)
    if (z > FZ1 - 8) continue
    if (Math.hypot(x + 784, z - 104) < 30) continue
    const w = 4.5 + r() * 2.5
    waves += `M${f1(x)},${f1(z)}q${f1(w / 2)},${f1(-w * 0.45)} ${f1(w)},0t${f1(w)},0`
    placed++
  }

  // sand: stipple on beaches
  let sand = ''
  const beach = CHAPTERS[3].areas?.find((a) => a.poly)?.poly?.map((p) => [p[0], p[1]] as P)
  const sandSpots = (test: (p: P) => boolean, bx0: number, bz0: number, bx1: number, bz1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const p: P = [bx0 + r() * (bx1 - bx0), bz0 + r() * (bz1 - bz0)]
      if (!test(p)) continue
      sand += ell(p[0], p[1], 0.35 + r() * 0.3, 0.35 + r() * 0.3)
    }
  }
  if (beach) sandSpots((p) => inPoly(p, beach) || (p[1] < coastZ(p[0]) - 0.5 && p[1] > coastZ(p[0]) - 16), -875, 36, -698, 100, 1100)
  sandSpots((p) => p[1] < coastZ(p[0]) - 0.5 && p[1] > coastZ(p[0]) - 12, 34, 70, 86, 96, 260)
  sandSpots((p) => p[1] < coastZ(p[0]) - 0.5 && p[1] > coastZ(p[0]) - 10, -940, 55, -870, 92, 200)

  // rivers
  let rivers = ''
  let riverEdge = ''
  let ravine = ''
  let ravineTicks = ''
  for (const rv of WORLD.rivers) {
    const rows = rv.path.slice()
    if (rv.dry) {
      const pts = densify(
        rows.map((p) => [p[0], p[1]] as P),
        5,
      )
      const zig = pts.map((p, i) => [p[0] + (i % 2 ? 1.6 : -1.6) + (r() - 0.5) * 1.5, p[1] + (r() - 0.5) * 1.5] as P)
      ravine += inkStroke(zig, 1.5, r, { vary: 0.5, taper: 10 })
      const ns = normals(pts)
      for (let i = 1; i < pts.length - 1; i++) {
        for (let side = -1; side <= 1; side += 2) {
          if (r() < 0.25) continue
          const b: P = [pts[i][0] + ns[i][0] * side * 3, pts[i][1] + ns[i][1] * side * 3]
          const e: P = [b[0] + ns[i][0] * side * (2.5 + r() * 3), b[1] + ns[i][1] * side * (2.5 + r() * 3)]
          ravineTicks += `M${pt(b)}L${pt(e)}`
        }
      }
      continue
    }
    const main = rv._name === 'the river'
    if (main) rows.unshift([rows[0][0] + 2, PZ0 - 10, 0, rows[0][3], 0])
    const dense = densifyRows(rows, 2)
    const pts = wobble(
      dense.map((p) => [p[0], p[1]] as P),
      main ? 1.4 : 1.6,
      main ? 22 : 12,
      r,
      2,
    )
    // width: from the data, thickening toward the mouth
    const n = pts.length
    const ns = normals(pts)
    const nz = noise1(r)
    const left: P[] = []
    const right: P[] = []
    for (let i = 0; i < n; i++) {
      const src = dense[Math.min(i, dense.length - 1)]
      const u = i / (n - 1)
      const w = main ? 1.0 + src[3] * 0.13 + 2.4 * u * u : 0.5 + src[3] * 0.14 * (0.4 + u)
      const ww = (w * (1 + 0.18 * nz(i / 9))) / 2
      left.push([pts[i][0] + ns[i][0] * ww, pts[i][1] + ns[i][1] * ww])
      right.push([pts[i][0] - ns[i][0] * ww, pts[i][1] - ns[i][1] * ww])
    }
    const rr = right.slice().reverse()
    rivers += `M${pt(left[0])}${curveSeg(left)}L${pt(rr[0])}${curveSeg(rr)}Z`
    riverEdge += curve(left) + curve(right)
  }

  // scrub tufts in the open land
  const valleyLine = vpts
  const routeLines = CHAPTERS.map((c) => c.main.map((p) => [p[0], p[1]] as P))
  const townPoly = buildTownPoly()
  let tufts = ''
  let nt = 0
  for (let tries = 0; tries < 3000 && nt < 230; tries++) {
    const p: P = [FX0 + 12 + r() * (FX1 - FX0 - 24), FZ0 + 12 + r() * (FZ1 - FZ0)]
    if (p[1] > coastZ(p[0]) - 8) continue
    if (inPoly(p, townPoly)) continue
    if (distToPolyline(p, valleyLine) < 46) continue
    if (routeLines.some((l) => distToPolyline(p, l) < 7)) continue
    const ridge = WORLD.hills.find((h) => h._name === 'pine ridge')
    if (ridge && distToPolyline(p, ridge.path.map((q) => [q[0], q[1]] as P)) < ridge.radius) continue
    const s = 0.8 + r() * 0.6
    const x = p[0]
    const z = p[1]
    tufts += `M${f1(x - 1.1 * s)},${f1(z)}L${f1(x - 1.8 * s)},${f1(z - 1.7 * s)}M${f1(x)},${f1(z)}L${f1(x + 0.1 * s)},${f1(z - 2.3 * s)}M${f1(x + 1.1 * s)},${f1(z)}L${f1(x + 1.9 * s)},${f1(z - 1.6 * s)}`
    nt++
  }

  // dry-stone field walls and olive groves in the open country
  let fieldWalls = ''
  let olives = ''
  const ridgeL = WORLD.hills.find((hh) => hh._name === 'pine ridge')!
  const ridgePts = ridgeL.path.map((q) => [q[0], q[1]] as P)
  const homeAt: P = [CHAPTERS[3].home!.house[0], CHAPTERS[3].home!.house[2]]
  const zones: number[][] = [
    [-150, -300, -20, 30],
    [-975, -330, -700, -30],
    [-720, -445, -430, -300],
    [118, -440, 195, 40],
    [-340, -445, -150, -290],
  ]
  const fieldOk = (p: P) =>
    p[1] < coastZ(p[0]) - 12 &&
    !inPoly(p, townPoly) &&
    distToPolyline(p, valleyLine) > 50 &&
    !routeLines.some((l) => distToPolyline(p, l) < 10) &&
    p[0] > FX0 + 8 &&
    p[0] < FX1 - 8 &&
    p[1] > FZ0 + 8 &&
    distToPolyline(p, ridgePts) > ridgeL.radius + 14 &&
    dist(p, homeAt) > 48
  for (const [zx0, zz0, zx1, zz1] of zones) {
    const cw = 34
    const chh = 28
    const nx = Math.ceil((zx1 - zx0) / cw)
    const nz = Math.ceil((zz1 - zz0) / chh)
    const grid: P[][] = []
    for (let i = 0; i <= nx; i++) {
      grid.push([])
      for (let k = 0; k <= nz; k++) grid[i].push([zx0 + i * cw + (r() - 0.5) * 14, zz0 + k * chh + (r() - 0.5) * 12])
    }
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++) {
        const a = grid[i][k]
        const b = grid[i + 1][k]
        const c = grid[i + 1][k + 1]
        const d = grid[i][k + 1]
        const ctr: P = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4]
        if (!fieldOk(ctr) || !fieldOk(a) || !fieldOk(c) || r() < 0.42) continue
        for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]] as [P, P][]) if (r() < 0.62) fieldWalls += poly(wobble([p, q], 0.7, 12, r, 2))
        if (r() < 0.35) {
          for (let u = 0.2; u < 0.85; u += 0.2)
            for (let v = 0.22; v < 0.85; v += 0.22) {
              const top: P = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
              const bot: P = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u]
              const x = top[0] + (bot[0] - top[0]) * v + (r() - 0.5) * 1.2
              const z = top[1] + (bot[1] - top[1]) * v + (r() - 0.5) * 1.2
              olives += ell(x, z, 1.25 + r() * 0.35, 1.05 + r() * 0.3)
            }
        }
      }
  }

  // coast road: grey double line
  const road = WORLD.roads[0]
  const roadC = wobble(
    road.path.map((p) => [p[0], p[1]] as P),
    0.9,
    30,
    r,
    2,
  )
  const hw = road.width / 2
  const roadA = curve(offsetLine(roadC, hw))
  const roadB = curve(offsetLine(roadC, -hw).map((p) => [p[0] + (r() - 0.5) * 0.3, p[1]] as P))
  // a little bridge where it crosses the river mouth
  let bi = 0
  let bd = Infinity
  roadC.forEach((p, i) => {
    const d = Math.abs(p[0] - 53)
    if (d < bd) {
      bd = d
      bi = i
    }
  })
  const bseg = roadC.slice(Math.max(0, bi - 5), Math.min(roadC.length, bi + 6))
  const bridge = poly(offsetLine(bseg, hw + 1.6)) + poly(offsetLine(bseg, -hw - 1.6))

  const cliffPath = brokenLine(
    wobble(
      WORLD.cliffPath.map((p) => [p[0], p[1]] as P),
      1.2,
      20,
      r,
      1.5,
    ),
    r,
    [1.8, 3.2],
    [2.4, 3.6],
  )

  // town
  const town = CHAPTERS[1].town!
  const gates = town.gates.map((g) => [g[0], g[1]] as P)
  const wallDense = densify(
    town.wall.map((p) => [p[0], p[1]] as P),
    2,
  )
  let wall = ''
  let run: P[] = []
  for (const p of wallDense) {
    if (gates.some((g) => dist(g, p) < 6.5)) {
      if (run.length > 1) wall += inkStroke(wobble(run, 0.5, 20, r, 2), 2.0, r, { vary: 0.25, taper: 1.5 })
      run = []
    } else run.push(p)
  }
  if (run.length > 1) wall += inkStroke(wobble(run, 0.5, 20, r, 2), 2.0, r, { vary: 0.25, taper: 3 })
  let towers = ''
  town.wall.forEach((p, i) => {
    if (i === 0 || i === town.wall.length - 1 || i % 2 === 1) return
    if (gates.some((g) => dist(g, [p[0], p[1]]) < 12)) return
    const s = 2.6
    towers += `M${f1(p[0] - s)},${f1(p[1] - s)}L${f1(p[0] + s)},${f1(p[1] - s + 0.3)}L${f1(p[0] + s - 0.2)},${f1(p[1] + s)}L${f1(p[0] - s + 0.2)},${f1(p[1] + s - 0.2)}Z`
  })
  const quayArea = CHAPTERS[1].areas?.find((a) => a._name === 'the quay')?.poly?.map((p) => [p[0], p[1]] as P) ?? []
  const quayLine: P[] = quayArea.length ? [quayArea[1], quayArea[2], quayArea[3]] : []
  const quay = quayLine.length ? inkStroke(wobble(quayLine, 0.4, 16, r, 2), 1.1, r, { taper: 2 }) : ''

  const houses = buildHouses(r, townPoly)

  // pines on the ridge, a few elsewhere
  const pines: { x: number; z: number; s: number }[] = []
  const ridge = WORLD.hills.find((h) => h._name === 'pine ridge')!
  const ridgeLine = densify(
    ridge.path.map((p) => [p[0], p[1]] as P),
    4,
  )
  const ravineLine = WORLD.rivers.find((rv) => rv.dry)!.path.map((p) => [p[0], p[1]] as P)
  const lmSpots = CHAPTERS.flatMap((c) => c.landmarks.map((l) => [l.at[0], l.at[1]] as P))
  const canPlace = (x: number, z: number, s: number, gap: number) => {
    if (z > coastZ(x) - 10) return false
    if (x < FX0 + 10 || x > FX1 - 10 || z < FZ0 + 16) return false
    if (distToPolyline([x, z], ravineLine) < 7) return false
    if (routeLines.some((l) => distToPolyline([x, z], l) < 6.5)) return false
    if (lmSpots.some((l) => dist(l, [x, z]) < 15)) return false
    if (inPoly([x, z], townPoly)) return false
    for (const p of pines) if (Math.abs(p.x - x) < (p.s + s) * 5.2 * gap && Math.abs(p.z - z) < (p.s + s) * 3.2 * gap) return false
    return true
  }
  for (let tries = 0; tries < 9000 && pines.length < 200; tries++) {
    const c = ridgeLine[Math.floor(r() * ridgeLine.length)]
    const a = r() * Math.PI * 2
    const rad = Math.sqrt(r()) * ridge.radius * 1.25
    const x = c[0] + Math.cos(a) * rad
    const z = c[1] + Math.sin(a) * rad
    const s = 1.0 + r() * 0.4
    if (canPlace(x, z, s, 0.5)) pines.push({ x, z, s })
  }
  const extras: P[] = [
    [-60, -300], [-40, -250], [-20, -200], [120, -300], [135, -150], [130, -420], [-10, -440],
    [-150, -330], [-180, -290], [-470, -40], [-440, 20], [-760, -40], [-820, -80], [-930, -60], [-900, -200],
    [-760, -300], [-620, -330], [-300, -330], [-250, -420], [100, 20],
  ]
  for (const e of extras) {
    for (let k = 0; k < 3; k++) {
      const x = e[0] + (r() - 0.5) * 26
      const z = e[1] + (r() - 0.5) * 20
      const s = 0.8 + r() * 0.3
      if (canPlace(x, z, s, 0.8)) pines.push({ x, z, s })
    }
  }
  pines.sort((a, b) => a.z - b.z)
  const pineItems = pines.map((p) => ({ parts: pineParts(p.x, p.z, p.s, r), box: [p.x - 7.5 * p.s, p.z - 10 * p.s, p.x + 7.5 * p.s, p.z + 0.5] }))
  const pineParts2: Part[][] = layers(pineItems).map((layer) => {
    const acc = ['', '', '', '']
    for (const it of layer) it.parts.forEach((pp, k) => (acc[k] += pp.d))
    return [
      { d: acc[0], s: true, w: 0.6 },
      { d: acc[1], f: PINE },
      { d: acc[2], f: PINE_DARK },
      { d: acc[3], s: true, w: 0.48 },
    ]
  })

  let cypresses = ''
  const cyp: P[] = [[-905, 0], [-866, -6], [-872, -14], [-318, -64], [-292, -70], [-58, -372], [-600, -60]]
  for (const c of cyp) {
    const h = 9 + r() * 3
    cypresses += `M${f1(c[0])},${f1(c[1])}Q${f1(c[0] - 2.2)},${f1(c[1] - h * 0.45)} ${f1(c[0] + 0.2)},${f1(c[1] - h)}Q${f1(c[0] + 2.2)},${f1(c[1] - h * 0.45)} ${f1(c[0])},${f1(c[1])}Z`
  }

  // home: one small house in the far west cove
  const hh = CHAPTERS[3].home!
  const hx = hh.house[0]
  const hz = hh.house[2] + 4
  const w = 16
  const h = 9
  const homeWall = `M${f1(hx - w / 2)},${f1(hz)}L${f1(hx - w / 2)},${f1(hz - h)}L${f1(hx + w / 2)},${f1(hz - h)}L${f1(hx + w / 2)},${f1(hz)}Z`
  const homeRoof = `M${f1(hx - w / 2 - 1.4)},${f1(hz - h + 0.4)}L${f1(hx - w * 0.18)},${f1(hz - h - 7.5)}L${f1(hx + w * 0.18)},${f1(hz - h - 7.5)}L${f1(hx + w / 2 + 1.4)},${f1(hz - h + 0.4)}Z`
  const chimney = `M${f1(hx + 3.4)},${f1(hz - h - 4.6)}L${f1(hx + 3.4)},${f1(hz - h - 9)}L${f1(hx + 5.4)},${f1(hz - h - 9)}L${f1(hx + 5.4)},${f1(hz - h - 3)}`
  const door = `M${f1(hx + 1.8)},${f1(hz)}L${f1(hx + 1.8)},${f1(hz - 4.6)}L${f1(hx + 4.6)},${f1(hz - 4.6)}L${f1(hx + 4.6)},${f1(hz)}`
  const home = {
    wall: homeWall,
    roof: homeRoof,
    ink: homeWall + homeRoof + chimney + door,
    window: [hx - 5, hz - 6.2] as P,
    door,
    chimney,
  }

  // creases where the sheet was folded into a pocket
  const cx = PCX + 6
  const cz = PCZ - 4
  const creases = {
    dark: poly(wobble([[cx, PZ0 + 2], [cx + 2, PZ1 - 2]], 0.6, 60, r, 8)) + poly(wobble([[PX0 + 2, cz], [PX1 - 2, cz + 2]], 0.6, 80, r, 8)),
    light: poly(wobble([[cx + 1.6, PZ0 + 2], [cx + 3.6, PZ1 - 2]], 0.6, 60, r, 8)) + poly(wobble([[PX0 + 2, cz + 1.6], [PX1 - 2, cz + 3.6]], 0.6, 80, r, 8)),
  }
  const stains = [
    { x: -760, z: -330, r: 170 },
    { x: -80, z: -120, r: 210 },
    { x: -420, z: 60, r: 150 },
  ]

  baseCache = {
    paper,
    frame,
    frameClip,
    landWash,
    hillWashes,
    floorWash,
    sea,
    seaDeep,
    seaEdge,
    shallows,
    ripples,
    waves,
    sand,
    rivers,
    riverEdge,
    ravine,
    ravineTicks,
    hachures: hach,
    hachureSoft: hachSoft,
    canyonEdge,
    tufts,
    fieldWalls,
    olives,
    roadA,
    roadB,
    bridge,
    cliffPath,
    wall,
    towers,
    quay,
    houses,
    pines: pineParts2,
    cypresses,
    home,
    creases,
    stains,
  }
  return baseCache
}

function buildTownPoly(): P[] {
  const town = CHAPTERS[1].town!
  const wall = town.wall.map((p) => [p[0], p[1]] as P)
  const last = wall[wall.length - 1]
  const coastPts: P[] = []
  for (let x = last[0]; x <= -140; x += 10) coastPts.push([x, coastZ(x) + 2])
  return [...wall, [last[0], coastZ(last[0]) + 2], ...coastPts, [-140, -214]]
}

function buildHouses(r: Rand, townPoly: P[]): BaseMap['houses'] {
  const town = CHAPTERS[1].town!
  const main = densify(
    CHAPTERS[1].main.map((p) => [p[0], p[1]] as P),
    3,
  )
  const branches = ((CHAPTERS[1] as unknown as { branches?: { path: number[][] }[] }).branches ?? []).map((b) => b.path.map((p) => [p[0], p[1]] as P))
  const circles: number[][] = [...town.exclude]
  for (const a of CHAPTERS[1].areas ?? []) if (a.circle) circles.push([a.circle[0], a.circle[1], a.circle[2] + 3])
  for (const l of CHAPTERS[1].landmarks) circles.push([l.at[0], l.at[1], 13])
  const quay = CHAPTERS[1].areas?.find((a) => a._name === 'the quay')?.poly?.map((p) => [p[0], p[1]] as P) ?? []
  const list: { x: number; z: number; w: number; h: number; rh: number; hip: boolean; tower?: boolean; box: number[] }[] = []
  const place = (x: number, z: number, w: number, h: number, rh: number, hip: boolean, tower = false) => {
    for (const o of list) if (Math.abs(o.x - x) < (o.w + w) * 0.4 && Math.abs(o.z - z) < 2.9) return false
    for (const o of list) if (Math.abs(o.x - x) < (o.w + w) * 0.5 + 0.8 && Math.abs(o.z - z) < 0.9) return false
    const box = [x - w / 2 - 1.4, z - h - rh - 0.5, x + w / 2 + 1.4, z + 0.5]
    list.push({ x, z, w, h, rh, hip, tower, box })
    return true
  }
  if (town.tower) place(town.tower[0], town.tower[1] + 6, 5.2, 13, 5.5, false, true)
  const [tcx, tcz] = town.center
  for (let tries = 0; tries < 20000 && list.length < 480; tries++) {
    const a = r() * Math.PI * 2
    const rad = Math.pow(r(), 0.4) * town.radius * 1.1
    const x = tcx + Math.cos(a) * rad
    const z = tcz + Math.sin(a) * rad
    if (!inPoly([x, z], townPoly)) continue
    if (z > coastZ(x) - 5) continue
    if (quay.length && inPoly([x, z], quay)) continue
    if (circles.some((c) => Math.hypot(x - c[0], z - c[1]) < c[2])) continue
    if (distToPolyline([x, z], main) < 5.5 || distToPolyline([x, z - 4], main) < 5) continue
    if (branches.some((b) => distToPolyline([x, z], b) < 5) || branches.some((b) => distToPolyline([x, z - 5], b) < 5)) continue
    const w = 7.5 + r() * 4
    const h = 4.4 + r() * 2.4
    const rh = 2.8 + r() * 1.8
    place(x, z, w, h, rh, r() < 0.55)
  }
  list.sort((a, b) => a.z - b.z)
  const out: BaseMap['houses'] = []
  const j = () => (r() - 0.5) * 0.5
  for (const layer of layers(list)) {
  let walls = ''
  let shade = ''
  let roofs = ''
  let roofsB = ''
  let roofShade = ''
  let ink = ''
  let windows = ''
  for (const hs of layer) {
    const { x, z, w, h, rh } = hs
    const x0 = x - w / 2
    const x1 = x + w / 2
    const wallD = `M${f1(x0 + j())},${f1(z)}L${f1(x0 + j())},${f1(z - h)}L${f1(x1 + j())},${f1(z - h)}L${f1(x1 + j())},${f1(z)}Z`
    walls += wallD
    shade += `M${f1(x1 - w * 0.22)},${f1(z)}L${f1(x1 - w * 0.22)},${f1(z - h)}L${f1(x1)},${f1(z - h)}L${f1(x1)},${f1(z)}Z`
    const e = hs.tower ? 0.6 : 1.1
    const ry = z - h + 0.35
    let roofD: string
    let rs: string
    if (hs.tower) {
      roofD = `M${f1(x0 - e)},${f1(ry)}L${f1(x)},${f1(z - h - rh)}L${f1(x1 + e)},${f1(ry)}Z`
      rs = `M${f1(x)},${f1(z - h - rh)}L${f1(x1 + e)},${f1(ry)}L${f1(x + w * 0.1)},${f1(ry)}Z`
    } else if (hs.hip) {
      roofD = `M${f1(x0 - e)},${f1(ry)}L${f1(x - w * 0.2 + j())},${f1(z - h - rh)}L${f1(x + w * 0.2 + j())},${f1(z - h - rh)}L${f1(x1 + e)},${f1(ry)}Z`
      rs = `M${f1(x + w * 0.2)},${f1(z - h - rh)}L${f1(x1 + e)},${f1(ry)}L${f1(x + w * 0.3)},${f1(ry)}Z`
    } else {
      roofD = `M${f1(x0 - e)},${f1(ry)}L${f1(x + j())},${f1(z - h - rh)}L${f1(x1 + e)},${f1(ry)}Z`
      rs = `M${f1(x)},${f1(z - h - rh)}L${f1(x1 + e)},${f1(ry)}L${f1(x + w * 0.12)},${f1(ry)}Z`
    }
    if (!hs.tower && r() < 0.38) roofsB += roofD
    else roofs += roofD
    roofShade += rs
    ink += wallD + roofD
    // a window or two, sometimes a door
    const wy = z - h * 0.62
    const nw = hs.tower ? 1 : w > 8.6 ? 2 : 1
    for (let k = 0; k < nw; k++) {
      const wx = nw === 1 ? x - 0.5 : x0 + (w * (k + 1)) / (nw + 1) - 0.5
      windows += `M${f1(wx)},${f1(wy)}h1.1v1.4h-1.1Z`
    }
    if (!hs.tower && r() < 0.35) windows += `M${f1(x + 1)},${f1(z)}v-2.2h1.3v2.2Z`
    if (hs.tower) windows += `M${f1(x - 0.7)},${f1(z - h + 1.4)}h1.4v2.2h-1.4Z`
  }
  out.push({ walls, shade, roofs, roofsB, roofShade, ink, windows })
  }
  return out
}

// ---------------------------------------------------------------- route plan

interface Dot { x: number; z: number; r: number; t: number }
interface LmPlan { id: string; glyph: string; x: number; z: number; rot: number; scale: number; t: number }
interface Plan {
  dots: Dot[]
  animStart: number
  times: number[]
  animIdx: number[]
  lms: LmPlan[]
  td: number
  endBox: [number, number, number, number] | null
  allBox: [number, number, number, number] | null
  spacing: number
}

interface Layout {
  W: number
  H: number
  pan: boolean
  sFit: number
  sPan: number
  /** Scale of the sheet turned a quarter, for the final reveal on tall screens. 0 = do not turn. */
  sRot: number
  padX: number
  padT: number
  padB: number
}

function computeLayout(W: number, H: number): Layout {
  const padX = Math.max(14, W * 0.035)
  const padT = Math.max(14, H * 0.045)
  const padB = Math.max(46, H * 0.075)
  const aw = W - 2 * padX
  const ah = H - padT - padB
  const sFit = Math.min(aw / PW, ah / PH)
  const sH = ah / PH
  const pan = sFit < 0.72 * sH
  const sRot = Math.min(aw / PH, ah / PW)
  return { W, H, pan, sFit, sPan: Math.min(sH, 1.7), sRot: pan && sRot > sFit * 1.25 ? sRot : 0, padX, padT, padB }
}

function buildPlan(
  routes: MapScreenProps['routes'],
  chapter: number,
  final: boolean,
  passed: string[],
  layout: Layout,
  reduced: boolean,
): Plan {
  const sMin = layout.pan ? (final ? layout.sRot || layout.sFit : layout.sPan * 0.9) : layout.sFit
  const spacing = clamp(7.4 / sMin, 6.6, 12.5)
  const sMain = layout.pan ? layout.sPan : layout.sFit
  const rad = Math.min(spacing * 0.3, 2.25 / sMain)

  const dots: Dot[] = []
  const chDots: { c: number; from: number; to: number; path: P[] }[] = []
  let animStart = -1
  for (let c = 0; c < 4; c++) {
    if (!final && c > chapter) continue
    const raw = routes[KEYS[c]]
    if (!raw || raw.length < 2) continue
    const pts = chaikin(rdp(raw.map((p) => [p[0], p[1]] as P), 1), 2)
    const animated = final || c === chapter
    if (animated && animStart < 0) animStart = dots.length
    const r = mulberry(4000 + c * 17)
    const from = dots.length
    const d = densify(pts, 0.5)
    const L = cumLen(d)
    const ns = normals(d)
    const tot = L[L.length - 1]
    let at = 0
    let j = 0
    while (at <= tot) {
      while (j < d.length - 1 && L[j + 1] < at) j++
      const a = d[j]
      const b = d[Math.min(j + 1, d.length - 1)]
      const seg = L[Math.min(j + 1, d.length - 1)] - L[j] || 1
      const t = clamp((at - L[j]) / seg, 0, 1)
      const jit = (r() - 0.5) * 0.9
      dots.push({
        x: a[0] + (b[0] - a[0]) * t + ns[j][0] * jit,
        z: a[1] + (b[1] - a[1]) * t + ns[j][1] * jit,
        r: rad * (0.86 + r() * 0.28),
        t: animated ? 0 : -1,
      })
      at += spacing * (0.9 + r() * 0.2)
    }
    chDots.push({ c, from, to: dots.length, path: pts })
  }

  // landmarks: only the passed ones, on chapters that are drawn
  const passedSet = new Set(passed)
  const lmRaw: { lm: Landmark; c: number; idx: number; x: number; z: number; rot: number }[] = []
  for (const cd of chDots) {
    for (const lm of CHAPTERS[cd.c].landmarks) {
      if (!passedSet.has(lm.id)) continue
      const at: P = [lm.at[0], lm.at[1]]
      let bi = cd.from
      let bd = Infinity
      for (let i = cd.from; i < cd.to; i++) {
        const d = Math.hypot(dots[i].x - at[0], dots[i].z - at[1])
        if (d < bd) {
          bd = d
          bi = i
        }
      }
      const mode = ON_ROUTE[lm.glyph]
      const a = dots[Math.max(cd.from, bi - 1)]
      const b = dots[Math.min(cd.to - 1, bi + 1)]
      const tang = Math.atan2(b.z - a.z, b.x - a.x)
      let x = at[0]
      let z = at[1]
      let rot = 0
      if (mode) {
        // centred on the walked line, so the dots pass through the drawing
        x = dots[bi].x
        z = dots[bi].z
        if (mode === 'align') {
          rot = (tang * 180) / Math.PI
          if (rot > 90) rot -= 180
          if (rot < -90) rot += 180
        }
        if (lm.glyph === 'home') {
          x = lm.at[0] + 4
          z = lm.at[1] - 2
        }
      } else {
        // beside the line, on its more open side
        const minD = 22
        if (bd < minD) {
          const nx = -Math.sin(tang)
          const nz = Math.cos(tang)
          let best = -1
          let bx = x
          let bz = z
          for (const side of [-1, 1]) {
            const cx = dots[bi].x + nx * side * minD
            const cz = dots[bi].z + nz * side * minD
            let md = Infinity
            for (let i = cd.from; i < cd.to; i++) md = Math.min(md, Math.hypot(dots[i].x - cx, dots[i].z - cz))
            const seaPenalty = cz > coastZ(cx) - 4 && lm.glyph !== 'boat' && lm.glyph !== 'wave' && lm.glyph !== 'jetty' && lm.glyph !== 'rockpool' ? -20 : 0
            if (md + seaPenalty > best) {
              best = md + seaPenalty
              bx = cx
              bz = cz
            }
          }
          x = bx
          z = bz
        }
        rot = (((lm.id.length * 37) % 11) - 5) * 1.2
      }
      lmRaw.push({ lm, c: cd.c, idx: bi, x, z, rot })
    }
  }

  // timing: the pen's pace along the animated dots
  const animIdx: number[] = []
  if (animStart >= 0) for (let i = animStart; i < dots.length; i++) animIdx.push(i)
  const td = animIdx.length < 2 ? 0 : final ? (reduced ? 4.5 : 11.5) : reduced ? 2.2 : 5.2
  const times: number[] = []
  if (animIdx.length >= 2) {
    const n = animIdx.length
    const linger = new Float32Array(n)
    const lingerAmt = final ? 1.3 : 1.6
    for (const l of lmRaw) {
      const k = l.idx - animStart
      if (k >= 0 && k < n) linger[k] += lingerAmt
    }
    let cost = 0
    const costs: number[] = []
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1)
      let pace = 1 + 1.5 * (1 - smooth01(u / 0.07))
      pace += final ? 2.1 * smooth01((u - 0.8) / 0.2) : 1.0 * smooth01((u - 0.84) / 0.16)
      cost += (k === 0 ? 0 : pace) + linger[k]
      costs.push(cost)
    }
    for (let k = 0; k < n; k++) {
      const t = (costs[k] / cost) * td
      times.push(t)
      dots[animIdx[k]].t = t
    }
  }

  const lms: LmPlan[] = lmRaw.map((l) => ({
    id: l.lm.id,
    glyph: l.lm.glyph,
    x: l.x,
    z: l.z,
    rot: l.rot,
    scale: l.lm.glyph === 'pine' ? 1.1 : l.lm.glyph === 'home' ? 1.0 : 1.6,
    t: dots[l.idx].t < 0 ? -1 : dots[l.idx].t,
  }))

  const box = (from: number, to: number): [number, number, number, number] | null => {
    if (to <= from) return null
    let x0 = Infinity
    let z0 = Infinity
    let x1 = -Infinity
    let z1 = -Infinity
    for (let i = from; i < to; i++) {
      x0 = Math.min(x0, dots[i].x)
      x1 = Math.max(x1, dots[i].x)
      z0 = Math.min(z0, dots[i].z)
      z1 = Math.max(z1, dots[i].z)
    }
    return [x0, z0, x1, z1]
  }
  const cur = chDots.find((c) => c.c === chapter)
  return {
    dots,
    animStart,
    times,
    animIdx,
    lms,
    td,
    endBox: cur ? box(cur.from, cur.to) : null,
    allBox: box(0, dots.length),
    spacing,
  }
}

// ---------------------------------------------------------------- camera
//
// The sheet is rendered once, at a fixed base scale, as two stacked SVGs on a
// "stage": the heavy static map, and a light overlay (drawings, dots, glow).
// The camera is a CSS transform on the stage, so panning and pulling back are
// composited and never re-rasterize the map.

/** Room around the paper for its shadow. */
const M = 40
const VB = `${PX0 - M} ${PZ0 - M} ${PW + 2 * M} ${PH + 2 * M}`

interface Cam { cx: number; cz: number; s: number; th: number }

const sBase = (L: Layout) => (L.pan ? L.sPan : L.sFit)

function stageTransform(c: Cam, L: Layout): string {
  const aw = L.W - 2 * L.padX
  const ah = L.H - L.padT - L.padB
  const sb = sBase(L)
  const lx = (c.cx - (PX0 - M)) * sb
  const lz = (c.cz - (PZ0 - M)) * sb
  const k = c.s / sb
  return `translate(${(L.padX + aw / 2).toFixed(2)}px, ${(L.padT + ah / 2).toFixed(2)}px) rotate(${c.th.toFixed(3)}deg) scale(${k.toFixed(5)}) translate(${(-lx).toFixed(2)}px, ${(-lz).toFixed(2)}px)`
}

function clampCam(c: Cam, L: Layout): Cam {
  const aw = L.W - 2 * L.padX
  const hw = aw / 2 / c.s
  const lo = PX0 + hw
  const hi = PX1 - hw
  return { ...c, cx: lo > hi ? PCX : clamp(c.cx, lo, hi), cz: PCZ }
}

const fullCam = (L: Layout, th: number): Cam => ({ cx: PCX, cz: PCZ, s: L.sFit, th })
const turnedCam = (L: Layout): Cam => ({ cx: PCX, cz: PCZ, s: L.sRot, th: -89 })

function boxCam(b: [number, number, number, number] | null, L: Layout, th: number): Cam {
  if (!b) return fullCam(L, th)
  const aw = L.W - 2 * L.padX
  const w = b[2] - b[0] + 90
  const s = clamp(Math.min(L.sPan, aw / w), L.sFit, L.sPan)
  return clampCam({ cx: (b[0] + b[2]) / 2, cz: PCZ, s, th }, L)
}

// ---------------------------------------------------------------- component

const ENTER = 0.95
const D0 = 1.15
const TILT = -1

function useReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!m) return
    const f = () => setR(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return r
}

function useViewport(): { W: number; H: number } {
  const [v, setV] = useState(() => ({ W: typeof window !== 'undefined' ? window.innerWidth : 1280, H: typeof window !== 'undefined' ? window.innerHeight : 800 }))
  useEffect(() => {
    const f = () => setV({ W: window.innerWidth, H: window.innerHeight })
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return v
}

/** The static drawing. Rendered once; never touched by the animation. */
const BaseSheet = memo(function BaseSheet({ base, grain }: { base: BaseMap; grain: string }) {
  const h = base.houses
  return (
    <svg className="lwh-map-base" viewBox={VB} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {grain && (
          <pattern id="lwh-grain" patternUnits="userSpaceOnUse" width="118" height="118">
            <image href={grain} width="118" height="118" preserveAspectRatio="none" />
          </pattern>
        )}
        <linearGradient id="lwh-sea" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2={PZ1}>
          <stop offset="0" stopColor={SHALLOW} />
          <stop offset="0.35" stopColor={SEA} />
          <stop offset="1" stopColor={SEA_DEEP} />
        </linearGradient>
        <radialGradient
          id="lwh-edge"
          gradientUnits="userSpaceOnUse"
          cx={PCX}
          cy={PCZ}
          r={PW * 0.62}
          gradientTransform={`translate(${PCX} ${PCZ}) scale(1 ${PH / PW}) translate(${-PCX} ${-PCZ})`}
        >
          <stop offset="0.62" stopColor="#B08A55" stopOpacity="0" />
          <stop offset="1" stopColor="#A57E4A" stopOpacity="0.26" />
        </radialGradient>
        <radialGradient id="lwh-stain">
          <stop offset="0" stopColor="#E2CB9C" stopOpacity="0.28" />
          <stop offset="0.7" stopColor="#E2CB9C" stopOpacity="0.12" />
          <stop offset="1" stopColor="#E2CB9C" stopOpacity="0" />
        </radialGradient>
        <clipPath id="lwh-frame">
          <path d={base.frameClip} />
        </clipPath>
        <clipPath id="lwh-paper">
          <path d={base.paper} />
        </clipPath>
      </defs>

      {/* a soft shadow under the sheet */}
      <g transform="translate(5 10)" fill="none" stroke="#1E140A" strokeLinejoin="round">
        <path d={base.paper} strokeWidth="34" strokeOpacity="0.035" />
        <path d={base.paper} strokeWidth="20" strokeOpacity="0.05" />
        <path d={base.paper} strokeWidth="9" strokeOpacity="0.07" />
        <path d={base.paper} fill="#1E140A" fillOpacity="0.14" stroke="none" />
      </g>

      <path d={base.paper} fill={PAPER} />
      <g clipPath="url(#lwh-paper)">
        {base.stains.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.z} r={s.r} fill="url(#lwh-stain)" />
        ))}

        {/* washes: land, hills, sea */}
        <g clipPath="url(#lwh-frame)">
          <path d={base.landWash} fill="#E6D2A6" fillOpacity="0.4" />
          {base.hillWashes.map((hw, i) => (
            <path key={i} d={hw.d} fill={hw.c} fillOpacity={hw.o} stroke={hw.e} strokeOpacity={hw.o * 1.3} strokeWidth="1.3" />
          ))}
          <path d={base.floorWash.d} fill="none" stroke="#F4EBD6" strokeOpacity="0.4" strokeWidth={base.floorWash.w} strokeLinecap="round" strokeLinejoin="round" />
          <path d={base.sea} fill="url(#lwh-sea)" fillOpacity="0.9" />
          <path d={base.seaDeep} fill={SEA_DEEP} fillOpacity="0.28" />
          <path d={base.shallows} fill="none" stroke={SHALLOW} strokeOpacity="0.75" strokeWidth="7" strokeLinecap="round" />
        </g>

        {/* the grain lies over the paint */}
        {grain && <rect x={PX0} y={PZ0} width={PW} height={PH} fill="url(#lwh-grain)" />}
        <rect x={PX0} y={PZ0} width={PW} height={PH} fill="url(#lwh-edge)" />
        <path d={base.creases.light} fill="none" stroke="#FFF9EC" strokeOpacity="0.55" strokeWidth="1.4" />
        <path d={base.creases.dark} fill="none" stroke="#9C8058" strokeOpacity="0.2" strokeWidth="1.3" />

        {/* ink */}
        <g clipPath="url(#lwh-frame)">
          {base.ripples.map((rp, i) => (
            <path key={i} d={rp.d} fill="none" stroke={SEA_EDGE} strokeOpacity={rp.o} strokeWidth="0.7" strokeLinecap="round" />
          ))}
          <path d={base.waves} fill="none" stroke={SEA_EDGE} strokeOpacity="0.7" strokeWidth="0.85" strokeLinecap="round" />
          <path d={base.sand} fill={SAND} fillOpacity="0.8" />
          <path d={base.seaEdge} fill={INK} fillOpacity="0.92" />

          <path d={base.rivers} fill={RIVER} fillOpacity="0.9" />
          <path d={base.riverEdge} fill="none" stroke={SEA_EDGE} strokeOpacity="0.5" strokeWidth="0.4" />
          <path d={base.ravineTicks} fill="none" stroke={INK_SOFT} strokeOpacity="0.7" strokeWidth="0.5" strokeLinecap="round" />
          <path d={base.ravine} fill={INK} />

          <path d={base.hachureSoft} fill={INK_SOFT} fillOpacity="0.62" />
          <path d={base.hachures} fill={INK} fillOpacity="0.8" />
          <path d={base.canyonEdge} fill={INK} fillOpacity="0.85" />

          <path d={base.fieldWalls} fill="none" stroke={INK_SOFT} strokeOpacity="0.8" strokeWidth="0.75" strokeDasharray="0.1 1.5" strokeLinecap="round" />
          <path d={base.olives} fill="#94A067" stroke={INK} strokeOpacity="0.6" strokeWidth="0.3" />
          <path d={base.tufts} fill="none" stroke={INK_SOFT} strokeOpacity="0.5" strokeWidth="0.4" strokeLinecap="round" />

          <path d={base.roadA + base.roadB} fill="none" stroke={ROAD} strokeWidth="0.7" strokeLinecap="round" />
          <path d={base.bridge} fill="none" stroke={INK} strokeWidth="0.7" strokeLinecap="round" />
          <path d={base.cliffPath} fill="none" stroke={INK} strokeOpacity="0.8" strokeWidth="0.55" strokeLinecap="round" />

          {/* the old town */}
          <path d={base.quay} fill={INK} fillOpacity="0.8" />
          <path d={base.wall} fill={INK} />
          <path d={base.towers} fill={STONE} stroke={INK} strokeWidth="0.6" strokeLinejoin="round" />
          {h.map((l, i) => (
            <g key={i}>
              <path d={l.walls} fill={WALL} />
              <path d={l.shade} fill={WALL_SHADE} />
              <path d={l.roofs} fill={ROOF} />
              <path d={l.roofsB} fill={ROOF_LIGHT} />
              <path d={l.roofShade} fill={ROOF_SHADE} fillOpacity="0.75" />
              <path d={l.ink} fill="none" stroke={INK} strokeWidth="0.45" strokeLinejoin="round" />
              <path d={l.windows} fill={INK} fillOpacity="0.85" />
            </g>
          ))}

          {/* pines */}
          {base.pines.map((parts, i) => (
            <g key={i}>
              {parts.map((p, j) =>
                p.f ? (
                  <path key={j} d={p.d} fill={p.f} />
                ) : (
                  <path key={j} d={p.d} fill="none" stroke={INK} strokeWidth={p.w ?? 0.4} strokeLinecap="round" strokeLinejoin="round" />
                ),
              )}
            </g>
          ))}
          <path d={base.cypresses} fill={CYPRESS} stroke={INK} strokeWidth="0.4" strokeLinejoin="round" />

          <HomeHouse base={base} />
        </g>
        <path d={base.frame} fill={INK} fillOpacity="0.9" />
      </g>
    </svg>
  )
})

function HomeHouse({ base, lit }: { base: BaseMap; lit?: RefObject<SVGPathElement | null> }) {
  const w = base.home.window
  const win = `M${pt(w)}h3v3.4h-3Z`
  return (
    <g>
      <path d={base.home.wall} fill={WALL} />
      <path d={base.home.roof} fill={ROOF} />
      <path d={base.home.ink} fill="none" stroke={INK} strokeWidth="0.6" strokeLinejoin="round" />
      <path d={win} fill={INK} fillOpacity="0.8" />
      {lit && <path ref={lit} d={win} fill={GLOW} style={{ opacity: 0 }} />}
      <path d={`${win}M${f1(w[0] + 1.5)},${f1(w[1])}v3.4`} fill="none" stroke={INK} strokeWidth="0.45" />
    </g>
  )
}

export function MapScreen(props: MapScreenProps): JSX.Element {
  const { routes, chapter, passed, final, onDone } = props
  const reduced = useReducedMotion()
  const { W, H } = useViewport()
  const layout = useMemo(() => computeLayout(W, H), [W, H])
  const base = useMemo(() => buildBase(), [])
  const grain = useMemo(() => makeGrain(), [])
  const passedKey = passed.join('|')
  // Keyed on content, not identity: a parent re-render with a fresh routes
  // object must not restart the drawing.
  const routesKey = KEYS.map((k) => {
    const r = routes[k]
    if (!r || !r.length) return '-'
    const a = r[0]
    const b = r[r.length - 1]
    return `${r.length}:${a[0].toFixed(1)},${a[1].toFixed(1)}:${b[0].toFixed(1)},${b[1].toFixed(1)}`
  }).join('|')
  const routesRef = useRef(routes)
  routesRef.current = routes
  const plan = useMemo(
    () => buildPlan(routesRef.current, chapter, final, passedKey ? passedKey.split('|') : [], layout, reduced),
    // the plan depends on the routes by content and on the layout only through its scales
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routesKey, chapter, final, passedKey, layout.pan, layout.sFit, layout.sPan, layout.sRot, reduced],
  )
  const glyphs = useMemo(() => {
    const m = new Map<string, Part[]>()
    for (const l of plan.lms) if (!m.has(l.glyph)) m.set(l.glyph, glyphParts(l.glyph))
    return m
  }, [plan])

  const stageRef = useRef<HTMLDivElement>(null)
  const overRef = useRef<SVGSVGElement>(null)
  const glowRef = useRef<SVGGElement>(null)
  const winRef = useRef<SVGPathElement>(null)
  const [done, setDone] = useState(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const camRef = useRef<Cam | null>(null)

  // the timeline
  const clock = useRef({ t0: 0, skipTo: -1, skippedAt: -1, doneAt: Infinity, dismissed: false })

  useEffect(() => {
    const stage = stageRef.current
    const over = overRef.current
    if (!stage || !over) return
    const L0 = layoutRef.current
    const dotsEl = Array.from(over.querySelectorAll<SVGCircleElement>('circle.lwh-dot'))
    const lmEl = Array.from(over.querySelectorAll<SVGGElement>('g.lwh-lm'))
    const { dots, times, animIdx, td } = plan
    const drawEnd = D0 + td
    const glowStart = drawEnd + 0.15
    const glowDur = reduced ? 0.6 : 2.0
    const panFinal = L0.pan && final && !reduced
    const pullStart = drawEnd + 1.6
    const pullDur = 3.4
    const doneAt = final ? Math.max(glowStart + glowDur, panFinal ? pullStart + pullDur : 0) : drawEnd + (L0.pan && !reduced ? 1.3 : 0.35)
    const tilt = reduced ? 0 : TILT
    const c = clock.current
    c.t0 = performance.now()
    c.skipTo = -1
    c.doneAt = doneAt
    c.dismissed = false
    setDone(false)

    const penAt = (t: number): P => {
      if (!animIdx.length) return [dots.length ? dots[dots.length - 1].x : PCX, dots.length ? dots[dots.length - 1].z : PCZ]
      if (t <= 0) return [dots[animIdx[0]].x, dots[animIdx[0]].z]
      if (t >= td) {
        const d = dots[animIdx[animIdx.length - 1]]
        return [d.x, d.z]
      }
      let lo = 0
      let hi = times.length - 1
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1
        if (times[m] <= t) lo = m
        else hi = m
      }
      const a = dots[animIdx[lo]]
      const b = dots[animIdx[hi]]
      const u = (t - times[lo]) / (times[hi] - times[lo] || 1)
      return [a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u]
    }

    // where the camera rests when everything is drawn
    const endCam = (L: Layout): Cam => {
      if (!L.pan) return fullCam(L, tilt)
      if (final) return L.sRot && !reduced ? turnedCam(L) : fullCam(L, tilt)
      return boxCam(plan.endBox, L, tilt)
    }
    const followCam = (t: number, L: Layout, th: number): Cam => {
      const p = penAt(t + 0.9)
      return clampCam({ cx: p[0], cz: PCZ, s: L.sPan, th }, L)
    }
    let cam: Cam = !L0.pan ? fullCam(L0, tilt) : reduced ? endCam(L0) : followCam(0, L0, tilt)
    let pullFrom: Cam | null = null
    let lastTf = ''
    const setCam = (cm: Cam, L: Layout) => {
      camRef.current = cm
      const tf = stageTransform(cm, L)
      if (tf !== lastTf) {
        stage.style.transform = tf
        lastTf = tf
      }
    }

    let cursor = 0
    while (cursor < dots.length && dots[cursor].t < 0) cursor++
    let lastComp = 1
    const lmOn = new Array(lmEl.length).fill(false)
    let raf = 0
    let prev = performance.now()
    let finished = false
    const maxComp = (plan.spacing * 0.42) / Math.max(0.01, dots[0]?.r ?? 1)

    const frame = (now: number) => {
      const L = layoutRef.current
      const dt = Math.min(0.1, (now - prev) / 1000)
      prev = now
      let t = (now - c.t0) / 1000
      if (c.skipTo >= 0 && t < c.skipTo) {
        c.t0 = now - c.skipTo * 1000
        t = c.skipTo
      }
      const skipped = c.skipTo >= 0
      const tdraw = t - D0
      // the paper settles from a toss onto the table
      const th = reduced ? 0 : TILT - 3.2 * (1 - easeOutCubic(t / ENTER))

      // camera
      if (!L.pan) cam = fullCam(L, th)
      else if (skipped || reduced) cam = endCam(L)
      else if (final && t >= pullStart) {
        // pull back to the whole day, turning the sheet to fit a tall screen
        if (!pullFrom) pullFrom = { ...cam }
        const e = easeInOutCubic((t - pullStart) / pullDur)
        const to = endCam(L)
        cam = {
          cx: pullFrom.cx + (to.cx - pullFrom.cx) * e,
          cz: PCZ,
          s: Math.exp(Math.log(pullFrom.s) + (Math.log(to.s) - Math.log(pullFrom.s)) * e),
          th: pullFrom.th + (to.th - pullFrom.th) * easeInOutCubic(((t - pullStart) / pullDur - 0.1) / 0.9),
        }
      } else {
        const target = t < drawEnd || final ? followCam(clamp(tdraw, 0, td), L, th) : endCam(L)
        const k = 1 - Math.exp(-dt * 2.6)
        cam = {
          cx: cam.cx + (target.cx - cam.cx) * k,
          cz: PCZ,
          s: Math.exp(Math.log(cam.s) + (Math.log(target.s) - Math.log(cam.s)) * k),
          th,
        }
      }
      setCam(cam, L)

      // dots: keep them legible as the camera pulls back
      const comp = L.pan ? clamp(Math.pow(L.sPan / cam.s, 0.62), 1, Math.max(1, maxComp)) : 1
      if (Math.abs(comp - lastComp) > 0.004) {
        lastComp = comp
        for (let i = 0; i < cursor; i++) dotsEl[i]?.setAttribute('r', (dots[i].r * comp).toFixed(2))
      }
      const tt = skipped ? Infinity : tdraw
      let k = cursor
      let settled = true
      while (k < dots.length && dots[k].t <= tt) {
        const age = tt - dots[k].t
        const pop = age >= 0.22 ? 1 : easeOutBack(age / 0.22)
        dotsEl[k]?.setAttribute('r', Math.max(0, dots[k].r * comp * pop).toFixed(2))
        if (age >= 0.22 && settled) cursor = k + 1
        else settled = false
        k++
      }

      // landmark drawings, as the line reaches them
      for (let i = 0; i < lmEl.length; i++) {
        if (lmOn[i]) continue
        const lt = plan.lms[i].t
        if (lt < 0 || tt >= lt) {
          lmOn[i] = true
          lmEl[i].classList.add('on')
          if (lt < 0) lmEl[i].classList.add('now')
        }
      }

      // the window at home
      if (final && glowRef.current) {
        const g = skipped ? 1 : smooth01((t - glowStart) / glowDur)
        glowRef.current.style.opacity = g.toFixed(3)
        const sc = 0.5 + 0.5 * easeOutCubic(skipped ? 1 : (t - glowStart) / (glowDur * 1.3))
        glowRef.current.setAttribute('transform', `translate(${f1(base.home.window[0] + 1.5)} ${f1(base.home.window[1] + 1.7)}) scale(${sc.toFixed(3)})`)
        if (winRef.current) winRef.current.style.opacity = smooth01(skipped ? 1 : (t - glowStart) / (glowDur * 0.45)).toFixed(3)
      }

      if (t >= doneAt && cursor >= dots.length && !finished) {
        finished = true
        setDone(true)
      }
      if (!finished) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [plan, final, reduced, base])

  // keep the resting view right after a resize
  useEffect(() => {
    const st = stageRef.current
    const cm = camRef.current
    if (!st || !cm) return
    const fixed: Cam = !layout.pan ? fullCam(layout, cm.th) : { ...clampCam(cm, layout), s: clamp(cm.s, layout.sFit, layout.sPan) }
    if (done && final && layout.pan && layout.sRot && !reduced) Object.assign(fixed, turnedCam(layout))
    st.style.transform = stageTransform(fixed, layout)
  }, [layout, done, final, reduced])

  // input: skip the drawing after a moment, then dismiss
  useEffect(() => {
    const handle = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.repeat || e.metaKey || e.ctrlKey || e.altKey)) return
      const c = clock.current
      if (c.dismissed) return
      const t = (performance.now() - c.t0) / 1000
      if (t < c.doneAt) {
        if (t >= 1.5 && c.skipTo < 0) {
          c.skipTo = c.doneAt
          c.skippedAt = performance.now()
        }
        return
      }
      if (c.skippedAt > 0 && performance.now() - c.skippedAt < 650) return
      c.dismissed = true
      onDoneRef.current()
    }
    window.addEventListener('keydown', handle)
    window.addEventListener('pointerdown', handle)
    return () => {
      window.removeEventListener('keydown', handle)
      window.removeEventListener('pointerdown', handle)
    }
  }, [])

  const sb = sBase(layout)
  const initialCam = !layout.pan ? fullCam(layout, reduced ? 0 : TILT - 3.2) : fullCam(layout, 0)

  return (
    <div className={`lwh-map${reduced ? ' lwh-reduced' : ''}`} role="presentation">
      <div className="lwh-map-dim" />
      <div className="lwh-map-rise">
        <div
          ref={stageRef}
          className="lwh-map-stage"
          style={{ width: `${((PW + 2 * M) * sb).toFixed(1)}px`, height: `${((PH + 2 * M) * sb).toFixed(1)}px`, transform: stageTransform(initialCam, layout) }}
        >
          <BaseSheet base={base} grain={grain} />
          <svg ref={overRef} className="lwh-map-over" viewBox={VB} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <radialGradient id="lwh-glow">
                <stop offset="0" stopColor={GLOW} stopOpacity="0.95" />
                <stop offset="0.35" stopColor={GLOW} stopOpacity="0.5" />
                <stop offset="1" stopColor={GLOW} stopOpacity="0" />
              </radialGradient>
              <clipPath id="lwh-frame-o">
                <path d={base.frameClip} />
              </clipPath>
            </defs>
            <g clipPath="url(#lwh-frame-o)">
              {/* home: the window lights at the very end of the day */}
              {final && (
                <>
                  <g ref={glowRef} style={{ opacity: 0 }}>
                    <circle r="44" fill="url(#lwh-glow)" />
                  </g>
                  <HomeHouse base={base} lit={winRef} />
                </>
              )}

              {/* landmark drawings, only for places he passed */}
              {plan.lms.map((l) => (
                <g key={l.id} className="lwh-lm" transform={`translate(${f1(l.x)} ${f1(l.z)}) rotate(${f1(l.rot)}) scale(${l.scale})`}>
                  {(glyphs.get(l.glyph) ?? []).map((p, j) =>
                    p.f ? (
                      <path key={j} className="gf" d={p.d} fill={p.f} />
                    ) : (
                      <path key={j} className="gs" d={p.d} pathLength={1} fill="none" stroke={p.c ?? INK} strokeWidth={p.w ?? 0.7} strokeLinecap="round" strokeLinejoin="round" />
                    ),
                  )}
                </g>
              ))}

              {/* the route: the only red on the screen */}
              <g className="lwh-route" fill={ROUTE}>
                {plan.dots.map((d, i) => (
                  <circle key={i} className="lwh-dot" cx={f1(d.x)} cy={f1(d.z)} r={d.t < 0 ? d.r.toFixed(2) : 0} />
                ))}
              </g>
            </g>
          </svg>
        </div>
      </div>
      <div className={`lwh-map-next${done ? ' on' : ''}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

export default MapScreen

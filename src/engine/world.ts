// The world: one heightfield for the whole coast, built from data at load.
//
// Height is composed in a fixed order, each stage a pure function of position:
//   1. land that rises inland from the coastline, and a seabed that falls away
//   2. hills and plateaus, smooth-maxed in and cut off into cliffs at the sea
//   3. the canyon, carved down to a floor with terraced limestone walls
//   4. every walkable route and area, flattened (so paths sit in the land)
//   5. rivers and the ravine, carved last (so a log or plank bridges them)
//   6. roads, flattened
// Walkability is separate from height: the boy can stand anywhere inside a
// route corridor or an area of the current chapter, and nowhere else.

import { Polyline, inPoly, polyEdgeDist } from './path'
import { fbm, clamp, smoothstep, lerp } from './noise'
import type { Area, Chapter, PathPt, Surface, WorldData } from './types'

export interface WalkPath {
  line: Polyline // channels: 0 = y, 1 = width
  chapter: number
  main: boolean
  bridge: boolean // walked over, never flattened into the land (a jetty)
}

interface AreaRt extends Area {
  chapter: number
}

export type ChapterSel = number | number[]
const inSel = (c: number, sel: ChapterSel) => (Array.isArray(sel) ? sel.includes(c) : sel < 0 || c === sel)

export class World {
  data: WorldData
  chapters: Chapter[]
  coast: Polyline
  hills: Polyline[]
  valleys: Polyline[]
  rivers: Polyline[]
  roads: Polyline[]
  walks: WalkPath[] = []
  areas: AreaRt[] = []
  mains: Polyline[] = []

  // heightfield
  nx: number
  nz: number
  x0: number
  z0: number
  cell: number
  h: Float32Array
  wall: Float32Array // 0..1 how much this vertex is canyon wall / cliff
  walkK: Float32Array // 0..1 how much this vertex was flattened by a route
  wet: Float32Array // 0..1 river bed
  road: Float32Array
  coastD: Float32Array // signed, + inland

  constructor(data: WorldData, chapters: Chapter[]) {
    this.data = data
    this.chapters = chapters
    this.coast = new Polyline(data.coast, 6, false)
    this.hills = data.hills.map((h) => new Polyline(h.path, 4))
    this.valleys = data.valleys.map((v) => new Polyline(v.path, 2))
    this.rivers = data.rivers.map((r) => new Polyline(r.path, 1.5))
    this.roads = data.roads.map((r) => new Polyline(r.path, 2))
    chapters.forEach((ch, ci) => {
      const main = new Polyline(ch.main as number[][], 1)
      this.mains.push(main)
      this.walks.push({ line: main, chapter: ci, main: true, bridge: false })
      for (const b of ch.branches)
        this.walks.push({ line: new Polyline(b.path as number[][], 1), chapter: ci, main: false, bridge: !!b.bridge })
      for (const a of ch.areas) this.areas.push({ ...a, chapter: ci })
    })

    const [bx0, bz0, bx1, bz1] = data.bounds
    this.cell = data.cell
    this.x0 = bx0
    this.z0 = bz0
    this.nx = Math.ceil((bx1 - bx0) / this.cell) + 1
    this.nz = Math.ceil((bz1 - bz0) / this.cell) + 1
    const N = this.nx * this.nz
    this.h = new Float32Array(N)
    this.wall = new Float32Array(N)
    this.walkK = new Float32Array(N)
    this.wet = new Float32Array(N)
    this.road = new Float32Array(N)
    this.coastD = new Float32Array(N)
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i
        const x = this.x0 + i * this.cell
        const z = this.z0 + j * this.cell
        this.sample(x, z, k)
      }
  }

  /** Signed distance to the coastline, positive inland. */
  coastDist(x: number, z: number) {
    const n = this.coast.nearest(x, z)!
    return n.side > 0 ? -n.d : n.d
  }

  /** Dev: the land's height at (x, z) before any route or river touches it. */
  natural(x: number, z: number) {
    const saveWalks = this.walks
    const saveAreas = this.areas
    const saveRivers = this.rivers
    const saveRoads = this.roads
    this.walks = []
    this.areas = []
    this.rivers = []
    this.roads = []
    const k = 0
    const keep = [this.h[k], this.wall[k], this.walkK[k], this.wet[k], this.road[k], this.coastD[k]]
    this.sample(x, z, k)
    const h = this.h[k]
    ;[this.h[k], this.wall[k], this.walkK[k], this.wet[k], this.road[k], this.coastD[k]] = keep
    this.walks = saveWalks
    this.areas = saveAreas
    this.rivers = saveRivers
    this.roads = saveRoads
    return h
  }

  private sample(x: number, z: number, k: number) {
    const L = this.data.land
    const dc = this.coastDist(x, z)
    this.coastD[k] = dc
    // 1. land and seabed
    let h: number
    if (dc > 0) {
      h = Math.min(L.max, dc * L.slope) + fbm(x * L.noiseScale, z * L.noiseScale, 4) * L.noise * smoothstep(0, 40, dc)
      h = Math.max(h, dc * 0.04)
    } else {
      h = -Math.min(16, 0.6 + -dc * L.seabed)
    }
    // 2. hills, cut into cliffs at the sea
    const cliffK = smoothstep(2, L.cliff, dc)
    let wallness = 0
    this.hills.forEach((line, hi) => {
      const hd = this.data.hills[hi]
      const n = line.nearest(x, z)!
      const reach = hd.radius + hd.falloff
      if (n.d > reach) return
      const top = line.e(0, n.s) + fbm(x * 0.04, z * 0.04, 3) * 2.2
      const hh = top * (1 - smoothstep(hd.radius, reach, n.d)) * cliffK
      if (hh > h) {
        if (dc > 0 && dc < L.cliff * 1.2) wallness = Math.max(wallness, (1 - cliffK) * clamp(hh / 10, 0, 1))
        h = smax(h, hh, 6)
      }
    })
    // 3. the canyon
    this.valleys.forEach((line, vi) => {
      const vd = this.data.valleys[vi]
      const n = line.nearest(x, z)!
      const floor = line.e(0, n.s)
      const half = line.e(1, n.s)
      const u = n.d - half
      if (u > 140) return
      let steep = vd.steep
      for (const s of vd.soften ?? []) {
        const dd = Math.hypot(x - s.at[0], z - s.at[1])
        steep = lerp(s.steep, steep, smoothstep(s.radius * 0.4, s.radius, dd))
      }
      let rise = 0
      if (u > 0) {
        const t = 1 - Math.exp(-u / steep)
        rise = vd.wall * t
        // terraces: flat-topped ledges with steep risers, the limestone read
        const q = vd.terrace
        const f = rise / q
        const fl = Math.floor(f)
        rise = (fl + smoothstep(0.5, 0.95, f - fl)) * q
        rise += fbm(x * 0.09, z * 0.09, 3) * 1.4 * t
      }
      const carved = floor + rise
      if (carved < h) {
        wallness = Math.max(wallness, u > 0 ? clamp(u / 6, 0, 1) * (1 - smoothstep(vd.wall * 0.85, vd.wall + 4, rise)) : 0)
        h = carved
      }
    })
    // 4. routes and areas
    let walkK = 0
    for (const w of this.walks) {
      const line = w.line
      if (w.bridge) continue
      if (x < line.minX - 16 || x > line.maxX + 16 || z < line.minZ - 16 || z > line.maxZ + 16) continue
      const n = line.nearest(x, z, 14)
      if (!n) continue
      const half = line.e(1, n.s) * 0.5
      const shoulder = 5.5
      const kk = n.d <= half + 0.7 ? 1 : smoothstep(half + shoulder, half + 0.7, n.d)
      if (kk <= 0) continue
      const target = line.e(0, n.s) - 0.14
      h = lerp(h, target, kk)
      walkK = Math.max(walkK, kk)
      if (kk > 0.5) wallness *= 1 - kk
    }
    for (const a of this.areas) {
      if (a.y === undefined) continue
      let edge: number
      if (a.circle) edge = Math.hypot(x - a.circle[0], z - a.circle[1]) - a.circle[2]
      else if (a.poly) edge = inPoly(x, z, a.poly) ? -polyEdgeDist(x, z, a.poly) : polyEdgeDist(x, z, a.poly)
      else continue
      if (edge > 6) continue
      const kk = edge <= 0.5 ? 1 : smoothstep(6, 0.5, edge)
      h = lerp(h, a.y - 0.08, kk)
      walkK = Math.max(walkK, kk)
      if (kk > 0.5) wallness *= 1 - kk
    }
    // 5. rivers and the ravine
    let wet = 0
    this.rivers.forEach((line, ri) => {
      const dry = this.data.rivers[ri].dry
      if (x < line.minX - 30 || x > line.maxX + 30 || z < line.minZ - 30 || z > line.maxZ + 30) return
      const n = line.nearest(x, z, 24)
      if (!n) return
      const wy = line.e(0, n.s)
      const half = line.e(1, n.s) * 0.5
      const depth = line.e(2, n.s)
      let prof: number
      if (n.d < half) {
        const r = n.d / half
        prof = wy - depth * (1 - r * r * r * r) + (dry ? 0 : -0.05)
      } else {
        prof = dry ? wy - depth + (n.d - half) * 3.2 + depth * 0.8 : wy + 0.2 + (n.d - half) * 0.55
      }
      if (prof < h) {
        h = prof
        if (!dry && n.d < half) wet = Math.max(wet, 1 - n.d / half)
        if (dry) wallness = Math.max(wallness, 0.9)
      }
    })
    // 6. roads
    let road = 0
    this.roads.forEach((line, ri) => {
      if (x < line.minX - 12 || x > line.maxX + 12 || z < line.minZ - 12 || z > line.maxZ + 12) return
      const n = line.nearest(x, z, 10)
      if (!n) return
      const half = this.data.roads[ri].width * 0.5
      const kk = n.d <= half ? 1 : smoothstep(half + 4, half, n.d)
      if (kk <= 0) return
      h = lerp(h, line.e(0, n.s), kk)
      road = Math.max(road, n.d <= half ? 1 : 0)
      wallness *= 1 - kk
    })
    this.h[k] = h
    this.wall[k] = wallness
    this.walkK[k] = walkK
    this.wet[k] = wet
    this.road[k] = road
  }

  /** Terrain height (bilinear over the grid). */
  ground(x: number, z: number) {
    const fx = clamp((x - this.x0) / this.cell, 0, this.nx - 1.001)
    const fz = clamp((z - this.z0) / this.cell, 0, this.nz - 1.001)
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const tx = fx - i
    const tz = fz - j
    const k = j * this.nx + i
    const a = this.h[k]
    const b = this.h[k + 1]
    const c = this.h[k + this.nx]
    const d = this.h[k + this.nx + 1]
    // match the triangulation used by the mesh (split along i+j diagonal)
    if (tx + tz < 1) return a + (b - a) * tx + (c - a) * tz
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz)
  }

  /** The route corridor the point is in, for chapter `ci` (or any chapter if ci < 0). */
  corridor(x: number, z: number, ci: ChapterSel) {
    let best: { w: WalkPath; s: number; d: number; half: number; y: number } | null = null
    for (const w of this.walks) {
      if (!inSel(w.chapter, ci)) continue
      const n = w.line.nearest(x, z, 12)
      if (!n) continue
      const half = w.line.e(1, n.s) * 0.5
      if (n.d > half) continue
      const score = n.d / half
      if (!best || score < best.d / best.half) best = { w, s: n.s, d: n.d, half, y: w.line.e(0, n.s) }
    }
    return best
  }

  areaAt(x: number, z: number, ci: ChapterSel) {
    for (const a of this.areas) {
      if (!inSel(a.chapter, ci)) continue
      if (a.circle && Math.hypot(x - a.circle[0], z - a.circle[1]) <= a.circle[2]) return a
      if (a.poly && inPoly(x, z, a.poly)) return a
    }
    return null
  }

  walkable(x: number, z: number, ci: ChapterSel) {
    return !!this.corridor(x, z, ci) || !!this.areaAt(x, z, ci)
  }

  /** Where the boy's feet go at (x, z). */
  standY(x: number, z: number, ci: ChapterSel) {
    const c = this.corridor(x, z, ci)
    if (c) {
      // a bridge (log, plank) is the route's height; otherwise follow the
      // ground where it was flattened, so paths and areas agree at seams
      const g = this.ground(x, z) + 0.14
      return g < c.y - 0.5 ? c.y : Math.max(g, c.y - 0.05) * 0.5 + c.y * 0.5
    }
    const a = this.areaAt(x, z, ci)
    if (a && a.y !== undefined) return lerp(this.ground(x, z) + 0.08, a.y, 0.5)
    return this.ground(x, z)
  }

  surfaceAt(x: number, z: number, ci: ChapterSel): Surface {
    const ch = this.chapters[Array.isArray(ci) ? ci[0] : Math.max(0, ci)]
    const c = this.corridor(x, z, ci)
    if (c) {
      const g = this.ground(x, z)
      if (g < c.y - 0.5) return 'wood'
      if (this.inWater(x, z)) return 'water'
      return ch.surface
    }
    const a = this.areaAt(x, z, ci)
    if (a) return a.surface
    return ch.surface
  }

  /** The surface of the nearest running river at (x, z), or null. */
  waterY(x: number, z: number): number | null {
    for (let ri = 0; ri < this.rivers.length; ri++) {
      if (this.data.rivers[ri].dry) continue
      const line = this.rivers[ri]
      const n = line.nearest(x, z, 12)
      if (n && n.d < line.e(1, n.s) * 0.5 + 1.5) return line.e(0, n.s)
    }
    return null
  }

  inWater(x: number, z: number) {
    for (let ri = 0; ri < this.rivers.length; ri++) {
      if (this.data.rivers[ri].dry) continue
      const line = this.rivers[ri]
      const n = line.nearest(x, z, 12)
      if (n && n.d < line.e(1, n.s) * 0.5 && this.ground(x, z) < line.e(0, n.s)) return true
    }
    return false
  }

  /**
   * Keep a proposed position inside the chapter's walkable space. Tries the
   * move, then each axis alone (so walls slide), then pulls back onto the
   * nearest corridor edge.
   */
  constrain(px: number, pz: number, nx: number, nz: number, ci: ChapterSel): [number, number] {
    if (this.walkable(nx, nz, ci)) return [nx, nz]
    if (this.walkable(nx, pz, ci)) return [nx, pz]
    if (this.walkable(px, nz, ci)) return [px, nz]
    // pull onto the nearest corridor edge
    let best: [number, number] = [px, pz]
    let bestD = Infinity
    for (const w of this.walks) {
      if (!inSel(w.chapter, ci)) continue
      const n = w.line.nearest(nx, nz, 20)
      if (!n) continue
      const half = w.line.e(1, n.s) * 0.5 * 0.96
      const cx = w.line.x(n.s)
      const cz = w.line.z(n.s)
      const dx = nx - cx
      const dz = nz - cz
      const l = Math.hypot(dx, dz) || 1
      const qx = cx + (dx / l) * Math.min(l, half)
      const qz = cz + (dz / l) * Math.min(l, half)
      const dd = Math.hypot(qx - nx, qz - nz)
      if (dd < bestD) {
        bestD = dd
        best = [qx, qz]
      }
    }
    for (const a of this.areas) {
      if (!inSel(a.chapter, ci) || !a.circle) continue
      const [cx, cz, r] = a.circle
      const dx = nx - cx
      const dz = nz - cz
      const l = Math.hypot(dx, dz) || 1
      const qx = cx + (dx / l) * Math.min(l, r * 0.97)
      const qz = cz + (dz / l) * Math.min(l, r * 0.97)
      const dd = Math.hypot(qx - nx, qz - nz)
      if (dd < bestD) {
        bestD = dd
        best = [qx, qz]
      }
    }
    // never teleport more than a step
    if (Math.hypot(best[0] - px, best[1] - pz) > 1.5) return [px, pz]
    return best
  }

  /** Distance to the nearest walkable space of any chapter (for dressing). Capped at `cap`. */
  walkClearance(x: number, z: number, cap = 12) {
    let best = cap
    for (const w of this.walks) {
      const line = w.line
      if (x < line.minX - cap - 6 || x > line.maxX + cap + 6 || z < line.minZ - cap - 6 || z > line.maxZ + cap + 6) continue
      const n = line.nearest(x, z, cap + 4)
      if (!n) continue
      best = Math.min(best, n.d - line.e(1, n.s) * 0.5)
    }
    for (const a of this.areas) {
      let e = cap
      if (a.circle) e = Math.hypot(x - a.circle[0], z - a.circle[1]) - a.circle[2]
      else if (a.poly) e = inPoly(x, z, a.poly) ? -1 : polyEdgeDist(x, z, a.poly)
      best = Math.min(best, e)
    }
    return best
  }

  riverClearance(x: number, z: number) {
    let best = 99
    for (const line of this.rivers) {
      const n = line.nearest(x, z, 20)
      if (n) best = Math.min(best, n.d - line.e(1, n.s) * 0.5)
    }
    return best
  }

  roadClearance(x: number, z: number) {
    let best = 99
    this.roads.forEach((line, i) => {
      const n = line.nearest(x, z, 20)
      if (n) best = Math.min(best, n.d - this.data.roads[i].width * 0.5)
    })
    return best
  }

  /** Grid index helpers for the mesh builder. */
  idx(i: number, j: number) {
    return j * this.nx + i
  }
}

function smax(a: number, b: number, k: number) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1)
  return lerp(a, b, h) + k * h * (1 - h)
}

export function pathPts(p: PathPt[]) {
  return p as number[][]
}

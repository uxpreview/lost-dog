// A smoothed polyline in plan (x, z) with any number of extra channels carried
// along it (height, width, depth...). Routes, branches, rivers, valleys and
// roads are all one of these. Sampled every ~1m, with a spatial hash so
// nearest-point queries stay cheap when the terrain asks a hundred thousand of
// them at load.

export interface Near {
  s: number // distance along the line
  d: number // unsigned distance from the line
  side: number // signed lateral offset (+ is to the right of travel)
  i: number // segment index
  t: number // 0..1 within segment
}

const HASH = 12

export class Polyline {
  xs: Float64Array
  zs: Float64Array
  ex: Float64Array[]
  s: Float64Array
  length: number
  n: number
  private hash = new Map<number, number[]>()
  minX = Infinity
  maxX = -Infinity
  minZ = Infinity
  maxZ = -Infinity

  constructor(points: number[][], step = 1, smooth = true) {
    const channels = Math.max(0, ...points.map((p) => p.length - 2))
    // fill missing trailing channels from the previous point (width defaults carry)
    const pts = points.map((p) => p.slice())
    for (let i = 0; i < pts.length; i++) {
      for (let c = 2; c < 2 + channels; c++) {
        if (pts[i][c] === undefined || pts[i][c] === null) {
          pts[i][c] = i > 0 ? pts[i - 1][c] : pts.find((q) => q[c] !== undefined)?.[c] ?? 0
        }
      }
    }
    const outX: number[] = []
    const outZ: number[] = []
    const outE: number[][] = Array.from({ length: channels }, () => [])
    const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))]
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = P(i - 1)
      const p1 = P(i)
      const p2 = P(i + 1)
      const p3 = P(i + 2)
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
      const n = Math.max(1, Math.ceil(segLen / step))
      for (let k = 0; k < n; k++) {
        const t = k / n
        if (smooth) {
          outX.push(cr(p0[0], p1[0], p2[0], p3[0], t))
          outZ.push(cr(p0[1], p1[1], p2[1], p3[1], t))
        } else {
          outX.push(p1[0] + (p2[0] - p1[0]) * t)
          outZ.push(p1[1] + (p2[1] - p1[1]) * t)
        }
        // extra channels: smoothstep-eased linear, so heights never overshoot
        const e = t * t * (3 - 2 * t)
        const tt = smooth ? e * 0.5 + t * 0.5 : t
        for (let c = 0; c < channels; c++) outE[c].push(p1[c + 2] + (p2[c + 2] - p1[c + 2]) * tt)
      }
    }
    const last = pts[pts.length - 1]
    outX.push(last[0])
    outZ.push(last[1])
    for (let c = 0; c < channels; c++) outE[c].push(last[c + 2])

    this.n = outX.length
    this.xs = Float64Array.from(outX)
    this.zs = Float64Array.from(outZ)
    this.ex = outE.map((a) => Float64Array.from(a))
    this.s = new Float64Array(this.n)
    for (let i = 1; i < this.n; i++) {
      this.s[i] = this.s[i - 1] + Math.hypot(this.xs[i] - this.xs[i - 1], this.zs[i] - this.zs[i - 1])
    }
    this.length = this.s[this.n - 1]
    for (let i = 0; i < this.n; i++) {
      this.minX = Math.min(this.minX, this.xs[i])
      this.maxX = Math.max(this.maxX, this.xs[i])
      this.minZ = Math.min(this.minZ, this.zs[i])
      this.maxZ = Math.max(this.maxZ, this.zs[i])
    }
    for (let i = 0; i < this.n - 1; i++) {
      const x0 = Math.min(this.xs[i], this.xs[i + 1])
      const x1 = Math.max(this.xs[i], this.xs[i + 1])
      const z0 = Math.min(this.zs[i], this.zs[i + 1])
      const z1 = Math.max(this.zs[i], this.zs[i + 1])
      for (let gx = Math.floor(x0 / HASH); gx <= Math.floor(x1 / HASH); gx++)
        for (let gz = Math.floor(z0 / HASH); gz <= Math.floor(z1 / HASH); gz++) {
          const k = key(gx, gz)
          let b = this.hash.get(k)
          if (!b) this.hash.set(k, (b = []))
          b.push(i)
        }
    }
  }

  /** Nearest point on the line, searching at most `maxD` meters away. Returns null beyond that. */
  nearest(x: number, z: number, maxD = 1e9): Near | null {
    if (maxD < 1e8) {
      const r = Math.ceil(maxD / HASH)
      const gx0 = Math.floor(x / HASH)
      const gz0 = Math.floor(z / HASH)
      let best: Near | null = null
      let bestD2 = maxD * maxD
      const seen = new Set<number>()
      for (let gx = gx0 - r; gx <= gx0 + r; gx++)
        for (let gz = gz0 - r; gz <= gz0 + r; gz++) {
          const b = this.hash.get(key(gx, gz))
          if (!b) continue
          for (const i of b) {
            if (seen.has(i)) continue
            seen.add(i)
            const res = this.segTest(i, x, z)
            if (res.d2 < bestD2) {
              bestD2 = res.d2
              best = this.makeNear(i, res.t, x, z, res.d2)
            }
          }
        }
      return best
    }
    let bi = 0
    let bt = 0
    let bd = Infinity
    for (let i = 0; i < this.n - 1; i++) {
      const r = this.segTest(i, x, z)
      if (r.d2 < bd) {
        bd = r.d2
        bi = i
        bt = r.t
      }
    }
    return this.makeNear(bi, bt, x, z, bd)
  }

  private segTest(i: number, x: number, z: number) {
    const ax = this.xs[i]
    const az = this.zs[i]
    const bx = this.xs[i + 1]
    const bz = this.zs[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const l2 = dx * dx + dz * dz || 1e-9
    let t = ((x - ax) * dx + (z - az) * dz) / l2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const px = ax + dx * t - x
    const pz = az + dz * t - z
    return { t, d2: px * px + pz * pz }
  }

  private makeNear(i: number, t: number, x: number, z: number, d2: number): Near {
    const dx = this.xs[i + 1] - this.xs[i]
    const dz = this.zs[i + 1] - this.zs[i]
    const l = Math.hypot(dx, dz) || 1
    // right of travel direction (dx,dz) in x-east z-south plan is (-dz, dx)
    const side = ((x - this.xs[i]) * -dz + (z - this.zs[i]) * dx) / l
    return { s: this.s[i] + (this.s[i + 1] - this.s[i]) * t, d: Math.sqrt(d2), side, i, t }
  }

  /** Index + fraction for a distance along the line. */
  private locate(s: number): [number, number] {
    if (s <= 0) return [0, 0]
    if (s >= this.length) return [this.n - 2, 1]
    let lo = 0
    let hi = this.n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (this.s[mid] <= s) lo = mid
      else hi = mid
    }
    const span = this.s[hi] - this.s[lo] || 1
    return [lo, (s - this.s[lo]) / span]
  }

  x(s: number) {
    const [i, t] = this.locate(s)
    return this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t
  }
  z(s: number) {
    const [i, t] = this.locate(s)
    return this.zs[i] + (this.zs[i + 1] - this.zs[i]) * t
  }
  /** channel c (0 = first extra, typically height) at s */
  e(c: number, s: number) {
    const a = this.ex[c]
    if (!a) return 0
    const [i, t] = this.locate(s)
    return a[i] + (a[i + 1] - a[i]) * t
  }
  /** unit tangent at s, averaged over a few meters so it never snaps at a vertex */
  tangent(s: number, span = 3): [number, number] {
    const x0 = this.x(s - span)
    const z0 = this.z(s - span)
    const x1 = this.x(s + span)
    const z1 = this.z(s + span)
    const l = Math.hypot(x1 - x0, z1 - z0) || 1
    return [(x1 - x0) / l, (z1 - z0) / l]
  }
  /** s of the point on the line nearest (x, z) */
  project(x: number, z: number) {
    return this.nearest(x, z)!.s
  }
}

function cr(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

function key(gx: number, gz: number) {
  return (gx + 4096) * 8192 + (gz + 4096)
}

/** Point in polygon (plan). */
export function inPoly(x: number, z: number, poly: number[][]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0]
    const zi = poly[i][1]
    const xj = poly[j][0]
    const zj = poly[j][1]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Distance from a point to a polygon's boundary (plan). */
export function polyEdgeDist(x: number, z: number, poly: number[][]) {
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0]
    const az = poly[j][1]
    const dx = poly[i][0] - ax
    const dz = poly[i][1] - az
    const l2 = dx * dx + dz * dz || 1e-9
    let t = ((x - ax) * dx + (z - az) * dz) / l2
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z))
  }
  return best
}

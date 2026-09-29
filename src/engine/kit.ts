// The prop kit. Everything in the world is modeled here from a handful of
// primitives, each part flat-colored from the palette, merged into one
// geometry per prop. Silhouette first: umbrella pines, cypress spires, hip
// roofs, a bell tower, boats with pointed bows.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PAL, lin } from './palette'

type Col = string | [number, number, number]

const Q = new THREE.Quaternion()
const E = new THREE.Euler()
const V = new THREE.Vector3()
const S = new THREE.Vector3()

export function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz))
}

export class Kit {
  parts: THREE.BufferGeometry[] = []

  /** Add a primitive with a flat color. `window` marks it as glass that can glow at night. */
  add(geo: THREE.BufferGeometry, color: Col, m?: THREE.Matrix4, o: { window?: boolean; jitter?: number; tone?: number } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone()
    g.deleteAttribute('uv')
    if (m) g.applyMatrix4(m)
    if (o.jitter) {
      const p = g.attributes.position
      // jitter shared corners identically so faces stay closed
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i)
        const y = p.getY(i)
        const z = p.getZ(i)
        const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
        const r = h - Math.floor(h)
        const h2 = Math.sin(x * 93.989 + y * 67.345 + z * 12.345) * 24634.6345
        const r2 = h2 - Math.floor(h2)
        p.setXYZ(i, x + (r - 0.5) * o.jitter, y + (r2 - 0.5) * o.jitter, z + (r - r2) * o.jitter)
      }
      g.computeVertexNormals()
    }
    const c = typeof color === 'string' ? lin(color) : color
    const t = o.tone ?? 1
    const n = g.attributes.position.count
    const arr = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      arr[i * 4] = c[0] * t
      arr[i * 4 + 1] = c[1] * t
      arr[i * 4 + 2] = c[2] * t
      arr[i * 4 + 3] = o.window ? 1 : 0
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 4))
    if (!g.attributes.normal) g.computeVertexNormals()
    this.parts.push(g)
    return this
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

// primitives (unit sized, base at y = 0 where it matters)
const box = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const cyl = (seg = 6, top = 1) => new THREE.CylinderGeometry(0.5 * top, 0.5, 1, seg, 1).translate(0, 0.5, 0)
const cone = (seg = 6) => new THREE.ConeGeometry(0.5, 1, seg, 1).translate(0, 0.5, 0)
const ico = (detail = 0) => new THREE.IcosahedronGeometry(0.5, detail)
const pyramid = () => new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0)

type R = () => number

// ------------------------------------------------------------------ trees

/**
 * An umbrella pine. `low` builds the far version of the same tree: the same
 * random draws (so the same height, lean and spread), one canopy mass.
 */
export function umbrellaPine(r: R, low = false) {
  const k = new Kit()
  const h = 6.5 + r() * 4
  const lean = (r() - 0.5) * 0.25
  const leanDir = r() * Math.PI * 2
  const lx = Math.sin(lean) * Math.cos(leanDir)
  const lz = Math.sin(lean) * Math.sin(leanDir)
  k.add(cyl(5, 0.65), PAL.pineTrunk, T(0, 0, 0, lz, 0, -lx, 0.42, h * 0.62, 0.42), { tone: 0.92 })
  const topX = -Math.sin(-lx) * h * 0.62
  const topZ = Math.sin(lz) * h * 0.62
  const top = h * 0.6
  // two or three arms fork up into the canopy
  const arms = 2 + Math.floor(r() * 2)
  for (let a = 0; a < arms; a++) {
    const ang = (a / arms) * Math.PI * 2 + r()
    if (!low) k.add(cyl(4, 0.6), PAL.pineTrunk, T(topX, top - 0.3, topZ, Math.cos(ang) * 0.7, 0, Math.sin(ang) * 0.7, 0.2, h * 0.32, 0.2), { tone: 0.85 })
  }
  // the umbrella: overlapping flattened blobs, lighter on top
  const R0 = 2.4 + r() * 1.4
  const blobs = 4 + Math.floor(r() * 3)
  for (let b = 0; b < blobs; b++) {
    const a = (b / blobs) * Math.PI * 2 + r() * 0.8
    const d = b === 0 ? 0 : R0 * (0.45 + r() * 0.4)
    const s = R0 * (0.9 + r() * 0.5) * (b === 0 ? 1.25 : 1)
    const y = h * 0.86 + (r() - 0.3) * 0.8
    const x = topX + Math.cos(a) * d
    const z = topZ + Math.sin(a) * d
    const ry = r() * 3
    const tone = 0.82 + r() * 0.12
    if (!low) k.add(ico(0), PAL.pineCanopy, T(x, y, z, 0, ry, 0, s, s * 0.36, s), { tone, jitter: 0.3 })
    else if (b === 0) k.add(ico(0), PAL.pineCanopy, T(x, y + 0.2, z, 0, ry, 0, R0 * 2.3, R0 * 0.7, R0 * 2.3), { tone })
    if (b % 2 === 0) {
      const ry2 = r() * 3
      const t2 = 0.9 + r() * 0.15
      if (!low) k.add(ico(0), PAL.pineCanopyLight, T(x, y + s * 0.12, z, 0, ry2, 0, s * 0.75, s * 0.22, s * 0.75), { tone: t2 })
    }
  }
  return k.build()
}

export function cypress(r: R) {
  const k = new Kit()
  const h = 6 + r() * 4
  const w = 1.1 + r() * 0.4
  k.add(cyl(5), PAL.pineTrunk, T(0, 0, 0, 0, 0, 0, 0.25, 1.2, 0.25))
  k.add(ico(0), PAL.cypress, T(0, h * 0.45, 0, 0, r() * 3, 0, w * 1.1, h * 0.95, w * 1.1), { jitter: 0.1, tone: 0.9 + r() * 0.15 })
  k.add(cone(6), PAL.cypress, T(0, h * 0.72, 0, 0, r() * 3, 0, w * 0.7, h * 0.34, w * 0.7), { tone: 1.05 })
  return k.build()
}

export function olive(r: R) {
  const k = new Kit()
  const h = 2.4 + r() * 1.2
  k.add(cyl(5, 0.7), PAL.oliveTrunk, T(0, 0, 0, 0.15, 0, 0.1, 0.5, h * 0.7, 0.5))
  k.add(cyl(4, 0.6), PAL.oliveTrunk, T(0.2, h * 0.55, 0, 0, 0, -0.6, 0.28, h * 0.5, 0.28))
  for (let b = 0; b < 4; b++) {
    const a = b * 1.7 + r()
    const s = 1.5 + r() * 0.9
    k.add(ico(0), PAL.olive, T(Math.cos(a) * 1.1, h + r() * 0.8, Math.sin(a) * 1.1, 0, 0, 0, s * 1.3, s * 0.8, s * 1.3), {
      jitter: 0.2,
      tone: 0.85 + r() * 0.25,
    })
  }
  return k.build()
}

export function shrub(r: R, col = PAL.maquis) {
  const k = new Kit()
  const n = 1 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) {
    const s = 0.7 + r() * 1.1
    k.add(ico(0), i % 2 ? PAL.maquisDark : col, T((r() - 0.5) * 1.4, s * 0.3, (r() - 0.5) * 1.4, 0, r() * 3, 0, s * 1.2, s * 0.8, s * 1.2), {
      tone: 0.85 + r() * 0.3,
    })
  }
  return k.build()
}

export function rock(r: R, col = PAL.limeA) {
  const k = new Kit()
  k.add(ico(0), col, T(0, 0.2, 0, r(), r(), r(), 1 + r() * 0.6, 0.7 + r() * 0.5, 1 + r() * 0.5), { jitter: 0.35, tone: 0.9 + r() * 0.15 })
  return k.build()
}

// ------------------------------------------------------------------ town

export interface HouseSpec {
  w: number
  d: number
  floors: number
  wall: string
  roof: string
  shutter: string
  roofType: 'hip' | 'gable' | 'flat'
  seed: number
}

/** A house with its front at +z. Base at y = 0; `plinth` extends below for sloped ground. */
export function house(s: HouseSpec, r: R, plinth = 3, windows = false) {
  const k = new Kit()
  const FH = 3.1
  const H = s.floors * FH
  k.add(box(), s.wall, T(0, -plinth, 0, 0, 0, 0, s.w, H + plinth, s.d), { tone: 0.97 + r() * 0.06 })
  // a darker course at the base
  k.add(box(), PAL.stoneD, T(0, -plinth, 0, 0, 0, 0, s.w + 0.08, plinth + 0.5, s.d + 0.08), { tone: 0.9 })
  // roof
  if (s.roofType === 'hip') {
    k.add(pyramid(), s.roof, T(0, H, 0, 0, 0, 0, s.w * 1.12, 1.7 + s.w * 0.12, s.d * 1.12), { tone: 0.95 + r() * 0.1 })
  } else if (s.roofType === 'gable') {
    const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1).rotateZ(Math.PI / 2).rotateX(0)
    g.translate(0, 0.25, 0)
    k.add(g, s.roof, T(0, H + 0.25, 0, 0, 0, 0, s.w * 1.1, 2.6, s.d * 1.12), { tone: 0.95 + r() * 0.1 })
  } else {
    k.add(box(), s.wall, T(0, H, 0, 0, 0, 0, s.w + 0.2, 0.5, s.d + 0.2), { tone: 0.92 })
  }
  // windows with shutters on the front and sides, a door on the front
  const cols = Math.max(1, Math.floor(s.w / 2.6))
  for (let f = 0; f < s.floors; f++)
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * (s.w / cols)
      const y = f * FH + 1.3
      if (f === 0 && c === Math.floor(cols / 2)) {
        k.add(box(), PAL.door, T(x, 0, s.d / 2, 0, 0, 0, 1.1, 2.2, 0.12))
        continue
      }
      if (r() < 0.15) continue
      k.add(box(), '#3A3F44', T(x, y, s.d / 2, 0, 0, 0, 0.7, 1.1, 0.1), { window: windows, tone: 0.8 })
      const open = r() < 0.6
      if (open) {
        k.add(box(), s.shutter, T(x - 0.62, y, s.d / 2 + 0.05, 0, 0, 0, 0.42, 1.15, 0.06))
        k.add(box(), s.shutter, T(x + 0.62, y, s.d / 2 + 0.05, 0, 0, 0, 0.42, 1.15, 0.06))
      } else {
        k.add(box(), s.shutter, T(x, y, s.d / 2 + 0.03, 0, 0, 0, 0.8, 1.15, 0.08))
      }
    }
  const sideCols = Math.max(1, Math.floor(s.d / 3))
  for (let f = 0; f < s.floors; f++)
    for (let c = 0; c < sideCols; c++) {
      if (r() < 0.4) continue
      const z = (c - (sideCols - 1) / 2) * (s.d / sideCols)
      const y = f * FH + 1.3
      for (const side of [-1, 1]) {
        k.add(box(), s.shutter, T((side * s.w) / 2, y, z, 0, 0, 0, 0.1, 1.1, 0.8), { tone: 0.9 })
      }
    }
  // a balcony sometimes, and a chimney
  if (s.floors > 1 && r() < 0.35) {
    k.add(box(), s.wall, T(0, FH, s.d / 2 + 0.5, 0, 0, 0, 2.4, 0.18, 1.0), { tone: 0.9 })
    k.add(box(), PAL.ink, T(0, FH + 0.18, s.d / 2 + 0.95, 0, 0, 0, 2.4, 0.8, 0.05), { tone: 1.4 })
  }
  if (r() < 0.5) k.add(box(), s.wall, T(s.w * 0.25, H + 0.8, -s.d * 0.2, 0, 0, 0, 0.6, 1.8, 0.6), { tone: 0.94 })
  // what makes one house not its neighbour: flower boxes, an awning, an outside stair
  const variant = r()
  if (variant < 0.45) {
    for (let f = 1; f < s.floors; f++)
      for (let c = 0; c < cols; c++) {
        if (r() < 0.45) continue
        const x = (c - (cols - 1) / 2) * (s.w / cols)
        const g = flowerBox(r)
        g.applyMatrix4(T(x, f * FH + 0.62, s.d / 2 + 0.14))
        k.parts.push(g)
      }
  }
  if (variant > 0.35 && variant < 0.6) {
    const x = (Math.floor(cols / 2) - (cols - 1) / 2) * (s.w / cols)
    for (let i = 0; i < 4; i++) k.add(box(), i % 2 ? PAL.awningCream : PAL.awningOchre, T(x - 0.6 + i * 0.4 + 0.2, 2.45, s.d / 2 + 0.45, 0.35, 0, 0, 0.4, 0.05, 0.95))
  }
  if (variant > 0.72 && s.floors > 1 && s.w > 5) {
    // an outside stair up the front to the first floor
    const n = 9
    for (let i = 0; i < n; i++) k.add(box(), PAL.stoneC, T(s.w / 2 - 0.6 - i * 0.32, 0, s.d / 2 + 0.55, 0, 0, 0, 0.34, (i + 1) * (FH / n), 1.0), { tone: 0.95 })
    k.add(box(), PAL.stoneC, T(s.w / 2 - 0.6 - n * 0.32 - 0.5, 0, s.d / 2 + 0.55, 0, 0, 0, 1.0, FH, 1.0), { tone: 0.95 })
    k.add(box(), PAL.door, T(s.w / 2 - 0.6 - n * 0.32 - 0.5, FH, s.d / 2 + 0.02, 0, 0, 0, 0.9, 2.1, 0.1))
    if (r() < 0.7) k.parts.push(pot(r).applyMatrix4(T(s.w / 2 - 0.6 - n * 0.32 - 0.5, FH, s.d / 2 + 0.75)))
  }
  if (s.floors > 1 && variant > 0.6 && variant < 0.72) {
    // a balcony with pots
    k.add(box(), s.wall, T(0, FH, s.d / 2 + 0.5, 0, 0, 0, 2.4, 0.18, 1.0), { tone: 0.9 })
    k.add(box(), PAL.ink, T(0, FH + 0.18, s.d / 2 + 0.95, 0, 0, 0, 2.4, 0.8, 0.05), { tone: 1.4 })
    for (const x of [-0.8, 0.2, 0.9]) k.parts.push(pot(r).applyMatrix4(T(x, FH + 0.18, s.d / 2 + 0.6)))
  }
  return k.build()
}

export function bellTower() {
  const k = new Kit()
  const W = 5
  const H = 24
  k.add(box(), PAL.stoneA, T(0, -3, 0, 0, 0, 0, W, H + 3, W))
  k.add(box(), PAL.stoneC, T(0, 8, 0, 0, 0, 0, W + 0.3, 0.4, W + 0.3))
  k.add(box(), PAL.stoneC, T(0, 16, 0, 0, 0, 0, W + 0.3, 0.4, W + 0.3))
  // belfry openings
  for (let s = 0; s < 4; s++) {
    const a = (s * Math.PI) / 2
    for (const off of [-1, 1]) {
      const ox = Math.cos(a) * (W / 2) + Math.sin(a) * off * 1.05
      const oz = Math.sin(a) * (W / 2) - Math.cos(a) * off * 1.05
      k.add(box(), '#2E3238', T(ox, H - 5.5, oz, 0, -a, 0, 0.9, 3.2, 0.12))
    }
    k.add(box(), '#2E3238', T(Math.cos(a) * (W / 2), 11.5, Math.sin(a) * (W / 2), 0, -a, 0, 0.6, 1.4, 0.12))
  }
  k.add(box(), PAL.stoneB, T(0, H, 0, 0, 0, 0, W + 0.6, 0.5, W + 0.6))
  k.add(pyramid(), PAL.roofA, T(0, H + 0.5, 0, 0, 0, 0, W * 1.05, 6.5, W * 1.05))
  return k.build()
}

export function townWall(len: number, h: number) {
  const k = new Kit()
  k.add(box(), PAL.stoneC, T(0, -4, 0, 0, 0, 0, 2.2, h + 4, len), { tone: 0.95 })
  const n = Math.floor(len / 2.4)
  for (let i = 0; i < n; i++) {
    if (i % 2) continue
    k.add(box(), PAL.stoneC, T(0, h, (i - (n - 1) / 2) * 2.4, 0, 0, 0, 2.2, 0.9, 1.2), { tone: 0.95 })
  }
  return k.build()
}

export function gateArch() {
  const k = new Kit()
  k.add(box(), PAL.stoneB, T(-3.2, -3, 0, 0, 0, 0, 2.6, 11, 3.2))
  k.add(box(), PAL.stoneB, T(3.2, -3, 0, 0, 0, 0, 2.6, 11, 3.2))
  k.add(box(), PAL.stoneB, T(0, 4.6, 0, 0, 0, 0, 9, 3.4, 3.2))
  const arch = new THREE.CylinderGeometry(1.9, 1.9, 3.3, 8, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)
  k.add(arch, PAL.stoneB, T(0, 4.6, 0, 0, 0, Math.PI / 2, 1, 1, 1), { tone: 0.8 })
  for (let i = 0; i < 5; i++) k.add(box(), PAL.stoneB, T(-3.6 + i * 1.8, 8, 0, 0, 0, 0, 1, 0.9, 3.2))
  return k.build()
}

export function colonnade(n: number) {
  const k = new Kit()
  const gap = 3.2
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * gap
    k.add(cyl(8), PAL.stoneA, T(x, 0, 0, 0, 0, 0, 0.9, 6.5, 0.9))
    k.add(box(), PAL.stoneB, T(x, 6.4, 0, 0, 0, 0, 1.2, 0.4, 1.2))
  }
  k.add(box(), PAL.stoneB, T(0, 6.8, 0, 0, 0, 0, n * gap, 1.3, 1.5))
  k.add(box(), PAL.stoneC, T(0, 8.1, 0, 0, 0, 0, n * gap + 0.4, 0.4, 1.8))
  return k.build()
}

export function stall(r: R) {
  const k = new Kit()
  for (const [x, z] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) k.add(cyl(4), PAL.wood, T(x, 0, z, 0, 0, 0, 0.12, 2.4, 0.12))
  k.add(box(), PAL.woodLight, T(0, 0.8, 0.3, 0, 0, 0, 2.6, 0.12, 1.2))
  for (let i = 0; i < 6; i++)
    k.add(box(), i % 2 ? PAL.awningCream : PAL.awningOchre, T(-1.25 + i * 0.5 + 0.25, 2.45, 0.2, 0.28, 0, 0, 0.5, 0.06, 2.4))
  const produce = [PAL.awningOchre, PAL.towelA, PAL.olive, PAL.roofC]
  for (let i = 0; i < 4; i++) {
    k.add(box(), PAL.wood, T(-0.95 + i * 0.63, 0.92, 0.35, 0, 0, 0, 0.55, 0.22, 0.5))
    for (let j = 0; j < 3; j++)
      k.add(ico(0), produce[Math.floor(r() * produce.length)], T(-1.05 + i * 0.63 + j * 0.1, 1.2, 0.3 + (j % 2) * 0.12, 0, 0, 0, 0.16, 0.16, 0.16))
  }
  return k.build()
}

export function crate() {
  const k = new Kit()
  k.add(box(), PAL.woodLight, T(0, 0, 0, 0, 0, 0, 0.7, 0.55, 0.5))
  k.add(box(), PAL.wood, T(0, 0.52, 0, 0, 0, 0, 0.74, 0.06, 0.54))
  for (let i = 0; i < 4; i++) k.add(ico(0), PAL.awningOchre, T(-0.2 + (i % 2) * 0.4, 0.62, -0.1 + Math.floor(i / 2) * 0.2, 0, 0, 0, 0.18, 0.18, 0.18))
  return k.build()
}

export function basket() {
  const k = new Kit()
  k.add(cyl(7, 1.25), PAL.woodLight, T(0, 0, 0, 0, 0, 0, 0.6, 0.4, 0.6))
  for (let i = 0; i < 5; i++) k.add(ico(0), PAL.towelA, T(Math.cos(i) * 0.15, 0.42, Math.sin(i) * 0.15, 0, 0, 0, 0.14, 0.14, 0.14))
  return k.build()
}

export function broom() {
  const k = new Kit()
  k.add(cyl(4), PAL.woodLight, T(0, 0, 0, 0, 0, 0, 0.05, 1.3, 0.05))
  k.add(cone(6), PAL.awningOchre, T(0, 0, 0, Math.PI, 0, 0, 0.3, 0.4, 0.3))
  return k.build()
}

export function boat(r: R) {
  const k = new Kit()
  const shape = new THREE.Shape()
  const L = 4.2 + r() * 1.5
  const W = 1.5
  shape.moveTo(-L / 2, -W / 2)
  shape.lineTo(L * 0.2, -W / 2)
  shape.quadraticCurveTo(L * 0.45, -W * 0.35, L / 2, 0)
  shape.quadraticCurveTo(L * 0.45, W * 0.35, L * 0.2, W / 2)
  shape.lineTo(-L / 2, W / 2)
  shape.lineTo(-L / 2, -W / 2)
  const hull = new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: false }).rotateX(-Math.PI / 2)
  k.add(hull, PAL.hull, T(0, 0, 0))
  const band = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false }).rotateX(-Math.PI / 2)
  k.add(band, r() < 0.5 ? PAL.hullStripe : PAL.hullOchre, T(0, 0.52, 0, 0, 0, 0, 1.02, 1, 1.04))
  k.add(box(), PAL.woodLight, T(-0.3, 0.3, 0, 0, 0, 0, 0.3, 0.1, W * 0.9))
  k.add(box(), PAL.hullStripe, T(-0.2, 0.05, 0, 0, 0, 0, L * 0.7, 0.05, W * 0.8), { tone: 0.8 })
  return k.build()
}

/** Washing on a line, the line at local y = 0. Each vertex knows how far it hangs (aHang), so it can flap. */
export function washingLine(len: number, r: R, low = false) {
  const k = new Kit()
  k.add(box(), PAL.ink, T(0, 0, 0, 0, 0, 0, 0.03, 0.03, len), { tone: 1.2 })
  const cloths = [PAL.clothA, PAL.clothB, PAL.clothC, PAL.clothD, PAL.towelB]
  let z = -len / 2 + 0.4
  while (z < len / 2 - 0.6) {
    const w = 0.5 + r() * 0.7
    const h = low ? 0.35 + r() * 0.25 : 0.5 + r() * 0.6
    k.add(new THREE.BoxGeometry(1, 1, 1, 1, 2, 2).translate(0, 0.5, 0), cloths[Math.floor(r() * cloths.length)], T(0, -h, z + w / 2, 0, 0, 0, 0.03, h, w))
    z += w + 0.2 + r() * 0.5
  }
  const g = k.build()
  const p = g.attributes.position
  const hang = new Float32Array(p.count)
  for (let i = 0; i < p.count; i++) hang[i] = Math.max(0, -p.getY(i))
  g.setAttribute('aHang', new THREE.BufferAttribute(hang, 1))
  return g
}

/** A bed of reeds or tall grass around (0,0), r meters across; base on `ground`. */
export function reedBed(radius: number, n: number, r: R, ground: (x: number, z: number) => number, cx: number, cz: number, kind: 'reeds' | 'brush') {
  const k = new Kit()
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * radius
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    const y = ground(cx + x, cz + z) - 0.05
    if (kind === 'reeds') {
      const h = 1.1 + r() * 0.9
      k.add(cone(3), r() < 0.5 ? PAL.duneGrass : PAL.floorGrass, T(x, y, z, (r() - 0.5) * 0.2, r() * 3, (r() - 0.5) * 0.2, 0.09, h, 0.09), { tone: 0.85 + r() * 0.25 })
      if (r() < 0.35) k.add(cyl(4), PAL.pineTrunk, T(x, y + h * 0.78, z, 0, 0, 0, 0.07, 0.22, 0.07), { tone: 1.1 })
    } else {
      const h = 0.7 + r() * 0.6
      const w = 0.35 + r() * 0.3
      k.add(cone(4), r() < 0.5 ? PAL.maquis : PAL.maquisDark, T(x, y, z, 0, r() * 3, 0, w, h, w), { tone: 0.85 + r() * 0.25 })
      if (r() < 0.25) k.add(ico(0), PAL.awningOchre, T(x, y + h * 0.8, z, 0, 0, 0, 0.12, 0.1, 0.12), { tone: 1 })
    }
  }
  return k.build()
}

export function fountain() {
  const k = new Kit()
  k.add(cyl(8), PAL.stoneB, T(0, 0, 0, 0, 0, 0, 3.4, 0.7, 3.4))
  k.add(cyl(8), PAL.seaShallow, T(0, 0.55, 0, 0, 0, 0, 3.0, 0.1, 3.0))
  k.add(cyl(6), PAL.stoneA, T(0, 0, 0, 0, 0, 0, 0.6, 1.6, 0.6))
  k.add(cyl(8), PAL.stoneA, T(0, 1.6, 0, 0, 0, 0, 1.3, 0.25, 1.3))
  return k.build()
}

export function pot(r: R) {
  const k = new Kit()
  k.add(cyl(6, 1.3), PAL.roofB, T(0, 0, 0, 0, 0, 0, 0.5, 0.45, 0.5))
  k.add(ico(0), r() < 0.5 ? PAL.maquis : PAL.olive, T(0, 0.65, 0, 0, r() * 3, 0, 0.7, 0.55, 0.7))
  if (r() < 0.5) for (let i = 0; i < 3; i++) k.add(ico(0), r() < 0.5 ? PAL.towelA : '#B7A4D0', T(Math.cos(i * 2) * 0.22, 0.9, Math.sin(i * 2) * 0.22, 0, 0, 0, 0.12, 0.12, 0.12))
  return k.build()
}

// ------------------------------------------------------------------ canyon / woods / shore

/** A fallen pine lying from a to b, with stubs and a root plate. */
export function fallenLog(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  const k = new Kit()
  const d = b.clone().sub(a)
  const L = d.length()
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(radius * 2, L + 3, radius * 2))
  k.add(new THREE.CylinderGeometry(0.42, 0.5, 1, 7, 1), PAL.pineTrunk, m)
  // flatten the walking top a touch with a lighter worn strip
  const m2 = new THREE.Matrix4().compose(mid.clone().add(new THREE.Vector3(0, radius * 0.86, 0)), q, new THREE.Vector3(radius * 0.7, L, 0.08))
  k.add(new THREE.BoxGeometry(1, 1, 1), PAL.woodLight, m2)
  const dir = d.clone().normalize()
  for (let i = 0; i < 4; i++) {
    const p = a.clone().addScaledVector(dir, L * (0.2 + i * 0.2) - 1.5)
    const side = i % 2 ? 1 : -1
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side)
    const qb = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), perp.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize())
    k.add(new THREE.CylinderGeometry(0.06, 0.1, 1, 4), PAL.pineTrunk, new THREE.Matrix4().compose(p.clone().addScaledVector(perp, radius + 0.3), qb, new THREE.Vector3(1, 1.2, 1)))
  }
  const root = a.clone().addScaledVector(dir, -1.6)
  k.add(ico(0), PAL.needlesDark, new THREE.Matrix4().compose(root, q, new THREE.Vector3(2.8, 0.5, 2.6)), { jitter: 0.3 })
  return k.build()
}

export function plankBridge(a: THREE.Vector3, b: THREE.Vector3, width: number) {
  const k = new Kit()
  const d = b.clone().sub(a)
  const L = d.length()
  const yaw = Math.atan2(d.x, d.z)
  const n = Math.floor(L / 0.45)
  for (let i = 0; i < n; i++) {
    const p = a.clone().addScaledVector(d, (i + 0.5) / n)
    k.add(box(), i % 3 ? PAL.woodLight : PAL.wood, T(p.x, p.y - 0.12, p.z, 0, yaw, (i % 2 ? 0.02 : -0.02), width, 0.1, 0.38))
  }
  for (const s of [-1, 1]) {
    const o = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar((s * width) / 2)
    const mid = a.clone().add(b).multiplyScalar(0.5).add(o)
    k.add(box(), PAL.wood, T(mid.x, mid.y - 0.3, mid.z, 0, yaw, 0, 0.14, 0.18, L + 1))
    for (const e of [a, b]) {
      const p = e.clone().add(o)
      k.add(cyl(4), PAL.wood, T(p.x, p.y - 1, p.z, 0, 0, 0, 0.16, 2, 0.16))
    }
  }
  return k.build()
}

export function steppingStones(a: THREE.Vector3, b: THREE.Vector3, count: number, r: R) {
  const k = new Kit()
  for (let i = 0; i < count; i++) {
    const p = a.clone().lerp(b, (i + 0.5) / count)
    const s = 0.9 + r() * 0.4
    k.add(ico(0), PAL.limeA, T(p.x + (r() - 0.5) * 0.6, p.y - 0.2, p.z + (r() - 0.5) * 0.6, 0, r() * 3, 0, s, 0.6, s), { jitter: 0.12, tone: 0.95 })
  }
  return k.build()
}

export function dryWall(path: [number, number][], gap: [number, number], ground: (x: number, z: number) => number, height: number, r: R) {
  const k = new Kit()
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, z0] = path[i]
    const [x1, z1] = path[i + 1]
    const L = Math.hypot(x1 - x0, z1 - z0)
    const yaw = Math.atan2(x1 - x0, z1 - z0)
    const n = Math.floor(L / 0.9)
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n
      const x = x0 + (x1 - x0) * t
      const z = z0 + (z1 - z0) * t
      if (Math.hypot(x - gap[0], z - gap[1]) < 2.2) continue
      const y = ground(x, z)
      const rows = 3
      for (let row = 0; row < rows; row++) {
        const s = 0.55 + r() * 0.3
        k.add(ico(0), row % 2 ? PAL.rockGrey : PAL.limeB, T(x + (r() - 0.5) * 0.2, y + row * (height / rows) + 0.15, z, 0, yaw + r(), 0, s * 1.3, s * 0.8, s), {
          tone: 0.8 + r() * 0.25,
        })
      }
    }
  }
  return k.build()
}

export function towel() {
  const k = new Kit()
  for (let i = 0; i < 5; i++) k.add(box(), i % 2 ? PAL.towelB : PAL.towelA, T(0, 0, -0.8 + i * 0.4, 0, 0, 0, 0.9, 0.04, 0.4))
  k.add(box(), PAL.boyShorts, T(0.8, 0, 0.3, 0, 0.5, 0, 0.3, 0.12, 0.25))
  return k.build()
}

export function cairn(r: R) {
  const k = new Kit()
  let y = 0
  for (let i = 0; i < 5; i++) {
    const s = 0.7 - i * 0.11
    k.add(ico(0), i % 2 ? PAL.limeC : PAL.limeB, T((r() - 0.5) * 0.1, y + s * 0.25, 0, 0, r() * 3, 0, s, s * 0.5, s))
    y += s * 0.45
  }
  return k.build()
}

export function jetty(a: THREE.Vector3, b: THREE.Vector3) {
  const k = new Kit()
  const d = b.clone().sub(a)
  const L = d.length()
  const yaw = Math.atan2(d.x, d.z)
  const n = Math.floor(L / 0.5)
  for (let i = 0; i < n; i++) {
    const p = a.clone().addScaledVector(d, (i + 0.5) / n)
    k.add(box(), i % 4 ? PAL.woodLight : PAL.wood, T(p.x, p.y - 0.1, p.z, 0, yaw, 0, 2.2, 0.1, 0.44))
    if (i % 6 === 0)
      for (const s of [-1, 1]) {
        const o = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(s * 1.05)
        k.add(cyl(5), PAL.wood, T(p.x + o.x, p.y - 3, p.z + o.z, 0, 0, 0, 0.22, 3.4, 0.22))
      }
  }
  return k.build()
}

export function driftwood() {
  const k = new Kit()
  k.add(cyl(5), '#B8A890', T(0, 0.15, 0, 0, 0, Math.PI / 2, 0.3, 3.2, 0.3))
  k.add(cyl(4), '#B8A890', T(0.6, 0.2, 0.3, 0.3, 0, 1.1, 0.14, 1.2, 0.14))
  return k.build()
}

/** Home: the house, its garden wall with a wooden gate, and the windows that light. Front faces +z. */
export function homeHouse() {
  const k = new Kit()
  const W = 8
  const D = 6.5
  const H = 5.6
  k.add(box(), PAL.stoneB, T(0, -2, 0, 0, 0, 0, W, H + 2, D))
  k.add(pyramid(), PAL.roofB, T(0, H, 0, 0, 0, 0, W * 1.12, 2.8, D * 1.12))
  k.add(box(), PAL.stoneB, T(2.2, H + 1, -1, 0, 0, 0, 0.7, 2.2, 0.7), { tone: 0.95 })
  // the doorway (dark until the door opens) and warm windows
  k.add(box(), '#2A2622', T(-0.8, 0, D / 2, 0, 0, 0, 1.3, 2.3, 0.05))
  for (const [x, y] of [[1.6, 1.2], [3.0, 1.2], [-2.8, 3.6], [-0.8, 3.6], [1.6, 3.6], [3.0, 3.6]]) {
    k.add(box(), '#3A3F44', T(x, y, D / 2 + 0.02, 0, 0, 0, 0.8, 1.1, 0.06), { window: true })
    k.add(box(), PAL.shutterBlue, T(x - 0.64, y, D / 2 + 0.06, 0, 0, 0, 0.42, 1.15, 0.05))
    k.add(box(), PAL.shutterBlue, T(x + 0.64, y, D / 2 + 0.06, 0, 0, 0, 0.42, 1.15, 0.05))
  }
  for (const z of [-1.5, 1.2]) k.add(box(), '#3A3F44', T(W / 2 + 0.02, 1.3, z, 0, 0, 0, 0.06, 1.1, 0.8), { window: true })
  // the bench by the door
  k.add(box(), PAL.wood, T(1.8, 0.45, D / 2 + 0.6, 0, 0, 0, 1.8, 0.1, 0.45))
  return k.build()
}

/** The garden wall, in world space around a gate at `gate` facing `facingYaw`. */
export function gardenWall(gateYaw: number) {
  const k = new Kit()
  const segs: [number, number, number, number][] = [
    [-6.5, 0, -1.2, 0],
    [1.2, 0, 6.5, 0],
    [-6.5, 0, -6.5, -11],
    [6.5, 0, 6.5, -11],
  ]
  for (const [x0, z0, x1, z1] of segs) {
    const L = Math.hypot(x1 - x0, z1 - z0)
    const mx = (x0 + x1) / 2
    const mz = (z0 + z1) / 2
    const yaw = Math.atan2(x1 - x0, z1 - z0)
    k.add(box(), PAL.stoneC, T(mx, -1.4, mz, 0, yaw, 0, 0.5, 2.2, L), { tone: 0.95 })
    k.add(box(), PAL.stoneB, T(mx, 0.8, mz, 0, yaw, 0, 0.62, 0.14, L + 0.1))
  }
  for (const x of [-1.25, 1.25]) k.add(box(), PAL.stoneB, T(x, -1, 0, 0, 0, 0, 0.6, 2.5, 0.6))
  const g = k.build()
  g.rotateY(gateYaw)
  return g
}

export function gateLeaf() {
  const k = new Kit()
  for (let i = 0; i < 5; i++) k.add(box(), PAL.woodLight, T(0.22 + i * 0.43, 0, 0, 0, 0, 0, 0.34, 1.05 + (i % 2) * 0.1, 0.06))
  k.add(box(), PAL.wood, T(1.08, 0.3, 0.04, 0, 0, 0, 2.1, 0.12, 0.05))
  k.add(box(), PAL.wood, T(1.08, 0.8, 0.04, 0, 0, 0, 2.1, 0.12, 0.05))
  return k.build()
}

export function doorLeaf() {
  const k = new Kit()
  k.add(box(), PAL.shutterBlue, T(0.62, 0, 0, 0, 0, 0, 1.24, 2.25, 0.08))
  k.add(box(), PAL.windowGlow, T(1.05, 1.1, 0.06, 0, 0, 0, 0.08, 0.08, 0.04))
  return k.build()
}

// ------------------------------------------------------------------ the town's furniture

/** A cafe table with a cloth and two glasses, at (0,0). */
export function cafeTable() {
  const k = new Kit()
  k.add(cyl(6), PAL.ink, T(0, 0, 0, 0, 0, 0, 0.12, 0.72, 0.12), { tone: 1.3 })
  k.add(cyl(8), PAL.clothA, T(0, 0.72, 0, 0, 0, 0, 0.9, 0.05, 0.9))
  k.add(cyl(5), PAL.clothC, T(0.15, 0.77, 0.1, 0, 0, 0, 0.07, 0.12, 0.07))
  k.add(box(), PAL.towelB, T(-0.1, 0.77, -0.05, 0, 0.4, 0, 0.18, 0.02, 0.26))
  return k.build()
}

/** A low stone bench or a doorstep to sit on. */
export function bench(len = 1.6) {
  const k = new Kit()
  k.add(box(), PAL.stoneC, T(0, 0, 0, 0, 0, 0, len, 0.42, 0.5), { tone: 0.95 })
  k.add(box(), PAL.stoneB, T(0, 0.42, 0, 0, 0, 0, len + 0.08, 0.06, 0.56))
  return k.build()
}

/** An open window someone leans out of: the dark room behind, a sill in front. Front at +z. */
export function windowLean(wall: string) {
  const k = new Kit()
  k.add(box(), '#2E3238', T(0, -0.1, -0.35, 0, 0, 0, 1.1, 1.4, 0.4))
  k.add(box(), wall, T(0, -0.55, 0.02, 0, 0, 0, 1.3, 0.55, 0.36), { tone: 0.95 })
  k.add(box(), PAL.stoneB, T(0, 0, 0.05, 0, 0, 0, 1.4, 0.07, 0.46))
  for (const s of [-1, 1]) k.add(box(), PAL.shutterGreen, T(s * 0.95, -0.2, 0.05, 0, s * 0.5, 0, 0.45, 1.25, 0.05))
  return k.build()
}

/** Nets heaped on the quay, with a float or two. */
export function nets() {
  const k = new Kit()
  k.add(ico(0), '#6E8A86', T(0, 0.2, 0, 0, 0.4, 0, 1.6, 0.45, 1.1), { jitter: 0.12 })
  k.add(ico(0), '#7E9894', T(0.5, 0.35, 0.2, 0, 1, 0, 0.9, 0.35, 0.7), { jitter: 0.1 })
  for (let i = 0; i < 3; i++) k.add(ico(0), PAL.awningOchre, T(-0.6 + i * 0.5, 0.35, 0.45, 0, 0, 0, 0.18, 0.18, 0.18))
  return k.build()
}

/** A boat hauled out on the quay on two trestles, for mending. */
export function boatOnTrestles(r: R) {
  const b = boat(r)
  b.applyMatrix4(T(0, 0.55, 0, 0, 0, 0.12))
  const k = new Kit()
  for (const x of [-1.2, 1.2]) {
    k.add(box(), PAL.wood, T(x, 0, 0, 0, 0, 0, 0.12, 0.6, 1.2))
    k.add(box(), PAL.wood, T(x, 0.5, 0, 0, 0, 0, 0.2, 0.1, 1.4))
  }
  return mergeGeometries([b, k.build()], false)!
}

/** A small tin can for watering the pots. */
export function wateringCan() {
  return new Kit().add(cyl(6), PAL.shutterGrey, T(0, -0.15, 0.08, 0, 0, 0, 0.16, 0.2, 0.16)).add(cyl(4), PAL.shutterGrey, T(0, -0.05, 0.2, 0.9, 0, 0, 0.03, 0.22, 0.03)).build()
}

/** The broom a sweeper holds (bristles down at the far end). */
export function heldBroom() {
  const k = new Kit()
  k.add(cyl(4), PAL.woodLight, T(0, -1.1, 0, 0, 0, 0, 0.04, 1.3, 0.04))
  k.add(cone(6), PAL.awningOchre, T(0, -1.05, 0, Math.PI, 0, 0, 0.26, 0.34, 0.26))
  return k.build()
}

// ------------------------------------------------------------------ ground cover and more growth

/** A tuft of grass: a few blades. */
export function tuft(r: R, col = PAL.floorGrass) {
  const k = new Kit()
  const n = 4 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) {
    const h = 0.25 + r() * 0.35
    k.add(cone(3), i % 2 ? col : PAL.maquis, T((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3, (r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5, 0.06, h, 0.06), { tone: 0.85 + r() * 0.3 })
  }
  return k.build()
}

/** Wildflowers: yellow, violet or white only (never red; see art-direction.md). */
export function flowers(r: R, head: string) {
  const k = new Kit()
  const n = 3 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 0.45
    const z = (r() - 0.5) * 0.45
    const h = 0.18 + r() * 0.25
    k.add(cone(3), PAL.maquis, T(x, 0, z, 0, r() * 3, 0, 0.05, h, 0.05))
    k.add(new THREE.OctahedronGeometry(0.5, 0), head, T(x, h, z, 0, r() * 3, 0, 0.1, 0.06, 0.1), { tone: 0.95 + r() * 0.1 })
  }
  return k.build()
}

/** A fig: pale grey trunk, low spreading limbs, big bright leaves. */
export function fig(r: R) {
  const k = new Kit()
  const h = 2.2 + r() * 1
  for (let a = 0; a < 3; a++) {
    const ang = a * 2.1 + r()
    k.add(cyl(5, 0.6), '#A8A194', T(0, 0, 0, Math.cos(ang) * 0.5, 0, Math.sin(ang) * 0.5, 0.26, h, 0.26))
  }
  for (let b = 0; b < 6; b++) {
    const a = b * 1.05 + r() * 0.5
    const d = 1 + r() * 1
    const s = 1.4 + r() * 0.8
    k.add(ico(0), b % 2 ? '#7E9A56' : '#6E8A4C', T(Math.cos(a) * d, h + r() * 0.6, Math.sin(a) * d, 0, r() * 3, 0, s * 1.3, s * 0.7, s * 1.3), { jitter: 0.2, tone: 0.9 + r() * 0.2 })
  }
  return k.build()
}

/** A carob: dark, dense and round. */
export function carob(r: R) {
  const k = new Kit()
  const h = 2.6 + r() * 1.2
  k.add(cyl(5, 0.7), PAL.oliveTrunk, T(0, 0, 0, 0.05, 0, 0.05, 0.45, h * 0.6, 0.45))
  k.add(ico(1), '#4E6446', T(0, h, 0, 0, r() * 3, 0, 4 + r(), 3 + r() * 0.6, 4 + r()), { jitter: 0.25, tone: 0.9 + r() * 0.15 })
  k.add(ico(0), '#5E7652', T(0.4, h + 0.9, -0.2, 0, r() * 3, 0, 2.6, 1.4, 2.6), { tone: 1 })
  return k.build()
}

// ------------------------------------------------------------------ canyon, hillside, quay props

/** A little wayside shrine: a stone post with a roofed niche and flowers at its foot. */
export function shrine() {
  const k = new Kit()
  k.add(box(), PAL.stoneB, T(0, -0.5, 0, 0, 0, 0, 0.8, 2.3, 0.7))
  k.add(box(), '#3A3F44', T(0, 1.05, 0.3, 0, 0, 0, 0.44, 0.55, 0.12))
  k.add(box(), PAL.stoneA, T(0, 1.75, 0, 0, 0, 0, 1.0, 0.1, 0.9))
  k.add(pyramid(), PAL.roofB, T(0, 1.85, 0, 0, 0, 0, 1.0, 0.5, 0.9))
  // a jar of white and yellow flowers someone keeps fresh
  k.add(cyl(6, 1.2), PAL.stoneC, T(0.25, 0, 0.6, 0, 0, 0, 0.2, 0.25, 0.2))
  for (let i = 0; i < 4; i++) k.add(new THREE.OctahedronGeometry(0.5, 0), i % 2 ? PAL.towelB : PAL.towelA, T(0.25 + Math.cos(i * 1.6) * 0.07, 0.35, 0.6 + Math.sin(i * 1.6) * 0.07, 0, 0, 0, 0.1, 0.07, 0.1))
  return k.build()
}

/** Low broken walls of a hut long fallen in, w x d, on sloping ground. */
export function ruin(w: number, d: number, r: R, ground: (x: number, z: number) => number, cx: number, cz: number, yaw: number) {
  const k = new Kit()
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const edges: [number, number, number, number][] = [
    [-w / 2, -d / 2, w / 2, -d / 2],
    [w / 2, -d / 2, w / 2, d / 2],
    [w / 2, d / 2, -w / 2, d / 2],
    [-w / 2, d / 2, -w / 2, -d / 2],
  ]
  for (const [x0, z0, x1, z1] of edges) {
    const L = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.floor(L / 0.8)
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const lx = x0 + (x1 - x0) * t
      const lz = z0 + (z1 - z0) * t
      const x = lx * c + lz * s
      const z = -lx * s + lz * c
      // standing to shoulder height in places, rubble in others
      const rows = Math.max(0, Math.round(1 + Math.sin(i * 1.7 + x0) * 1.4 + r() * 1.2))
      const y = ground(cx + x, cz + z)
      for (let q = 0; q < rows; q++) {
        const sz = 0.55 + r() * 0.3
        k.add(ico(0), q % 2 ? PAL.rockGrey : PAL.limeB, T(x + (r() - 0.5) * 0.15, y + q * 0.42 + 0.15, z, 0, yaw + r(), 0, sz * 1.3, sz * 0.8, sz), { tone: 0.8 + r() * 0.25 })
      }
      if (rows === 0 && r() < 0.5) k.add(ico(0), PAL.limeB, T(x + (r() - 0.5) * 0.6, y + 0.08, z + (r() - 0.5) * 0.6, r(), r(), 0, 0.5, 0.3, 0.5), { tone: 0.85 })
    }
  }
  return k.build()
}

/** A row of beehives on a stone bench: white boxes with ochre roofs. */
export function beehives(n: number, r: R) {
  const k = new Kit()
  k.add(box(), PAL.stoneC, T(0, 0, 0, 0, 0, 0, n * 0.75 + 0.3, 0.35, 0.8))
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.75
    const h = 0.55 + Math.floor(r() * 2) * 0.22
    k.add(box(), i % 3 === 1 ? PAL.clothB : PAL.clothA, T(x, 0.35, 0, 0, (r() - 0.5) * 0.1, 0, 0.55, h, 0.55))
    k.add(box(), PAL.awningOchre, T(x, 0.35 + h, 0, 0, 0, 0, 0.64, 0.07, 0.64))
    k.add(box(), '#3A3F44', T(x, 0.4, 0.28, 0, 0, 0, 0.25, 0.04, 0.02))
  }
  return k.build()
}

/** Fish crates stacked on the quay. */
export function crates(r: R) {
  const k = new Kit()
  const n = 3 + Math.floor(r() * 4)
  for (let i = 0; i < n; i++) {
    const col = i % 3
    const row = Math.floor(i / 3)
    k.add(box(), i % 2 ? PAL.woodLight : PAL.wood, T((col - 1) * 0.66 + (r() - 0.5) * 0.08, row * 0.3, (r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.15, 0, 0.62, 0.28, 0.44), { tone: 0.9 + r() * 0.2 })
  }
  return k.build()
}

/** A dry fountain: a stone basin with nothing in it but leaves. */
export function dryFountain() {
  const k = new Kit()
  k.add(cyl(8), PAL.stoneB, T(0, 0, 0, 0, 0, 0, 3.0, 0.65, 3.0))
  k.add(cyl(8), PAL.stoneD, T(0, 0.5, 0, 0, 0, 0, 2.6, 0.08, 2.6), { tone: 0.85 })
  k.add(cyl(6), PAL.stoneA, T(0, 0, 0, 0, 0, 0, 0.5, 1.5, 0.5))
  k.add(box(), PAL.stoneA, T(0, 1.5, 0, 0, 0.4, 0, 0.8, 0.5, 0.8))
  for (let i = 0; i < 6; i++) k.add(ico(0), PAL.needles, T(Math.cos(i) * 0.9, 0.58, Math.sin(i * 1.3) * 0.8, 0, i, 0, 0.18, 0.04, 0.12))
  return k.build()
}

/** A covered passage over an alley: a room on a stone arch, span across `w`, front at +z. */
export function alleyArch(w: number, wall: string, roof: string) {
  const k = new Kit()
  const D = 2.6
  const spring = 2.5
  const rise = Math.min(1.0, w * 0.3)
  const y0 = spring + rise
  k.add(box(), wall, T(0, y0, 0, 0, 0, 0, w, 2.8, D), { tone: 0.97 })
  // the arch: stones round a flattened half circle, springing from both house walls
  const n = 7
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - (i / n) * Math.PI
    const a1 = Math.PI - ((i + 1) / n) * Math.PI
    const x0 = Math.cos(a0) * (w / 2)
    const y0a = spring + Math.sin(a0) * rise
    const x1 = Math.cos(a1) * (w / 2)
    const y1 = spring + Math.sin(a1) * rise
    const L = Math.hypot(x1 - x0, y1 - y0a)
    k.add(box(), wall, T((x0 + x1) / 2, (y0a + y1) / 2 - 0.02, 0, 0, 0, Math.atan2(y1 - y0a, x1 - x0), L + 0.06, 0.3, D), { tone: 0.82 })
    // fill above each stone up to the room
    k.add(box(), wall, T((x0 + x1) / 2, Math.max(y0a, y1), 0, 0, 0, 0, L, y0 - Math.max(y0a, y1) + 0.05, D), { tone: 0.95 })
  }
  k.add(pyramid(), roof, T(0, y0 + 2.8, 0, 0, 0, 0, w + 0.4, 1.2, D + 0.4))
  for (const sd of [-1, 1]) {
    k.add(box(), '#3A3F44', T(w * 0.2 * sd, y0 + 1.0, D / 2, 0, 0, 0, 0.6, 0.9, 0.05))
    k.add(box(), '#3A3F44', T(w * 0.2 * sd, y0 + 1.0, -D / 2, 0, 0, 0, 0.6, 0.9, 0.05))
  }
  return k.build()
}

/** Flower boxes on a sill: yellow, violet or white. */
export function flowerBox(r: R) {
  const k = new Kit()
  k.add(box(), PAL.wood, T(0, 0, 0, 0, 0, 0, 0.8, 0.18, 0.22))
  k.add(box(), PAL.maquis, T(0, 0.14, 0, 0, 0, 0, 0.74, 0.16, 0.2), { tone: 0.9 + r() * 0.2 })
  const heads = [PAL.flowerYellow, PAL.flowerViolet, PAL.flowerWhite]
  const hc = heads[Math.floor(r() * 3)]
  for (let i = 0; i < 3; i++) k.add(new THREE.OctahedronGeometry(0.5, 0), hc, T(-0.25 + i * 0.25, 0.32, 0.03, 0, 0, 0, 0.1, 0.07, 0.1))
  return k.build()
}

/** A charcoal burner's mound, sealed with earth, and a stack of cut wood. */
export function kiln(r: R) {
  const k = new Kit()
  k.add(ico(1), '#5E564C', T(0, 0.2, 0, 0, 0, 0, 4.2, 2.2, 4.2), { jitter: 0.15, tone: 0.95 })
  k.add(ico(0), PAL.needlesDark, T(0, 1.3, 0, 0, 0, 0, 1.2, 0.5, 1.2), { tone: 0.8 })
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 4 - row; i++)
      k.add(cyl(5), i % 2 ? PAL.pineTrunk : PAL.woodLight, T(3.2 + i * 0.3 + row * 0.15, row * 0.28, 1.2, Math.PI / 2, 0.1 * (r() - 0.5), 0, 0.28, 1.8, 0.28))
  return k.build()
}

/** A dog's water bowl by someone's door. */
export function dogBowl() {
  const k = new Kit()
  k.add(cyl(8, 1.25), PAL.shutterBlue, T(0, 0, 0, 0, 0, 0, 0.36, 0.1, 0.36))
  k.add(cyl(8), PAL.riverShallow, T(0, 0.07, 0, 0, 0, 0, 0.36, 0.02, 0.36))
  return k.build()
}

/** A flat swimming rock, sloping into the water. */
export function slab(r: R) {
  const k = new Kit()
  k.add(ico(0), PAL.limeC, T(0, 0, 0, 0.1, r() * 3, 0.06, 4.2, 1.1, 3.0), { jitter: 0.2 })
  k.add(ico(0), PAL.limeA, T(1.4, -0.1, 0.8, 0.2, r() * 3, 0, 2.0, 0.9, 1.6), { jitter: 0.2 })
  return k.build()
}

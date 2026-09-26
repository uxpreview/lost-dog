// Dressing: what grows and what was built, placed by rule from the data.
// Trees and rocks are instanced in spatial chunks so the camera and the shadow
// pass only draw what is near. The town is built street-first: houses line
// every alley with their fronts on the corridor edge, then fill the blocks.

import * as THREE from 'three'
import type { World } from './world'
import { rng, smoothstep } from './noise'
import * as K from './kit'
import { PAL } from './palette'
import { worldMaterial } from './materials'

const CHUNK = 120

/** Low washing lines over the alleys: the boy ducks under these. Plan segment and height. */
export const duckLines: { x0: number; z0: number; x1: number; z1: number; y: number }[] = []
/** Brush and reed beds on the way: he pushes through, they part. */
export const brushPatches: { x: number; z: number; r: number; kind: string }[] = []
/** The fronts of the town's houses, for people who lean out of windows. */
export const houseFronts: { x: number; z: number; yaw: number; base: number; floors: number; w: number }[] = []

interface Inst {
  x: number
  y: number
  z: number
  ry: number
  s: number
}

class Scatter {
  buckets = new Map<string, Inst[]>()
  add(variant: string, i: Inst) {
    const key = `${variant}|${Math.floor(i.x / CHUNK)}|${Math.floor(i.z / CHUNK)}`
    let b = this.buckets.get(key)
    if (!b) this.buckets.set(key, (b = []))
    b.push(i)
  }
}

export function dress(w: World, quality: number): THREE.Group {
  const root = new THREE.Group()
  root.name = 'dressing'
  const r = rng(1234)
  const sc = new Scatter()

  const matTree = worldMaterial({ vertexColors: true, wind: 1 })
  const matStatic = worldMaterial({ vertexColors: true })
  // low growth moves in the air and parts for the boy and the dog
  const matLow = worldMaterial({ vertexColors: true, wind: 7, windBase: 0 })

  const variants: Record<string, { geo: THREE.BufferGeometry; shadow: boolean; mat: THREE.Material }> = {}
  const vr = rng(99)
  for (let i = 0; i < 3; i++) variants['pine' + i] = { geo: K.umbrellaPine(vr), shadow: true, mat: matTree }
  for (let i = 0; i < 2; i++) variants['cypress' + i] = { geo: K.cypress(vr), shadow: true, mat: matTree }
  for (let i = 0; i < 2; i++) variants['olive' + i] = { geo: K.olive(vr), shadow: true, mat: matTree }
  for (let i = 0; i < 3; i++) variants['shrub' + i] = { geo: K.shrub(vr, i % 2 ? PAL.maquis : PAL.olive), shadow: false, mat: matLow }
  for (let i = 0; i < 1; i++) variants['grass' + i] = { geo: K.shrub(vr, PAL.duneGrass), shadow: false, mat: matLow }
  for (let i = 0; i < 2; i++) variants['rock' + i] = { geo: K.rock(vr, i % 2 ? PAL.limeA : PAL.rockGrey), shadow: false, mat: matStatic }

  const pick = (base: string, n: number) => base + Math.floor(r() * n)
  const TOWN: [number, number] = [-280, -70]

  // ---------------------------------------------------------------- vegetation
  const step = 4.2 / Math.sqrt(quality)
  const [bx0, bz0, bx1, bz1] = w.data.bounds
  for (let z = bz0 + 2; z < bz1 - 2; z += step)
    for (let x = bx0 + 2; x < bx1 - 2; x += step) {
      const px = x + (r() - 0.5) * step
      const pz = z + (r() - 0.5) * step
      const i = Math.round((px - w.x0) / w.cell)
      const j = Math.round((pz - w.z0) / w.cell)
      const k = w.idx(i, j)
      const dc = w.coastD[k]
      if (dc < 3) continue
      const h = w.ground(px, pz)
      if (h < 0.6) continue
      const hx = w.h[w.idx(Math.min(i + 1, w.nx - 1), j)] - w.h[w.idx(Math.max(i - 1, 0), j)]
      const hz = w.h[w.idx(i, Math.min(j + 1, w.nz - 1))] - w.h[w.idx(i, Math.max(j - 1, 0))]
      const slope = Math.hypot(hx, hz) / (2 * w.cell)
      const wall = w.wall[k]
      const townD = Math.hypot(px - TOWN[0], pz - TOWN[1])
      if (townD < 150) continue
      if (w.road[k] > 0 || w.wet[k] > 0) continue
      const u = r()
      const canyon = px > -90
      const woods = px < -390 && px > -700 && pz < 20
      const shore = px < -690
      const hillside = !canyon && !woods && !shore
      let v: string | null = null
      let s = 0.8 + r() * 0.45
      let needClear = 1.2
      if (canyon) {
        if (h > 28 && wall < 0.3 && slope < 0.6) {
          // plateau pines cluster along the rim, so the canyon has a skyline
          const nearRim = smoothstep(0.02, 0.0, wall) < 1 ? 1 : 0.6
          if (u < 0.055 * nearRim) v = pick('pine', 3)
          else if (u < 0.16) v = pick('shrub', 3)
          else if (u < 0.19) v = pick('rock', 2)
        } else if (wall > 0.25) {
          if (slope < 1.4 && u < 0.05) v = pick('shrub', 3)
          else if (u < 0.065 && slope < 0.9) v = pick('pine', 3), (s *= 0.7)
        } else {
          if (u < 0.05) v = pick('shrub', 3)
          else if (u < 0.08) v = pick('rock', 2)
          else if (u < 0.092) (v = pick('pine', 3)), (needClear = 3.5)
        }
      } else if (woods) {
        if (u < 0.3 * quality ** 0.3) (v = pick('pine', 3)), (needClear = 2.6), (s = 0.85 + r() * 0.5)
        else if (u < 0.42) v = pick('shrub', 3)
        else if (u < 0.45) v = pick('rock', 2)
      } else if (shore) {
        if (h > 2.2 && u < 0.1) v = pick('grass', 1)
        else if (h > 5 && u < 0.14) v = pick('shrub', 3)
        else if (u < 0.155 && h > 6) (v = pick('olive', 2)), (needClear = 2.5)
        else if (dc < 12 && u < 0.19) v = pick('rock', 2)
      } else if (hillside) {
        if (u < 0.1) v = pick('shrub', 3)
        else if (u < 0.125) (v = pick('olive', 2)), (needClear = 2.5)
        else if (u < 0.14) (v = pick('pine', 3)), (needClear = 3)
        else if (u < 0.15) (v = pick('cypress', 2)), (needClear = 2.5)
        else if (u < 0.165) v = pick('rock', 2)
      }
      if (!v) continue
      if (v.startsWith('rock')) needClear = 0.8
      if (w.walkClearance(px, pz, needClear + 1) < needClear) continue
      if (framedNear(w, px, pz)) continue
      if (w.riverClearance(px, pz) < 0.8) continue
      if (w.roadClearance(px, pz) < 1.5) continue
      sc.add(v, { x: px, y: h - 0.15, z: pz, ry: r() * Math.PI * 2, s })
    }

  // ---------------------------------------------------------------- the town
  const ci = w.chapters.findIndex((c) => !!c.town)
  if (ci >= 0) buildTown(w, ci, root, sc, r)

  // ---------------------------------------------------------------- per-chapter props
  w.chapters.forEach((ch) => {
    for (const p of ch.props ?? []) placeProp(w, p, root, p.kind === 'reeds' || p.kind === 'brush' ? matLow : matStatic, r)
    if (ch.home) {
      const [gx, gy, gz] = ch.home.gate
      const [hx, , hz] = ch.home.house
      // olives and a cypress pair in the garden
      for (const [ox, oz, kind] of [[-9, -8, 'olive'], [8, -6, 'olive'], [-3, -14, 'cypress'], [4, -15, 'cypress'], [12, 4, 'olive']] as const) {
        sc.add(kind + '0', { x: hx + ox, y: w.ground(hx + ox, hz + oz) - 0.1, z: hz + oz, ry: r() * 6, s: 1 })
      }
      void gx
      void gy
      void gz
    }
  })

  // ---------------------------------------------------------------- flush instances
  const dummy = new THREE.Object3D()
  for (const [key, list] of sc.buckets) {
    const vname = key.split('|')[0]
    const v = variants[vname]
    if (!v) continue
    const im = new THREE.InstancedMesh(v.geo, v.mat, list.length)
    list.forEach((it, n) => {
      dummy.position.set(it.x, it.y, it.z)
      dummy.rotation.set(0, it.ry, 0)
      dummy.scale.setScalar(it.s)
      dummy.updateMatrix()
      im.setMatrixAt(n, dummy.matrix)
    })
    im.castShadow = v.shadow
    im.receiveShadow = true
    im.computeBoundingSphere()
    root.add(im)
  }
  return root
}

/** Nothing grows in front of a framed camera. */
function framedNear(w: World, x: number, z: number) {
  for (const ch of w.chapters)
    for (const c of ch.cameras ?? []) {
      const [cx, , cz] = c.position
      const [lx, , lz] = c.lookAt
      // a corridor from the camera toward what it frames, first 40 m
      const dx = lx - cx
      const dz = lz - cz
      const L = Math.hypot(dx, dz) || 1
      const t = Math.max(0, Math.min(40, ((x - cx) * dx + (z - cz) * dz) / L))
      const px = cx + (dx / L) * t
      const pz = cz + (dz / L) * t
      if (Math.hypot(x - px, z - pz) < 6 + t * 0.25) return true
    }
  return false
}

// ------------------------------------------------------------------------ town

function buildTown(w: World, ci: number, root: THREE.Group, sc: Scatter, r: () => number) {
  const t = w.chapters[ci].town!
  const houses = new THREE.Group()
  houses.name = 'town'
  const matHouse = worldMaterial({ vertexColors: true })
  const placed: { x: number; z: number; rad: number }[] = []
  const walls = [PAL.stoneA, PAL.stoneB, PAL.stoneC, PAL.stoneA, PAL.stoneD]
  const roofs = [PAL.roofA, PAL.roofB, PAL.roofC, PAL.roofA]
  const shutters = [PAL.shutterGreen, PAL.shutterGrey, PAL.shutterBlue, PAL.shutterGreen]
  const geos: THREE.BufferGeometry[] = []
  const washing: THREE.BufferGeometry[] = []

  const excluded = (x: number, z: number) => {
    if (Math.hypot(x - t.center[0], z - t.center[1]) > t.radius) return true
    for (const [ex, ez, er] of t.exclude) if (Math.hypot(x - ex, z - ez) < er) return true
    if (w.coastDist(x, z) < 3) return true
    return false
  }
  const footprintClear = (cx: number, cz: number, yaw: number, hw: number, hd: number, margin: number) => {
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const lx = u * hw
      const lz = v * hd
      const x = cx + lx * c + lz * s
      const z = cz - lx * s + lz * c
      if (w.walkClearance(x, z, margin + 2) < margin) return false
    }
    return true
  }
  const tryHouse = (cx: number, cz: number, yaw: number, hw: number, hd: number, margin: number) => {
    if (excluded(cx, cz)) return false
    for (const p of placed) if (Math.hypot(p.x - cx, p.z - cz) < (p.rad + Math.min(hw, hd)) * 0.8) return false
    if (!footprintClear(cx, cz, yaw, hw, hd, margin)) return false
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    let base = Infinity
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1]]) {
      const x = cx + u * hw * c + v * hd * s
      const z = cz - u * hw * s + v * hd * c
      base = Math.min(base, w.ground(x, z))
    }
    // houses on the street front take the street's height
    const floors = 2 + Math.floor(r() * 2.6)
    const spec: K.HouseSpec = {
      w: hw * 2,
      d: hd * 2,
      floors,
      wall: walls[Math.floor(r() * walls.length)],
      roof: roofs[Math.floor(r() * roofs.length)],
      shutter: shutters[Math.floor(r() * shutters.length)],
      roofType: r() < 0.7 ? 'hip' : r() < 0.6 ? 'gable' : 'flat',
      seed: r(),
    }
    const g = K.house(spec, r, 4)
    g.applyMatrix4(K.T(cx, base, cz, 0, yaw, 0))
    houseFronts.push({ x: cx + Math.sin(yaw) * hd, z: cz + Math.cos(yaw) * hd, yaw, base, floors, w: hw * 2 })
    geos.push(g)
    placed.push({ x: cx, z: cz, rad: Math.max(hw, hd) })
    return true
  }

  // 1. street fronts
  for (const wp of w.walks) {
    if (wp.chapter !== ci) continue
    const line = wp.line
    for (let s = 3; s < line.length - 2; s += 6.5 + r() * 2.5) {
      const x = line.x(s)
      const z = line.z(s)
      const half = line.e(1, s) * 0.5
      const [tx, tz] = line.tangent(s, 2)
      for (const side of [-1, 1]) {
        const hw = 2.8 + r() * 1.6
        const hd = 3.5 + r() * 2
        const nx = -tz * side
        const nz = tx * side
        const cx = x + nx * (half + 0.35 + hd)
        const cz = z + nz * (half + 0.35 + hd)
        // front (+z local) faces back toward the street
        const yaw = Math.atan2(-nx, -nz)
        tryHouse(cx, cz, yaw, hw, hd, 0.25)
      }
    }
  }
  // area edges (market, quay, squares)
  for (const a of w.areas) {
    if (a.chapter !== ci || !a.circle) continue
    const [ax, az, ar] = a.circle
    for (let ang = 0; ang < Math.PI * 2; ang += 0.5) {
      const hd = 3.5 + r() * 1.5
      const hw = 3 + r() * 1.5
      const cx = ax + Math.cos(ang) * (ar + 0.4 + hd)
      const cz = az + Math.sin(ang) * (ar + 0.4 + hd)
      tryHouse(cx, cz, Math.atan2(-Math.cos(ang), -Math.sin(ang)), hw, hd, 0.25)
    }
  }
  // 2. fill the blocks, on the town's grid
  const gridYaw = 0.35
  for (let gz = -t.radius; gz <= t.radius; gz += 8.5)
    for (let gx = -t.radius; gx <= t.radius; gx += 8.5) {
      const c = Math.cos(gridYaw)
      const s = Math.sin(gridYaw)
      const cx = t.center[0] + gx * c + gz * s + (r() - 0.5) * 2
      const cz = t.center[1] - gx * s + gz * c + (r() - 0.5) * 2
      tryHouse(cx, cz, gridYaw + Math.floor(r() * 4) * (Math.PI / 2), 3 + r() * 1.3, 3.2 + r() * 1.3, 0.6)
    }

  // walls and gates
  for (let i = 0; i < t.wall.length - 1; i++) {
    const [x0, z0] = t.wall[i]
    const [x1, z1] = t.wall[i + 1]
    const L = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.ceil(L / 6)
    for (let j = 0; j < n; j++) {
      const a = j / n
      const b = (j + 1) / n
      const sx = x0 + (x1 - x0) * ((a + b) / 2)
      const sz = z0 + (z1 - z0) * ((a + b) / 2)
      if (t.gates.some(([gx, gz]) => Math.hypot(gx - sx, gz - sz) < 7)) continue
      if (w.walkClearance(sx, sz, 4) < 1.4) continue
      const g = K.townWall(L / n + 0.3, 6.5)
      g.applyMatrix4(K.T(sx, w.ground(sx, sz), sz, 0, Math.atan2(x1 - x0, z1 - z0), 0))
      geos.push(g)
    }
  }
  for (const [gx, gz, gy, rot] of t.gates) {
    const g = K.gateArch()
    g.applyMatrix4(K.T(gx, gy - 0.1, gz, 0, rot, 0))
    geos.push(g)
  }
  {
    const [tx, tz] = t.tower
    const g = K.bellTower()
    g.applyMatrix4(K.T(tx, w.ground(tx, tz), tz, 0, 0.35, 0))
    geos.push(g)
  }
  {
    const [[x0, z0], [x1, z1]] = t.palace
    const L = Math.hypot(x1 - x0, z1 - z0)
    const g = K.colonnade(Math.floor(L / 3.2))
    const mx = (x0 + x1) / 2
    const mz = (z0 + z1) / 2
    g.applyMatrix4(K.T(mx, 2.3, mz - 3, 0, Math.atan2(z1 - z0, x1 - x0) * -1, 0))
    geos.push(g)
  }
  // cypresses and pots in the lanes, washing over the narrow alleys
  for (const wp of w.walks) {
    if (wp.chapter !== ci) continue
    const line = wp.line
    for (let s = 5; s < line.length - 5; s += 9) {
      const x = line.x(s)
      const z = line.z(s)
      const half = line.e(1, s) * 0.5
      const [tx, tz] = line.tangent(s, 2)
      const y = line.e(0, s)
      if (r() < 0.35 && Math.hypot(x - t.center[0], z - t.center[1]) < t.radius * 0.85) {
        const side = r() < 0.5 ? -1 : 1
        const px = x - tz * side * (half - 0.35)
        const pz = z + tx * side * (half - 0.35)
        const g = K.pot(r)
        g.applyMatrix4(K.T(px, y - 0.05, pz, 0, r() * 6, 0))
        geos.push(g)
      }
      if (half < 2 && r() < 0.34 && Math.hypot(x - t.center[0], z - t.center[1]) < t.radius * 0.8) {
        // some hang low enough over the lane that he has to duck
        const low = r() < 0.5
        const len = half * 2 + 1.2
        const ly = y + (low ? 1.9 : 5.2 + r() * 1.5)
        const g = K.washingLine(len, r, low)
        g.applyMatrix4(K.T(x, ly, z, 0, Math.atan2(-tz, tx) + Math.PI / 2, 0))
        washing.push(g)
        if (low) duckLines.push({ x0: x - tz * half, z0: z + tx * half, x1: x + tz * half, z1: z - tx * half, y: ly })
      }
    }
  }
  for (const a of w.areas) {
    if (a.chapter !== ci || !a.circle) continue
    const [ax, az, ar] = a.circle
    for (let q = 0; q < 2; q++) {
      const ang = r() * Math.PI * 2
      const px = ax + Math.cos(ang) * (ar - 1.2)
      const pz = az + Math.sin(ang) * (ar - 1.2)
      sc.add('cypress' + Math.floor(r() * 2), { x: px, y: (a.y ?? w.ground(px, pz)) - 0.1, z: pz, ry: r() * 6, s: 0.9 })
    }
  }

  // merge the town in spatial chunks
  const chunks = new Map<string, THREE.BufferGeometry[]>()
  for (const g of geos) {
    g.computeBoundingSphere()
    const c = g.boundingSphere!.center
    const key = `${Math.floor(c.x / 80)}|${Math.floor(c.z / 80)}`
    let list = chunks.get(key)
    if (!list) chunks.set(key, (list = []))
    list.push(g)
  }
  const { mergeGeometries } = THREE_UTILS
  for (const list of chunks.values()) {
    const merged = mergeGeometries(list, false)
    if (!merged) continue
    merged.computeBoundingSphere()
    const m = new THREE.Mesh(merged, matHouse)
    m.castShadow = true
    m.receiveShadow = true
    houses.add(m)
  }
  root.add(houses)
  // the washing is its own mesh, so it can move
  const wm = _merge(washing, false)
  if (wm) {
    wm.computeBoundingSphere()
    const m = new THREE.Mesh(wm, worldMaterial({ vertexColors: true, hang: true }))
    m.castShadow = true
    m.receiveShadow = true
    m.name = 'washing'
    root.add(m)
  }
}

import { mergeGeometries as _merge } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
const THREE_UTILS = { mergeGeometries: _merge }

// ------------------------------------------------------------------------ props

function v3(a: unknown, w: World): THREE.Vector3 {
  const p = a as number[]
  if (p.length === 2) return new THREE.Vector3(p[0], w.ground(p[0], p[1]), p[1])
  return new THREE.Vector3(p[0], p[1], p[2])
}

function placeProp(w: World, p: Record<string, unknown>, root: THREE.Group, mat: THREE.Material, r: () => number) {
  let g: THREE.BufferGeometry | null = null
  const kind = p.kind as string
  const rot = (p.rot as number) ?? 0
  switch (kind) {
    case 'log':
      g = K.fallenLog(v3(p.from, w), v3(p.to, w), (p.radius as number) ?? 0.45)
      break
    case 'plank':
      g = K.plankBridge(v3(p.from, w), v3(p.to, w), (p.width as number) ?? 1.3)
      break
    case 'stones':
      g = K.steppingStones(v3(p.from, w), v3(p.to, w), (p.count as number) ?? 6, r)
      break
    case 'drywall':
      g = K.dryWall(p.path as [number, number][], p.gap as [number, number], (x, z) => w.ground(x, z), (p.height as number) ?? 1.2, r)
      break
    case 'towel': {
      const at = v3(p.at, w)
      g = K.towel()
      g.applyMatrix4(K.T(at.x, at.y, at.z, 0, rot, 0))
      break
    }
    case 'cairn': {
      const at = v3(p.at, w)
      g = K.cairn(r)
      g.applyMatrix4(K.T(at.x, at.y, at.z))
      break
    }
    case 'boat': {
      const at = v3(p.at, w)
      g = K.boat(r)
      g.applyMatrix4(K.T(at.x, at.y, at.z, 0, rot, 0.08))
      break
    }
    case 'boats': {
      const at = v3(p.at, w)
      const parts: THREE.BufferGeometry[] = []
      for (let i = 0; i < 6; i++) {
        const b = K.boat(r)
        b.applyMatrix4(K.T(at.x + (i - 2.5) * 5 + r() * 1.5, -0.25, at.z + 3 + r() * 4, 0, Math.PI / 2 + (r() - 0.5) * 0.4, 0))
        parts.push(b)
      }
      g = _merge(parts, false)
      break
    }
    case 'jetty':
      g = K.jetty(v3(p.from, w), v3(p.to, w))
      break
    case 'driftwood': {
      const at = v3(p.at, w)
      g = K.driftwood()
      g.applyMatrix4(K.T(at.x, at.y, at.z, 0, rot, 0))
      break
    }
    case 'stalls': {
      const at = v3(p.at, w)
      const parts: THREE.BufferGeometry[] = []
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25 + 0.4
        const s = K.stall(r)
        const y = w.standY(at.x + Math.cos(a) * 9, at.z + Math.sin(a) * 9, -1)
        s.applyMatrix4(K.T(at.x + Math.cos(a) * 9.5, y - 0.02, at.z + Math.sin(a) * 9.5, 0, -a - Math.PI / 2, 0))
        parts.push(s)
      }
      g = _merge(parts, false)
      break
    }
    case 'reeds':
    case 'brush': {
      const at = v3(p.at, w)
      const rad = (p.r as number) ?? 3
      g = K.reedBed(rad, (p.n as number) ?? Math.round(rad * rad * (kind === 'reeds' ? 9 : 4)), r, (x, z) => w.ground(x, z), at.x, at.z, kind)
      g.translate(at.x, 0, at.z)
      brushPatches.push({ x: at.x, z: at.z, r: rad, kind })
      break
    }
    case 'fountain': {
      const at = v3(p.at, w)
      g = K.fountain()
      g.applyMatrix4(K.T(at.x, w.standY(at.x, at.z, -1) - 0.05, at.z))
      break
    }
  }
  if (!g) return
  g.computeBoundingSphere()
  const m = new THREE.Mesh(g, mat)
  m.castShadow = true
  m.receiveShadow = true
  root.add(m)
}

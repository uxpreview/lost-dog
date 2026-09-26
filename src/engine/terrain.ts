// Meshes built from the World: terrain tiles, the walked paths as crisp
// ribbons laid over the land, the sea and the rivers, and the sky.

import * as THREE from 'three'
import type { World } from './world'
import { PAL, lin, mixc } from './palette'
import { fbm, hash2, smoothstep, clamp } from './noise'
import { worldMaterial, waterMaterial, skyMaterial, HeightMap } from './materials'
import type { Polyline } from './path'

type RGB = [number, number, number]

const C = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, lin(v)])) as Record<keyof typeof PAL, RGB>

const TOWN_C: [number, number] = [-280, -70]

/** Albedo for a terrain vertex. */
function terrainColor(w: World, k: number, x: number, z: number, slope: number): RGB {
  const h = w.h[k]
  const dc = w.coastD[k]
  const n1 = fbm(x * 0.05, z * 0.05, 3)
  const n2 = hash2(Math.floor(x * 0.7), Math.floor(z * 0.7)) - 0.5
  let c: RGB
  if (dc < 0 || h < -0.2) {
    const t = clamp(-h / 8, 0, 1)
    c = mixc(C.seabedShallow, C.seabedDeep, Math.sqrt(t))
    return c
  }
  // regions
  const canyonK = smoothstep(-110, -40, x)
  const townD = Math.hypot(x - TOWN_C[0], z - TOWN_C[1])
  const townK = (1 - smoothstep(120, 190, townD)) * (1 - canyonK)
  const shoreK = smoothstep(-640, -700, x) * smoothstep(-90, -30, z)
  const woodsK = Math.max(0, 1 - canyonK - townK - shoreK) * smoothstep(-360, -420, x)

  // open land
  let land = mixc(C.plateauGrass, C.maquis, smoothstep(-0.2, 0.4, n1))
  land = mixc(land, C.townEarth, townK * 0.75)
  land = mixc(land, mixc(C.needles, C.moss, smoothstep(-0.1, 0.3, n1)), woodsK)
  land = mixc(land, mixc(C.duneGrass, C.sand, smoothstep(0.1, -0.3, n1)), shoreK)
  // valley floor near the river: gravel and sand
  if (canyonK > 0.5 && h < 22) {
    // the floor: dry grass and scrub with gravel bars, sand toward the water
    const floorK = smoothstep(22, 12, h) * (1 - w.wall[k])
    const n3 = fbm(x * 0.021 + 4.1, z * 0.021 - 2.3, 3)
    let fl = mixc(C.floorGrass, C.maquis, smoothstep(0.0, 0.5, n1) * 0.6)
    fl = mixc(fl, C.gravel, smoothstep(0.05, 0.35, n3) * 0.8)
    const rc = w.riverClearance(x, z)
    fl = mixc(fl, C.riverSand, smoothstep(6, 1.5, rc))
    land = mixc(land, fl, floorK)
  }
  c = land
  // slopes go to rock
  const rockK = smoothstep(0.55, 1.1, slope)
  c = mixc(c, mixc(C.rockGrey, C.cliff, 0.5 + n2), rockK * (1 - woodsK * 0.5))
  // canyon walls: stratified limestone, bands by height with a wander
  const wall = w.wall[k]
  if (wall > 0.02) {
    const band = (h / 2.6 + n1 * 0.6) % 3
    const lime = band < 1 ? C.limeA : band < 2 ? C.limeB : C.limeC
    let tone = mixc(lime, C.limeShade, smoothstep(0.3, -0.5, n1) * 0.35)
    // risers are bare rock, streaked; ledges are pale and catch a little scrub
    const riser = smoothstep(0.9, 1.8, slope)
    const streak = hash2(Math.floor(x * 0.45), 7) - 0.5
    tone = mixc(tone, mixc(C.limeShade, C.rockGrey, 0.5 + streak), riser * 0.55)
    const ledge = smoothstep(0.55, 0.2, slope)
    tone = mixc(tone, mixc(C.limeC, C.maquis, smoothstep(0.1, 0.5, n2 + n1 * 0.5) * 0.6), ledge * 0.7)
    c = mixc(c, tone, clamp(wall * 1.3, 0, 1))
  }
  // beach
  if (dc < 16 && h < 4.5) {
    const beachK = smoothstep(16, 6, dc) * smoothstep(4.5, 2.5, h)
    const b = dc < 5 ? mixc(C.sandWet, C.pebble, 0.3 + n2) : mixc(C.sand, C.pebble, smoothstep(0.1, 0.5, n1))
    c = mixc(c, b, beachK * (1 - wall))
  }
  // routes (shoulders show under the ribbon edges as worn earth)
  if (w.walkK[k] > 0.05) {
    const worn = townK > 0.5 ? C.pavingEdge : woodsK > 0.5 ? C.needlesDark : shoreK > 0.5 ? C.sand : C.gravel
    c = mixc(c, worn, w.walkK[k] * 0.7)
  }
  if (w.wet[k] > 0) c = mixc(c, C.riverBed, clamp(w.wet[k] * 2, 0, 1))
  if (w.road[k] > 0) c = mixc(c, C.road, 0.9)
  const j = 1 + n2 * 0.07
  return [c[0] * j, c[1] * j, c[2] * j]
}

export function buildTerrain(w: World): THREE.Group {
  const g = new THREE.Group()
  g.name = 'terrain'
  const mat = worldMaterial({ vertexColors: true })
  const TILE = 48
  for (let tj = 0; tj < w.nz - 1; tj += TILE)
    for (let ti = 0; ti < w.nx - 1; ti += TILE) {
      const i1 = Math.min(ti + TILE, w.nx - 1)
      const j1 = Math.min(tj + TILE, w.nz - 1)
      const cw = i1 - ti + 1
      const chh = j1 - tj + 1
      const pos = new Float32Array(cw * chh * 3)
      const col = new Float32Array(cw * chh * 3)
      let allSea = true
      for (let j = tj; j <= j1; j++)
        for (let i = ti; i <= i1; i++) {
          const k = w.idx(i, j)
          const o = ((j - tj) * cw + (i - ti)) * 3
          let x = w.x0 + i * w.cell
          let z = w.z0 + j * w.cell
          const h = w.h[k]
          if (h > -3) allSea = false
          // jitter the plan position off the walkable land, so facets read as rock, not grid
          if (w.walkK[k] < 0.02 && i > 0 && j > 0 && i < w.nx - 1 && j < w.nz - 1) {
            x += (hash2(i * 3 + 1, j * 7 + 2) - 0.5) * w.cell * 0.5
            z += (hash2(i * 5 + 3, j * 11 + 1) - 0.5) * w.cell * 0.5
          }
          pos[o] = x
          pos[o + 1] = h
          pos[o + 2] = z
          const hx = w.h[w.idx(Math.min(i + 1, w.nx - 1), j)] - w.h[w.idx(Math.max(i - 1, 0), j)]
          const hz = w.h[w.idx(i, Math.min(j + 1, w.nz - 1))] - w.h[w.idx(i, Math.max(j - 1, 0))]
          const slope = Math.hypot(hx, hz) / (2 * w.cell)
          const c = terrainColor(w, k, x, z, slope)
          col[o] = c[0]
          col[o + 1] = c[1]
          col[o + 2] = c[2]
        }
      if (allSea) continue
      const idx: number[] = []
      for (let j = 0; j < chh - 1; j++)
        for (let i = 0; i < cw - 1; i++) {
          const a = j * cw + i
          const b = a + 1
          const c = a + cw
          const d = c + 1
          idx.push(a, c, b, b, c, d)
        }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      geo.setIndex(idx)
      geo.computeVertexNormals()
      geo.computeBoundingSphere()
      geo.computeBoundingBox()
      const m = new THREE.Mesh(geo, mat)
      m.receiveShadow = true
      m.castShadow = true
      g.add(m)
    }
  return g
}

/** The walked routes as ribbons: crisp edges, a slight crown, colored by chapter surface. */
export function buildPaths(w: World): THREE.Mesh {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const surfaceColor: Record<string, [RGB, RGB]> = {
    gravel: [C.trail, C.trailEdge],
    stone: [C.paving, C.pavingEdge],
    needles: [C.needles, C.needlesDark],
    sand: [C.sand, C.sandWet],
    dust: [C.gravel, C.townEarth],
  }
  for (const wp of w.walks) {
    if (wp.bridge) continue
    const ch = w.chapters[wp.chapter]
    // on the beach the whole sand is the path; a ribbon would read as a road
    if (ch.surface === 'sand') continue
    const [ca, cb] = surfaceColor[ch.surface] ?? surfaceColor.gravel
    // paving only inside the town; outside its walls a paved chapter walks on dirt
    const town = ch.town
    const inTown = town ? (x: number, z: number) => Math.hypot(x - town.center[0], z - town.center[1]) < town.radius * 0.92 : () => false
    addRibbon(w, wp.line, ca, cb, pos, col, idx, ch.surface === 'stone', inTown)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  const m = new THREE.Mesh(geo, worldMaterial({ vertexColors: true }))
  m.receiveShadow = true
  m.name = 'paths'
  return m
}

function landAt(w: World, x: number, z: number): RGB {
  const i = clamp(Math.round((x - w.x0) / w.cell), 1, w.nx - 2)
  const j = clamp(Math.round((z - w.z0) / w.cell), 1, w.nz - 2)
  const k = w.idx(i, j)
  const hx = w.h[k + 1] - w.h[k - 1]
  const hz = w.h[k + w.nx] - w.h[k - w.nx]
  return terrainColor(w, k, x, z, Math.hypot(hx, hz) / (2 * w.cell))
}

function addRibbon(w: World, line: Polyline, ca0: RGB, cb0: RGB, pos: number[], col: number[], idx: number[], pavedChapter: boolean, inTown: (x: number, z: number) => boolean) {
  const STEP = 1
  const ACROSS = [-1, -0.92, -0.6, -0.3, 0.3, 0.6, 0.92, 1]
  let prevOk = false
  let base = 0
  for (let s = 0; s <= line.length; s += STEP) {
    const x = line.x(s)
    const z = line.z(s)
    const y = line.e(0, s)
    const half = line.e(1, s) * 0.5
    const [tx, tz] = line.tangent(s, 1.5)
    const rx = -tz
    const rz = tx
    // skip where the route bridges (log, plank) or runs under a river (the ford keeps it)
    const g = w.ground(x, z)
    const ok = g > y - 0.6
    const paved = pavedChapter && inTown(x, z)
    const ca = pavedChapter && !paved ? C.trail : ca0
    const cb = pavedChapter && !paved ? C.trailEdge : cb0
    if (ok) {
      const row = pos.length / 3
      for (const a of ACROSS) {
        const px = x + rx * half * a
        const pz = z + rz * half * a
        const edge = Math.abs(a)
        const crown = paved ? (edge > 0.95 ? -0.1 : edge > 0.9 ? -0.04 : 0.02) : 0.03 * (1 - edge * edge) - 0.05 * edge
        pos.push(px, y + crown - 0.02, pz)
        const n = hash2(Math.floor(px * 1.3), Math.floor(pz * 1.3)) - 0.5
        let c = mixc(ca, cb, clamp(edge * edge * 0.8 + n * 0.3, 0, 1))
        if (paved && edge > 0.9) c = mixc(c, cb, 0.6)
        // unpaved trails are worn into the land: their edges become the land
        if (!paved) c = mixc(c, landAt(w, px, pz), smoothstep(0.35, 1, edge) * 0.85)
        const j = 1 + n * 0.06
        col.push(c[0] * j, c[1] * j, c[2] * j)
      }
      if (prevOk) {
        const A = ACROSS.length
        for (let q = 0; q < A - 1; q++) {
          const a0 = base + q
          const a1 = row + q
          idx.push(a0, a0 + 1, a1, a0 + 1, a1 + 1, a1)
        }
      }
      base = row
    }
    prevOk = ok
  }
}

/** The heightfield as a texture, so water can know its depth per pixel. */
export function bindHeightMap(w: World) {
  const data = new Uint16Array(w.nx * w.nz)
  for (let i = 0; i < data.length; i++) data[i] = THREE.DataUtils.toHalfFloat(w.h[i])
  const tex = new THREE.DataTexture(data, w.nx, w.nz, THREE.RedFormat, THREE.HalfFloatType)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  HeightMap.uHeight.value = tex
  HeightMap.uHMap.value.set(w.x0, w.z0, 1 / w.cell, 0)
  HeightMap.uHSize.value.set(w.nx, w.nz)
}

/** Sea: a grid over the whole map and beyond, with depth per vertex for color and foam. */
export function buildSea(w: World): THREE.Mesh {
  const [x0, , x1, z1] = w.data.bounds
  const pad = 1400
  const pos: number[] = []
  const depth: number[] = []
  const idx: number[] = []
  // near the coast the grid is fine (foam, shallows); far out it is coarse
  const xsA: number[] = []
  const zsA: number[] = []
  for (let x = x0 - pad; x < x0; x += 200) xsA.push(x)
  for (let x = x0; x <= x1; x += 6) xsA.push(x)
  for (let x = x1 + 200; x <= x1 + pad; x += 200) xsA.push(x)
  const zStart = -40
  for (let z = zStart; z <= z1; z += 6) zsA.push(z)
  for (let z = z1 + 150; z <= z1 + pad; z += 150) zsA.push(z)
  for (const z of zsA)
    for (const x of xsA) {
      pos.push(x, 0, z)
      const inside = x >= x0 && x <= x1 && z <= z1
      depth.push(inside ? Math.max(0, -w.ground(x, z)) : 14)
    }
  const nx = xsA.length
  for (let j = 0; j < zsA.length - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      const b = a + 1
      const c = a + nx
      const d = c + 1
      if (depth[a] <= 0 && depth[b] <= 0 && depth[c] <= 0 && depth[d] <= 0) continue
      idx.push(a, c, b, b, c, d)
    }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1))
  geo.setAttribute('flow', new THREE.Float32BufferAttribute(new Float32Array(depth.length), 1))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
  const m = new THREE.Mesh(geo, waterMaterial(PAL.seaShallow, PAL.seaDeep, false))
  m.name = 'sea'
  m.renderOrder = 2
  return m
}

export function buildRivers(w: World): THREE.Mesh {
  const pos: number[] = []
  const depth: number[] = []
  const flow: number[] = []
  const idx: number[] = []
  w.rivers.forEach((line, ri) => {
    if (w.data.rivers[ri].dry) return
    const A = 7
    let prev = -1
    for (let s = 0; s <= line.length; s += 1.5) {
      const x = line.x(s)
      const z = line.z(s)
      const wy = line.e(0, s)
      if (wy <= 0.05) break
      const half = line.e(1, s) * 0.5 + 1.2
      const [tx, tz] = line.tangent(s, 2)
      const row = pos.length / 3
      for (let a = 0; a < A; a++) {
        const u = (a / (A - 1)) * 2 - 1
        const px = x - tz * half * u
        const pz = z + tx * half * u
        pos.push(px, wy, pz)
        depth.push(Math.max(0, wy - w.ground(px, pz)))
        flow.push(s)
      }
      if (prev >= 0) for (let a = 0; a < A - 1; a++) idx.push(prev + a, prev + a + 1, row + a, prev + a + 1, row + a + 1, row + a)
      prev = row
    }
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1))
  geo.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 1))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
  const m = new THREE.Mesh(geo, waterMaterial(PAL.riverShallow, PAL.riverDeep, true))
  m.name = 'rivers'
  m.renderOrder = 3
  return m
}

export function buildSky(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMaterial())
  m.frustumCulled = false
  m.renderOrder = -1
  m.name = 'sky'
  return m
}

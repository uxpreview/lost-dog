// Life at the edges of the frame. Everything here is small, read from each
// chapter's `life` list, and none of it is information: nothing points at the
// dog, nothing is red, nothing can be harmed or harm. Critters notice the boy
// and get out of his way; that is all they do.
//
//   lizards      on sunlit rock; they scatter into cracks as he passes
//   goats        on the ledges, grazing, a bell when they lift their heads
//   fish         rings on a pool now and then
//   dragonflies  darting low over the water
//   butterflies  pale, over the grass
//   cat          sitting on a step until the dog noses her, then up the wall
//   deer         grazing in the golden hour; bolts well before he is close
//   jays         lift out of the pines as he comes under them
//   gulls        wheeling over the shore
//   crabs        sidling on the wet sand; they run for the water
//   lantern      a night fisherman's lamp far out (cool light, never window gold)
//
// Also the small effects the dog's business needs: dust, drops, water rings.

import * as THREE from 'three'
import { Kit, T } from './kit'
import { PAL } from './palette'
import { worldMaterial, glowMaterial } from './materials'
import type { World } from './world'
import type { Chapter, P2 } from './types'
import { clamp, damp, rng } from './noise'
import { camQuat } from './characters'

const tmpQ = new THREE.Quaternion()

export interface LifeDef {
  kind: 'lizards' | 'goats' | 'fish' | 'dragonflies' | 'butterflies' | 'cat' | 'deer' | 'jays' | 'gulls' | 'crabs' | 'lantern'
  at: P2
  r?: number
  n?: number
  y?: number
  /** goats: ledge spots; deer: where it runs; cat: where she goes [x, z, height above ground] */
  spots?: P2[]
  flee?: P2
  jump?: [number, number, number]
  /** deer: only before this much of the chapter (the golden hour) */
  until?: number
}

export type LifeEvent = { kind: string; x: number; y: number; z: number; sound?: string }

const box = () => new THREE.BoxGeometry(1, 1, 1)
const ico = () => new THREE.IcosahedronGeometry(0.5, 0)
const cone = (n = 4) => new THREE.ConeGeometry(0.5, 1, n, 1)

// ------------------------------------------------------------------ meshes

function lizardGeo() {
  return new Kit()
    .add(ico(), '#A89A74', T(0, 0.03, 0, 0, 0, 0, 0.06, 0.035, 0.16))
    .add(ico(), '#A89A74', T(0, 0.035, 0.1, 0, 0, 0, 0.045, 0.03, 0.06))
    .add(cone(3), '#9A8C68', T(0, 0.025, -0.16, -Math.PI / 2, 0, 0, 0.03, 0.2, 0.02))
    .build()
}

function goatGeo(coat: string, dark: string) {
  const k = new Kit()
  k.add(box(), coat, T(0, 0.62, 0, 0, 0, 0, 0.34, 0.34, 0.72))
  for (const [x, z] of [[-0.11, 0.26], [0.11, 0.26], [-0.11, -0.26], [0.11, -0.26]]) k.add(box(), dark, T(x, 0.22, z, 0, 0, 0, 0.07, 0.46, 0.07))
  k.add(box(), coat, T(0, 0.2, 0.36, 0.3, 0, 0, 0.14, 0.16, 0.36))
  k.add(box(), dark, T(0, 0.74, -0.38, 0.9, 0, 0, 0.06, 0.06, 0.14))
  return k.build()
}

function goatHeadGeo(coat: string, dark: string) {
  const k = new Kit()
  k.add(box(), coat, T(0, 0, 0.1, 0.35, 0, 0, 0.16, 0.18, 0.3))
  for (const s of [-1, 1]) {
    k.add(cone(4), dark, T(s * 0.05, 0.12, 0.0, -0.9, 0, s * 0.2, 0.04, 0.18, 0.04))
    k.add(box(), coat, T(s * 0.1, 0.04, 0.02, 0, 0, s * 0.6, 0.12, 0.03, 0.06))
  }
  k.add(box(), '#E8E2D2', T(0, -0.1, 0.18, 0, 0, 0, 0.04, 0.1, 0.04))
  // the bell
  k.add(ico(), PAL.awningOchre, T(0, -0.16, -0.02, 0, 0, 0, 0.07, 0.08, 0.07))
  return k.build()
}

function catGeo() {
  return new Kit()
    .add(ico(), '#6A625A', T(0, 0.14, 0, 0.5, 0, 0, 0.2, 0.28, 0.24))
    .add(ico(), '#6A625A', T(0, 0.34, 0.05, 0, 0, 0, 0.16, 0.14, 0.15))
    .add(cone(3), '#5A524A', T(-0.05, 0.43, 0.05, 0, 0, 0, 0.05, 0.08, 0.04))
    .add(cone(3), '#5A524A', T(0.05, 0.43, 0.05, 0, 0, 0, 0.05, 0.08, 0.04))
    .add(box(), '#5A524A', T(0.06, 0.03, -0.14, 0, 0.6, 0, 0.04, 0.04, 0.3))
    .add(ico(), '#E8E2D2', T(0, 0.3, 0.12, 0, 0, 0, 0.06, 0.05, 0.03))
    .build()
}

function deerGeo() {
  const k = new Kit()
  const c = '#A88A64'
  const d = '#7E6448'
  k.add(ico(), c, T(0, 0.95, 0, 0, 0, 0, 0.42, 0.42, 1.0))
  for (const [x, z] of [[-0.12, 0.34], [0.12, 0.34], [-0.12, -0.34], [0.12, -0.34]]) k.add(box(), d, T(x, 0.38, z, 0, 0, 0, 0.07, 0.78, 0.07))
  k.add(box(), c, T(0, 1.22, 0.5, -0.6, 0, 0, 0.14, 0.5, 0.16))
  k.add(ico(), c, T(0, 1.46, 0.66, 0, 0, 0, 0.18, 0.2, 0.3))
  for (const s of [-1, 1]) k.add(cone(3), c, T(s * 0.09, 1.58, 0.6, 0, 0, s * 0.5, 0.07, 0.16, 0.03))
  k.add(ico(), '#F1ECE0', T(0, 1.04, -0.5, 0, 0, 0, 0.14, 0.18, 0.08))
  return k.build()
}

function crabGeo() {
  const k = new Kit()
  const c = '#8C7F6A'
  k.add(ico(), c, T(0, 0.05, 0, 0, 0, 0, 0.16, 0.06, 0.12))
  for (const s of [-1, 1]) {
    k.add(ico(), '#7A6E5C', T(s * 0.1, 0.06, 0.08, 0, 0, 0, 0.07, 0.04, 0.05))
    for (let i = 0; i < 3; i++) k.add(box(), '#6E6452', T(s * 0.1, 0.03, -0.03 + i * 0.04, 0, 0, s * 0.6, 0.1, 0.01, 0.01))
  }
  return k.build()
}

function wingedGeo(body: string, wing: string, bodyL: number, span: number, chord: number) {
  const b = new Kit().add(ico(), body, T(0, 0, 0, 0, 0, 0, bodyL * 0.2, bodyL * 0.2, bodyL)).build()
  const w = new Kit().add(box(), wing, T(span / 2, 0, 0, 0, 0, 0, span, 0.006, chord)).build()
  return { b, w }
}

function lanternBoatGeo() {
  const k = new Kit()
  const shape = new THREE.Shape()
  const L = 4.6
  const W = 1.5
  shape.moveTo(-L / 2, -W / 2)
  shape.lineTo(L * 0.2, -W / 2)
  shape.quadraticCurveTo(L * 0.45, -W * 0.35, L / 2, 0)
  shape.quadraticCurveTo(L * 0.45, W * 0.35, L * 0.2, W / 2)
  shape.lineTo(-L / 2, W / 2)
  shape.lineTo(-L / 2, -W / 2)
  k.add(new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }).rotateX(-Math.PI / 2), '#3A4458')
  k.add(box(), '#2E3444', T(1.6, 0.6, 0, 0, 0, 0, 0.06, 1.8, 0.06))
  // someone sitting in the stern, a dark shape
  k.add(box(), '#262C3A', T(-1.2, 0.6, 0, 0, 0, 0, 0.4, 0.7, 0.35))
  k.add(ico(), '#262C3A', T(-1.2, 1.1, 0, 0, 0, 0, 0.26, 0.28, 0.26))
  return k.build()
}

// ------------------------------------------------------------------ runtime

interface Critter {
  obj: THREE.Object3D
  x: number
  y: number
  z: number
  yaw: number
  hx: number
  hy: number
  hz: number
  state: number // 0 idle, 1 reacting, 2 gone
  t: number
  vx: number
  vz: number
  phase: number
  head?: THREE.Object3D
  wl?: THREE.Object3D
  wr?: THREE.Object3D
}

interface Group {
  def: LifeDef
  ci: number
  items: Critter[]
  noticed: boolean
  t: number
  cool: number
}

interface Bit {
  m: THREE.Mesh
  vx: number
  vy: number
  vz: number
  t: number
  life: number
  on: boolean
}

export class Life {
  group = new THREE.Group()
  groups: Group[] = []
  events: LifeEvent[] = []
  private bits: Bit[] = []
  private rings: { m: THREE.Mesh; t: number; on: boolean; size: number }[] = []
  private butterflyPool: Critter[] = []
  private world: World
  private r = rng(4242)

  constructor(world: World, chapters: Chapter[]) {
    this.world = world
    const mat = worldMaterial({ vertexColors: true })
    const lizard = lizardGeo()
    const goats = [goatGeo('#EDE6D6', '#8A7E6C'), goatGeo('#8C7258', '#5A4A3A'), goatGeo('#4A4440', '#2E2A28')]
    const goatHeads = [goatHeadGeo('#EDE6D6', '#8A7E6C'), goatHeadGeo('#8C7258', '#5A4A3A'), goatHeadGeo('#4A4440', '#2E2A28')]
    const cat = catGeo()
    const deer = deerGeo()
    const crab = crabGeo()
    const dfly = wingedGeo('#5E8C8A', '#DCEBEA', 0.09, 0.07, 0.025)
    const bfly = wingedGeo('#6A5A48', '#F2D27A', 0.03, 0.06, 0.07)
    const bflyW = wingedGeo('#6A5A48', '#F4F1E8', 0.03, 0.06, 0.07)
    const gull = wingedGeo('#F2F1EC', '#E6E6E0', 0.3, 0.5, 0.16)
    const lantern = lanternBoatGeo()
    const r = this.r

    const winged = (g: { b: THREE.BufferGeometry; w: THREE.BufferGeometry }, s: number) => {
      const o = new THREE.Group()
      const body = new THREE.Mesh(g.b, mat)
      const wl = new THREE.Mesh(g.w, mat)
      const wr = new THREE.Mesh(g.w, mat)
      wr.scale.x = -1
      o.add(body, wl, wr)
      o.scale.setScalar(s)
      return { o, wl, wr }
    }
    const crit = (obj: THREE.Object3D, x: number, y: number, z: number, yaw = 0): Critter => {
      obj.position.set(x, y, z)
      obj.rotation.y = yaw
      this.group.add(obj)
      return { obj, x, y, z, yaw, hx: x, hy: y, hz: z, state: 0, t: 0, vx: 0, vz: 0, phase: r() * 10 }
    }

    chapters.forEach((ch, ci) => {
      for (const def of ch.life ?? []) {
        const g: Group = { def, ci, items: [], noticed: false, t: 0, cool: 0 }
        const [ax, az] = def.at
        const R = def.r ?? 6
        const n = def.n ?? 4
        const scatter = () => {
          const a = r() * Math.PI * 2
          const d = Math.sqrt(r()) * R
          return [ax + Math.cos(a) * d, az + Math.sin(a) * d] as const
        }
        switch (def.kind) {
          case 'lizards':
            for (let i = 0; i < n; i++) {
              const [x, z] = scatter()
              if (world.walkClearance(x, z, 3) < 0.4) continue
              const m = new THREE.Mesh(lizard, mat)
              m.scale.setScalar(1.6)
              g.items.push(crit(m, x, world.ground(x, z) + 0.05, z, r() * 6))
            }
            break
          case 'goats': {
            const spots = def.spots ?? Array.from({ length: n }, () => scatter() as unknown as P2)
            spots.forEach(([x, z], i) => {
              const o = new THREE.Group()
              const v = i % 3
              o.add(new THREE.Mesh(goats[v], mat))
              const head = new THREE.Group()
              head.position.set(0, 0.86, 0.4)
              head.add(new THREE.Mesh(goatHeads[v], mat))
              o.add(head)
              o.traverse((q) => ((q as THREE.Mesh).castShadow = true))
              const c = crit(o, x, world.ground(x, z), z, r() * 6)
              c.head = head
              g.items.push(c)
            })
            break
          }
          case 'fish':
            break
          case 'dragonflies':
          case 'butterflies':
            for (let i = 0; i < n; i++) {
              const [x, z] = scatter()
              const w = def.kind === 'dragonflies' ? winged(dfly, 3) : winged(i % 2 ? bflyW : bfly, 3)
              const y = (def.y ?? world.ground(x, z)) + 0.6 + r() * 0.8
              const c = crit(w.o, x, y, z)
              c.wl = w.wl
              c.wr = w.wr
              g.items.push(c)
            }
            break
          case 'cat': {
            const m = new THREE.Mesh(cat, mat)
            m.scale.setScalar(1.5)
            m.castShadow = true
            g.items.push(crit(m, ax, world.standY(ax, az, -1), az, r() * 6))
            break
          }
          case 'deer': {
            const m = new THREE.Mesh(deer, mat)
            m.castShadow = true
            const c = crit(m, ax, world.ground(ax, az), az, r() * 6)
            g.items.push(c)
            break
          }
          case 'jays':
            break
          case 'gulls':
            for (let i = 0; i < n; i++) {
              const w = winged(gull, 2.2)
              const c = crit(w.o, ax, (def.y ?? 14) + r() * 6, az)
              c.wl = w.wl
              c.wr = w.wr
              c.phase = r() * Math.PI * 2
              c.vx = (0.12 + r() * 0.08) * (r() < 0.3 ? -1 : 1)
              c.vz = R * (0.6 + r() * 0.5)
              g.items.push(c)
            }
            break
          case 'crabs':
            for (let i = 0; i < n; i++) {
              const [x, z] = scatter()
              if (world.ground(x, z) < 0.1) continue
              const m = new THREE.Mesh(crab, mat)
              m.scale.setScalar(1.7)
              g.items.push(crit(m, x, world.ground(x, z) + 0.02, z, r() * 6))
            }
            break
          case 'lantern': {
            const o = new THREE.Group()
            o.add(new THREE.Mesh(lantern, worldMaterial({ vertexColors: true })))
            const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), glowMaterial('#D8E6F2'))
            glow.position.set(1.6, 2.6, 0)
            glow.renderOrder = 6
            ;(glow.material as THREE.ShaderMaterial).uniforms.uAlpha.value = 0.85
            o.add(glow)
            const c = crit(o, ax, -0.1, az, 0.6)
            c.head = glow
            g.items.push(c)
            break
          }
        }
        this.groups.push(g)
      }
    })

    // pools: flying bits (dust, drops), water rings, spare butterflies
    const bitGeo = new THREE.IcosahedronGeometry(0.04, 0)
    const bitMats = { dust: worldMaterial({ color: PAL.gravel }), drops: worldMaterial({ color: '#EAF4F2', emissive: '#304040' }) }
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(bitGeo, bitMats.dust)
      m.visible = false
      this.group.add(m)
      this.bits.push({ m, vx: 0, vy: 0, vz: 0, t: 0, life: 1, on: false })
    }
    this.bitMats = bitMats
    const ringGeo = new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2)
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#E6F2EE', transparent: true, opacity: 0, depthWrite: false }))
      m.visible = false
      m.renderOrder = 4
      this.group.add(m)
      this.rings.push({ m, t: 0, on: false, size: 1 })
    }
    for (let i = 0; i < 3; i++) {
      const w = winged(i % 2 ? bflyW : bfly, 3)
      const c = crit(w.o, 0, -100, 0)
      c.wl = w.wl
      c.wr = w.wr
      c.state = 2
      w.o.visible = false
      this.butterflyPool.push(c)
    }
  }

  private bitMats: Record<'dust' | 'drops', THREE.Material>

  // ---------------------------------------------------------------- effects

  /** A little burst of dust (digging, a scramble) or drops (a shake, a splash). */
  puff(x: number, y: number, z: number, kind: 'dust' | 'drops', n = 8, up = 1.6) {
    let k = 0
    for (const b of this.bits) {
      if (b.on) continue
      b.on = true
      b.t = 0
      b.life = 0.5 + Math.random() * 0.5
      b.m.material = this.bitMats[kind]
      b.m.visible = true
      b.m.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3)
      const a = Math.random() * Math.PI * 2
      const sp = 0.6 + Math.random() * 1.4
      b.vx = Math.cos(a) * sp
      b.vz = Math.sin(a) * sp
      b.vy = up * (0.6 + Math.random() * 0.8)
      b.m.scale.setScalar(kind === 'dust' ? 1.1 : 0.7)
      if (++k >= n) break
    }
  }

  /** A ring spreading on still water. */
  ripple(x: number, y: number, z: number, size = 1) {
    const r = this.rings.find((q) => !q.on)
    if (!r) return
    r.on = true
    r.t = 0
    r.size = size
    r.m.position.set(x, y + 0.03, z)
    r.m.visible = true
  }

  /** A butterfly starts up from (x, z): the dog's chase. */
  butterfly(x: number, y: number, z: number, awayYaw: number) {
    const c = this.butterflyPool.find((q) => q.state === 2)
    if (!c) return
    c.state = 1
    c.t = 0
    c.x = x
    c.y = y + 0.5
    c.z = z
    c.vx = Math.sin(awayYaw) * 1.6
    c.vz = Math.cos(awayYaw) * 1.6
    c.obj.visible = true
  }

  /** The dog has nosed whatever is at (x, z): the cat there answers. */
  poke(x: number, z: number) {
    for (const g of this.groups) {
      if (g.def.kind !== 'cat') continue
      const c = g.items[0]
      if (c && c.state === 0 && Math.hypot(c.x - x, c.z - z) < 4) {
        c.state = 1
        c.t = 0
      }
    }
  }

  private emit(kind: string, x: number, y: number, z: number, sound?: string) {
    this.events.push({ kind, x, y, z, sound })
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, bx: number, bz: number, dx: number, dz: number, time: number, ci: number, progress: number, darkness: number) {
    for (const g of this.groups) {
      const [ax, az] = g.def.at
      const dCenter = Math.hypot(bx - ax, bz - az)
      const near = dCenter < (g.def.kind === 'lantern' ? 400 : g.def.kind === 'gulls' ? 160 : 110)
      for (const c of g.items) c.obj.visible = near && c.state !== 2
      if (!near) {
        // out of sight they reset, so a second pass finds them again
        if (g.def.kind === 'lizards' || g.def.kind === 'crabs' || g.def.kind === 'jays')
          for (const c of g.items) {
            c.state = 0
            c.x = c.hx
            c.z = c.hz
          }
        continue
      }
      g.t += dt
      g.cool -= dt
      const noticeR = g.def.kind === 'lantern' ? 140 : g.def.kind === 'gulls' ? 60 : g.def.kind === 'goats' ? 40 : 18
      if (!g.noticed && g.ci === ci && dCenter < noticeR) {
        g.noticed = true
        if (g.def.kind !== 'lizards' && g.def.kind !== 'crabs' && g.def.kind !== 'jays' && g.def.kind !== 'cat' && g.def.kind !== 'deer') this.emit('life:' + g.def.kind, ax, 0, az)
      }
      switch (g.def.kind) {
        case 'lizards':
        case 'crabs': {
          const crab = g.def.kind === 'crabs'
          for (const c of g.items) {
            const d = Math.min(Math.hypot(bx - c.x, bz - c.z), Math.hypot(dx - c.x, dz - c.z) + 1)
            if (c.state === 0) {
              // basking: a push-up now and then; crabs sidle
              c.phase += dt
              if (crab) {
                const s = Math.sin(c.phase * 0.7) * 0.25 * dt
                c.x += Math.cos(c.yaw) * s
                c.z -= Math.sin(c.yaw) * s
              }
              c.obj.position.set(c.x, c.y + (crab ? 0 : Math.max(0, Math.sin(c.phase * 3)) * 0.02), c.z)
              if (d < (crab ? 4 : 5.5)) {
                c.state = 1
                c.t = 0
                // away from him, a little sideways, quick
                let ex = c.x - bx
                let ez = c.z - bz
                if (crab) {
                  // toward the sea (south) as much as away
                  ez += 3
                }
                const l = Math.hypot(ex, ez) || 1
                const sp = crab ? 3.2 : 5
                c.vx = (ex / l) * sp
                c.vz = (ez / l) * sp
                c.yaw = crab ? Math.atan2(c.vz, -c.vx) : Math.atan2(c.vx, c.vz)
                this.emit(crab ? 'life:crabs' : 'life:lizards', c.x, c.y, c.z, 'scatter')
              }
            } else if (c.state === 1) {
              c.t += dt
              const zig = crab ? 0 : Math.sin(c.t * 30) * 0.6
              c.x += (c.vx + -c.vz * zig * 0.3) * dt
              c.z += (c.vz + c.vx * zig * 0.3) * dt
              c.obj.position.set(c.x, this.world.ground(c.x, c.z) + 0.04, c.z)
              c.obj.rotation.y = c.yaw
              if (c.t > (crab ? 1.1 : 0.5)) c.state = 2
            }
          }
          break
        }
        case 'goats':
          for (const c of g.items) {
            const d = Math.hypot(bx - c.x, bz - c.z)
            c.t -= dt
            // graze, and now and then lift the head to look at him
            if (c.t <= 0) {
              c.state = c.state === 1 ? 0 : d < 35 && Math.random() < 0.6 ? 1 : 0
              c.t = c.state === 1 ? 2.5 + Math.random() * 2 : 3 + Math.random() * 5
              // the first look is a moment; after that it is only the bell
              if (c.state === 1 && d < 50) this.emit(c.vx ? 'sound' : 'life:goat', c.x, c.y + 1, c.z, 'goatbell')
              if (c.state === 1 && d < 50) c.vx = 1
            }
            const want = c.state === 1 ? 0.45 : -0.9 + Math.sin(time * 3 + c.phase) * 0.12
            c.head!.rotation.x = damp(c.head!.rotation.x, -want, 4, dt)
            if (c.state === 1) {
              const yaw = Math.atan2(bx - c.x, bz - c.z)
              c.head!.rotation.y = damp(c.head!.rotation.y, clamp(angle(yaw - c.yaw), -1, 1), 3, dt)
            } else c.head!.rotation.y = damp(c.head!.rotation.y, 0, 2, dt)
          }
          break
        case 'fish': {
          // a ring now and then, more of them when he is close and still
          if (g.cool <= 0 && dCenter < 45) {
            g.cool = 1.2 + Math.random() * 3.5
            const R = g.def.r ?? 5
            const a = Math.random() * Math.PI * 2
            const rr = Math.sqrt(Math.random()) * R
            const x = ax + Math.cos(a) * rr
            const z = az + Math.sin(a) * rr
            const y = g.def.y ?? this.world.ground(x, z)
            this.ripple(x, y, z, 0.7)
            if (Math.random() < 0.5) setTimeout(() => this.ripple(x, y, z, 0.45), 350)
            if (dCenter < 20) this.emit('sound', x, y, z, 'plop')
          }
          break
        }
        case 'dragonflies':
        case 'butterflies': {
          const df = g.def.kind === 'dragonflies'
          const R = g.def.r ?? 6
          for (const c of g.items) this.fly(c, dt, df, ax, az, R, g.def.y, bx, bz)
          break
        }
        case 'cat': {
          const c = g.items[0]
          if (!c) break
          if (c.state === 1) {
            c.t += dt
            const jd = g.def.jump
            const j = jd ? [jd[0], this.world.standY(jd[0], jd[1], -1) + jd[2], jd[1]] : null
            // she bats once, then goes off out of reach and sits again
            if (c.t < 0.35) c.obj.rotation.z = Math.sin(c.t * 18) * 0.15
            else if (j) {
              const k = clamp((c.t - 0.35) / 0.5, 0, 1)
              c.obj.position.set(c.hx + (j[0] - c.hx) * k, c.hy + (j[1] - c.hy) * k + Math.sin(k * Math.PI) * 0.9, c.hz + (j[2] - c.hz) * k)
              c.obj.rotation.z = 0
              if (k >= 1) {
                c.state = 3
                c.obj.rotation.y = Math.atan2(bx - j[0], bz - j[2])
              }
            }
            if (c.t > 0.3 && c.t - dt <= 0.3) this.emit('life:cat', c.x, c.y, c.z, 'scatter')
          }
          break
        }
        case 'deer': {
          const c = g.items[0]
          if (!c) break
          if (c.state === 0) {
            c.phase += dt
            c.obj.rotation.x = Math.sin(c.phase * 0.8) * 0.05
            if (dCenter < 34 && progress < (g.def.until ?? 1) && g.ci === ci) {
              c.state = 1
              c.t = 0
              const f = g.def.flee ?? [ax - 30, az]
              const l = Math.hypot(f[0] - c.x, f[1] - c.z) || 1
              c.vx = ((f[0] - c.x) / l) * 8
              c.vz = ((f[1] - c.z) / l) * 8
              c.yaw = Math.atan2(c.vx, c.vz)
              this.emit('life:deer', c.x, c.y + 1, c.z, 'hooves')
            } else if (progress >= (g.def.until ?? 1)) c.state = 2
          } else if (c.state === 1) {
            c.t += dt
            c.x += c.vx * dt
            c.z += c.vz * dt
            const hop = Math.abs(Math.sin(c.t * 7)) * 0.6
            c.obj.position.set(c.x, this.world.ground(c.x, c.z) + hop, c.z)
            c.obj.rotation.set(Math.cos(c.t * 7) * 0.2, c.yaw, 0)
            if (c.t > 3.2) c.state = 2
          }
          break
        }
        case 'jays': {
          if (g.cool <= 0 && dCenter < (g.def.r ?? 10) && g.ci === ci && !g.items.length) {
            g.cool = 1e9
            this.emit('life:jays', ax, this.world.ground(ax, az) + 7, az, 'jays')
          }
          break
        }
        case 'gulls':
          for (const c of g.items) {
            c.phase += c.vx * dt
            const R = c.vz
            c.x = ax + Math.cos(c.phase) * R
            c.z = az + Math.sin(c.phase) * R * 0.7
            const y = (g.def.y ?? 14) + Math.sin(c.phase * 2.3) * 2
            c.obj.position.set(c.x, y, c.z)
            c.obj.rotation.set(-0.1, Math.atan2(-Math.sin(c.phase) * Math.sign(c.vx), Math.cos(c.phase) * 0.7 * Math.sign(c.vx)), Math.sign(c.vx) * 0.3)
            const flap = Math.sin(time * 5 + c.hx) > 0.6 ? Math.sin(time * 9) * 0.6 : 0.12
            c.wl!.rotation.z = flap
            c.wr!.rotation.z = -flap
          }
          break
        case 'lantern': {
          const c = g.items[0]
          c.phase += dt
          c.obj.position.set(c.hx + Math.sin(c.phase * 0.03) * 12, -0.1 + Math.sin(c.phase * 0.9) * 0.08, c.hz + Math.cos(c.phase * 0.02) * 6)
          c.obj.rotation.z = Math.sin(c.phase * 0.7) * 0.04
          const glow = c.head as THREE.Mesh
          ;(glow.material as THREE.ShaderMaterial).uniforms.uAlpha.value = (0.7 + Math.sin(c.phase * 2.1) * 0.08) * darkness
          glow.quaternion.copy(c.obj.getWorldQuaternion(tmpQ).invert()).multiply(camQuat)
          break
        }
      }
    }
    // the dog's butterfly
    for (const c of this.butterflyPool) {
      if (c.state !== 1) continue
      c.t += dt
      c.x += c.vx * dt
      c.z += c.vz * dt
      c.y += (0.5 + Math.sin(c.t * 5) * 0.8) * dt
      c.obj.position.set(c.x + Math.sin(c.t * 7) * 0.15, c.y, c.z)
      c.obj.rotation.y = Math.atan2(c.vx, c.vz)
      const f = Math.sin(c.t * 40) * 0.9
      c.wl!.rotation.z = f
      c.wr!.rotation.z = -f
      if (c.t > 6) {
        c.state = 2
        c.obj.visible = false
      }
    }
    // bits and rings
    for (const b of this.bits) {
      if (!b.on) continue
      b.t += dt
      b.vy -= 9 * dt
      b.m.position.x += b.vx * dt
      b.m.position.y += b.vy * dt
      b.m.position.z += b.vz * dt
      if (b.t > b.life) {
        b.on = false
        b.m.visible = false
      }
    }
    for (const r of this.rings) {
      if (!r.on) continue
      r.t += dt
      const k = r.t / 1.6
      r.m.scale.setScalar((0.15 + k * 1.1) * r.size)
      ;(r.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k) * 0.5
      if (k >= 1) {
        r.on = false
        r.m.visible = false
      }
    }
  }

  private fly(c: Critter, dt: number, dart: boolean, ax: number, az: number, R: number, y0: number | undefined, bx: number, bz: number) {
    c.t -= dt
    if (c.t <= 0) {
      // a new place to hover: dragonflies dart, butterflies wander
      const a = Math.random() * Math.PI * 2
      const d = Math.sqrt(Math.random()) * R
      c.hx = ax + Math.cos(a) * d
      c.hz = az + Math.sin(a) * d
      c.hy = (y0 ?? this.world.ground(c.hx, c.hz)) + 0.5 + Math.random() * (dart ? 0.6 : 1.4)
      c.t = dart ? 0.4 + Math.random() * 1.6 : 1.5 + Math.random() * 2.5
    }
    // shy of the boy
    const db = Math.hypot(bx - c.x, bz - c.z)
    if (db < 2.5) {
      c.hx = c.x + (c.x - bx) * 1.5
      c.hz = c.z + (c.z - bz) * 1.5
    }
    const rate = dart ? 6 : 1.2
    c.x = damp(c.x, c.hx, rate, dt)
    c.y = damp(c.y, c.hy + (dart ? 0 : Math.sin(c.phase * 3) * 0.2), rate, dt)
    c.z = damp(c.z, c.hz, rate, dt)
    c.phase += dt
    c.obj.position.set(c.x, c.y, c.z)
    c.obj.rotation.y = Math.atan2(c.hx - c.x, c.hz - c.z)
    const f = dart ? Math.sin(c.phase * 90) * 0.35 : Math.sin(c.phase * 14) * 1.0
    c.wl!.rotation.z = f
    c.wr!.rotation.z = -f
  }
}

function angle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

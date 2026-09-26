// Small living things: birds that lift (the whistle's answer you can see with
// the sound off), prints that fade, the ring of a whistle, motes in the light.

import * as THREE from 'three'
import { printMaterial, worldMaterial, U } from './materials'
import { PAL } from './palette'
import { Kit, T } from './kit'

// ------------------------------------------------------------------ birds

type BirdKind = 'small' | 'pigeons' | 'gulls'

interface Bird {
  g: THREE.Group
  wl: THREE.Object3D
  wr: THREE.Object3D
  vel: THREE.Vector3
  t: number
  life: number
  flap: number
  active: boolean
  perched: boolean
  kind: BirdKind
  home: THREE.Vector3
}

export class Birds {
  group = new THREE.Group()
  birds: Bird[] = []
  private mats: Record<BirdKind, THREE.Material>

  constructor(n = 48) {
    this.mats = {
      small: worldMaterial({ color: '#5E5448' }),
      pigeons: worldMaterial({ color: '#9AA0A8' }),
      gulls: worldMaterial({ color: '#F2F1EC' }),
    }
    const bodyK = new Kit().add(new THREE.IcosahedronGeometry(0.5, 0), '#FFFFFF', T(0, 0, 0, 0, 0, 0, 0.12, 0.1, 0.26)).build()
    const wingK = new Kit().add(new THREE.BoxGeometry(1, 1, 1), '#DDDDDD', T(0.17, 0, 0, 0, 0, 0, 0.34, 0.015, 0.14)).build()
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group()
      const kind: BirdKind = 'small'
      const body = new THREE.Mesh(bodyK, this.mats[kind])
      const wl = new THREE.Mesh(wingK, this.mats[kind])
      const wr = new THREE.Mesh(wingK, this.mats[kind])
      wr.scale.x = -1
      g.add(body, wl, wr)
      g.visible = false
      this.group.add(g)
      this.birds.push({ g, wl, wr, vel: new THREE.Vector3(), t: 0, life: 5, flap: Math.random() * 6, active: false, perched: false, kind, home: new THREE.Vector3() })
    }
  }

  private setKind(b: Bird, kind: BirdKind) {
    b.kind = kind
    const m = this.mats[kind]
    b.g.children.forEach((c) => ((c as THREE.Mesh).material = m))
    const s = kind === 'gulls' ? 3.6 : kind === 'pigeons' ? 2.8 : 2.4
    b.g.scale.setScalar(s)
  }

  /** A flock lifts from around (x, y, z) and flies off, away from `from` if given. */
  lift(x: number, y: number, z: number, kind: BirdKind, count = 7, from?: THREE.Vector3) {
    let n = 0
    const away = new THREE.Vector3()
    if (from) away.set(x - from.x, 0, z - from.z).normalize()
    else away.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
    for (const b of this.birds) {
      if (b.active) continue
      this.setKind(b, kind)
      b.active = true
      b.perched = false
      b.t = 0
      b.life = 5.5 + Math.random() * 2.5
      b.g.visible = true
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 3
      b.g.position.set(x + Math.cos(a) * r, y + 0.3 + Math.random() * 1.5, z + Math.sin(a) * r)
      const spread = (Math.random() - 0.5) * 1.4
      const dir = away.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread)
      b.vel.set(dir.x * (2.5 + Math.random() * 2), 4 + Math.random() * 2.5, dir.z * (2.5 + Math.random() * 2))
      if (++n >= count) break
    }
  }

  update(dt: number) {
    for (const b of this.birds) {
      if (!b.active) continue
      b.t += dt
      b.flap += dt * (b.kind === 'gulls' ? 9 : 22)
      const f = Math.sin(b.flap) * (b.kind === 'gulls' ? 0.6 : 0.9)
      b.wl.rotation.z = f
      b.wr.rotation.z = -f
      b.vel.y = Math.max(b.vel.y - dt * 0.5, 1.6)
      b.vel.x += (Math.random() - 0.5) * dt * 2
      b.vel.z += (Math.random() - 0.5) * dt * 2
      b.g.position.addScaledVector(b.vel, dt)
      b.g.rotation.y = Math.atan2(b.vel.x, b.vel.z)
      b.g.rotation.x = -0.3
      if (b.t > b.life) {
        b.active = false
        b.g.visible = false
      }
    }
  }
}

// ------------------------------------------------------------------ prints

export class Prints {
  mesh: THREE.InstancedMesh
  born: THREE.InstancedBufferAttribute
  life: THREE.InstancedBufferAttribute
  i = 0
  n: number
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private e = new THREE.Euler()

  constructor(paw: boolean, n = 220) {
    this.n = n
    const geo = new THREE.PlaneGeometry(paw ? 0.15 : 0.13, paw ? 0.15 : 0.25)
    geo.rotateX(-Math.PI / 2)
    this.born = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(-1000), 1)
    this.life = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(20), 1)
    geo.setAttribute('aBorn', this.born)
    geo.setAttribute('aLife', this.life)
    this.mesh = new THREE.InstancedMesh(geo, printMaterial(paw), n)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    for (let k = 0; k < n; k++) this.mesh.setMatrixAt(k, this.m.makeTranslation(0, -999, 0))
  }

  add(x: number, y: number, z: number, yaw: number, life: number) {
    const k = this.i++ % this.n
    this.m.compose(new THREE.Vector3(x, y + 0.03, z), this.q.setFromEuler(this.e.set(0, yaw, 0)), new THREE.Vector3(1, 1, 1))
    this.mesh.setMatrixAt(k, this.m)
    this.mesh.instanceMatrix.needsUpdate = true
    this.born.setX(k, U.uTime.value)
    this.life.setX(k, life)
    this.born.needsUpdate = true
    this.life.needsUpdate = true
  }
}

// ------------------------------------------------------------------ whistle ring

export class Rings {
  group = new THREE.Group()
  private rings: { m: THREE.Mesh; t: number; active: boolean }[] = []

  constructor() {
    const geo = new THREE.RingGeometry(0.9, 1, 48)
    geo.rotateX(-Math.PI / 2)
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: '#FFF8E8', transparent: true, opacity: 0, depthWrite: false }),
      )
      m.visible = false
      m.renderOrder = 5
      this.group.add(m)
      this.rings.push({ m, t: 0, active: false })
    }
  }

  emit(x: number, y: number, z: number, delay = 0) {
    const r = this.rings.find((q) => !q.active)
    if (!r) return
    r.active = true
    r.t = -delay
    r.m.position.set(x, y + 0.08, z)
  }

  update(dt: number) {
    for (const r of this.rings) {
      if (!r.active) continue
      r.t += dt
      if (r.t < 0) continue
      const k = r.t / 1.1
      r.m.visible = true
      r.m.scale.setScalar(0.4 + k * 3.2)
      ;(r.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k) * 0.35
      if (k >= 1) {
        r.active = false
        r.m.visible = false
      }
    }
  }
}

// ------------------------------------------------------------------ motes

export class Motes {
  points: THREE.Points
  private base: Float32Array
  mat: THREE.PointsMaterial

  constructor(n = 260) {
    const pos = new Float32Array(n * 3)
    this.base = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      this.base[i * 3] = (Math.random() - 0.5) * 50
      this.base[i * 3 + 1] = Math.random() * 12
      this.base[i * 3 + 2] = (Math.random() - 0.5) * 50
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    // round, soft motes (a square point reads as a pixel, not dust)
    const cv = document.createElement('canvas')
    cv.width = cv.height = 32
    const cx = cv.getContext('2d')!
    const gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.4, 'rgba(255,255,255,0.5)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    cx.fillStyle = gr
    cx.fillRect(0, 0, 32, 32)
    const tex = new THREE.CanvasTexture(cv)
    this.mat = new THREE.PointsMaterial({ color: PAL.towelB, map: tex, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    this.points = new THREE.Points(geo, this.mat)
    this.points.frustumCulled = false
  }

  update(t: number, cx: number, cy: number, cz: number, color: THREE.Color, amount: number) {
    const p = this.points.geometry.attributes.position as THREE.BufferAttribute
    const a = p.array as Float32Array
    for (let i = 0; i < a.length; i += 3) {
      const bx = this.base[i] + Math.sin(t * 0.13 + i) * 1.5
      const by = this.base[i + 1] + Math.sin(t * 0.21 + i * 0.7) * 0.8
      const bz = this.base[i + 2] + Math.cos(t * 0.11 + i * 1.3) * 1.5
      a[i] = cx + wrap(bx - cx * 0.0 - (cx % 50), 50)
      a[i + 1] = cy - 2 + by
      a[i + 2] = cz + wrap(bz - (cz % 50), 50)
    }
    p.needsUpdate = true
    this.mat.color.copy(color)
    this.mat.opacity = amount
    this.points.visible = amount > 0.01
  }
}

function wrap(v: number, size: number) {
  return ((((v + size / 2) % size) + size) % size) - size / 2
}

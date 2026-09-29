// The boy, the dog, and the townsfolk. Built from simple forms on a pivot
// hierarchy and animated procedurally. The animation carries the story: the
// boy's walk is light in the morning, heavy in the woods, calm on the beach;
// the dog's tail and look-back are the two most animated things in the game.

import * as THREE from 'three'
import { Kit, T } from './kit'
import { PAL, COLLAR, lin } from './palette'
import { worldMaterial, glowMaterial } from './materials'
import { damp, clamp } from './noise'

const box = () => new THREE.BoxGeometry(1, 1, 1)
const cyl = (seg = 6, top = 1) => new THREE.CylinderGeometry(0.5 * top, 0.5, 1, seg, 1)
const ico = (d = 1) => new THREE.IcosahedronGeometry(0.5, d)
const cone = (seg = 4) => new THREE.ConeGeometry(0.5, 1, seg, 1)

function piece(parts: [THREE.BufferGeometry, string, THREE.Matrix4][]) {
  const k = new Kit()
  for (const [g, c, m] of parts) k.add(g, c, m)
  return k.build()
}

function pivot(parent: THREE.Object3D, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}

function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

// ============================================================================ boy

export type BoyPose = 'none' | 'whistle' | 'reach' | 'kneel'

/** How the ground is asking him to move, each 0..1; blended, never a verb. */
export interface Traverse {
  balance: number // on a log or a plank: arms out, a little sway
  wade: number // in the river: high steps, arms lifted clear
  climb: number // scrambling up: lean in, hands to the rock
  descend: number // picking his way down: sit back, arms out
  duck: number // under the washing
  push: number // through brush and reeds: arms up in front
}

export class Boy {
  root = new THREE.Group()
  hips: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  foreR: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  phase = 0
  pose: BoyPose = 'none'
  poseT = 0
  poseW = 0
  lookYaw = 0
  lookPitch = 0
  private breathe = Math.random() * 10
  tr: Traverse = { balance: 0, wade: 0, climb: 0, descend: 0, duck: 0, push: 0 }
  private trT = 0

  constructor() {
    const mat = worldMaterial({ vertexColors: true })
    this.hips = pivot(this.root, 0, 0.5, 0)
    mesh(this.hips, piece([[box(), PAL.boyShorts, T(0, 0.02, 0, 0, 0, 0, 0.3, 0.16, 0.2)]]), mat)
    this.torso = pivot(this.hips, 0, 0.06, 0)
    mesh(
      this.torso,
      piece([
        [cyl(7, 0.86), PAL.boyShirt, T(0, 0.18, 0, 0, 0, 0, 0.34, 0.38, 0.24)],
        [ico(1), PAL.boyShirt, T(0, 0.34, 0, 0, 0, 0, 0.36, 0.14, 0.24)],
        [cyl(6), PAL.boySkin, T(0, 0.43, 0, 0, 0, 0, 0.09, 0.06, 0.09)],
      ]),
      mat,
    )
    this.head = pivot(this.torso, 0, 0.46, 0)
    mesh(
      this.head,
      piece([
        [ico(1), PAL.boySkin, T(0, 0.2, 0, 0, 0, 0, 0.42, 0.44, 0.42)],
        // hair: a cap over the crown and back, a fringe in front
        [ico(1), PAL.boyHair, T(0, 0.27, -0.03, -0.25, 0, 0, 0.45, 0.36, 0.44)],
        [box(), PAL.boyHair, T(0, 0.33, 0.14, 0.4, 0, 0, 0.32, 0.08, 0.12)],
        // eyes only
        [ico(0), PAL.dogEye, T(-0.08, 0.2, 0.195, 0, 0, 0, 0.05, 0.065, 0.03)],
        [ico(0), PAL.dogEye, T(0.08, 0.2, 0.195, 0, 0, 0, 0.05, 0.065, 0.03)],
        [ico(0), PAL.boySkin, T(-0.215, 0.19, 0, 0, 0, 0, 0.06, 0.1, 0.07)],
        [ico(0), PAL.boySkin, T(0.215, 0.19, 0, 0, 0, 0, 0.06, 0.1, 0.07)],
      ]),
      mat,
    )
    const armGeo = piece([
      [ico(1), PAL.boyShirt, T(0, -0.04, 0, 0, 0, 0, 0.13, 0.14, 0.13)],
      [cyl(5), PAL.boySkin, T(0, -0.15, 0, 0, 0, 0, 0.075, 0.18, 0.075)],
    ])
    const foreGeo = piece([
      [cyl(5), PAL.boySkin, T(0, -0.09, 0, 0, 0, 0, 0.07, 0.18, 0.07)],
      [ico(0), PAL.boySkin, T(0, -0.2, 0.0, 0, 0, 0, 0.09, 0.1, 0.09)],
    ])
    this.armL = pivot(this.torso, -0.2, 0.36, 0)
    mesh(this.armL, armGeo, mat)
    const foreL = pivot(this.armL, 0, -0.23, 0)
    mesh(foreL, foreGeo, mat)
    this.armR = pivot(this.torso, 0.2, 0.36, 0)
    mesh(this.armR, armGeo, mat)
    this.foreR = pivot(this.armR, 0, -0.23, 0)
    mesh(this.foreR, foreGeo, mat)
    const legGeo = piece([
      [cyl(6), PAL.boyShorts, T(0, -0.08, 0, 0, 0, 0, 0.13, 0.16, 0.14)],
      [cyl(5), PAL.boySkin, T(0, -0.27, 0, 0, 0, 0, 0.085, 0.26, 0.085)],
      [box(), PAL.boyShoe, T(0, -0.44, 0.035, 0, 0, 0, 0.11, 0.08, 0.19)],
    ])
    this.legL = pivot(this.hips, -0.08, 0, 0)
    mesh(this.legL, legGeo, mat)
    this.legR = pivot(this.hips, 0.08, 0, 0)
    mesh(this.legR, legGeo, mat)
  }

  setPose(p: BoyPose, t = 0.9) {
    this.pose = p
    this.poseT = t
  }

  /** speed in m/s; gait shapes the walk. Returns true on a footfall this frame. */
  update(dt: number, speed: number, gait: 'light' | 'tired' | 'calm', lookYaw: number, lookPitch: number, ground?: Partial<Traverse>): boolean {
    for (const k of Object.keys(this.tr) as (keyof Traverse)[]) this.tr[k] = damp(this.tr[k], ground?.[k] ?? 0, k === 'duck' ? 12 : 6, dt)
    this.trT += dt
    const G = {
      light: { stride: 1.05, amp: 0.62, arm: 0.7, bob: 0.05, lean: 0.12, head: 0 },
      tired: { stride: 0.9, amp: 0.45, arm: 0.35, bob: 0.035, lean: 0.2, head: 0.18 },
      calm: { stride: 0.95, amp: 0.48, arm: 0.45, bob: 0.03, lean: 0.05, head: -0.02 },
    }[gait]
    const moving = clamp(speed / 2.5, 0, 1)
    const prev = this.phase
    this.phase += (speed / G.stride) * Math.PI * dt
    const s = Math.sin(this.phase)
    const step = Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI) && moving > 0.2
    this.breathe += dt
    const br = Math.sin(this.breathe * 1.9) * 0.012
    this.hips.position.y = 0.5 + Math.abs(Math.cos(this.phase)) * G.bob * moving - G.bob * 0.5 * moving + br * 0.3
    this.hips.rotation.y = s * 0.12 * moving
    this.torso.rotation.x = G.lean * moving + br
    this.torso.rotation.y = -s * 0.18 * moving
    this.legL.rotation.x = s * G.amp * moving
    this.legR.rotation.x = -s * G.amp * moving
    let aL = -s * G.arm * moving + 0.05
    let aR = s * G.arm * moving + 0.05
    let aRz = -0.08
    let fR = -0.25 - moving * 0.3
    // poses blend over the walk
    this.poseT -= dt
    const want = this.poseT > 0 ? 1 : 0
    this.poseW = damp(this.poseW, want, want ? 14 : 6, dt)
    if (this.pose === 'whistle') {
      aR = aR * (1 - this.poseW) + -2.35 * this.poseW
      aRz = -0.08 * (1 - this.poseW) + 0.55 * this.poseW
      fR = fR * (1 - this.poseW) + -1.9 * this.poseW
    } else if (this.pose === 'reach') {
      aR = aR * (1 - this.poseW) + -1.45 * this.poseW
      fR = fR * (1 - this.poseW) + -0.1 * this.poseW
      this.torso.rotation.x += 0.25 * this.poseW
    } else if (this.pose === 'kneel') {
      this.hips.position.y -= 0.18 * this.poseW
      this.legL.rotation.x += -1.1 * this.poseW
      this.legR.rotation.x += 0.4 * this.poseW
      aR = aR * (1 - this.poseW) + -0.9 * this.poseW
      aL = aL * (1 - this.poseW) + -0.7 * this.poseW
    }
    // the ground's say in it
    const tr = this.tr
    let zL = 0.08 + 0.05 * moving
    let zR = aRz - 0.05 * moving
    let hipRoll = 0
    let torsoRoll = 0
    if (tr.balance > 0.01) {
      const w = tr.balance
      const sway = Math.sin(this.trT * 2.2) * 0.09 + Math.sin(this.trT * 3.7) * 0.04
      zL += -1.25 * w + sway * 1.5 * w
      zR += 1.25 * w + sway * 1.5 * w
      aL *= 1 - w * 0.8
      aR *= 1 - w * 0.8
      hipRoll += sway * w
      torsoRoll -= sway * 0.6 * w
    }
    if (tr.wade > 0.01) {
      const w = tr.wade
      this.legL.rotation.x += Math.max(0, s) * 0.45 * w * moving
      this.legR.rotation.x += Math.max(0, -s) * 0.45 * w * moving
      zL += -0.45 * w
      zR += 0.45 * w
      this.torso.rotation.x += 0.08 * w
    }
    if (tr.climb > 0.01) {
      const w = tr.climb
      this.torso.rotation.x += 0.42 * w
      // hands to the rock, one then the other
      aL = aL * (1 - w) + (-1.1 - Math.max(0, s) * 0.5) * w
      aR = aR * (1 - w) + (-1.1 - Math.max(0, -s) * 0.5) * w
      fR = fR * (1 - w) + -0.4 * w
    }
    if (tr.descend > 0.01) {
      const w = tr.descend
      this.torso.rotation.x -= 0.14 * w
      zL += -0.55 * w
      zR += 0.55 * w
      this.hips.position.y -= 0.04 * w
    }
    if (tr.duck > 0.01) {
      const w = tr.duck
      this.hips.position.y -= 0.14 * w
      this.torso.rotation.x += 0.55 * w
    }
    if (tr.push > 0.01) {
      const w = tr.push
      aL = aL * (1 - w) + (-1.0 + Math.sin(this.phase) * 0.25) * w
      aR = aR * (1 - w) + (-1.0 - Math.sin(this.phase) * 0.25) * w
      zL += 0.25 * w
      zR += -0.25 * w
      this.torso.rotation.x += 0.1 * w
    }
    this.hips.rotation.z = hipRoll
    this.torso.rotation.z = torsoRoll
    this.armL.rotation.set(aL, 0, zL)
    this.armR.rotation.set(aR, 0, zR)
    this.foreR.rotation.x = fR
    this.lookYaw = damp(this.lookYaw, lookYaw, 5, dt)
    this.lookPitch = damp(this.lookPitch, lookPitch, 5, dt)
    this.head.rotation.set(G.head * moving - this.lookPitch - (this.pose === 'whistle' ? 0.2 * this.poseW : 0) + this.tr.duck * 0.35 + this.tr.balance * 0.25, this.lookYaw, 0)
    return step
  }
}

// ============================================================================ dog

export type DogGait = 'stand' | 'trot' | 'bound' | 'sit' | 'walk'
export type DogAct =
  | 'none' | 'glance' | 'turn' | 'bow' | 'bounce' | 'stare' | 'eat' | 'lookup' | 'answer'
  // business on the walk
  | 'drink' | 'dig' | 'sniff' | 'roll' | 'shake' | 'leap' | 'nose'

export class DogRig {
  root = new THREE.Group()
  body: THREE.Group
  neck: THREE.Group
  head: THREE.Group
  earL: THREE.Group
  earR: THREE.Group
  tail: THREE.Group[] = []
  legs: { hip: THREE.Group; knee: THREE.Group; front: boolean; side: number }[] = []
  eyes: THREE.Mesh[] = []
  collarMat: THREE.ShaderMaterial
  phase = 0
  sitW = 0
  boundW = 0
  wag = 0
  wagSpeed = 6
  wagAmp = 0.5
  tailUp = 0.5
  act: DogAct = 'none'
  actT = 0
  actDur = 1
  lookYaw = 0
  lookPitch = 0
  targetLookYaw = 0
  targetLookPitch = 0
  bodyTwist = 0
  hop = 0
  earsUp = 0.5
  eyeGlow = 0

  constructor() {
    const mat = worldMaterial({ vertexColors: true })
    this.collarMat = worldMaterial({ color: COLLAR, emissive: new THREE.Color(COLLAR).multiplyScalar(0.12) })
    this.body = pivot(this.root, 0, 0.44, 0)
    mesh(
      this.body,
      piece([
        [ico(1), PAL.dogCoat, T(0, 0.0, -0.02, 0, 0, 0, 0.3, 0.27, 0.66)],
        [ico(1), PAL.dogCoat, T(0, 0.03, 0.2, 0, 0, 0, 0.32, 0.3, 0.34)],
        [ico(1), PAL.dogWhite, T(0, -0.07, 0.23, 0, 0, 0, 0.22, 0.2, 0.24)],
        [ico(0), PAL.dogWhite, T(0, -0.1, -0.02, 0, 0, 0, 0.18, 0.1, 0.4)],
      ]),
      mat,
    )
    this.neck = pivot(this.body, 0, 0.07, 0.3)
    mesh(this.neck, piece([[cyl(6, 0.8), PAL.dogCoat, T(0, 0.08, 0.03, 0.55, 0, 0, 0.17, 0.24, 0.17)]]), mat)
    // the collar: thick enough to read at thirty meters, the only red in the world
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.028, 6, 14), this.collarMat)
    collar.position.set(0, 0.06, 0.02)
    collar.rotation.x = Math.PI / 2 + 0.55
    collar.castShadow = true
    this.neck.add(collar)
    const tag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 0), worldMaterial({ color: PAL.towelA, emissive: '#302410' }))
    tag.position.set(0, 0.0, 0.11)
    this.neck.add(tag)
    this.head = pivot(this.neck, 0, 0.2, 0.08)
    mesh(
      this.head,
      piece([
        [ico(1), PAL.dogCoat, T(0, 0.02, 0, 0, 0, 0, 0.22, 0.2, 0.23)],
        [box(), PAL.dogCoat, T(0, -0.02, 0.13, 0.1, 0, 0, 0.11, 0.09, 0.14)],
        [box(), PAL.dogWhite, T(0, -0.045, 0.16, 0.1, 0, 0, 0.1, 0.05, 0.12)],
        [ico(0), PAL.dogNose, T(0, 0.0, 0.205, 0, 0, 0, 0.045, 0.035, 0.03)],
        [ico(0), PAL.dogWhite, T(0, 0.08, 0.06, 0, 0, 0, 0.06, 0.03, 0.08)],
        [ico(0), PAL.dogEye, T(-0.058, 0.045, 0.095, 0, 0, 0, 0.032, 0.036, 0.02)],
        [ico(0), PAL.dogEye, T(0.058, 0.045, 0.095, 0, 0, 0, 0.032, 0.036, 0.02)],
      ]),
      mat,
    )
    const earGeo = piece([
      [cone(4), PAL.dogCoat, T(0, 0.06, 0, 0, Math.PI / 4, 0, 0.075, 0.13, 0.04)],
      [cone(4), PAL.dogWhite, T(0, 0.055, 0.008, 0, Math.PI / 4, 0, 0.045, 0.09, 0.02)],
    ])
    this.earL = pivot(this.head, -0.065, 0.1, -0.01)
    mesh(this.earL, earGeo, mat)
    this.earR = pivot(this.head, 0.065, 0.1, -0.01)
    mesh(this.earR, earGeo, mat)
    // eyes that catch the light in the dark
    const gm = glowMaterial('#E8F2C8')
    for (const x of [-0.058, 0.058]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), gm)
      e.position.set(x, 0.045, 0.11)
      e.renderOrder = 10
      this.head.add(e)
      this.eyes.push(e)
    }
    // tail: three segments, white tip
    let parent: THREE.Object3D = pivot(this.body, 0, 0.07, -0.33)
    for (let i = 0; i < 3; i++) {
      const seg = pivot(parent, 0, 0, 0)
      const len = 0.12
      mesh(seg, piece([[cyl(5, 0.8), i === 2 ? PAL.dogWhite : PAL.dogCoat, T(0, len / 2, 0, 0, 0, 0, 0.065 - i * 0.012, len, 0.065 - i * 0.012)]]), mat)
      this.tail.push(seg)
      parent = pivot(seg, 0, len, 0)
    }
    // legs
    const upper = piece([[cyl(5, 0.8), PAL.dogCoat, T(0, -0.1, 0, 0, 0, 0, 0.085, 0.2, 0.085)]])
    const lower = piece([
      [cyl(5, 0.9), PAL.dogCoat, T(0, -0.09, 0, 0, 0, 0, 0.06, 0.18, 0.06)],
      [box(), PAL.dogWhite, T(0, -0.19, 0.015, 0, 0, 0, 0.065, 0.04, 0.085)],
    ])
    for (const [front, side] of [[true, -1], [true, 1], [false, -1], [false, 1]] as const) {
      const hip = pivot(this.body, side * 0.09, -0.04, front ? 0.23 : -0.24)
      mesh(hip, upper, mat)
      const knee = pivot(hip, 0, -0.2, 0)
      mesh(knee, lower, mat)
      this.legs.push({ hip, knee, front, side })
    }
  }

  play(a: DogAct, dur: number) {
    this.act = a
    this.actT = 0
    this.actDur = dur
  }

  /**
   * speed m/s along his heading. lookAt is the yaw (relative to his body) and
   * pitch he wants his head to turn to, or null to look ahead. Returns true on
   * a paw fall.
   */
  update(dt: number, speed: number, gait: DogGait, lookYaw: number | null, lookPitch: number, excite: number, darkness: number, camFacing: number): boolean {
    const sitting = gait === 'sit'
    const bounding = gait === 'bound'
    this.sitW = damp(this.sitW, sitting ? 1 : 0, sitting ? 7 : 10, dt)
    this.boundW = damp(this.boundW, bounding ? 1 : 0, 6, dt)
    const moving = clamp(speed / 2.2, 0, 1.4)
    const prev = this.phase
    const cadence = bounding ? 2.6 : gait === 'walk' ? 1.45 : 2.2
    this.phase += dt * Math.PI * 2 * cadence * Math.min(1, speed / 1.2 + 0.001) * (speed > 0.05 ? 1 : 0)
    const step = Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI) && speed > 0.3
    const s = Math.sin(this.phase)
    const c = Math.cos(this.phase)

    // acts (look-backs, bounce, stare...) run on a timer
    this.actT += dt
    const a = this.act
    const k = a === 'none' ? 0 : Math.sin(clamp(this.actT / this.actDur, 0, 1) * Math.PI)
    // sustained acts ease in and out and hold in between
    const kh = a === 'none' ? 0 : clamp(this.actT / 0.35, 0, 1) * clamp((this.actDur - this.actT) / 0.35, 0, 1)
    const at = this.actT
    if (a !== 'none' && this.actT > this.actDur) this.act = 'none'

    // tail language
    let wantUp = sitting ? -0.4 : moving > 0.2 ? 0.7 : 0.35
    let wantSpeed = 5 + excite * 9
    let wantAmp = 0.35 + excite * 0.45
    if (a === 'stare') {
      wantUp = 0.95
      wantAmp = 0.02
    }
    if (a === 'bow' || a === 'bounce' || a === 'answer') {
      wantSpeed = 16
      wantAmp = 0.8
    }
    if (a === 'dig' || a === 'leap' || a === 'roll') {
      wantUp = 0.9
      wantSpeed = 15
      wantAmp = 0.75
    }
    if (a === 'sniff' || a === 'drink') {
      wantUp = 0.55
      wantSpeed = 7
      wantAmp = 0.3
    }
    if (a === 'nose') {
      wantUp = 0.75
      wantSpeed = 11
      wantAmp = 0.35
    }
    if (bounding) wantUp = 0.5
    this.tailUp = damp(this.tailUp, wantUp, 5, dt)
    this.wagSpeed = damp(this.wagSpeed, wantSpeed, 4, dt)
    this.wagAmp = damp(this.wagAmp, wantAmp, 4, dt)
    this.wag += dt * this.wagSpeed

    // body: trot bob, bound rock, sit pitch, bow
    const bob = moving * (0.018 * Math.abs(c) + this.boundW * 0.05 * s)
    let pitch = -this.sitW * 0.5 + this.boundW * 0.12 * c
    let y = 0.44 + bob - this.sitW * 0.13
    if (a === 'bow') {
      pitch += 0.35 * k
      y -= 0.1 * k
    }
    let roll = 0
    if (a === 'bounce') {
      this.hop = Math.max(0, Math.sin(clamp(this.actT / this.actDur, 0, 1) * Math.PI * 2)) * 0.22
      pitch -= 0.3 * k
    } else if (a === 'leap') {
      // two bounds after something, then it is gone
      const t = at / 0.62
      this.hop = t < 2 ? Math.abs(Math.sin(t * Math.PI)) * 0.42 : damp(this.hop, 0, 10, dt)
      pitch += t < 2 ? -Math.cos(t * Math.PI) * 0.35 : 0
    } else this.hop = damp(this.hop, 0, 10, dt)
    if (a === 'dig') {
      pitch += 0.22 * kh
      y -= 0.04 * kh
    }
    if (a === 'drink') {
      pitch += 0.2 * kh
      y -= 0.05 * kh
    }
    if (a === 'sniff') pitch += 0.08 * kh
    if (a === 'roll') {
      // over onto his back in the grass, wriggling
      roll = kh * (2.2 + Math.sin(at * 7) * 0.35)
      y -= 0.22 * kh
    }
    if (a === 'shake') roll = Math.sin(at * 36) * 0.32 * kh
    y += this.hop
    this.body.position.y = y
    this.body.position.z = -this.sitW * 0.06
    this.body.rotation.x = pitch
    const twistWant = a === 'turn' ? clamp(this.targetLookYaw, -0.9, 0.9) * 0.5 * k : 0
    this.bodyTwist = damp(this.bodyTwist, twistWant, 8, dt)
    this.body.rotation.y = this.bodyTwist
    this.body.rotation.z = moving * 0.03 * s + roll

    // legs
    for (const L of this.legs) {
      let swing: number
      if (bounding) {
        const ph = this.phase + (L.front ? 0 : Math.PI * 0.9) + (L.side > 0 ? 0.25 : 0)
        swing = Math.sin(ph) * 0.9 * moving
      } else {
        // trot: diagonal pairs
        const diag = (L.front ? 1 : -1) * L.side
        swing = Math.sin(this.phase + (diag > 0 ? 0 : Math.PI)) * 0.55 * Math.min(1, moving)
      }
      let hip = swing
      let knee = L.front ? Math.max(0, -Math.cos(this.phase + (L.side > 0 ? 0 : Math.PI))) * 0.5 * moving : -Math.max(0, Math.sin(this.phase)) * 0.4 * moving
      if (!L.front) {
        // sitting: haunches down, hocks forward
        hip = hip * (1 - this.sitW) + -1.25 * this.sitW
        knee = knee * (1 - this.sitW) + 1.9 * this.sitW
      } else {
        hip = hip * (1 - this.sitW) + 0.5 * this.sitW
        knee = knee * (1 - this.sitW) + -0.05 * this.sitW
        if (a === 'bow') {
          hip -= 0.9 * k
          knee += 1.2 * k
        }
        if (a === 'bounce') hip -= 0.8 * k
        if (a === 'dig') {
          // the front paws scrabble, one then the other
          const ph = at * 17 + (L.side > 0 ? Math.PI : 0)
          hip = hip * (1 - kh) + (-0.7 + Math.sin(ph) * 0.65) * kh
          knee = knee * (1 - kh) + (0.9 + Math.cos(ph) * 0.5) * kh
        }
      }
      if (a === 'roll') {
        const ph = at * 9 + (L.front ? 0 : 1.3) + (L.side > 0 ? Math.PI : 0)
        hip = hip * (1 - kh) + (L.front ? -0.6 : 0.6) * kh + Math.sin(ph) * 0.5 * kh
        knee = knee * (1 - kh) + (L.front ? 0.9 : -0.8) * kh
      }
      if (a === 'leap') {
        const t = at / 0.62
        if (t < 2) hip = (L.front ? -1 : 1) * Math.sin(t * Math.PI * 2) * 0.7
      }
      L.hip.rotation.x = hip
      L.knee.rotation.x = knee
    }

    // head and neck: look where he wants, with his whole neck when it's far
    let ly = lookYaw ?? 0
    let lp = lookPitch
    if (a === 'glance' || a === 'turn') {
      ly = this.targetLookYaw
      lp = this.targetLookPitch
    }
    if (a === 'lookup') {
      ly = this.targetLookYaw
      lp = 0.55
    }
    if (a === 'eat') lp = -0.7 * k
    if (a === 'drink') lp = lp * (1 - kh) + (-0.95 + Math.max(0, Math.sin(at * 11)) * 0.12) * kh
    if (a === 'dig') lp = lp * (1 - kh) - 0.55 * kh
    if (a === 'sniff') {
      lp = lp * (1 - kh) - 0.75 * kh
      ly = ly * (1 - kh) + Math.sin(at * 2.6) * 0.45 * kh
    }
    if (a === 'nose') {
      // nose out, slowly; the cat's paw at the end and he pulls back
      const back = smoothstepN(0.72, 0.8, at / this.actDur)
      lp = lp * (1 - kh) + (-0.3 + back * 0.55) * kh
    }
    if (a === 'leap') lp = 0.5 * kh
    if (a === 'roll') lp = 0.2 * kh
    if (a === 'stare') lp = 0.12
    const lookW = lookYaw !== null || a === 'glance' || a === 'turn' || a === 'lookup' ? 1 : 0
    this.lookYaw = damp(this.lookYaw, clamp(ly, -1.9, 1.9) * lookW, a === 'stare' ? 20 : 7, dt)
    this.lookPitch = damp(this.lookPitch, lp, 7, dt)
    const headBob = moving * 0.04 * Math.sin(this.phase * 2)
    // business: the whole neck goes down to the water, the hole, the scent
    const neckDown = a === 'drink' ? 0.95 * kh : a === 'dig' ? 0.55 * kh : a === 'sniff' ? 0.5 * kh : a === 'nose' ? 0.35 * kh : 0
    this.neck.rotation.set(-this.sitW * 0.1 + this.sitW * 0.45 - this.lookPitch * 0.4 + headBob + neckDown, this.lookYaw * 0.5 - this.bodyTwist * 0.5, 0)
    this.head.rotation.set(this.sitW * -0.35 - this.lookPitch * 0.6 - this.boundW * 0.2, this.lookYaw * 0.5, 0)

    // ears: up when alert, back when running
    let earWant = a === 'stare' ? 1 : bounding ? -0.6 : excite > 0.5 ? 0.9 : 0.5
    if (a === 'nose' || a === 'leap') earWant = 1
    if (a === 'shake') earWant = Math.sin(at * 36) > 0 ? 1 : -0.8
    this.earsUp = damp(this.earsUp, earWant, 8, dt)
    const flick = Math.max(0, Math.sin(this.wag * 0.13) - 0.97) * 8
    this.earL.rotation.set(-this.earsUp * 0.2 + (1 - this.earsUp) * 0.5, 0, -0.25 - flick * 0.3)
    this.earR.rotation.set(-this.earsUp * 0.2 + (1 - this.earsUp) * 0.5, 0, 0.25)

    // tail chain
    const wagA = Math.sin(this.wag) * this.wagAmp
    const base = -0.9 + this.tailUp * 1.3
    this.tail.forEach((seg, i) => {
      if (i === 0) seg.rotation.set(-base - (sitting ? 0 : 0.2), wagA * 0.5, 0)
      else seg.rotation.set(0.25 * i * (1 - this.tailUp) + (sitting ? 0.3 : -0.1), wagA * 0.35 * i, 0)
    })
    if (sitting) this.tail[0].rotation.set(-2.3, 0, wagA * 0.8)

    // eye glints: only in the dark, only toward the camera
    const glow = darkness * clamp(camFacing * 1.4 - 0.2, 0, 1) * (0.55 + this.eyeGlow)
    this.eyeGlow = damp(this.eyeGlow, 0, 1.5, dt)
    for (const e of this.eyes) {
      e.visible = glow > 0.02
      ;(e.material as THREE.ShaderMaterial).uniforms.uAlpha.value = glow
      e.quaternion.copy(e.parent!.getWorldQuaternion(new THREE.Quaternion()).invert())
      e.quaternion.multiply(camQuat)
    }
    return step
  }
}

function smoothstepN(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Set each frame by the game so the eye sprites face the camera. */
export const camQuat = new THREE.Quaternion()

// ============================================================================ townsfolk

export type FolkKind = 'fishmonger' | 'kids' | 'old-woman' | 'sitter' | 'walker' | 'kid'

export class Folk {
  root = new THREE.Group()
  body: THREE.Group
  head: THREE.Group
  armR: THREE.Group
  armL: THREE.Group
  legs: THREE.Group[] = []
  phase = Math.random() * 10
  kind: FolkKind
  scale: number

  constructor(kind: FolkKind, variant = 0) {
    this.kind = kind
    const mat = worldMaterial({ vertexColors: true })
    const kid = kind === 'kid'
    const old = kind === 'old-woman'
    this.scale = kid ? 0.72 : old ? 0.92 : 1
    const shirtOpts = kid ? [PAL.clothC, PAL.towelA, PAL.clothD] : [PAL.shutterGrey, PAL.clothD, PAL.hullStripe, PAL.awningCream]
    const shirt = old ? '#6E6A7E' : shirtOpts[variant % shirtOpts.length]
    const lower = old ? '#4E4A56' : kid ? PAL.boyShorts : ['#4E5A66', '#6A5A48', '#57606A'][variant % 3]
    const skin = ['#E2B48C', '#C9966E', '#D8A882'][variant % 3]
    const hair = old ? '#D8D4CC' : ['#3A2E26', '#5A4636', '#2E2A26'][variant % 3]
    this.root.scale.setScalar(this.scale * 1.35)
    this.body = pivot(this.root, 0, 0.55, 0)
    const parts: [THREE.BufferGeometry, string, THREE.Matrix4][] = [
      [cyl(7, 0.8), shirt, T(0, 0.22, 0, 0, 0, 0, 0.36, 0.5, 0.26)],
      [cyl(7, 1.2), lower, T(0, -0.02, 0, 0, 0, 0, 0.32, 0.12, 0.24)],
    ]
    if (old) parts.push([cyl(8, 0.7), lower, T(0, -0.35, 0, 0, 0, 0, 0.44, 0.5, 0.36)])
    if (kind === 'fishmonger') parts.push([box(), PAL.clothA, T(0, 0.1, 0.13, 0, 0, 0, 0.3, 0.5, 0.04)])
    mesh(this.body, piece(parts), mat)
    this.head = pivot(this.body, 0, 0.52, 0)
    const hp: [THREE.BufferGeometry, string, THREE.Matrix4][] = [
      [ico(1), skin, T(0, 0.14, 0, 0, 0, 0, 0.3, 0.32, 0.3)],
      [ico(1), hair, T(0, 0.2, -0.03, -0.3, 0, 0, 0.32, 0.26, 0.31)],
    ]
    if (old) hp.push([ico(1), '#8A86A0', T(0, 0.18, -0.02, 0, 0, 0, 0.36, 0.32, 0.36)])
    if (kind === 'fishmonger') hp.push([cyl(8), PAL.awningCream, T(0, 0.28, 0, 0, 0, 0, 0.34, 0.08, 0.34)])
    mesh(this.head, piece(hp), mat)
    const arm = piece([[cyl(5), shirt, T(0, -0.14, 0, 0, 0, 0, 0.09, 0.28, 0.09)], [ico(0), skin, T(0, -0.32, 0, 0, 0, 0, 0.09, 0.1, 0.09)]])
    this.armL = pivot(this.body, -0.2, 0.42, 0)
    mesh(this.armL, arm, mat)
    this.armR = pivot(this.body, 0.2, 0.42, 0)
    mesh(this.armR, arm, mat)
    if (!old) {
      const leg = piece([[cyl(5), lower, T(0, -0.25, 0, 0, 0, 0, 0.11, 0.5, 0.11)], [box(), PAL.boyShoe, T(0, -0.52, 0.03, 0, 0, 0, 0.11, 0.07, 0.18)]])
      for (const x of [-0.08, 0.08]) {
        const l = pivot(this.body, x, -0.04, 0)
        mesh(l, leg, mat)
        this.legs.push(l)
      }
    }
    if (kind === 'sitter') {
      this.body.position.y = 0.32
      for (const l of this.legs) l.rotation.x = -1.4
    }
  }

  /** point: 0..1 arm raise toward yaw (relative); walk speed for kids; bend for the old woman's treat */
  update(dt: number, walk: number, point: number, pointYaw: number, bend: number, lookYaw: number) {
    this.phase += dt * (walk > 0 ? walk * 3.2 : 1)
    const s = Math.sin(this.phase * (walk > 0 ? 1 : 0.4))
    if (walk > 0) {
      this.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.phase + i * Math.PI) * 0.7))
      this.armL.rotation.x = Math.sin(this.phase + Math.PI) * 0.6
      this.armR.rotation.x = Math.sin(this.phase) * 0.6
      this.body.position.y = 0.55 + Math.abs(Math.cos(this.phase)) * 0.05
    } else if (this.kind !== 'sitter') {
      this.legs.forEach((l) => (l.rotation.x = damp(l.rotation.x, 0, 6, dt)))
      this.armL.rotation.x = damp(this.armL.rotation.x, 0.05 + s * 0.02, 6, dt)
      this.body.position.y = 0.55 + s * 0.006
      this.armR.rotation.x = damp(this.armR.rotation.x, -point * 1.55 - bend * 1.0, 8, dt)
      this.armR.rotation.z = damp(this.armR.rotation.z, point * 0.2, 8, dt)
    }
    this.body.rotation.y = point * pointYaw * 0.6
    this.body.rotation.x = bend * 0.55
    this.head.rotation.y = damp(this.head.rotation.y, lookYaw - point * pointYaw * 0.3, 4, dt)
    this.head.rotation.x = bend * 0.3
  }
}

export type FolkIdle = 'sweep' | 'laundry' | 'cards' | 'sleep' | 'window' | 'mend' | 'chat' | 'water' | 'stand' | 'sit' | 'nets'

/**
 * One idle each, for the town's ambient people. Called after update(), it
 * overrides the limbs it owns. `t` is the person's own clock.
 */
export function folkIdle(f: Folk, idle: FolkIdle, t: number, looking: number) {
  const B = f.body
  switch (idle) {
    case 'sweep': {
      const sw = Math.sin(t * 2.2)
      B.rotation.y = sw * 0.35
      B.rotation.x = 0.25
      f.armL.rotation.set(-0.9, 0, 0.35 + sw * 0.15)
      f.armR.rotation.set(-0.6, 0, -0.1 + sw * 0.15)
      break
    }
    case 'laundry': {
      // reach up to the line, peg, down to the basket, up again
      const c = (t % 5.5) / 5.5
      const up = c < 0.6 ? Math.sin((c / 0.6) * Math.PI) : 0
      f.armL.rotation.set(-2.7 * up - 0.1, 0, 0.1)
      f.armR.rotation.set(-2.6 * up - 0.1 + (1 - up) * -0.4, 0, -0.1)
      B.rotation.x = (1 - up) * 0.35 * (c > 0.65 ? 1 : 0)
      break
    }
    case 'cards':
    case 'nets': {
      const play = idle === 'cards' ? Math.max(0, Math.sin(t * 0.9) - 0.85) * 6 : 0
      f.armL.rotation.set(-1.15, 0, 0.25)
      f.armR.rotation.set(-1.15 - play * 0.6 + (idle === 'nets' ? Math.sin(t * 5) * 0.15 : 0), 0, -0.25)
      B.rotation.x = 0.15
      if (!looking) f.head.rotation.x = 0.35
      break
    }
    case 'sleep':
      B.rotation.x = 0.1 + Math.sin(t * 0.8) * 0.02
      f.head.rotation.set(0.6, 0.25, 0.15)
      f.armL.rotation.set(-0.3, 0, 0.3)
      f.armR.rotation.set(-0.3, 0, -0.3)
      break
    case 'window':
      f.armL.rotation.set(-1.4, 0, 0.5)
      f.armR.rotation.set(-1.4, 0, -0.5)
      B.rotation.x = 0.2
      if (!looking) f.head.rotation.x = 0.3
      break
    case 'mend': {
      B.rotation.x = 0.7
      f.armL.rotation.set(-1.2, 0, 0.3)
      const hit = Math.max(0, Math.sin(t * 5.5))
      f.armR.rotation.set(-1.8 + hit * 0.9, 0, -0.2)
      break
    }
    case 'chat': {
      const g = Math.max(0, Math.sin(t * 0.8 + f.phase)) * Math.max(0, Math.sin(t * 2.3))
      f.armR.rotation.set(-0.5 - g * 0.7, 0, -0.3 - g * 0.3)
      if (!looking) f.head.rotation.x = Math.sin(t * 1.4 + f.phase) * 0.08
      break
    }
    case 'water':
      B.rotation.x = 0.25
      f.armR.rotation.set(-0.9 + Math.sin(t * 0.7) * 0.15, 0, -0.1)
      break
    case 'stand':
    case 'sit':
      B.rotation.z = Math.sin(t * 0.3 + f.phase) * 0.03
      break
  }
}

export function flatColor(hex: string) {
  return lin(hex)
}

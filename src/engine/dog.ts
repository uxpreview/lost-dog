// The dog is an actor, not an AI. He runs the chapter's authored node route
// along its main line and nothing about him is simulated:
//
//   heel      beside the boy (the opening, and the whole of the shore)
//   bolt      goes rigid, stares at nothing up the canyon, then runs
//   perch     waits at a point until the boy is close, looks back, moves on
//   hazard    sits on the far side of a danger until the boy is through
//   visit     stops with someone who knows him
//   eyes      waits in the dark, where only his eyes catch the light
//   join      sits at the treeline and falls in beside the boy
//   gate      goes ahead and sits in front of home
//   nearmiss  lets the boy close in, then the staged almost
//
// Between nodes he trots. If the boy falls far behind he stops and waits
// (sitting, looking back) rather than being dragged: never rubber-banding.
// He is never in danger and nothing here can harm him.

import * as THREE from 'three'
import { DogRig, type DogAct, type DogGait } from './characters'
import { Polyline } from './path'
import type { DogNode } from './types'
import type { World } from './world'
import { angleDiff, clamp, damp, dampAngle } from './noise'

export interface DogCtx {
  world: World
  ci: number
  line: Polyline
  boyX: number
  boyZ: number
  boyY: number
  boyYaw: number
  boyS: number
  boyMoving: boolean
  time: number
  whistles: number
  progress: number
  darkness: number
  camFacing: number
}

export type DogEvent =
  | { type: 'bolt' }
  | { type: 'arrive'; node: DogNode }
  | { type: 'release'; node: DogNode }
  | { type: 'collar' }
  | { type: 'join' }
  | { type: 'home' }
  | { type: 'eyes' }
  | { type: 'visit'; npc: string }
  | { type: 'pawstep'; x: number; y: number; z: number }

interface NodeRt {
  node: DogNode
  s: number
  clearS: number
}

type Mode = 'heel' | 'stare' | 'run' | 'pause' | 'wait' | 'extra' | 'nearmiss' | 'escape' | 'vista' | 'companion' | 'home'

const TROT = 3.9
const BOUND = 6.6

export class DogActor {
  rig = new DogRig()
  x = 0
  z = 0
  y = 0
  yaw = 0
  s = 0
  lat = 0
  speed = 0
  gait: DogGait = 'stand'
  mode: Mode = 'heel'
  ni = 0
  nodes: NodeRt[] = []
  t = 0
  lookTimer = 3
  boundT = 0
  extra: Polyline | null = null
  es = 0
  excite = 0.3
  holdT = 0
  events: DogEvent[] = []
  released = false
  private lookBackVariant = 0
  private lastLook = 0

  setChapter(nodes: DogNode[], line: Polyline, continuing: boolean) {
    this.nodes = nodes.map((node) => ({
      node,
      s: line.project(node.at[0], node.at[1]),
      clearS: node.type === 'hazard' ? line.project(node.clear[0], node.clear[1]) : 0,
    }))
    this.ni = 0
    this.extra = null
    this.es = 0
    this.holdT = 0
    this.released = false
    const first = this.nodes[0]?.node
    if (first?.type === 'heel') {
      // the shore's heel is company, not the morning's game
      this.mode = continuing || first.until.progress !== undefined ? 'companion' : 'heel'
      if (!continuing) {
        this.x = first.at[0]
        this.z = first.at[1]
      }
    } else {
      if (!continuing) {
        // a fresh start from the menu: he is already a little way ahead
        this.s = Math.min(line.length, 22)
        this.x = line.x(this.s)
        this.z = line.z(this.s)
      } else {
        this.s = line.project(this.x, this.z)
      }
      this.mode = 'run'
      // skip nodes he is already past
      while (this.nodes[this.ni] && this.nodes[this.ni].s < this.s - 2 && this.nodes[this.ni].node.type !== 'nearmiss') this.ni++
    }
    this.t = 0
  }

  get node() {
    return this.nodes[this.ni]
  }

  private emit(e: DogEvent) {
    this.events.push(e)
  }

  private lookBack(c: DogCtx, allowTurn: boolean) {
    const variants: DogAct[] = allowTurn ? ['glance', 'turn', 'glance', 'turn'] : ['glance']
    const v = variants[this.lookBackVariant++ % variants.length]
    this.setLookTarget(c)
    this.rig.play(v, v === 'glance' ? 0.8 : 1.4)
    this.lastLook = c.time
  }

  private setLookTarget(c: DogCtx) {
    const want = Math.atan2(c.boyX - this.x, c.boyZ - this.z)
    this.rig.targetLookYaw = angleDiff(this.yaw, want)
    const d = Math.hypot(c.boyX - this.x, c.boyZ - this.z)
    this.rig.targetLookPitch = clamp(Math.atan2(c.boyY + 0.8 - (this.y + 0.6), d), -0.6, 0.6)
  }

  whistleAnswer(c: DogCtx): 'bounce' | 'lookup' | 'bark' {
    this.setLookTarget(c)
    if (this.mode === 'heel') {
      this.rig.play('bounce', 0.9)
      this.excite = 1
      return 'bounce'
    }
    if (this.mode === 'companion' || this.mode === 'home') {
      this.rig.play('lookup', 1.8)
      return 'lookup'
    }
    this.rig.play('answer', 0.7)
    this.rig.eyeGlow = 1
    return 'bark'
  }

  update(dt: number, c: DogCtx) {
    this.t += dt
    const n = this.node
    const dBoy = Math.hypot(c.boyX - this.x, c.boyZ - this.z)
    let moveTo: [number, number] | null = null
    let speedWant = 0
    let faceBoy = false
    let pose: DogGait = 'stand'
    let lookAtBoy = false
    this.excite = damp(this.excite, dBoy < 6 ? 0.8 : 0.35, 1.5, dt)

    switch (this.mode) {
      case 'heel':
      case 'companion': {
        // beside the boy, a little ahead, on his right
        const fx = Math.sin(c.boyYaw)
        const fz = Math.cos(c.boyYaw)
        const tx = c.boyX + fx * 0.7 - fz * 1.0
        const tz = c.boyZ + fz * 0.7 + fx * 1.0
        const d = Math.hypot(tx - this.x, tz - this.z)
        moveTo = [tx, tz]
        speedWant = d < 0.4 ? 0 : clamp(d * 1.8, 0.6, 4.5)
        pose = d < 0.4 && !c.boyMoving ? (this.t % 20 > 9 ? 'sit' : 'stand') : speedWant > 3.2 ? 'trot' : 'walk'
        lookAtBoy = !c.boyMoving
        if (!c.boyMoving && d < 0.5) faceBoy = false
        if (this.mode === 'heel' && n?.node.type === 'heel') {
          const u = n.node.until
          const byTime = u.time !== undefined && this.t > u.time
          const byWhistle = u.whistles !== undefined && c.whistles >= u.whistles && this.t > 14
          const byWander = u.time !== undefined && Math.hypot(c.boyX - n.node.at[0], c.boyZ - n.node.at[1]) > 22
          if (byTime || byWhistle || byWander) this.advance(c)
        }
        if (this.mode === 'companion' && n?.node.type === 'heel' && n.node.until.progress !== undefined && c.progress >= n.node.until.progress) {
          this.advance(c)
        }
        break
      }
      case 'stare': {
        const nd = n.node as Extract<DogNode, { type: 'bolt' }>
        const want = Math.atan2(nd.stare[0] - this.x, nd.stare[2] - this.z)
        this.yaw = dampAngle(this.yaw, want, 5, dt)
        pose = 'stand'
        this.holdT += dt
        if (this.rig.act !== 'stare') this.rig.play('stare', nd.hold + 0.4)
        if (this.holdT > nd.hold) {
          this.ni++
          this.mode = 'run'
          this.boundT = 4.5
          this.s = c.line.project(this.x, this.z)
        }
        break
      }
      case 'run': {
        if (!n) {
          pose = 'sit'
          faceBoy = true
          break
        }
        // too far ahead: stop and wait for him, looking back
        const gap = this.s - c.boyS
        if (gap > 44 && dBoy > 30 && this.boundT <= 0) {
          this.mode = 'pause'
          this.holdT = 0
          this.lookBack(c, true)
          break
        }
        const targetS = n.s
        this.boundT -= dt
        speedWant = this.boundT > 0 ? BOUND : TROT
        if (dBoy < 9 && this.boundT <= 0) speedWant = TROT * 1.12
        pose = this.boundT > 0.5 ? 'bound' : 'trot'
        // his place on the route never runs ahead of his body
        const bodyS = c.line.project(this.x, this.z)
        this.s = Math.min(targetS, this.s + this.speed * dt, bodyS + 4)
        moveTo = this.linePoint(c, this.s + 1.5)
        // constant look-backs while trotting (rule 3)
        this.lookTimer -= dt
        if (this.lookTimer <= 0 && this.boundT <= 0.5) {
          this.lookTimer = 3.2 + Math.random() * 3
          this.lookBack(c, dBoy > 14)
        }
        if (this.s >= targetS - 0.25) this.arrive(c)
        break
      }
      case 'pause': {
        this.holdT += dt
        pose = this.holdT > 2.5 ? 'sit' : 'stand'
        faceBoy = true
        lookAtBoy = true
        const gap = this.s - c.boyS
        if (gap < 26 || dBoy < 22) {
          this.mode = 'run'
          this.lookTimer = 1.5
        }
        break
      }
      case 'wait': {
        const nd = n.node
        // walk the last meters to his mark before settling
        const mark: [number, number] = [nd.at[0], nd.at[1]]
        const toMark = Math.hypot(mark[0] - this.x, mark[1] - this.z)
        if (toMark > 0.6 && nd.type !== 'join' && nd.type !== 'eyes') {
          moveTo = mark
          speedWant = Math.min(TROT, 1 + toMark * 1.5)
          pose = 'trot'
          this.holdT = 0
          break
        }
        this.holdT += dt
        faceBoy = true
        lookAtBoy = true
        pose = 'pose' in nd && nd.pose === 'sit' ? 'sit' : 'stand'
        let release = false
        if (nd.type === 'perch' || nd.type === 'eyes') release = dBoy < nd.release
        if (nd.type === 'hazard') release = c.boyS >= n.clearS || dBoy < 2.2
        if (nd.type === 'visit') {
          lookAtBoy = this.holdT > nd.hold
          faceBoy = this.holdT > nd.hold
          if (this.holdT < nd.hold) {
            pose = this.holdT > 0.6 ? 'sit' : 'stand'
            if (this.holdT > 1 && this.holdT - dt <= 1) this.rig.play('eat', 1.6)
          }
          release = this.holdT > nd.hold && dBoy < nd.release
        }
        if (nd.type === 'join') {
          if (dBoy < nd.release) {
            this.mode = 'companion'
            this.emit({ type: 'join' })
            this.rig.play('bow', 1.1)
            this.ni++
          }
          break
        }
        if (nd.type === 'gate') {
          if (dBoy < nd.release && !this.released) {
            this.released = true
            this.mode = 'home'
            this.emit({ type: 'home' })
          }
          break
        }
        // a hazard releases only once he has seen the boy through
        if (release && this.holdT > 0.8) {
          this.emit({ type: 'release', node: nd })
          this.ni++
          this.mode = 'run'
          this.lookTimer = 2.5
          this.rig.play('turn', 0.9)
        }
        break
      }
      case 'extra':
      case 'escape': {
        // along the near-miss path beyond the main line
        const L = this.extra!
        const sp = this.mode === 'escape' && this.es < 30 ? BOUND : TROT
        speedWant = sp
        pose = sp > 5 ? 'bound' : 'trot'
        this.es = Math.min(L.length, this.es + this.speed * dt)
        moveTo = [L.x(Math.min(L.length, this.es + 1.5)), L.z(Math.min(L.length, this.es + 1.5))]
        this.lookTimer -= dt
        if (this.lookTimer <= 0) {
          this.lookTimer = 2.5
          this.lookBack(c, false)
        }
        if (this.es >= L.length - 0.2) {
          this.mode = 'vista'
          this.holdT = 0
        }
        break
      }
      case 'vista': {
        pose = 'sit'
        faceBoy = true
        lookAtBoy = true
        break
      }
      case 'nearmiss': {
        const nd = n.node as Extract<DogNode, { type: 'nearmiss' }>
        faceBoy = true
        lookAtBoy = true
        pose = 'stand'
        this.excite = 1
        if (dBoy < 1.45 && !this.released) {
          this.released = true
          this.emit({ type: 'collar' })
        }
        void nd
        break
      }
      case 'home': {
        pose = 'stand'
        faceBoy = true
        lookAtBoy = true
        this.excite = 1
        break
      }
    }

    // speed and position
    this.speed = damp(this.speed, speedWant, 4, dt)
    if (moveTo) {
      const dx = moveTo[0] - this.x
      const dz = moveTo[1] - this.z
      const d = Math.hypot(dx, dz)
      if (d > 0.05) {
        const step = Math.min(d, this.speed * dt)
        let nx = this.x + (dx / d) * step
        let nz = this.z + (dz / d) * step
        if (this.mode === 'heel' || this.mode === 'companion') [nx, nz] = c.world.constrain(this.x, this.z, nx, nz, c.ci)
        this.x = nx
        this.z = nz
        if (this.speed > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 8, dt)
      }
    }
    if (faceBoy && this.speed < 0.4) {
      const want = Math.atan2(c.boyX - this.x, c.boyZ - this.z)
      this.yaw = dampAngle(this.yaw, want, dBoy < 3 ? 3 : 2, dt)
    }
    const ty = c.world.standY(this.x, this.z, this.mode === 'extra' || this.mode === 'escape' || this.mode === 'vista' ? -1 : c.ci)
    this.y = this.y === 0 ? ty : damp(this.y, ty, 14, dt)
    this.gait = pose

    this.setLookTarget(c)
    const lookYaw = lookAtBoy && dBoy < 60 ? this.rig.targetLookYaw : null
    const step = this.rig.update(dt, this.speed, pose, lookYaw, lookAtBoy ? this.rig.targetLookPitch : 0, this.excite, c.darkness, c.camFacing)
    this.rig.root.position.set(this.x, this.y, this.z)
    this.rig.root.rotation.y = this.yaw
    if (step) this.emit({ type: 'pawstep', x: this.x, y: this.y, z: this.z })
    void this.lastLook
  }

  private linePoint(c: DogCtx, s: number): [number, number] {
    const L = c.line
    const ss = clamp(s, 0, L.length)
    // wander off the centerline, never off the corridor
    const half = L.e(1, ss) * 0.5
    const want = Math.sin(ss * 0.07 + 1.3) * Math.max(0, Math.min(1.3, half - 0.6))
    this.lat = damp(this.lat, want, 1.2, 1 / 60)
    const [tx, tz] = L.tangent(ss, 2)
    return [L.x(ss) - tz * this.lat, L.z(ss) + tx * this.lat]
  }

  private advance(c: DogCtx) {
    this.ni++
    const n = this.node
    this.s = c.line.project(this.x, this.z)
    if (!n) return
    if (n.node.type === 'bolt') {
      this.mode = 'stare'
      this.holdT = 0
      this.emit({ type: 'bolt' })
    } else {
      this.mode = 'run'
      this.lookTimer = 3
    }
  }

  private arrive(c: DogCtx) {
    const n = this.node
    this.emit({ type: 'arrive', node: n.node })
    this.holdT = 0
    if (n.node.type === 'nearmiss') {
      const nd = n.node
      this.extra = new Polyline(nd.path as number[][], 1)
      this.es = this.extra.project(this.x, this.z)
      if (nd.contact) {
        this.mode = 'nearmiss'
        this.released = false
      } else {
        this.mode = 'extra'
        this.lookTimer = 2
      }
      return
    }
    if (n.node.type === 'visit') this.emit({ type: 'visit', npc: n.node.npc })
    if (n.node.type === 'eyes') this.emit({ type: 'eyes' })
    this.mode = 'wait'
    this.rig.play(Math.random() < 0.5 ? 'turn' : 'bow', 1.2)
    void c
  }

  /** After the collar slips: bound away along the near-miss path. */
  escape() {
    this.mode = 'escape'
    this.es = this.extra ? this.extra.project(this.x, this.z) : 0
    this.lookTimer = 1.2
  }

  get pos() {
    return new THREE.Vector3(this.x, this.y, this.z)
  }
}

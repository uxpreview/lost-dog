// The game: one continuous coast, one day. Chapters are stretches of the same
// world read from data; the light is keyed to how far along the dog's route
// the boy has come, so wandering never costs him daylight.

import * as THREE from 'three'
import worldData from '../data/world.json'
import ch1 from '../data/ch1.json'
import ch2 from '../data/ch2.json'
import ch3 from '../data/ch3.json'
import ch4 from '../data/ch4.json'
import type { Chapter, Light, WorldData, Witness } from './types'
import { World } from './world'
import { Polyline } from './path'
import { U } from './materials'
import { buildTerrain, buildPaths, buildSea, buildRivers, buildSky, bindHeightMap } from './terrain'
import { dress } from './dress'
import { Boy, Folk, camQuat } from './characters'
import { DogActor, type DogCtx } from './dog'
import { Birds, Prints, Rings, Motes } from './fx'
import { Post } from './post'
import { input, clearKeys } from './input'
import { useUI } from './store'
import { loadSave, writeSave, type Save } from './save'
import { audio } from './audio'
import { angleDiff, clamp, damp, dampAngle, lerp, smoothstep } from './noise'
import * as K from './kit'
import { worldMaterial, glowMaterial } from './materials'

export const CHAPTERS = [ch1, ch2, ch3, ch4] as unknown as Chapter[]

const tmpC = new THREE.Color()
const tmpC2 = new THREE.Color()

interface FolkRt {
  def: Witness
  rigs: Folk[]
  x: number
  z: number
  y: number
  yaw: number
  t: number
  state: 'idle' | 'react' | 'done'
  cool: number
  runS: number
  run?: Polyline
}

interface DistRt {
  kind: string
  x: number
  z: number
  y: number
  obj: THREE.Object3D
  hit: boolean
  t: number
  dir: number
}

type Mode = 'title' | 'play' | 'map' | 'cut' | 'end'

export class Game {
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(50, 1, 0.2, 2200)
  post: Post
  world: World
  sun = new THREE.DirectionalLight(0xffffff, 1)
  sky!: THREE.Mesh
  boy = new Boy()
  dog = new DogActor()
  birds = new Birds()
  paws = new Prints(true, 260)
  feet = new Prints(false, 160)
  rings = new Rings()
  motes = new Motes()
  folk: FolkRt[] = []
  dist: DistRt[] = []
  lines: Polyline[]
  ci = 0
  /** walkable chapters: the current one, plus the seam of the last until he is on his way */
  walk: number[] = [0]
  mode: Mode = 'title'
  time = 0
  // the boy
  px = 0
  pz = 0
  py = 0
  pyaw = 0
  pspeed = 0
  pvx = 0
  pvz = 0
  boyS = 0
  bestS = 0
  progress = 0
  // camera
  camYaw = 0
  camPos = new THREE.Vector3()
  camLook = new THREE.Vector3()
  camFov = 50
  frameW = 0
  camSwing = 0
  cutCam: { pos: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null
  // whistle
  whistleCool = 0
  whistles = 0
  pendingAnswer = -1
  // chapter state
  save: Save
  route: [number, number][] = []
  lastLog = new THREE.Vector2(1e9, 1e9)
  passed = new Set<string>()
  timeScale = 1
  cutT = 0
  cutKind = ''
  darkness = 0
  aspect = 1
  quality: number
  home: {
    door: THREE.Object3D
    gate: THREE.Object3D
    light: THREE.Mesh
    figure: Folk
    windowsMat: THREE.ShaderMaterial
    halo: THREE.ShaderMaterial
  } | null = null
  private lastFootSide = 1
  private lastPawSide = 1
  private cardTimer = 0
  private eyesShown = false
  private stepAudioT = 0

  constructor(quality: number, onProgress?: (p: number) => void) {
    this.quality = quality
    this.post = new Post(quality > 0.7 ? 4 : 2)
    this.save = loadSave()
    onProgress?.(0.1)
    this.world = new World(worldData as unknown as WorldData, CHAPTERS)
    this.lines = this.world.mains
    onProgress?.(0.5)
    const s = this.scene
    bindHeightMap(this.world)
    this.sky = buildSky()
    s.add(this.sky)
    s.add(buildTerrain(this.world))
    s.add(buildPaths(this.world))
    s.add(buildSea(this.world))
    s.add(buildRivers(this.world))
    onProgress?.(0.7)
    s.add(dress(this.world, quality))
    onProgress?.(0.9)
    this.buildHome()
    this.buildFolk()
    this.buildDisturbances()
    s.add(this.boy.root, this.dog.rig.root, this.birds.group, this.paws.mesh, this.feet.mesh, this.rings.group, this.motes.points)
    this.boy.root.traverse((o) => (o.castShadow = true))
    // the sun (or moon): shadows only; the shader takes its color from U
    this.sun.castShadow = true
    const sz = quality > 0.7 ? 2048 : 1024
    this.sun.shadow.mapSize.set(sz, sz)
    const sc = this.sun.shadow.camera
    sc.left = -42
    sc.right = 42
    sc.top = 42
    sc.bottom = -42
    sc.near = 1
    sc.far = 400
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.08
    s.add(this.sun, this.sun.target)
    useUI.getState().set({ reached: this.save.reached })
    this.startChapter(0, false)
    this.mode = 'title'
    onProgress?.(1)
  }

  get ch() {
    return CHAPTERS[this.ci]
  }
  get line() {
    return this.lines[this.ci]
  }

  // ------------------------------------------------------------------ setup

  private buildHome() {
    const c4 = CHAPTERS.find((c) => c.home)
    if (!c4?.home) return
    const [hx, hy, hz] = c4.home.house
    const [gx, gy, gz] = c4.home.gate
    const winMat = worldMaterial({ vertexColors: true, windows: true })
    const house = new THREE.Mesh(K.homeHouse(), winMat)
    house.position.set(hx, hy, hz)
    house.castShadow = true
    house.receiveShadow = true
    this.scene.add(house)
    const wall = new THREE.Mesh(K.gardenWall(0), worldMaterial({ vertexColors: true }))
    wall.position.set(gx, gy, gz)
    wall.castShadow = true
    wall.receiveShadow = true
    this.scene.add(wall)
    const gate = new THREE.Group()
    gate.position.set(gx - 1.1, gy, gz)
    const leaf = new THREE.Mesh(K.gateLeaf(), worldMaterial({ vertexColors: true }))
    leaf.castShadow = true
    gate.add(leaf)
    this.scene.add(gate)
    const door = new THREE.Group()
    door.position.set(hx - 0.8 - 0.62, hy, hz + 3.26)
    const dl = new THREE.Mesh(K.doorLeaf(), worldMaterial({ vertexColors: true }))
    door.add(dl)
    this.scene.add(door)
    // the warm spill from the open door, laid on the ground
    const light = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 7).rotateX(-Math.PI / 2).translate(0, 0, 3.5),
      new THREE.MeshBasicMaterial({ color: '#F2B950', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    light.position.set(hx - 0.8, this.world.ground(hx - 0.8, hz + 5) + 0.06, hz + 3.3)
    this.scene.add(light)
    const figure = new Folk('walker', 1)
    figure.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = worldMaterial({ color: '#14161C' })
    })
    figure.root.position.set(hx - 0.8, hy, hz + 2.6)
    figure.root.visible = false
    this.scene.add(figure.root)
    // a soft halo at each window, the warmest light in the game
    const halos = new THREE.Group()
    const hm = glowMaterial('#F2B950')
    for (const [x, y] of [[1.6, 1.2], [3.0, 1.2], [-2.8, 3.6], [-0.8, 3.6], [1.6, 3.6], [3.0, 3.6]]) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), hm)
      q.position.set(hx + x, hy + y, hz + 3.4)
      q.renderOrder = 6
      halos.add(q)
    }
    this.scene.add(halos)
    this.home = { door, gate, light, figure, windowsMat: winMat, halo: hm }
  }

  private buildFolk() {
    CHAPTERS.forEach((ch) => {
      for (const w of ch.witnesses ?? []) {
        const rigs: Folk[] = []
        if (w.kind === 'kids') rigs.push(new Folk('kid', 0), new Folk('kid', 1))
        else rigs.push(new Folk(w.kind, this.folk.length))
        const y = this.world.standY(w.at[0], w.at[1], -1)
        const yaw = Math.atan2(w.face[0] - w.at[0], w.face[1] - w.at[1])
        rigs.forEach((r, i) => {
          r.root.position.set(w.at[0] + i * 0.9, y, w.at[1] + i * 0.4)
          r.root.rotation.y = yaw
          this.scene.add(r.root)
        })
        this.folk.push({
          def: w,
          rigs,
          x: w.at[0],
          z: w.at[1],
          y,
          yaw,
          t: 0,
          state: 'idle',
          cool: 0,
          runS: 0,
          run: w.run ? new Polyline([w.at, ...w.run] as number[][], 1) : undefined,
        })
      }
    })
  }

  private buildDisturbances() {
    const mat = worldMaterial({ vertexColors: true })
    CHAPTERS.forEach((ch) => {
      for (const d of ch.disturbances ?? []) {
        const [x, z] = d.at
        const y = this.world.standY(x, z, -1)
        let obj: THREE.Object3D
        if (d.kind === 'crate') obj = new THREE.Mesh(K.crate(), mat)
        else if (d.kind === 'basket') obj = new THREE.Mesh(K.basket(), mat)
        else if (d.kind === 'broom') obj = new THREE.Mesh(K.broom(), mat)
        else {
          // pigeons or cats sitting about, until he comes through
          obj = new THREE.Group()
          const n = d.kind === 'pigeons' ? 6 : 2
          for (let i = 0; i < n; i++) {
            const g = new K.Kit()
              .add(new THREE.IcosahedronGeometry(0.5, 0), d.kind === 'pigeons' ? '#9AA0A8' : '#5A524A', K.T(0, 0.12, 0, 0, 0, 0, 0.2, 0.2, 0.3))
              .add(new THREE.IcosahedronGeometry(0.5, 0), d.kind === 'pigeons' ? '#8A9098' : '#5A524A', K.T(0, 0.26, 0.12, 0, 0, 0, 0.12, 0.12, 0.12))
            if (d.kind === 'cats') g.add(new THREE.BoxGeometry(1, 1, 1), '#5A524A', K.T(0, 0.14, -0.22, 0.8, 0, 0, 0.04, 0.3, 0.04))
            const m = new THREE.Mesh(g.build(), mat)
            m.position.set((Math.random() - 0.5) * 2.4, 0, (Math.random() - 0.5) * 2.4)
            m.rotation.y = Math.random() * 6
            if (d.kind === 'cats') m.scale.setScalar(1.6)
            obj.add(m)
          }
        }
        obj.position.set(x, y, z)
        obj.traverse((o) => ((o as THREE.Mesh).castShadow = true))
        this.scene.add(obj)
        this.dist.push({ kind: d.kind, x, z, y, obj, hit: false, t: 0, dir: Math.random() * 6 })
      }
    })
  }

  // ------------------------------------------------------------------ chapters

  startChapter(ci: number, continuing: boolean) {
    this.ci = ci
    const ch = this.ch
    const line = this.line
    if (!continuing) {
      const p0 = ch.main[0]
      const [tx, tz] = line.tangent(2, 2)
      this.px = p0[0]
      this.pz = p0[1]
      this.pyaw = Math.atan2(tx, tz)
      this.camYaw = this.pyaw
      this.py = this.world.standY(this.px, this.pz, ci)
      if (ci === 0) {
        this.px = 68
        this.pz = 34
        this.pyaw = Math.atan2(-18, 6)
      }
      this.snapCamera = true
    }
    this.walk = continuing && ci > 0 ? [ci, ci - 1] : [ci]
    this.boyS = line.project(this.px, this.pz)
    this.bestS = this.boyS
    this.progress = 0
    this.dog.setChapter(ch.dog, line, continuing)
    this.route = continuing ? [] : []
    this.lastLog.set(1e9, 1e9)
    this.whistles = 0
    this.eyesShown = false
    this.cutCam = null
    this.timeScale = 1
    if (ci === 0 && !continuing) {
      this.passed.clear()
    }
    for (const f of this.folk) {
      f.state = 'idle'
      f.runS = 0
    }
    this.applyLight(0, true)
  }

  private snapCamera = true

  begin() {
    audio.unlock()
    audio.setBed(this.ch.bed, 3)
    this.mode = 'play'
    this.showCard()
    const ui = useUI.getState()
    ui.set({ screen: 'play', legend: this.ci === 0 })
  }

  /** From the menu. */
  jumpTo(ci: number) {
    this.startChapter(ci, false)
    this.mode = 'play'
    this.snapCamera = true
    audio.setBed(this.ch.bed, 2)
    this.showCard()
    useUI.getState().set({ screen: 'play', paused: false, map: null })
  }

  private showCard() {
    this.cardTimer = 5.2
    useUI.getState().set({ card: this.ch.title })
  }

  private endChapter() {
    const ch = this.ch
    this.save.routes[ch.id] = this.route.slice()
    this.save.passed = [...new Set([...this.save.passed, ...this.passed])]
    this.save.reached = Math.max(this.save.reached, this.ci + 1)
    writeSave(this.save)
    useUI.getState().set({ reached: this.save.reached })
    if (ch.map) {
      this.mode = 'map'
      clearKeys()
      audio.stinger('chapter')
      useUI.getState().set({
        screen: 'map',
        map: { routes: this.routesForMap(), chapter: this.ci, passed: [...this.passed, ...this.save.passed], final: false },
      })
    } else {
      this.nextChapter()
    }
  }

  private routesForMap() {
    const r: Record<string, [number, number][]> = {}
    CHAPTERS.forEach((c, i) => {
      if (i === this.ci) r[c.id] = this.route.slice()
      else if (this.save.routes[c.id]) r[c.id] = this.save.routes[c.id]
    })
    return r
  }

  /** Called by the map screen when dismissed. */
  mapDone() {
    const ui = useUI.getState()
    if (this.mode === 'end') {
      ui.set({ map: null, fin: true, screen: 'end' })
      audio.stinger('title')
      return
    }
    ui.set({ map: null, screen: 'play' })
    this.nextChapter()
  }

  private nextChapter() {
    if (this.ci >= CHAPTERS.length - 1) return
    this.startChapter(this.ci + 1, true)
    this.mode = 'play'
    audio.setBed(this.ch.bed, this.ci === 3 ? 6 : 2.5)
    this.showCard()
  }

  // ------------------------------------------------------------------ light

  private applyLight(p: number, snap = false) {
    const keys = this.ch.lighting
    let a: Light = keys[0]
    let b: Light = keys[keys.length - 1]
    for (let i = 0; i < keys.length - 1; i++) {
      if (p >= keys[i].at && p <= keys[i + 1].at) {
        a = keys[i]
        b = keys[i + 1]
        break
      }
    }
    const t = b.at > a.at ? smoothstep(0, 1, (p - a.at) / (b.at - a.at)) : 0
    const col = (k: keyof Light, out: THREE.Color) => out.set(a[k] as string).lerp(tmpC2.set(b[k] as string), t)
    const az = THREE.MathUtils.degToRad(lerpAngleDeg(a.sun[0], b.sun[0], t))
    const el = THREE.MathUtils.degToRad(lerp(a.sun[1], b.sun[1], t))
    U.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize()
    col('sunColor', U.uSunColor.value).multiplyScalar(lerp(a.sunI, b.sunI, t))
    const ambI = lerp(a.ambI, b.ambI, t)
    col('ambSky', U.uAmbSky.value).multiplyScalar(ambI)
    col('ambGround', U.uAmbGround.value).multiplyScalar(ambI)
    col('fog', U.uFogColor.value)
    col('skyTop', U.uSkyTop.value)
    col('skyHorizon', U.uSkyHorizon.value)
    col('sunColor', tmpC)
    U.uSunGlow.value.copy(U.uFogColor.value).lerp(tmpC, 0.55)
    U.uFogNear.value = lerp(a.fogNear, b.fogNear, t)
    U.uFogFar.value = lerp(a.fogFar, b.fogFar, t)
    U.uStars.value = lerp(a.stars, b.stars, t)
    U.uMoon.value = lerp(a.moon, b.moon, t)
    const lum = U.uSkyTop.value.r * 0.21 + U.uSkyTop.value.g * 0.72 + U.uSkyTop.value.b * 0.07
    this.darkness = smoothstep(0.1, 0.02, lum)
    U.uNight.value = this.darkness
    // the grade follows the chapter's temperature
    const pm = this.post.mat.uniforms
    const grades: Record<string, [number[], number[], number]> = {
      canyon: [[0.012, 0.018, 0.03], [1.02, 1.0, 0.96], 1.04],
      town: [[0.0, 0.012, 0.03], [1.03, 1.01, 0.98], 1.08],
      woods: [[0.03, 0.012, 0.04], [1.04, 0.98, 0.94], 1.06],
      shore: [[0.0, 0.02, 0.05], [0.98, 1.0, 1.06], 0.95],
    }
    const [lift, gain, sat] = grades[this.ch.bed]
    const k = snap ? 1 : 0.05
    pm.uLift.value.lerp(new THREE.Vector3(...lift), k)
    pm.uGain.value.lerp(new THREE.Vector3(...gain), k)
    pm.uSat.value = lerp(pm.uSat.value, sat, k)
  }

  // ------------------------------------------------------------------ frame

  resize(w: number, h: number, dpr: number) {
    this.aspect = w / Math.max(1, h)
    this.camera.aspect = this.aspect
    this.camera.updateProjectionMatrix()
    this.post.setSize(w * dpr, h * dpr)
  }

  update(rawDt: number) {
    const ui = useUI.getState()
    const paused = ui.paused
    if (input.menu) {
      input.menu = false
      if (this.mode === 'play') ui.set({ paused: !paused })
    }
    const dt = Math.min(rawDt, 1 / 20) * (paused ? 0 : this.timeScale)
    this.time += dt
    U.uTime.value = this.time
    this.post.mat.uniforms.uTime.value = this.time

    if (this.mode === 'title') this.updateTitle(dt)
    else if (this.mode === 'play' || this.mode === 'cut' || this.mode === 'end') this.updatePlay(dt)
    else if (this.mode === 'map') {
      // the world holds still under the paper
    }
    this.birds.update(dt)
    this.rings.update(dt)
    this.updateFolk(dt)
    this.updateDisturbances(dt)
    this.updateCamera(dt)
    this.updateSun()
    const mc = tmpC.copy(U.uSunColor.value).lerp(new THREE.Color(1, 1, 1), 0.3)
    this.motes.update(this.time, this.px, this.py, this.pz, mc, this.ch.bed === 'canyon' ? 0.5 : this.ch.bed === 'woods' ? 0.35 * (1 - this.darkness) : this.ch.bed === 'town' ? 0.12 : 0)
    camQuat.copy(this.camera.quaternion)
    audio.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, Math.sin(this.camYaw), Math.cos(this.camYaw))
    if (this.cardTimer > 0) {
      this.cardTimer -= rawDt
      if (this.cardTimer <= 0) ui.set({ card: null })
    }
    if (ui.whistleReady !== this.whistleCool <= 0) ui.set({ whistleReady: this.whistleCool <= 0 })
  }

  private updateTitle(dt: number) {
    // the boy and the dog at the swimming spot, ordinary morning
    this.boy.update(dt, 0, 'light', 0.4, 0.1)
    this.boy.root.position.set(this.px, this.py, this.pz)
    this.boy.root.rotation.y = this.pyaw
    this.dog.update(dt, this.dogCtx())
    this.drainDogEvents()
  }

  private dogCtx(): DogCtx {
    const toDog = new THREE.Vector3(this.dog.x - this.camera.position.x, 0, this.dog.z - this.camera.position.z).normalize()
    const dogFwd = new THREE.Vector3(Math.sin(this.dog.yaw), 0, Math.cos(this.dog.yaw))
    return {
      world: this.world,
      ci: this.ci,
      line: this.line,
      boyX: this.px,
      boyZ: this.pz,
      boyY: this.py,
      boyYaw: this.pyaw,
      boyS: this.boyS,
      boyMoving: this.pspeed > 0.4,
      time: this.time,
      whistles: this.whistles,
      progress: this.progress,
      darkness: this.darkness,
      camFacing: -toDog.dot(dogFwd),
    }
  }

  private updatePlay(dt: number) {
    const ch = this.ch
    const canMove = this.mode === 'play'
    // movement, camera-relative
    let mx = canMove ? input.move.x : 0
    let mz = canMove ? input.move.z : 0
    if (mx || mz) {
      if (useUI.getState().legend) useUI.getState().set({ legend: false })
    }
    const cy = Math.cos(this.camYaw)
    const sy = Math.sin(this.camYaw)
    // forward is the camera's view direction on the ground
    let wx = mx * cy + mz * sy
    let wz = -mx * sy + mz * cy
    const mag = Math.min(1, Math.hypot(mx, mz))
    const surface = this.world.surfaceAt(this.px, this.pz, this.walk)
    const slow = surface === 'water' ? 0.62 : surface === 'wood' ? 0.7 : 1
    const vmax = ch.walkSpeed * slow * mag
    if (mag > 0.01) {
      const l = Math.hypot(wx, wz) || 1
      wx /= l
      wz /= l
    }
    this.pvx = damp(this.pvx, wx * vmax, 9, dt)
    this.pvz = damp(this.pvz, wz * vmax, 9, dt)
    const nx = this.px + this.pvx * dt
    const nz = this.pz + this.pvz * dt
    const [cx, cz] = this.world.constrain(this.px, this.pz, nx, nz, this.walk)
    const moved = Math.hypot(cx - this.px, cz - this.pz)
    this.pspeed = dt > 0 ? damp(this.pspeed, moved / dt, 12, dt) : this.pspeed
    this.px = cx
    this.pz = cz
    if (mag > 0.05) this.pyaw = dampAngle(this.pyaw, Math.atan2(this.pvx, this.pvz), 10, dt)
    const ty = this.world.standY(this.px, this.pz, this.walk)
    this.py = damp(this.py, ty, 16, dt)

    // progress along the dog's route
    const n = this.line.nearest(this.px, this.pz, 30)
    if (n) this.boyS = n.s
    this.bestS = Math.max(this.bestS, this.boyS)
    if (this.walk.length > 1 && this.boyS > 30) this.walk = [this.ci]
    this.progress = clamp(this.bestS / this.line.length, 0, 1)
    this.applyLight(this.progress)
    audio.setProgress(this.progress)

    // route log, one sample per ~2 m, and landmarks passed
    if (Math.hypot(this.px - this.lastLog.x, this.pz - this.lastLog.y) > 2) {
      this.route.push([Math.round(this.px * 10) / 10, Math.round(this.pz * 10) / 10])
      this.lastLog.set(this.px, this.pz)
    }
    for (const lm of ch.landmarks) if (!this.passed.has(lm.id) && Math.hypot(this.px - lm.at[0], this.pz - lm.at[1]) < lm.r) this.passed.add(lm.id)

    // whistle
    this.whistleCool -= dt
    if (input.whistle) {
      input.whistle = false
      if (canMove) this.whistle()
    }
    if (this.pendingAnswer > 0) {
      this.pendingAnswer -= dt
      if (this.pendingAnswer <= 0) this.answer()
    }

    // the boy's body
    const dToDog = Math.hypot(this.dog.x - this.px, this.dog.z - this.pz)
    let lookYaw = 0
    let lookPitch = 0
    if (dToDog < 40) {
      const rel = angleDiff(this.pyaw, Math.atan2(this.dog.x - this.px, this.dog.z - this.pz))
      if (Math.abs(rel) < 1.4) lookYaw = rel * 0.8
      lookPitch = clamp(Math.atan2(this.dog.y - this.py - 0.6, dToDog), -0.5, 0.3)
    }
    const step = this.boy.update(dt, this.pspeed, ch.gait, lookYaw, lookPitch)
    this.boy.root.position.set(this.px, this.py, this.pz)
    this.boy.root.rotation.y = this.pyaw
    if (step) {
      this.lastFootSide *= -1
      const side = this.lastFootSide * 0.1
      if (ch.prints && surface !== 'water' && surface !== 'wood' && surface !== 'stone') {
        this.feet.add(this.px + Math.cos(this.pyaw) * side, this.py, this.pz - Math.sin(this.pyaw) * side, this.pyaw, 20)
      }
      audio.footstep(surface, clamp(this.pspeed / 3.5, 0.3, 1))
    }

    // the dog
    this.dog.update(dt, this.dogCtx())
    this.drainDogEvents()

    // the ending and the collar are staged
    this.updateCut(dt)

    // chapter exit
    if (this.mode === 'play' && ch.exit) {
      const [ex, ez, er] = ch.exit
      if (Math.hypot(this.px - ex, this.pz - ez) < er) this.endChapter()
    }

    // windows light up as he comes home
    if (this.home) {
      const want = this.ci === 3 ? smoothstep(0.55, 0.92, this.progress) : 0
      U.uWindow.value = damp(U.uWindow.value, want, 1.2, dt)
      this.home.halo.uniforms.uAlpha.value = U.uWindow.value * 0.55
    }
    this.stepAudioT -= dt
  }

  private drainDogEvents() {
    const ch = this.ch
    for (const e of this.dog.events) {
      switch (e.type) {
        case 'pawstep': {
          this.lastPawSide *= -1
          const surf = this.world.surfaceAt(e.x, e.z, this.ci)
          if (ch.prints && surf !== 'water' && surf !== 'wood' && surf !== 'stone') {
            const yaw = this.dog.yaw
            const s = this.lastPawSide * 0.09
            this.paws.add(e.x + Math.cos(yaw) * s, e.y, e.z - Math.sin(yaw) * s, yaw, 40)
          }
          if (Math.random() < 0.5) audio.pawstep(e.x, e.y, e.z, surf)
          break
        }
        case 'bolt':
          audio.stinger('bolt')
          break
        case 'collar':
          this.startCut('collar')
          break
        case 'join':
          audio.stinger('eyes')
          break
        case 'home':
          this.startCut('home')
          break
        case 'eyes':
          break
        case 'visit':
          for (const f of this.folk) if (f.def.id === e.npc) (f.state = 'react'), (f.t = 0)
          break
      }
    }
    this.dog.events.length = 0
    // the pair of eyes in the dark: once, when he first sees them
    const nd = this.dog.node?.node
    if (!this.eyesShown && nd?.type === 'eyes' && this.dog.mode === 'wait') {
      const d = Math.hypot(this.dog.x - this.px, this.dog.z - this.pz)
      if (d < 24) {
        this.eyesShown = true
        this.dog.rig.eyeGlow = 1.6
        audio.stinger('eyes')
      }
    }
  }

  private whistle() {
    if (this.whistleCool > 0) return
    this.whistleCool = 3
    this.whistles++
    this.boy.setPose('whistle', 0.9)
    audio.whistle()
    this.rings.emit(this.px, this.py, this.pz, 0.1)
    this.rings.emit(this.px, this.py, this.pz, 0.35)
    const d = Math.hypot(this.dog.x - this.px, this.dog.z - this.pz)
    this.pendingAnswer = this.dog.mode === 'heel' || this.dog.mode === 'companion' ? 0.5 : clamp(0.75 + d / 140, 0.75, 1.5)
    if (useUI.getState().legend) useUI.getState().set({ legend: false })
  }

  private answer() {
    const ch = this.ch
    const c = this.dogCtx()
    // in the stone town, some corners send the bark back from the wrong way
    if (ch.whistle === 'misleading') {
      for (const fs of ch.falseSources ?? []) {
        const [zx, zz, zr] = fs.zone
        if (Math.hypot(this.px - zx, this.pz - zz) < zr) {
          const [ax, ay, az] = fs.answerAt
          audio.bark(ax, ay, az, { echo: true })
          this.birds.lift(ax, ay, az, 'pigeons', 11)
          audio.birds(ax, ay, az, 'pigeons')
          return
        }
      }
    }
    const r = this.dog.whistleAnswer(c)
    const { x, y, z } = this.dog
    if (r === 'lookup') return
    if (r === 'bounce') {
      audio.bark(x, y, z, { double: true })
      return
    }
    audio.bark(x, y, z, { echo: ch.whistle === 'misleading' })
    const kind = ch.bed === 'town' ? 'pigeons' : ch.bed === 'shore' ? 'gulls' : 'small'
    if (this.darkness < 0.55) {
      this.birds.lift(x, y + 2, z, kind, 11, new THREE.Vector3(this.px, 0, this.pz))
      audio.birds(x, y, z, kind)
    }
  }

  // ------------------------------------------------------------------ staged moments

  private startCut(kind: 'collar' | 'home') {
    this.cutKind = kind
    this.cutT = 0
    this.mode = kind === 'home' ? 'end' : 'cut'
    clearKeys()
    if (kind === 'collar') audio.stinger('nearmiss')
    if (kind === 'home') audio.stinger('home')
  }

  private updateCut(dt: number) {
    if (this.cutKind === '') return
    this.cutT += dt / Math.max(this.timeScale, 0.001)
    const t = this.cutT
    if (this.cutKind === 'collar') {
      // the reach, the collar under his fingers, and gone
      this.boy.setPose('reach', 0.2)
      this.pyaw = dampAngle(this.pyaw, Math.atan2(this.dog.x - this.px, this.dog.z - this.pz), 6, dt)
      this.timeScale = t < 1.3 ? 0.35 : damp(this.timeScale, 1, 3, dt)
      if (t > 0.9 && this.dog.mode === 'nearmiss') this.dog.escape()
      const cam = this.ch.cameras?.[0]
      if (cam && t < 2.4) this.cutCam = { pos: new THREE.Vector3(...cam.position), look: new THREE.Vector3(...cam.lookAt), fov: cam.fov ?? 45 }
      else this.cutCam = null
      if (t > 2.6) {
        this.timeScale = 1
        this.cutKind = ''
        this.mode = 'play'
      }
    }
    if (this.cutKind === 'home' && this.home) {
      const h = this.home
      const [dx, dz] = [this.dog.x, this.dog.z]
      this.pyaw = dampAngle(this.pyaw, Math.atan2(dx - this.px, dz - this.pz), 3, dt)
      if (t > 1.2 && t < 6) this.boy.setPose('kneel', 0.3)
      if (t > 1.6 && t < 2) this.dog.rig.play('bow', 1.2)
      const cam = this.ch.cameras?.[0]
      if (cam) this.cutCam = { pos: new THREE.Vector3(...cam.position), look: new THREE.Vector3(...cam.lookAt), fov: cam.fov ?? 42 }
      // someone opens the door
      if (t > 4.2) {
        if (t - dt <= 4.2) audio.door()
        const o = smoothstep(4.2, 6.2, t)
        h.door.rotation.y = -o * 1.7
        ;(h.light.material as THREE.MeshBasicMaterial).opacity = o * 0.55
        h.figure.root.visible = t > 5
        h.figure.update(dt, 0, 0, 0, 0, 0)
      }
      if (t > 3.5 && t < 7) h.gate.rotation.y = damp(h.gate.rotation.y, -0.3, 1, dt)
      const fade = smoothstep(9.5, 12, t)
      this.post.mat.uniforms.uFade.value = fade
      this.post.mat.uniforms.uFadeColor.value.setRGB(0.94, 0.9, 0.81)
      if (t > 12 && useUI.getState().screen !== 'map' && !useUI.getState().fin) {
        this.save.routes[this.ch.id] = this.route.slice()
        this.save.reached = CHAPTERS.length
        writeSave(this.save)
        useUI.getState().set({
          screen: 'map',
          map: { routes: this.routesForMap(), chapter: 3, passed: [...this.passed, ...this.save.passed], final: true },
        })
      }
    }
  }

  // ------------------------------------------------------------------ people and things

  private updateFolk(dt: number) {
    for (const f of this.folk) {
      const d = Math.hypot(f.x - this.px, f.z - this.pz)
      if (d > 90) continue
      const dDog = Math.hypot(f.x - this.dog.x, f.z - this.dog.z)
      f.cool -= dt
      const trig = f.def.trigger
      if (f.state === 'idle' && f.cool <= 0) {
        if ((trig === 'dog' && dDog < 5 && f.def.react !== 'treat') || (typeof trig === 'number' && d < trig)) {
          f.state = 'react'
          f.t = 0
        }
      }
      let walk = 0
      let point = 0
      let bend = 0
      const lookYaw = clamp(angleDiff(f.yaw, Math.atan2(this.px - f.x, this.pz - f.z)), -1.2, 1.2) * (d < 14 ? 1 : 0)
      let pointYaw = 0
      if (f.state === 'react') {
        f.t += dt
        if (f.def.react === 'point' && f.def.point) {
          pointYaw = angleDiff(f.yaw, Math.atan2(f.def.point[0] - f.x, f.def.point[1] - f.z))
          point = smoothstep(0.3, 0.9, f.t) * (1 - smoothstep(4.5, 5.2, f.t))
          if (f.t > 5.4) (f.state = 'idle'), (f.cool = 8)
        } else if (f.def.react === 'run' && f.run) {
          walk = 1
          f.runS += dt * 3.4
          const s = Math.min(f.run.length, f.runS)
          const nx = f.run.x(s)
          const nz = f.run.z(s)
          f.yaw = Math.atan2(nx - f.x, nz - f.z) || f.yaw
          f.x = nx
          f.z = nz
          f.y = this.world.standY(nx, nz, -1)
          if (s >= f.run.length) (f.state = 'done'), (walk = 0)
        } else if (f.def.react === 'treat') {
          bend = smoothstep(0, 0.8, f.t) * (1 - smoothstep(3.6, 4.4, f.t))
          if (f.t > 4.6) f.state = 'done'
        } else if (f.def.react === 'look') {
          if (f.t > 4) (f.state = 'idle'), (f.cool = 3)
        }
      }
      f.rigs.forEach((r, i) => {
        const off = i * 0.9
        r.root.position.set(f.x + Math.cos(f.yaw) * off, f.y, f.z - Math.sin(f.yaw) * off)
        r.root.rotation.y = f.yaw
        r.update(dt, walk * (1 + i * 0.1), point, pointYaw, bend, f.def.react === 'look' || f.state === 'idle' ? lookYaw : 0)
      })
    }
  }

  private updateDisturbances(dt: number) {
    for (const d of this.dist) {
      if (!d.hit && Math.hypot(this.dog.x - d.x, this.dog.z - d.z) < 3.2) {
        d.hit = true
        d.t = 0
        if (d.kind === 'pigeons') {
          this.birds.lift(d.x, d.y, d.z, 'pigeons', 6, new THREE.Vector3(this.dog.x, 0, this.dog.z))
          audio.birds(d.x, d.y, d.z, 'pigeons')
          d.obj.visible = false
        }
      }
      if (!d.hit) continue
      d.t += dt
      const k = smoothstep(0, 0.45, d.t)
      if (d.kind === 'crate' || d.kind === 'basket') {
        d.obj.rotation.set(0, d.dir, 0)
        d.obj.rotateZ(k * 1.5)
      } else if (d.kind === 'broom') {
        d.obj.rotation.set(0, d.dir, k * 1.45)
      } else if (d.kind === 'cats') {
        d.obj.children.forEach((c, i) => {
          c.position.x += Math.cos(d.dir + i) * dt * 5 * (d.t < 1.4 ? 1 : 0)
          c.position.z += Math.sin(d.dir + i) * dt * 5 * (d.t < 1.4 ? 1 : 0)
          c.visible = d.t < 1.5
        })
      }
    }
  }

  // ------------------------------------------------------------------ camera

  private updateCamera(dt: number) {
    const cam = this.camera
    const portrait = this.aspect < 1
    let wantPos: THREE.Vector3
    let wantLook: THREE.Vector3
    let wantFov = portrait ? lerp(66, 52, smoothstep(0.5, 1, this.aspect)) : 50
    if (this.mode === 'title') {
      // behind them, looking up the canyon where the day will go
      const a = Math.sin(this.time * 0.06) * 0.8
      wantPos = portrait ? new THREE.Vector3(70.5 + a * 0.4, 6.4, 45) : new THREE.Vector3(73 + a, 6.2 + Math.sin(this.time * 0.09) * 0.3, 44.5)
      wantPos.y = Math.max(wantPos.y, this.world.ground(wantPos.x, wantPos.z) + 2.2)
      wantLook = portrait ? new THREE.Vector3(66.5, 7.5, 14) : new THREE.Vector3(63 + a * 0.5, 9.5, 4)
      wantFov = portrait ? 58 : 42
    } else {
      // follow along the route: the camera looks where the dog went
      const nearest = this.world.corridor(this.px, this.pz, this.walk)
      let tx = Math.sin(this.pyaw)
      let tz = Math.cos(this.pyaw)
      if (nearest) {
        const [ax, az] = nearest.w.line.tangent(nearest.s, 9)
        // on a branch, face whichever way along it he is heading
        const sign = nearest.w.main ? 1 : Math.sign(ax * this.pvx + az * this.pvz || 1)
        tx = ax * sign
        tz = az * sign
      }
      const pathYaw = Math.atan2(tx, tz)
      const moveYaw = this.pspeed > 0.5 ? Math.atan2(this.pvx, this.pvz) : pathYaw
      const want = pathYaw + clamp(angleDiff(pathYaw, moveYaw), -0.5, 0.5) * 0.4
      this.camYaw = dampAngle(this.camYaw, want, this.snapCamera ? 100 : 1.6, dt)
      const town = this.ch.bed === 'town'
      const dist = town ? 7.2 : 7.8
      const height = town ? 5.6 : 3.8
      const fx = Math.sin(this.camYaw)
      const fz = Math.cos(this.camYaw)
      wantPos = new THREE.Vector3(this.px - fx * dist, this.py + height, this.pz - fz * dist)
      wantLook = new THREE.Vector3(this.px + fx * 3, this.py + 1.1, this.pz + fz * 3)
      // keep the camera out of rock and houses: swing toward the open side
      // first (a cliff path is seen from the valley), and only then rise
      const blockedAt = (yaw: number) => {
        const bx = this.px - Math.sin(yaw) * dist
        const bz = this.pz - Math.cos(yaw) * dist
        const by = Math.max(this.py + height, this.world.ground(bx, bz) + 1.8)
        let b = 0
        for (let i = 1; i <= 4; i++) {
          const t = i / 4
          const sx = lerp(this.px, bx, t)
          const sz = lerp(this.pz, bz, t)
          const gy = this.world.ground(sx, sz)
          const ly = lerp(this.py + 1.2, by, t)
          if (gy > ly - 0.8) b = Math.max(b, gy - ly + 1.6)
          if (town && this.world.walkClearance(sx, sz, 3) > 1.2) b = Math.max(b, 4 * t)
        }
        return b
      }
      let bestYaw = this.camYaw
      let best = blockedAt(this.camYaw)
      if (best > 0.3) {
        for (const k of [1, -1, 2, -2, 3, -3]) {
          const yaw = this.camYaw + k * 0.38
          const b = blockedAt(yaw) + Math.abs(k) * 0.4
          if (b < best) {
            best = b
            bestYaw = yaw
          }
        }
      }
      this.camSwing = dampAngle(this.camSwing, angleDiff(this.camYaw, bestYaw), 1.5, dt)
      const sw = this.camYaw + this.camSwing
      wantPos = new THREE.Vector3(this.px - Math.sin(sw) * dist, this.py + height, this.pz - Math.cos(sw) * dist)
      wantLook = new THREE.Vector3(this.px + Math.sin(sw) * 3, this.py + 1.1, this.pz + Math.cos(sw) * 3)
      const g = this.world.ground(wantPos.x, wantPos.z)
      if (wantPos.y < g + 1.8) wantPos.y = g + 1.8
      this.frameW = damp(this.frameW, blockedAt(sw), 3, dt)
      wantPos.y += this.frameW
      // the dog in frame pulls the composition toward him
      const toDog = new THREE.Vector3(this.dog.x - this.px, 0, this.dog.z - this.pz)
      const dd = toDog.length()
      if (dd < 45 && dd > 1.5) {
        toDog.normalize()
        const ahead = toDog.x * fx + toDog.z * fz
        if (ahead > 0.3) {
          const w = smoothstep(45, 12, dd) * 0.35 * ahead
          wantLook.lerp(new THREE.Vector3(this.dog.x, this.dog.y + 0.6, this.dog.z), w * 0.5)
        }
      }

      // framed moments from the chapter
      for (const c of this.ch.cameras ?? []) {
        const [x, z, r] = c.trigger
        if (Math.hypot(this.px - x, this.pz - z) < r && this.mode === 'play') {
          wantPos = new THREE.Vector3(...c.position)
          wantLook = new THREE.Vector3(...c.lookAt)
          wantFov = (c.fov ?? 45) * (portrait ? 1.35 : 1)
        }
      }
      if (this.cutCam) {
        wantPos = this.cutCam.pos.clone()
        wantLook = this.cutCam.look.clone()
        wantFov = this.cutCam.fov * (portrait ? 1.35 : 1)
      }
    }
    // a framed camera can never sit inside the land
    wantPos.y = Math.max(wantPos.y, this.world.ground(wantPos.x, wantPos.z) + 1.4)
    if (this.snapCamera) {
      this.camPos.copy(wantPos)
      this.camLook.copy(wantLook)
      this.camFov = wantFov
      this.snapCamera = false
    } else {
      const rate = this.mode === 'title' ? 1 : this.cutCam ? 2.2 : 4
      this.camPos.set(damp(this.camPos.x, wantPos.x, rate, dt), damp(this.camPos.y, wantPos.y, rate, dt), damp(this.camPos.z, wantPos.z, rate, dt))
      this.camLook.set(damp(this.camLook.x, wantLook.x, rate * 1.4, dt), damp(this.camLook.y, wantLook.y, rate * 1.4, dt), damp(this.camLook.z, wantLook.z, rate * 1.4, dt))
      this.camFov = damp(this.camFov, wantFov, 2, dt)
    }
    cam.position.copy(this.camPos)
    cam.lookAt(this.camLook)
    // nothing past the fog is drawn; the sky rides with the camera
    const far = Math.max(360, U.uFogFar.value * 1.05)
    if (Math.abs(cam.far - far) > far * 0.04) {
      cam.far = far
      cam.updateProjectionMatrix()
    }
    this.sky.position.copy(cam.position)
    if (Math.abs(cam.fov - this.camFov) > 0.01) {
      cam.fov = this.camFov
      cam.updateProjectionMatrix()
    }
  }

  private updateSun() {
    const d = U.uSunDir.value
    const snap = 84 / (this.quality > 0.7 ? 2048 : 1024)
    const tx = Math.round(this.px / snap) * snap
    const tz = Math.round(this.pz / snap) * snap
    // the shadow box sits a little ahead of the boy, where the camera looks
    const fx = Math.sin(this.camYaw) * 14
    const fz = Math.cos(this.camYaw) * 14
    this.sun.target.position.set(tx + fx, this.py, tz + fz)
    this.sun.position.set(tx + fx + d.x * 150, this.py + Math.max(d.y, 0.08) * 150, tz + fz + d.z * 150)
    this.sun.target.updateMatrixWorld()
  }

  /**
   * Dev harness: walk the boy along the dog's route for `seconds` of game
   * time, without drawing. Returns a log of what the dog did.
   */
  autopilot(seconds: number, dt = 1 / 30, stopAtDog = true) {
    const log: string[] = []
    let lastMode = ''
    for (let t = 0; t < seconds; t += dt) {
      const L = this.line
      // walk toward the dog's route a few meters ahead, but not past a waiting dog
      let s = Math.min(L.length, this.boyS + 5)
      if (stopAtDog && (this.dog.mode === 'wait' || this.dog.mode === 'pause')) s = Math.min(s, this.dog.s + 1)
      const wx0 = L.x(s) - this.px
      const wz0 = L.z(s) - this.pz
      const l = Math.hypot(wx0, wz0) || 1
      const wx = l < 0.8 ? 0 : wx0 / l
      const wz = l < 0.8 ? 0 : wz0 / l
      const cy = Math.cos(this.camYaw)
      const sy = Math.sin(this.camYaw)
      input.move.x = wx * cy - wz * sy
      input.move.z = wx * sy + wz * cy
      this.update(dt)
      const m = `${this.mode}/${this.dog.mode}/${this.dog.ni}`
      if (m !== lastMode) {
        log.push(`${this.time.toFixed(1)}s boyS=${this.boyS.toFixed(0)} dogS=${this.dog.s.toFixed(0)} ${m}`)
        lastMode = m
      }
      if (this.mode === 'map' || this.mode === 'end') break
    }
    input.move.x = 0
    input.move.z = 0
    return log
  }

  /** Dev harness: advance game time without drawing. */
  simulate(seconds: number, dt = 1 / 30) {
    for (let t = 0; t < seconds; t += dt) this.update(dt)
  }

  gl: THREE.WebGLRenderer | null = null
  private restFrames = 0

  render(gl: THREE.WebGLRenderer) {
    this.gl = gl
    // under the paper the world holds still: draw it once, then rest the GPU
    if (this.mode === 'map' || useUI.getState().fin) {
      if (this.restFrames++ > 2) return
    } else this.restFrames = 0
    gl.info.autoReset = false
    gl.info.reset()
    this.post.render(gl, this.scene, this.camera)
  }
}

function lerpAngleDeg(a: number, b: number, t: number) {
  let d = b - a
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return a + d * t
}

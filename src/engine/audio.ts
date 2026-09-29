// Procedural sound for The Long Way Home.
//
// Everything is synthesised at runtime with the Web Audio API: oscillators,
// filtered noise, a little FM, and one convolution reverb whose impulse is
// generated noise. No samples, no files, nothing sourced from anywhere.
//
// The game is fully playable with sound off. Nothing here carries information
// the picture does not; sound adds the half of a day a picture cannot hold.
//
// Shape of the graph:
//
//   beds (ambience + generative music) --\
//   one-shots (steps, barks, birds) -----+--> master --> hp --> comp --> limiter --> soft clip --> out
//   stingers ----------------------------/        ^
//   music / stingers / spatial sends --> reverb --/
//
// Scheduling is a lookahead scheduler on a 100 ms interval against
// ctx.currentTime. Every gain change is a ramp. Finished nodes are
// disconnected by the same tick.

export type Surface = 'dust' | 'gravel' | 'sand' | 'stone' | 'grass' | 'needles' | 'wood' | 'water'
export type Bed = 'canyon' | 'town' | 'woods' | 'shore' | 'title' | 'none'
export type Stinger = 'bolt' | 'nearmiss' | 'reveal' | 'chapter' | 'eyes' | 'home' | 'title'

type Voice = (dest: AudioNode, t: number, midi: number, vel: number, pan?: number) => number
type Tick = (t0: number, t1: number, fading: boolean) => void

interface Graph {
  master: GainNode
  amb: GainNode
  music: GainNode
  sfx: GainNode
  sting: GainNode
  verb: GainNode
  white: AudioBuffer
  pink: AudioBuffer
  brown: AudioBuffer
  piano: PeriodicWave
  pulse: Float32Array<ArrayBuffer>
}

// ---------------------------------------------------------------------------
// Mix. Linear gains. Measured offline; see the level table in the report.
// ---------------------------------------------------------------------------

const MIX = {
  master: 0.72,
  amb: 1,
  music: 0.9,
  sfx: 1,
  sting: 0.95,
  musicSend: 0.34,
  stingSend: 0.42,
  verbReturn: 0.85,
  whistle: 0.2,
  bark: 0.9,
  step: 0.28,
  paw: 0.11,
  flock: 1.3,
}

const TICK_MS = 100
const LOOKAHEAD = 0.3

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let ctx: BaseAudioContext | null = null
let A!: BaseAudioContext
let G!: Graph
let offline = false
let isMuted = false
let hidden = false
let resumePending = false
let runToken = 0
let wantBed: Bed = 'none'
let progress = 0
let appliedProgress = -1
let current: BedRt | null = null
let beds: BedRt[] = []
let trash: { t: number; n: AudioNode[] }[] = []
let lastStep = 0
let stepSide = 1
const ear = { x: 0, y: 0, z: 0, fx: 0, fz: -1 }

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}
function randInt(a: number, b: number): number {
  return Math.floor(rand(a, b + 1 - 1e-9))
}
function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(Math.random() * xs.length)]
}
function chance(p: number): boolean {
  return Math.random() < p
}
function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v))
}
function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k
}
function smooth(e0: number, e1: number, x: number): number {
  const k = clamp((x - e0) / (e1 - e0), 0, 1)
  return k * k * (3 - 2 * k)
}
function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

function gn(v = 0): GainNode {
  const g = A.createGain()
  g.gain.value = v
  return g
}
function bq(type: BiquadFilterType, f: number, q = 0.7071): BiquadFilterNode {
  const b = A.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}
function osc(type: OscillatorType, f: number, t: number): OscillatorNode {
  const o = A.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  return o
}
function stereo(p: number): AudioNode {
  if (typeof A.createStereoPanner === 'function') {
    const s = A.createStereoPanner()
    s.pan.value = clamp(p, -1, 1)
    return s
  }
  return gn(1)
}
/** A looping noise source starting at a random point, so no two layers line up. */
function noise(buf: AudioBuffer, t: number, dur?: number, rate = 1): AudioBufferSourceNode {
  const s = A.createBufferSource()
  s.buffer = buf
  s.loop = true
  s.playbackRate.value = rate
  s.start(t, Math.random() * buf.duration * 0.95)
  if (dur !== undefined) s.stop(t + dur)
  return s
}
function chain(...nodes: AudioNode[]): void {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1])
}
/** Disconnect these nodes once `end` has passed. */
function bin(end: number, ...n: AudioNode[]): void {
  trash.push({ t: end, n })
}
function holdParam(p: AudioParam, at: number): void {
  if (typeof p.cancelAndHoldAtTime === 'function') {
    p.cancelAndHoldAtTime(at)
  } else {
    const v = p.value
    p.cancelScheduledValues(at)
    p.setValueAtTime(v, at)
  }
}
function rampParam(p: AudioParam, v: number, dur: number): void {
  const t = A.currentTime
  holdParam(p, t)
  p.linearRampToValueAtTime(v, t + Math.max(0.02, dur))
}
/** Percussive envelope: linear attack, exponential tail. Returns the time it is inaudible (-60 dB). */
function perc(p: AudioParam, t: number, peak: number, atk: number, tau: number): number {
  p.setValueAtTime(0, t)
  p.linearRampToValueAtTime(peak, t + atk)
  p.setTargetAtTime(0, t + atk, tau)
  return t + atk + tau * 7
}
/** Swell envelope: linear rise, hold, exponential release. Returns the end time. */
function swell(p: AudioParam, t: number, peak: number, atk: number, hold: number, rel: number): number {
  p.setValueAtTime(0, t)
  p.linearRampToValueAtTime(peak, t + atk)
  p.setValueAtTime(peak, t + atk + hold)
  p.setTargetAtTime(0, t + atk + hold, rel / 5)
  return t + atk + hold + rel * 1.4
}

// ---------------------------------------------------------------------------
// Generated buffers: noise, the reverb impulse, curves
// ---------------------------------------------------------------------------

function makeNoise(kind: 'white' | 'pink' | 'brown', seconds: number): AudioBuffer {
  const sr = A.sampleRate
  const len = Math.floor(sr * seconds)
  const fade = Math.floor(sr * 0.05)
  const buf = A.createBuffer(2, len, sr)
  const tmp = new Float32Array(len + fade)
  for (let ch = 0; ch < 2; ch++) {
    let b0 = 0
    let b1 = 0
    let b2 = 0
    let last = 0
    let x1 = 0
    let y1 = 0
    for (let i = 0; i < tmp.length; i++) {
      const w = Math.random() * 2 - 1
      let v = w
      if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046
        b1 = 0.963 * b1 + w * 0.2965164
        b2 = 0.57 * b2 + w * 1.0526913
        v = b0 + b1 + b2 + w * 0.1848
      } else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02
        // dc blocker so the loop point never steps
        y1 = last - x1 + 0.9995 * y1
        x1 = last
        v = y1
      }
      tmp[i] = v
    }
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = tmp[i]
    // crossfade the tail into the head: the loop is seamless
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      d[i] = tmp[i] * k + tmp[len + i] * (1 - k)
    }
    let e = 0
    for (let i = 0; i < len; i++) e += d[i] * d[i]
    const s = 0.25 / Math.sqrt(e / len || 1)
    for (let i = 0; i < len; i++) d[i] *= s
  }
  return buf
}

/** A warm hall: decaying noise that darkens as it dies, unit energy per channel. */
function makeImpulse(seconds: number): AudioBuffer {
  const sr = A.sampleRate
  const len = Math.floor(sr * seconds)
  const pre = Math.floor(sr * 0.014)
  const buf = A.createBuffer(2, len, sr)
  const rate = Math.log(1000) / seconds
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr
      const a = 0.2 + 0.68 * Math.min(1, t / seconds)
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a)
      const fadeIn = Math.min(1, t / 0.02)
      d[i] = lp * Math.exp(-t * rate) * fadeIn
    }
    // a few sparse early reflections
    for (let k = 0; k < 6; k++) {
      const i = pre + Math.floor(sr * rand(0.004, 0.07))
      d[i] += (Math.random() < 0.5 ? -1 : 1) * rand(0.2, 0.5) * 0.02
    }
    let e = 0
    for (let i = 0; i < len; i++) e += d[i] * d[i]
    const s = 1 / Math.sqrt(e || 1)
    for (let i = 0; i < len; i++) d[i] *= s
  }
  return buf
}

/** Linear to 0.7, then a tanh knee that can never exceed 0.93. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 8193
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    const ax = Math.abs(x)
    const y = ax <= 0.7 ? ax : 0.7 + 0.3 * Math.tanh((ax - 0.7) / 0.3)
    c[i] = Math.sign(x) * y
  }
  return c
}

function pulseCurve(): Float32Array<ArrayBuffer> {
  const n = 257
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    c[i] = x > 0 ? x * x : 0
  }
  return c
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

function build(c: BaseAudioContext): void {
  ctx = c
  A = c
  offline = typeof (c as OfflineAudioContext).startRendering === 'function'

  const master = gn(0)
  const hp = bq('highpass', 24, 0.7)
  const comp = A.createDynamicsCompressor()
  comp.threshold.value = -20
  comp.knee.value = 14
  comp.ratio.value = 2
  comp.attack.value = 0.02
  comp.release.value = 0.4
  const lim = A.createDynamicsCompressor()
  lim.threshold.value = -5
  lim.knee.value = 2
  lim.ratio.value = 20
  lim.attack.value = 0.002
  lim.release.value = 0.12
  const clip = A.createWaveShaper()
  clip.curve = softClipCurve()
  clip.oversample = 'none'
  const trim = gn(0.95)
  chain(master, hp, comp, lim, clip, trim, A.destination)

  const amb = gn(MIX.amb)
  const music = gn(MIX.music)
  const sfx = gn(MIX.sfx)
  const sting = gn(MIX.sting)
  amb.connect(master)
  music.connect(master)
  sfx.connect(master)
  sting.connect(master)

  const verb = gn(1)
  const conv = A.createConvolver()
  conv.normalize = false
  conv.buffer = makeImpulse(2.6)
  const vhp = bq('highpass', 150, 0.6)
  const vret = gn(MIX.verbReturn)
  chain(verb, conv, vhp, vret, master)
  const ms = gn(MIX.musicSend)
  chain(music, ms, verb)
  const ss = gn(MIX.stingSend)
  chain(sting, ss, verb)

  // A felt-piano spectrum: every harmonic, falling away quickly.
  const imag = new Float32Array([0, 1, 0.5, 0.26, 0.14, 0.085, 0.05, 0.03, 0.018, 0.01])
  const real = new Float32Array(imag.length)
  const piano = A.createPeriodicWave(real, imag)

  G = {
    master,
    amb,
    music,
    sfx,
    sting,
    verb,
    white: makeNoise('white', 4),
    pink: makeNoise('pink', 7),
    brown: makeNoise('brown', 6),
    piano,
    pulse: pulseCurve(),
  }
  applyListener()
}

// ---------------------------------------------------------------------------
// Running, muting, visibility
// ---------------------------------------------------------------------------

function isLive(): boolean {
  if (!ctx || isMuted || hidden) return false
  if (offline) return true
  const st = (ctx as AudioContext).state
  return st === 'running' || resumePending
}

function applyRun(): void {
  if (!ctx) return
  const t = A.currentTime
  const want = !isMuted && !hidden
  holdParam(G.master.gain, t)
  if (offline) {
    G.master.gain.setTargetAtTime(want ? MIX.master : 0, t, want ? 0.25 : 0.05)
    return
  }
  const ac = ctx as AudioContext
  const tok = ++runToken
  if (want) {
    G.master.gain.setTargetAtTime(MIX.master, t, 0.3)
    if (ac.state !== 'running') {
      resumePending = true
      ac.resume().then(
        () => {
          resumePending = false
        },
        () => {
          resumePending = false
        },
      )
    }
  } else {
    G.master.gain.setTargetAtTime(0, t, 0.05)
    // after the fade, stop the clock: no CPU, no battery
    setTimeout(() => {
      if (tok !== runToken || !ctx || (!isMuted && !hidden)) return
      ac.suspend().catch(() => undefined)
    }, 450)
  }
}

function onVisibility(): void {
  hidden = document.hidden
  applyRun()
}

function kickIOS(): void {
  // Older iOS only fully unlocks once a buffer has played inside the gesture.
  try {
    const b = A.createBuffer(1, 1, A.sampleRate)
    const s = A.createBufferSource()
    s.buffer = b
    s.connect(A.destination)
    s.start(0)
    s.onended = () => s.disconnect()
  } catch {
    /* nothing to do */
  }
}

function applyListener(): void {
  if (!ctx) return
  const L = A.listener
  const l = Math.hypot(ear.fx, ear.fz)
  const fx = l > 1e-6 ? ear.fx / l : 0
  const fz = l > 1e-6 ? ear.fz / l : -1
  if (L.positionX) {
    L.positionX.value = ear.x
    L.positionY.value = ear.y
    L.positionZ.value = ear.z
    L.forwardX.value = fx
    L.forwardY.value = 0
    L.forwardZ.value = fz
    L.upX.value = 0
    L.upY.value = 1
    L.upZ.value = 0
  } else {
    L.setPosition(ear.x, ear.y, ear.z)
    L.setOrientation(fx, 0, fz, 0, 1, 0)
  }
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

function tick(): void {
  if (!ctx) return
  const t0 = A.currentTime
  const t1 = t0 + LOOKAHEAD

  if (Math.abs(progress - appliedProgress) > 0.002) {
    appliedProgress = progress
    for (const b of beds) b.onProgress?.(progress, t0)
  }
  for (const b of beds) for (const f of b.ticks) f(t0, t1, b.fading)

  if (beds.some((b) => b.disposeAt <= t0)) {
    beds = beds.filter((b) => {
      if (b.disposeAt > t0) return true
      b.dispose()
      return false
    })
  }
  if (trash.length) {
    const keep: typeof trash = []
    for (const e of trash) {
      if (e.t + 0.1 < t0) {
        for (const n of e.n) {
          try {
            n.disconnect()
          } catch {
            /* already gone */
          }
        }
      } else keep.push(e)
    }
    trash = keep
  }
}

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

function pitchPan(m: number): number {
  return clamp((m - 64) / 34, -0.35, 0.35)
}

/** Felt piano: a hammer of soft noise, a spectrum that closes quickly, two strings beating. */
const felt: Voice = (dest, t, midi, vel, p = pitchPan(midi)) => {
  const f = mtof(midi)
  const tail = f < 140 ? 3.2 : f < 420 ? 2.4 : 1.7
  const o1 = osc('sine', f, t)
  o1.setPeriodicWave(G.piano)
  const o2 = osc('sine', f, t)
  o2.setPeriodicWave(G.piano)
  o2.detune.value = rand(2.5, 5)
  const m2 = gn(0.55)
  const lp = bq('lowpass', Math.min(7000, f * 7 + 700), 0.35)
  lp.frequency.setTargetAtTime(Math.min(2800, f * 2.2 + 260), t + 0.004, 0.2)
  const g = gn(0)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vel, t + 0.005)
  g.gain.setTargetAtTime(vel * 0.42, t + 0.005, 0.09)
  g.gain.setTargetAtTime(0, t + 0.26, tail)
  const end = t + 0.26 + tail * 6.5
  const pn = stereo(p)
  o1.connect(lp)
  chain(o2, m2, lp)
  chain(lp, g, pn, dest)
  const n = noise(G.pink, t, 0.08)
  const nl = bq('lowpass', Math.min(2200, f * 3 + 300), 0.5)
  const ng = gn(0)
  perc(ng.gain, t, vel * 0.16, 0.002, 0.012)
  chain(n, nl, ng, pn)
  o1.start(t)
  o2.start(t)
  o1.stop(end)
  o2.stop(end)
  bin(end, o1, o2, m2, lp, g, pn, n, nl, ng)
  return end
}

/** Kalimba: FM pluck, the tine's inharmonic click, a round tail. */
const kalimba: Voice = (dest, t, midi, vel, p = pitchPan(midi)) => {
  const f = mtof(midi)
  const car = osc('sine', f, t)
  const mod = osc('sine', f, t)
  const mg = gn(0)
  mg.gain.setValueAtTime(f * 1.4, t)
  mg.gain.setTargetAtTime(f * 0.06, t, 0.035)
  chain(mod, mg)
  mg.connect(car.frequency)
  const g = gn(0)
  const end = perc(g.gain, t, vel, 0.003, f > 800 ? 0.32 : 0.5)
  const lp = bq('lowpass', 5200, 0.5)
  const pn = stereo(p)
  chain(car, g, lp, pn, dest)
  const nodes: AudioNode[] = [car, mod, mg, g, lp, pn]
  const ft = f * 5.95
  if (ft < 14000) {
    const tine = osc('sine', ft, t)
    const tg = gn(0)
    perc(tg.gain, t, vel * 0.09, 0.001, 0.028)
    chain(tine, tg, lp)
    tine.start(t)
    tine.stop(t + 0.3)
    nodes.push(tine, tg)
  }
  car.start(t)
  mod.start(t)
  car.stop(end)
  mod.stop(end)
  bin(end, ...nodes)
  return end
}

/** Soft marimba: fundamental, the bar's 4x mode, a whisper of the 10x. */
const marimba: Voice = (dest, t, midi, vel, p = pitchPan(midi)) => {
  const f = mtof(midi)
  const pn = stereo(p)
  pn.connect(dest)
  const parts: [number, number, number][] = [
    [1, 1, f < 300 ? 0.45 : 0.3],
    [3.99, 0.2, 0.035],
    [9.9, 0.045, 0.012],
  ]
  const nodes: AudioNode[] = [pn]
  let end = t
  for (const [r, a, tau] of parts) {
    if (f * r > 13000) continue
    const o = osc('sine', f * r, t)
    const g = gn(0)
    const e = perc(g.gain, t, vel * a, 0.002, tau)
    chain(o, g, pn)
    o.start(t)
    o.stop(e)
    nodes.push(o, g)
    end = Math.max(end, e)
  }
  bin(end, ...nodes)
  return end
}

/** Additive bell. partials: [ratio, amp, decay tau]. */
function bell(dest: AudioNode, t: number, f: number, vel: number, parts: [number, number, number][], lpHz: number): number {
  const lp = bq('lowpass', lpHz, 0.5)
  lp.connect(dest)
  const nodes: AudioNode[] = [lp]
  let end = t
  for (const [r, a, tau] of parts) {
    if (f * r > 12000) continue
    const o = osc('sine', f * r, t)
    o.detune.value = rand(-3, 3)
    const g = gn(0)
    const e = perc(g.gain, t, vel * a, 0.004, tau)
    chain(o, g, lp)
    o.start(t)
    o.stop(e)
    nodes.push(o, g)
    end = Math.max(end, e)
  }
  bin(end, ...nodes)
  return end
}

interface PadOpts {
  cut?: number
  cutTo?: number
  spread?: number
  air?: number
  trem?: number
}

/** A warm pad chord: saw + triangle per tone, detuned, through a soft lowpass. */
function pad(dest: AudioNode, t: number, midis: number[], level: number, atk: number, hold: number, rel: number, o: PadOpts = {}): number {
  const cut = o.cut ?? 900
  const lp = bq('lowpass', cut, 0.6)
  if (o.cutTo !== undefined) {
    lp.frequency.setValueAtTime(cut, t)
    lp.frequency.linearRampToValueAtTime(o.cutTo, t + atk + hold * 0.5)
  }
  const env = gn(0)
  const end = swell(env.gain, t, level, atk, hold, rel)
  chain(lp, env)
  const nodes: AudioNode[] = [lp, env]
  let tail: AudioNode = env
  if (o.trem) {
    const tr = gn(0.82)
    const lfo = osc('sine', o.trem, t)
    const lg = gn(0.18)
    chain(lfo, lg)
    lg.connect(tr.gain)
    env.connect(tr)
    lfo.start(t)
    lfo.stop(end)
    nodes.push(tr, lfo, lg)
    tail = tr
  }
  tail.connect(dest)
  // a slow breath in the filter
  const fl = osc('sine', rand(0.05, 0.11), t)
  const fg = gn(cut * 0.18)
  chain(fl, fg)
  fg.connect(lp.frequency)
  fl.start(t)
  fl.stop(end)
  nodes.push(fl, fg)
  const n = midis.length
  const per = 1 / Math.sqrt(n)
  const spread = o.spread ?? 0.5
  midis.forEach((m, i) => {
    const f = mtof(m)
    const side = (i % 2 === 0 ? -1 : 1) * (n > 1 ? i / (n - 1) : 0)
    const pn = stereo(side * spread)
    const a = osc('sawtooth', f, t)
    a.detune.value = -6 + rand(-2, 2)
    const b = osc('triangle', f, t)
    b.detune.value = 6 + rand(-2, 2)
    const va = gn(per * 0.45)
    const vb = gn(per * 0.85)
    chain(a, va, pn)
    chain(b, vb, pn)
    pn.connect(lp)
    a.start(t)
    b.start(t)
    a.stop(end)
    b.stop(end)
    nodes.push(pn, a, b, va, vb)
  })
  if (o.air) {
    const s = noise(G.pink, t, end - t)
    const bp = bq('bandpass', 2600, 0.6)
    const ag = gn(o.air)
    chain(s, bp, ag, env)
    nodes.push(s, bp, ag)
  }
  bin(end, ...nodes)
  return end
}

// ---------------------------------------------------------------------------
// Beds
// ---------------------------------------------------------------------------

class BedRt {
  readonly amb: GainNode
  readonly wet: GainNode
  readonly mus: GainNode
  readonly nodes: AudioNode[] = []
  readonly sources: AudioScheduledSourceNode[] = []
  readonly ticks: Tick[] = []
  onProgress: ((p: number, t: number) => void) | null = null
  fading = false
  disposeAt = Infinity
  private readonly levels: [GainNode, number][]

  constructor(readonly id: Bed) {
    this.amb = gn(0)
    this.wet = gn(0)
    this.mus = gn(0)
    this.amb.connect(G.amb)
    this.wet.connect(G.verb)
    this.mus.connect(G.music)
    this.nodes.push(this.amb, this.wet, this.mus)
    this.levels = [
      [this.amb, 1],
      [this.wet, 1],
      [this.mus, 1],
    ]
  }

  keep(...n: AudioNode[]): void {
    this.nodes.push(...n)
  }

  run(...s: AudioScheduledSourceNode[]): void {
    const t = A.currentTime
    for (const x of s) {
      if (!(x instanceof AudioBufferSourceNode)) x.start(t)
      this.sources.push(x)
    }
  }

  /** A continuous noise layer through a filter chain into `dest`. Returns its level gain. */
  layer(buf: AudioBuffer, filters: BiquadFilterNode[], level: number, dest: AudioNode = this.amb, rate = 1): GainNode {
    const s = noise(buf, A.currentTime, undefined, rate)
    const g = gn(level)
    chain(s, ...filters, g, dest)
    this.sources.push(s)
    this.keep(...filters, g)
    return g
  }

  /** Drift a parameter between lo and hi, a new target every gapLo..gapHi seconds. */
  wander(param: AudioParam, lo: number, hi: number, gapLo: number, gapHi: number): void {
    param.value = (lo + hi) / 2
    let next = -1
    this.ticks.push((t0, t1) => {
      if (next < 0) next = t0
      while (next < t1) {
        const at = Math.max(next, t0)
        const gap = rand(gapLo, gapHi)
        param.setTargetAtTime(rand(lo, hi), at, gap / 3)
        next = at + gap
      }
    })
  }

  /** Call fn(t) at random intervals. Events stop when the bed is fading. */
  every(lo: number, hi: number, fn: (t: number) => void, first?: number): void {
    let next = -1
    this.ticks.push((t0, t1, fading) => {
      if (next < 0) next = t0 + (first ?? rand(lo, hi) * 0.5)
      while (next < t1) {
        if (!fading) fn(Math.max(next, t0))
        next = Math.max(next, t0) + rand(lo, hi)
      }
    })
  }

  fadeIn(dur: number): void {
    for (const [g, v] of this.levels) rampParam(g.gain, v, dur)
  }

  fadeOut(dur: number): void {
    this.fading = true
    for (const [g] of this.levels) rampParam(g.gain, 0, dur)
    this.disposeAt = A.currentTime + dur + 0.6
  }

  dispose(): void {
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {
        /* never started or already stopped */
      }
      try {
        s.disconnect()
      } catch {
        /* gone */
      }
    }
    for (const n of this.nodes) {
      try {
        n.disconnect()
      } catch {
        /* gone */
      }
    }
    this.sources.length = 0
    this.nodes.length = 0
    this.ticks.length = 0
  }
}

// --- generative music -------------------------------------------------------

interface MelodyCfg {
  step: number
  scale: number[]
  anchors: number[]
  voices: Voice[]
  vel: number
  density: () => number
  shift?: () => number
  len: [number, number]
  rest: [number, number]
  dyad?: number
  start?: number
  dest?: AudioNode
}

interface Note {
  m: number | null
  s: number
  v: number
  voice: Voice
}

/** Short phrases from a random walk on the scale, remembered and sometimes repeated, then space. */
function melody(b: BedRt, c: MelodyCfg): void {
  const q: Note[] = []
  let last: number[] | null = null
  let next = -1
  const nearestAnchor = (ix: number): number => {
    let best = c.anchors[0]
    for (const a of c.anchors) if (Math.abs(a - ix) < Math.abs(best - ix)) best = a
    return best
  }
  const build = (): void => {
    const d = clamp(c.density(), 0.04, 1)
    const shift = c.shift ? c.shift() : 0
    let idx: number[]
    if (last && chance(0.42)) {
      idx = last.slice()
      if (chance(0.5)) {
        const k = idx.length - 1
        idx[k] = nearestAnchor(clamp(idx[k] + pick([-2, -1, 1, 2]), 0, c.scale.length - 1))
      }
    } else {
      const n = d < 0.3 ? randInt(1, 2) : randInt(c.len[0], c.len[1])
      const mids = c.anchors.filter((a) => a > 0 && a < c.scale.length - 2)
      let ix = pick(mids.length ? mids : c.anchors)
      idx = [ix]
      for (let k = 1; k < n; k++) {
        ix = clamp(ix + pick([-2, -1, -1, -1, 1, 1, 1, 2, 0, 3, -3]), 0, c.scale.length - 1)
        idx.push(ix)
      }
      idx[n - 1] = nearestAnchor(idx[n - 1])
    }
    last = idx
    const voice = pick(c.voices)
    idx.forEach((ix, k) => {
      const lastNote = k === idx.length - 1
      q.push({
        m: k === 0 || chance(0.9) ? c.scale[ix] + shift : null,
        s: lastNote ? randInt(2, 4) : pick([1, 1, 2, 2, 2, 3]),
        v: c.vel * rand(0.72, 1.02) * (k === 0 ? 1.08 : 1) * (lastNote ? 0.9 : 1),
        voice,
      })
    })
    q.push({ m: null, s: Math.round(randInt(c.rest[0], c.rest[1]) / Math.sqrt(d)), v: 0, voice })
  }
  b.ticks.push((t0, t1, fading) => {
    if (next < 0) next = t0 + (c.start ?? 1)
    while (next < t1) {
      if (!q.length) build()
      const it = q.shift() as Note
      if (it.m !== null && !fading) {
        const tt = Math.max(t0, next) + rand(0, 0.014)
        const dest = c.dest ?? b.mus
        it.voice(dest, tt, it.m, it.v)
        if (c.dyad && chance(c.dyad)) {
          const lower = c.scale.indexOf(it.m - (c.shift ? c.shift() : 0))
          if (lower >= 2) it.voice(dest, tt + rand(0.005, 0.03), it.m - (c.scale[lower] - c.scale[lower - 2]), it.v * 0.6)
        }
      }
      next = Math.max(next, t0 - 0.05) + it.s * c.step
    }
  })
}

interface HarmonyCfg {
  chords: number[][]
  bar: number
  level: number
  atk: number
  cut: number
  air?: number
  spread?: number
  bass?: { voice: Voice; vel: number; prob: number }
  dest?: AudioNode
  /** When this returns false the chord is skipped (its bus is silent anyway). */
  gate?: () => boolean
}

/** Slow pad chords, overlapping so each change is a crossfade. */
function harmony(b: BedRt, c: HarmonyCfg): void {
  let next = -1
  let i = 0
  b.ticks.push((t0, t1, fading) => {
    if (next < 0) next = t0 + 0.05
    while (next < t1) {
      const at = Math.max(next, t0)
      if (!fading && (!c.gate || c.gate())) {
        const chord = c.chords[i % c.chords.length]
        const dest = c.dest ?? b.mus
        pad(dest, at, chord, c.level, c.atk, Math.max(0.5, c.bar - c.atk * 0.5), c.atk * 1.6, {
          cut: c.cut,
          air: c.air,
          spread: c.spread,
        })
        if (c.bass && chance(c.bass.prob)) c.bass.voice(dest, at + 0.02, chord[0], c.bass.vel, 0)
      }
      i++
      next = at + c.bar
    }
  })
}

// --- nature -----------------------------------------------------------------

interface Syl {
  d: number
  f0: number
  f1: number
  f2: number
  tr: number
  td: number
  gap: number
  a: number
}
interface Species {
  syl: Syl[]
  pan: number
  lp: number
  lvl: number
}

/** A songbird: a phrase template that stays itself from call to call. */
function makeSpecies(style: 'finch' | 'thrush'): Species {
  const finch = style === 'finch'
  const base = finch ? rand(3000, 4600) : rand(1700, 2900)
  const n = finch ? randInt(3, 7) : randInt(2, 5)
  const syl: Syl[] = []
  let prev: Syl | null = null
  for (let i = 0; i < n; i++) {
    if (prev && chance(finch ? 0.5 : 0.25)) {
      syl.push({ ...prev })
      continue
    }
    const k = Math.random()
    const d = finch ? rand(0.025, 0.085) : rand(0.08, 0.22)
    const f0 = base * rand(0.82, 1.22)
    let f1 = f0
    let f2 = f0
    let tr = 0
    let td = 0
    if (k < 0.35) {
      f1 = f0 * rand(1.1, 1.4)
      f2 = f1 * rand(1, 1.08)
    } else if (k < 0.65) {
      f1 = f0 * rand(0.85, 1)
      f2 = f0 * rand(0.6, 0.8)
    } else if (k < 0.85) {
      f1 = f0 * rand(1.12, 1.32)
      f2 = f0 * rand(0.85, 1)
    } else {
      f2 = f0 * rand(0.9, 1.1)
      tr = rand(22, 42)
      td = f0 * rand(0.04, 0.09)
    }
    const s: Syl = { d, f0, f1, f2, tr, td, gap: finch ? rand(0.03, 0.09) : rand(0.06, 0.16), a: rand(0.6, 1) }
    syl.push(s)
    prev = s
  }
  return { syl, pan: rand(-0.8, 0.8), lp: rand(5500, 9000), lvl: rand(0.6, 1) }
}

function sing(dest: AudioNode, wet: AudioNode, sp: Species, t: number, level: number): void {
  const k = rand(0.97, 1.03)
  const car = osc('sine', sp.syl[0].f0 * k, t)
  const lfo = osc('sine', 30, t)
  const lg = gn(0)
  chain(lfo, lg)
  lg.connect(car.frequency)
  const amp = gn(0)
  const lp = bq('lowpass', sp.lp, 0.5)
  const pn = stereo(sp.pan + rand(-0.1, 0.1))
  const send = gn(0.3)
  chain(car, amp, lp, pn, dest)
  chain(pn, send, wet)
  const count = chance(0.25) ? Math.max(1, sp.syl.length - randInt(1, 2)) : sp.syl.length
  let s = t
  for (let i = 0; i < count; i++) {
    const y = sp.syl[i]
    car.frequency.setValueAtTime(y.f0 * k, s)
    car.frequency.exponentialRampToValueAtTime(y.f1 * k, s + y.d * 0.5)
    car.frequency.exponentialRampToValueAtTime(y.f2 * k, s + y.d)
    lfo.frequency.setValueAtTime(y.tr || 30, s)
    lg.gain.setValueAtTime(y.td * k, s)
    const pk = level * sp.lvl * y.a
    amp.gain.setValueAtTime(0, s)
    amp.gain.linearRampToValueAtTime(pk, s + Math.min(0.012, y.d * 0.3))
    amp.gain.linearRampToValueAtTime(pk * 0.6, s + y.d * 0.8)
    amp.gain.linearRampToValueAtTime(0, s + y.d)
    s += y.d + y.gap
  }
  const end = s + 0.05
  car.start(t)
  lfo.start(t)
  car.stop(end)
  lfo.stop(end)
  bin(end, car, lfo, lg, amp, lp, pn, send)
}

/** A field of crickets: each one a pure tone, pulsed, gated into regular chirps. */
function crickets(b: BedRt, n: number, dest: AudioNode): void {
  const t = A.currentTime
  for (let i = 0; i < n; i++) {
    const o = osc('sine', rand(4000, 4800), t)
    const lfo = osc('sine', rand(24, 34), t)
    const sh = A.createWaveShaper()
    sh.curve = G.pulse
    const am = gn(0)
    const gate = gn(0)
    const lv = gn(rand(0.45, 1))
    const pn = stereo(rand(-0.85, 0.85))
    chain(lfo, sh)
    sh.connect(am.gain)
    chain(o, am, gate, lv, pn, dest)
    b.run(o, lfo)
    b.keep(sh, am, gate, lv, pn)
    const period = rand(0.5, 1.1)
    const len = rand(0.08, 0.15)
    let next = -1
    b.ticks.push((t0, t1) => {
      if (next < 0) next = t0 + rand(0, period)
      while (next < t1) {
        const s = Math.max(next, t0)
        gate.gain.setValueAtTime(0, s)
        gate.gain.linearRampToValueAtTime(1, s + 0.012)
        gate.gain.setValueAtTime(1, s + len)
        gate.gain.linearRampToValueAtTime(0, s + len + 0.015)
        next = s + period * rand(0.97, 1.03)
        if (chance(0.035)) next += rand(2, 6)
      }
    })
  }
}

function river(b: BedRt, k: number): void {
  const body = b.layer(G.pink, [bq('bandpass', 480, 0.6)], 0.4 * k)
  b.wander(body.gain, 0.33 * k, 0.46 * k, 2, 5)
  const c1 = bq('bandpass', 1100, 2.2)
  const g1 = b.layer(G.pink, [c1], 0.3 * k)
  b.wander(c1.frequency, 750, 1700, 0.12, 0.45)
  b.wander(g1.gain, 0.12 * k, 0.4 * k, 0.1, 0.4)
  const c2 = bq('bandpass', 2000, 3)
  const g2 = b.layer(G.pink, [c2], 0.2 * k)
  b.wander(c2.frequency, 1400, 2700, 0.08, 0.3)
  b.wander(g2.gain, 0.05 * k, 0.28 * k, 0.08, 0.3)
  b.layer(G.white, [bq('highpass', 3500, 0.5), bq('lowpass', 9000, 0.5)], 0.035 * k)
  b.layer(G.brown, [bq('lowpass', 170, 0.6), bq('highpass', 40, 0.7)], 0.1 * k)
}

function coo(dest: AudioNode, wet: AudioNode, t: number, level: number): void {
  const pn = stereo(rand(-0.75, 0.75))
  const lp = bq('lowpass', 850, 0.7)
  const o = osc('triangle', 320, t)
  const fl = osc('sine', rand(14, 20), t)
  const fg = gn(0.18)
  const trem = gn(0.82)
  chain(fl, fg)
  fg.connect(trem.gain)
  const g = gn(0)
  const send = gn(0.25)
  chain(o, g, trem, lp, pn, dest)
  chain(pn, send, wet)
  const k = rand(0.92, 1.08)
  const shape: [number, number, number, number, number][] = [
    [0, 0.18, 300, 335, 0.6],
    [0.3, 0.46, 335, 390, 1],
    [0.86, 0.3, 350, 290, 0.7],
  ]
  for (const [off, d, fa, fb, a] of shape) {
    const s = t + off
    o.frequency.setValueAtTime(fa * k, s)
    o.frequency.exponentialRampToValueAtTime(fb * k, s + d)
    g.gain.setValueAtTime(0, s)
    g.gain.linearRampToValueAtTime(level * a, s + d * 0.3)
    g.gain.linearRampToValueAtTime(0, s + d)
  }
  const end = t + 1.25
  o.start(t)
  fl.start(t)
  o.stop(end)
  fl.stop(end)
  bin(end, o, fl, fg, trem, g, lp, pn, send)
}

function owl(dest: AudioNode, wet: AudioNode, t: number, level: number): void {
  const pn = stereo(pick([-1, 1]) * rand(0.4, 0.85))
  const lp = bq('lowpass', 700, 0.7)
  const o = osc('triangle', 380, t)
  const g = gn(0)
  const send = gn(0.6)
  chain(o, g, lp, pn, dest)
  chain(pn, send, wet)
  const k = rand(0.94, 1.04)
  const hoots: [number, number, number][] = [
    [0, 0.5, 1],
    [1.05, 0.22, 0.7],
    [1.35, 0.55, 0.85],
  ]
  for (const [off, d, a] of hoots) {
    const s = t + off
    o.frequency.setValueAtTime(390 * k, s)
    o.frequency.linearRampToValueAtTime(405 * k, s + d * 0.25)
    o.frequency.exponentialRampToValueAtTime(365 * k, s + d)
    g.gain.setValueAtTime(0, s)
    g.gain.linearRampToValueAtTime(level * a, s + Math.min(0.07, d * 0.3))
    g.gain.setValueAtTime(level * a, s + d * 0.6)
    g.gain.linearRampToValueAtTime(0, s + d)
  }
  const end = t + 2.0
  o.start(t)
  o.stop(end)
  bin(end, o, g, lp, pn, send)
}

/** One wave: a long rise, the crest's hiss, a foamy recession. */
function wave(dest: AudioNode, t: number, strength: number, pan: number, far: boolean): void {
  const rise = rand(2.2, 3.3)
  const dur = rise + rand(3.2, 5)
  const pn = stereo(pan)
  pn.connect(dest)
  const s = noise(G.pink, t, dur + 0.2)
  const lp = bq('lowpass', 260, 0.5)
  const top = (far ? 900 : 2200) * strength
  lp.frequency.setValueAtTime(260, t)
  lp.frequency.exponentialRampToValueAtTime(top, t + rise)
  lp.frequency.exponentialRampToValueAtTime(420, t + dur)
  const g = gn(0)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.25 * strength, t + rise * 0.7)
  g.gain.linearRampToValueAtTime(0.5 * strength, t + rise)
  g.gain.setTargetAtTime(0, t + rise + 0.25, (dur - rise) / 4)
  chain(s, lp, g, pn)
  const nodes: AudioNode[] = [pn, s, lp, g]
  if (!far) {
    const h = noise(G.white, t + rise - 0.3, dur - rise + 0.6)
    const hp = bq('highpass', 2400, 0.6)
    const hl = bq('lowpass', 8000, 0.5)
    const hg = gn(0)
    const ht = t + rise - 0.3
    hg.gain.setValueAtTime(0, ht)
    hg.gain.linearRampToValueAtTime(0.09 * strength, ht + 0.45)
    hg.gain.setTargetAtTime(0, ht + 0.6, (dur - rise) / 3.5)
    chain(h, hp, hl, hg, pn)
    nodes.push(h, hp, hl, hg)
  }
  bin(t + dur + 0.3, ...nodes)
}

function churchBell(b: BedRt, t: number): void {
  const strikes = randInt(1, 3)
  const parts: [number, number, number][] = [
    [0.5, 0.55, 2.2],
    [1, 1, 1.4],
    [1.19, 0.5, 1.0],
    [1.5, 0.35, 0.9],
    [2, 0.45, 0.7],
    [2.52, 0.2, 0.45],
    [3.01, 0.12, 0.35],
  ]
  for (let i = 0; i < strikes; i++) {
    const at = t + i * rand(2.2, 2.6)
    const pn = stereo(0.45)
    const dry = gn(0.55)
    const wet = gn(0.9)
    const end = bell(pn, at, 220, 0.03, parts, 1700)
    chain(pn, dry, b.amb)
    chain(pn, wet, b.wet)
    bin(end, pn, dry, wet)
  }
}

// --- the five beds ----------------------------------------------------------

const D_PENT = [62, 64, 66, 69, 71, 74, 76, 78, 81]
const D_PENT_ANCH = [0, 2, 3, 5, 7, 8]

function bedCanyon(b: BedRt): void {
  river(b, 1)
  const breeze = b.layer(G.pink, [bq('lowpass', 380, 0.6)], 0.2)
  b.wander(breeze.gain, 0.05, 0.32, 3, 8)
  const leaves = b.layer(G.pink, [bq('bandpass', 1900, 0.5)], 0.03)
  b.wander(leaves.gain, 0.005, 0.05, 3, 8)
  const species = [makeSpecies('finch'), makeSpecies('finch'), makeSpecies('finch')]
  b.every(3, 9, (t) => sing(b.amb, b.wet, pick(species), t, 0.05), 2)

  harmony(b, {
    chords: [
      [50, 57, 64, 66],
      [43, 50, 59, 64],
      [47, 54, 62, 69],
      [45, 52, 59, 64],
    ],
    bar: 10,
    level: 0.042,
    atk: 5,
    cut: 850,
    air: 0.25,
  })
  melody(b, {
    step: 0.42,
    scale: D_PENT,
    anchors: D_PENT_ANCH,
    voices: [kalimba, felt, kalimba],
    vel: 0.165,
    density: () => 0.6,
    len: [3, 6],
    rest: [6, 14],
    dyad: 0.12,
    start: 3,
  })
}

function bedTown(b: BedRt): void {
  // cicadas: three voices, buzzing and swelling, never shrill
  const cic = bq('highshelf', 7000, 0.7)
  cic.gain.value = -9
  const cicBus = gn(1)
  chain(cicBus, cic, b.amb)
  b.keep(cic, cicBus)
  const voices: [number, number, number, number][] = [
    [4300, 4, 47, -0.55],
    [5200, 5, 59, 0.3],
    [6000, 6, 71, 0.75],
  ]
  voices.forEach(([f, q, rate, p], i) => {
    const pn = stereo(p)
    const am = gn(0.55)
    const lfo = osc('sine', rate, A.currentTime)
    const ld = gn(0.45)
    chain(lfo, ld)
    ld.connect(am.gain)
    const pulse = gn(0.7)
    const pl = osc('sine', rand(3, 6.5), A.currentTime)
    const pd = gn(i === 1 ? 0.3 : 0.12)
    chain(pl, pd)
    pd.connect(pulse.gain)
    const sw = b.layer(G.white, [bq('bandpass', f, q), bq('bandpass', f * 1.03, q)], 0.5, am)
    b.wander(sw.gain, 0.25, 1, 4, 11)
    chain(am, pulse, pn, cicBus)
    b.run(lfo, pl)
    b.keep(pn, am, ld, pulse, pd)
  })
  // harbor water lapping, far off
  const lapG = gn(0.2)
  const lp = bq('lowpass', 520, 0.6)
  const hp = bq('highpass', 90, 0.7)
  const lapLvl = gn(0.7)
  chain(lapG, lapLvl, b.amb)
  b.layer(G.pink, [lp, hp], 1, lapG)
  b.keep(lapG, lapLvl)
  b.every(1.0, 2.8, (t) => {
    lapG.gain.setTargetAtTime(rand(0.7, 1), t, 0.12)
    lapG.gain.setTargetAtTime(0.2, t + rand(0.25, 0.5), rand(0.35, 0.7))
    if (chance(0.5)) {
      const s = noise(G.pink, t + 0.2, 0.3)
      const bp = bq('bandpass', rand(550, 800), 2)
      const g = gn(0)
      const end = perc(g.gain, t + 0.2, 0.12, 0.006, 0.04)
      chain(s, bp, g, lapLvl)
      bin(end, s, bp, g)
    }
  }, 0.5)
  // open air
  const air = b.layer(G.pink, [bq('lowpass', 900, 0.5)], 0.06)
  b.wander(air.gain, 0.03, 0.08, 4, 9)
  b.every(45, 100, (t) => churchBell(b, t), 24)
  b.every(10, 26, (t) => coo(b.amb, b.wet, t, 0.045), 6)

  harmony(b, {
    chords: [
      [50, 57, 61, 66, 69],
      [50, 56, 59, 64, 68],
    ],
    bar: 16 * 0.36,
    level: 0.038,
    atk: 3,
    cut: 1100,
    air: 0.2,
    bass: { voice: marimba, vel: 0.22, prob: 0.7 },
  })
  melody(b, {
    step: 0.36,
    scale: [62, 64, 66, 68, 69, 71, 73, 74, 76, 78, 80, 81],
    anchors: [0, 2, 3, 4, 6, 7, 9, 11],
    voices: [marimba, kalimba, marimba],
    vel: 0.18,
    density: () => 0.75,
    len: [3, 7],
    rest: [4, 10],
    dyad: 0.2,
    start: 2,
  })
}

function bedWoods(b: BedRt): void {
  // wind in the pines: a low body and a needle hiss sharing one gust
  const gust = gn(0.6)
  const windBus = gn(1)
  chain(gust, windBus, b.amb)
  b.keep(gust, windBus)
  b.wander(gust.gain, 0.3, 1, 3, 8)
  const wlp = bq('lowpass', 700, 0.5)
  b.layer(G.pink, [wlp, bq('highpass', 40, 0.7)], 0.38, gust)
  const hissG = gn(1)
  hissG.connect(gust)
  b.keep(hissG)
  b.layer(G.pink, [bq('bandpass', 2000, 0.5)], 0.075, hissG)

  const species = [makeSpecies('thrush'), makeSpecies('thrush'), makeSpecies('finch')]
  b.every(2.5, 7, (t) => {
    const k = Math.pow(1 - progress, 1.5)
    if (chance(k)) sing(b.amb, b.wet, pick(species), t, 0.045 * (0.5 + 0.5 * k))
  }, 1.5)

  const crickBus = gn(0)
  crickBus.connect(b.amb)
  b.keep(crickBus)
  crickets(b, 5, crickBus)

  b.every(30, 70, (t) => {
    if (progress > 0.75 && chance(0.6)) owl(b.amb, b.wet, t, 0.04)
  }, 20)

  // music: warm at golden hour, thinning to a drone
  const musLp = bq('lowpass', 4500, 0.5)
  const padBus = gn(1)
  chain(padBus, musLp)
  musLp.connect(b.mus)
  b.keep(musLp, padBus)
  const droneG = gn(0)
  const dlp = bq('lowpass', 320, 0.5)
  const d1 = osc('sawtooth', mtof(43), A.currentTime)
  d1.detune.value = -4
  const d2 = osc('sawtooth', mtof(50), A.currentTime)
  d2.detune.value = 4
  const d2g = gn(0.6)
  const d3 = osc('sine', mtof(31), A.currentTime)
  const d3g = gn(0.5)
  const dl = osc('sine', 0.05, A.currentTime)
  const dlg = gn(80)
  chain(d1, dlp)
  chain(d2, d2g, dlp)
  chain(d3, d3g, droneG)
  chain(dl, dlg)
  dlg.connect(dlp.frequency)
  chain(dlp, droneG, b.mus)
  b.run(d1, d2, d3, dl)
  b.keep(droneG, dlp, d2g, d3g, dlg)

  harmony(b, {
    chords: [
      [43, 50, 54, 59],
      [40, 47, 55, 62],
      [48, 55, 59, 64],
      [50, 54, 57, 59],
    ],
    bar: 11,
    level: 0.032,
    atk: 5,
    cut: 800,
    air: 0.15,
    dest: padBus,
    gate: () => progress < 0.93,
  })
  melody(b, {
    step: 0.46,
    scale: [55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79],
    anchors: [0, 2, 3, 5, 7, 8, 10],
    voices: [felt],
    vel: 0.13,
    density: () => lerp(0.65, 0.08, progress),
    shift: () => (progress > 0.55 ? -12 : 0),
    len: [3, 6],
    rest: [5, 12],
    dyad: 0.15,
    start: 2.5,
    dest: musLp,
  })

  const apply = (p: number, t: number): void => {
    crickBus.gain.setTargetAtTime(0.28 * smooth(0.3, 0.85, p), t, 1.5)
    wlp.frequency.setTargetAtTime(lerp(720, 380, p), t, 1.5)
    windBus.gain.setTargetAtTime(lerp(1, 0.75, p), t, 1.5)
    hissG.gain.setTargetAtTime(lerp(1, 0.35, p), t, 1.5)
    padBus.gain.setTargetAtTime(1 - smooth(0.3, 0.95, p), t, 2)
    droneG.gain.setTargetAtTime(0.03 * smooth(0.45, 1, p), t, 2)
    musLp.frequency.setTargetAtTime(lerp(4500, 1400, p), t, 2)
  }
  b.onProgress = apply
}

function bedShore(b: BedRt): void {
  const surf = b.layer(G.brown, [bq('lowpass', 240, 0.6), bq('highpass', 40, 0.7)], 0.12)
  b.wander(surf.gain, 0.08, 0.15, 3, 7)
  const night = b.layer(G.pink, [bq('lowpass', 1200, 0.5)], 0.025)
  b.wander(night.gain, 0.015, 0.03, 5, 10)
  let side = 1
  b.every(6, 9, (t) => {
    side = -side
    wave(b.amb, t, rand(0.8, 1), side * rand(0.1, 0.45), false)
  }, 0.2)
  b.every(3.5, 5.5, (t) => wave(b.amb, t, rand(0.5, 0.75), rand(-0.7, 0.7), true), 2)
  const crickBus = gn(0.12)
  crickBus.connect(b.amb)
  b.keep(crickBus)
  crickets(b, 3, crickBus)

  // together: a tender motif, low, repeating with small changes
  const step = 0.6
  const bars: { chord: number[]; bass: number; mel: [number, number][] }[] = [
    { chord: [50, 54, 57, 61], bass: 38, mel: [[57, 0], [62, 2], [64, 4], [66, 6]] },
    { chord: [47, 50, 54, 57], bass: 35, mel: [[66, 0], [64, 2], [62, 4], [59, 8]] },
    { chord: [43, 47, 50, 54], bass: 43, mel: [[62, 0], [64, 2], [66, 4], [69, 6]] },
    { chord: [45, 50, 52, 57], bass: 45, mel: [[64, 0], [66, 2], [64, 4], [61, 8]] },
  ]
  let next = -1
  let bar = 0
  b.ticks.push((t0, t1, fading) => {
    if (next < 0) next = t0 + 1.5
    while (next < t1) {
      const at = Math.max(next, t0)
      if (!fading) {
        const B = bars[bar % bars.length]
        pad(b.mus, at, B.chord, 0.03, 4, 16 * step - 2, 6, { cut: 750, air: 0.2 })
        felt(b.mus, at + 0.01, B.bass, 0.12, -0.1)
        if (chance(0.5)) felt(b.mus, at + step * 8, B.bass + 7, 0.07, -0.05)
        const rest = bar > 0 && chance(0.15)
        if (!rest) {
          B.mel.forEach(([m, s], k) => {
            let mm = m
            if (k === B.mel.length - 1 && chance(0.25)) mm = pick([m, m + 2, m - 1, m + 3])
            felt(b.mus, at + s * step + rand(0, 0.02), mm, 0.14 * rand(0.8, 1) * (k === 0 ? 1.05 : 1))
          })
        }
        if (chance(0.2)) kalimba(b.mus, at + 12 * step, pick([74, 76, 78]), 0.05, 0.3)
      }
      bar++
      next = at + 16 * step
    }
  })
}

function bedTitle(b: BedRt): void {
  river(b, 0.5)
  harmony(b, {
    chords: [
      [50, 57, 64, 66, 69],
      [50, 55, 62, 69, 71],
    ],
    bar: 14,
    level: 0.08,
    atk: 6,
    cut: 800,
    air: 0.35,
    spread: 0.7,
  })
  melody(b, {
    step: 0.6,
    scale: D_PENT,
    anchors: D_PENT_ANCH,
    voices: [kalimba],
    vel: 0.07,
    density: () => 0.3,
    len: [1, 2],
    rest: [8, 16],
    start: 6,
  })
}

function makeBed(id: Bed): BedRt {
  const b = new BedRt(id)
  if (id === 'canyon') bedCanyon(b)
  else if (id === 'town') bedTown(b)
  else if (id === 'woods') bedWoods(b)
  else if (id === 'shore') bedShore(b)
  else if (id === 'title') bedTitle(b)
  return b
}

function startBed(bed: Bed, fade: number): void {
  if (current && current.id === bed && !current.fading) return
  if (current) current.fadeOut(fade)
  current = null
  if (bed === 'none') return
  const b = makeBed(bed)
  b.fadeIn(fade)
  beds.push(b)
  current = b
  b.onProgress?.(progress, A.currentTime)
  const t0 = A.currentTime
  for (const f of b.ticks) f(t0, t0 + LOOKAHEAD, false)
}

// ---------------------------------------------------------------------------
// Spatial output
// ---------------------------------------------------------------------------

interface Spatial {
  input: GainNode
  dist: number
  nodes: AudioNode[]
}

/** Lowpass for air, a panner (10 m clear, 80 m faint), and a reverb send that makes distance wetter. */
function spatial(x: number, y: number, z: number, hrtf: boolean, extraWet = 0, wetScale = 1): Spatial {
  const dist = Math.hypot(x - ear.x, y - ear.y, z - ear.z)
  const input = gn(1)
  const lp = bq('lowpass', clamp(20000 * Math.exp(-dist / 45), 1800, 20000), 0.5)
  const p = A.createPanner()
  p.panningModel = hrtf ? 'HRTF' : 'equalpower'
  p.distanceModel = 'inverse'
  p.refDistance = 6
  p.rolloffFactor = 0.6
  p.maxDistance = 1000
  if (p.positionX) {
    p.positionX.value = x
    p.positionY.value = y
    p.positionZ.value = z
  } else {
    p.setPosition(x, y, z)
  }
  chain(input, lp, p, G.sfx)
  const near = Math.min(1, 6 / (6 + 0.6 * Math.max(0, dist - 6)))
  const k = clamp(dist / 70, 0, 1)
  const send = gn(wetScale * (0.35 * (0.3 + 0.7 * k) * Math.sqrt(near) + extraWet))
  chain(input, send, G.verb)
  return { input, dist, nodes: [input, lp, p, send] }
}

// ---------------------------------------------------------------------------
// One-shot sound
// ---------------------------------------------------------------------------

function thud(dest: AudioNode, t: number, f: number, dur: number, lvl: number): number {
  const o = osc('sine', f, t)
  o.frequency.exponentialRampToValueAtTime(f * 0.55, t + dur)
  const g = gn(0)
  const end = perc(g.gain, t, lvl, 0.003, dur / 3)
  chain(o, g, dest)
  o.start(t)
  o.stop(end)
  bin(end, o, g)
  return end
}

function burst(
  dest: AudioNode,
  t: number,
  buf: AudioBuffer,
  type: BiquadFilterType,
  f: number,
  q: number,
  dur: number,
  lvl: number,
  atk = 0.003,
  fTo?: number,
): number {
  const fl = bq(type, f, q)
  if (fTo !== undefined) {
    fl.frequency.setValueAtTime(f, t)
    fl.frequency.exponentialRampToValueAtTime(fTo, t + dur)
  }
  const g = gn(0)
  const end = perc(g.gain, t, lvl, atk, dur / 4)
  const s = noise(buf, t, end - t + 0.02)
  chain(s, fl, g, dest)
  bin(end, s, fl, g)
  return end
}

/** Tiny grains through one filter: gravel, twigs, droplets. */
function grains(dest: AudioNode, t: number, n: number, spread: number, fLo: number, fHi: number, q: number, lvl: number, gd: number): number {
  const fl = bq('bandpass', fLo, q)
  const g = gn(0)
  let at = t
  for (let i = 0; i < n; i++) {
    fl.frequency.setValueAtTime(rand(fLo, fHi), at)
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(lvl * rand(0.35, 1), at + 0.0015)
    g.gain.linearRampToValueAtTime(0, at + gd)
    at += gd + rand(0, spread / n)
  }
  const end = at + 0.02
  const s = noise(G.white, t, end - t)
  chain(s, fl, g, dest)
  bin(end, s, fl, g)
  return end
}

function surfaceHit(dest: AudioNode, t: number, surface: Surface, L: number, sc: number): number {
  const v = (a: number, b: number): number => rand(a, b) * sc
  let e = t
  const m = (x: number): void => {
    e = Math.max(e, x)
  }
  switch (surface) {
    case 'dust':
      m(thud(dest, t, v(70, 90), 0.06, L * 0.45))
      m(burst(dest, t, G.pink, 'lowpass', v(800, 1000), 0.7, 0.09, L * 0.7, 0.006))
      m(grains(dest, t + 0.005, 3, 0.05, 2500 * sc, 4000 * sc, 1.2, L * 0.12, 0.006))
      break
    case 'gravel':
      m(thud(dest, t, v(80, 100), 0.05, L * 0.35))
      m(burst(dest, t, G.pink, 'bandpass', v(1200, 1600), 0.8, 0.07, L * 0.4))
      m(grains(dest, t + 0.004, randInt(5, 8), 0.07, 1800 * sc, 5000 * sc, 2, L * 0.55, 0.008))
      break
    case 'sand':
      m(burst(dest, t, G.pink, 'lowpass', v(1100, 1500), 0.5, 0.14, L * 0.85, 0.025))
      m(burst(dest, t + 0.01, G.white, 'highpass', v(4500, 5500), 0.6, 0.1, L * 0.1, 0.03))
      m(thud(dest, t, v(60, 75), 0.07, L * 0.25))
      break
    case 'stone':
      m(thud(dest, t, v(100, 125), 0.035, L * 0.6))
      m(burst(dest, t, G.white, 'bandpass', v(1900, 2500), 1.5, 0.03, L * 0.45, 0.002))
      m(burst(dest, t, G.pink, 'bandpass', v(500, 700), 1, 0.05, L * 0.3, 0.002))
      break
    case 'grass':
      m(burst(dest, t, G.pink, 'bandpass', v(2600, 3400), 0.5, 0.12, L * 0.5, 0.02))
      m(thud(dest, t, v(65, 85), 0.06, L * 0.35))
      break
    case 'needles':
      m(thud(dest, t, v(70, 90), 0.06, L * 0.4))
      m(burst(dest, t, G.pink, 'lowpass', v(1600, 2000), 0.6, 0.1, L * 0.45, 0.01))
      m(grains(dest, t + 0.006, randInt(4, 6), 0.08, 1500 * sc, 3500 * sc, 1.5, L * 0.25, 0.01))
      break
    case 'wood':
      m(thud(dest, t, v(140, 165), 0.09, L * 0.65))
      m(burst(dest, t, G.pink, 'bandpass', v(380, 460), 5, 0.12, L * 0.8, 0.003))
      m(burst(dest, t, G.white, 'bandpass', v(2200, 2800), 2, 0.02, L * 0.15, 0.001))
      break
    case 'water':
      m(burst(dest, t, G.pink, 'bandpass', v(650, 800), 1.2, 0.18, L * 0.75, 0.01, 2200 * sc))
      m(grains(dest, t + 0.03, 4, 0.15, 900 * sc, 2600 * sc, 6, L * 0.35, 0.02))
      m(thud(dest, t, v(55, 65), 0.08, L * 0.3))
      break
  }
  return e
}

function barkVoice(dest: AudioNode, t: number, pm: number, lvl: number): number {
  const dur = rand(0.12, 0.17)
  const f0 = 500 * pm
  const src = osc('sawtooth', f0 * 0.9, t)
  src.frequency.linearRampToValueAtTime(f0 * 1.05, t + 0.018)
  src.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + dur)
  // roughness: a throat is never a clean oscillator
  const rn = noise(G.white, t, dur + 0.1)
  const rl = bq('lowpass', 320, 0.7)
  const rg = gn(f0 * 0.14)
  chain(rn, rl, rg)
  rg.connect(src.frequency)
  const mix = gn(1)
  src.connect(mix)
  const nz = noise(G.pink, t, dur + 0.1)
  const ng = gn(0.6)
  chain(nz, ng, mix)
  const env = gn(0)
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(lvl, t + 0.007)
  env.gain.setTargetAtTime(lvl * 0.7, t + 0.007, 0.04)
  env.gain.setTargetAtTime(0, t + dur * 0.7, 0.024)
  const end = t + dur * 0.7 + 0.2
  const nodes: AudioNode[] = [src, rn, rl, rg, mix, nz, ng, env]
  const forms: [number, number, number, number][] = [
    [820, 540, 4, 1],
    [1550, 1150, 5, 0.55],
    [2650, 2300, 6, 0.22],
  ]
  for (const [a, b, q, amp] of forms) {
    const bp = bq('bandpass', a * 0.85 * pm, q)
    bp.frequency.setValueAtTime(a * 0.85 * pm, t)
    bp.frequency.linearRampToValueAtTime(a * pm, t + 0.025)
    bp.frequency.exponentialRampToValueAtTime(b * pm, t + dur)
    const fg = gn(amp)
    chain(mix, bp, fg, env)
    nodes.push(bp, fg)
  }
  const body = bq('lowpass', 900, 0.7)
  const bg = gn(0.3)
  chain(mix, body, bg, env)
  env.connect(dest)
  const th = osc('sine', 150 * pm, t)
  th.frequency.exponentialRampToValueAtTime(70, t + 0.07)
  const tg = gn(0)
  perc(tg.gain, t, lvl * 0.25, 0.004, 0.025)
  chain(th, tg, dest)
  nodes.push(body, bg, th, tg)
  src.start(t)
  th.start(t)
  src.stop(end)
  th.stop(end)
  bin(end, ...nodes)
  return end
}

function gull(dest: AudioNode, t: number, lvl: number): number {
  const pm = rand(0.92, 1.08)
  const o = osc('sawtooth', 800 * pm, t)
  o.frequency.exponentialRampToValueAtTime(1500 * pm, t + 0.07)
  o.frequency.exponentialRampToValueAtTime(1350 * pm, t + 0.18)
  o.frequency.exponentialRampToValueAtTime(700 * pm, t + 0.44)
  const vib = osc('sine', 22, t)
  const vg = gn(22)
  chain(vib, vg)
  vg.connect(o.frequency)
  const lp = bq('lowpass', 3400, 0.7)
  const b1 = bq('bandpass', 1700, 1.5)
  const b2 = bq('bandpass', 3000, 2)
  const g2 = gn(0.35)
  const g = gn(0)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(lvl, t + 0.03)
  g.gain.linearRampToValueAtTime(lvl * 0.7, t + 0.3)
  g.gain.linearRampToValueAtTime(0, t + 0.46)
  chain(o, lp, b1, g)
  chain(lp, b2, g2, g)
  g.connect(dest)
  const end = t + 0.5
  o.start(t)
  vib.start(t)
  o.stop(end)
  vib.stop(end)
  bin(end, o, vib, vg, lp, b1, b2, g2, g)
  return end
}

function creak(dest: AudioNode, t: number, dur: number, fA: number, fB: number, bps: number[], lvl: number): number {
  const o = osc('sawtooth', fA, t)
  const steps = 7
  for (let i = 1; i <= steps; i++) o.frequency.linearRampToValueAtTime(lerp(fA, fB, i / steps) * rand(0.85, 1.15), t + (dur * i) / steps)
  const jit = noise(G.white, t, dur + 0.05)
  const jl = bq('lowpass', 60, 0.7)
  const jg = gn(fA * 0.3)
  chain(jit, jl, jg)
  jg.connect(o.frequency)
  const g = gn(0)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(lvl, t + dur * 0.15)
  g.gain.linearRampToValueAtTime(lvl * 0.6, t + dur * 0.7)
  g.gain.linearRampToValueAtTime(0, t + dur)
  const nodes: AudioNode[] = [o, jit, jl, jg, g]
  for (const f of bps) {
    const bp = bq('bandpass', f, 10)
    chain(o, bp, g)
    nodes.push(bp)
  }
  g.connect(dest)
  const end = t + dur + 0.05
  o.start(t)
  o.stop(end)
  bin(end, ...nodes)
  return end
}

function latch(dest: AudioNode, t: number, lvl: number, f: number): number {
  burst(dest, t, G.white, 'bandpass', f, 2, 0.012, lvl, 0.001)
  const e = bell(dest, t, f * 0.7, lvl * 0.35, [
    [1, 1, 0.03],
    [1.51, 0.6, 0.02],
  ], 6000)
  return e
}

// --- stingers ---------------------------------------------------------------

function stingBolt(t: number): void {
  const d = G.sting
  pad(d, t, [45, 50, 52, 57], 0.06, 0.25, 1.2, 1.4, { cut: 900, trem: 5 })
  const hi = osc('triangle', mtof(76), t)
  const hg = gn(0)
  hg.gain.setValueAtTime(0, t)
  hg.gain.linearRampToValueAtTime(0.04, t + 1.3)
  hg.gain.setTargetAtTime(0, t + 1.45, 0.15)
  const hl = bq('lowpass', 2500, 0.5)
  chain(hi, hl, hg, d)
  hi.start(t)
  hi.stop(t + 2.6)
  bin(t + 2.6, hi, hg, hl)
  const r = t + 1.45
  pad(d, r, [50, 54, 57, 62], 0.06, 0.35, 1.0, 2.8, { cut: 700, cutTo: 1700, spread: 0.6 })
  felt(d, r + 0.02, 78, 0.16)
  felt(d, r + 0.05, 69, 0.1)
  felt(d, r + 0.5, 74, 0.13)
}

function stingNearmiss(t: number): void {
  const d = G.sting
  const lp = bq('lowpass', 6000, 0.5)
  const env = gn(0)
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(1, t + 0.7)
  env.gain.setValueAtTime(1, t + 1.0)
  env.gain.setTargetAtTime(0, t + 1.0, 0.25)
  const end = t + 2.4
  chain(lp, env, d)
  const nodes: AudioNode[] = [lp, env]
  ;[81, 83, 88, 90].forEach((m, i) => {
    const o = osc('sine', mtof(m), t)
    o.detune.value = rand(-6, 6)
    const g = gn(0.03)
    const trem = osc('sine', rand(6.5, 9), t)
    const tg = gn(0.02)
    chain(trem, tg)
    tg.connect(g.gain)
    const pn = stereo(i % 2 ? 0.5 : -0.5)
    chain(o, g, pn, lp)
    o.start(t)
    trem.start(t)
    o.stop(end)
    trem.stop(end)
    nodes.push(o, g, trem, tg, pn)
  })
  const s = noise(G.white, t, 1.2)
  const hp = bq('highpass', 4000, 0.5)
  const ng = gn(0)
  ng.gain.setValueAtTime(0, t)
  ng.gain.linearRampToValueAtTime(0.045, t + 0.6)
  ng.gain.linearRampToValueAtTime(0, t + 0.85)
  chain(s, hp, ng, d)
  nodes.push(s, hp, ng)
  bin(end, ...nodes)
}

function stingReveal(t: number): void {
  const d = G.sting
  felt(d, t, 38, 0.14, 0)
  pad(d, t, [38, 45, 52, 54, 57, 61, 64, 69], 0.1, 1.8, 1.6, 3.6, { cut: 500, cutTo: 2400, spread: 0.9, air: 0.3 })
  ;[69, 74, 76, 78, 81].forEach((m, i) => kalimba(d, t + 0.9 + i * 0.22, m, 0.1 - i * 0.008))
}

function stingChapter(t: number): void {
  const d = G.sting
  felt(d, t, 66, 0.15)
  felt(d, t + 0.55, 64, 0.13)
  felt(d, t + 0.55, 45, 0.09)
  felt(d, t + 1.15, 62, 0.15)
  felt(d, t + 1.15, 50, 0.1)
  felt(d, t + 1.17, 57, 0.07)
  pad(d, t + 1.1, [50, 57, 62], 0.03, 0.8, 0.6, 2.5, { cut: 700 })
}

function stingEyes(t: number): void {
  bell(G.sting, t, mtof(50), 0.2, [
    [0.5, 0.3, 1.2],
    [1, 1, 0.8],
    [2, 0.35, 0.45],
    [3.01, 0.16, 0.28],
    [4.16, 0.07, 0.16],
    [5.43, 0.035, 0.1],
  ], 1800)
}

function stingHome(t: number): void {
  const d = G.sting
  felt(d, t, 38, 0.12, 0)
  felt(d, t + 0.02, 45, 0.08, 0)
  pad(d, t, [38, 55, 59, 62, 66, 69], 0.055, 3, 0.8, 3, { cut: 500, cutTo: 1500, spread: 0.7, air: 0.25 })
  const r = t + 3.5
  pad(d, r, [38, 50, 57, 62, 64, 66, 69, 74], 0.075, 2.6, 3.2, 5.5, { cut: 700, cutTo: 2600, spread: 0.9, air: 0.35 })
  ;[38, 45, 54, 57, 62, 64, 66].forEach((m, i) => felt(d, r + i * 0.09, m, 0.13 - i * 0.006))
  const mot: [number, number][] = [
    [78, 0],
    [81, 0.4],
    [83, 0.8],
    [81, 1.2],
    [78, 1.8],
    [76, 2.2],
    [74, 2.8],
  ]
  for (const [m, o] of mot) kalimba(d, r + 2.2 + o, m, 0.055, 0.2)
}

function stingTitle(t: number): void {
  const d = G.sting
  const mel: [number, number, number][] = [
    [66, 0, 0.14],
    [69, 0.5, 0.13],
    [71, 1.0, 0.14],
    [69, 1.5, 0.12],
    [64, 2.3, 0.12],
    [66, 2.8, 0.12],
    [62, 3.4, 0.15],
  ]
  for (const [m, o, v] of mel) felt(d, t + o, m, v)
  felt(d, t, 43, 0.1, 0)
  felt(d, t + 3.4, 38, 0.11, 0)
  felt(d, t + 3.42, 45, 0.07, 0)
  pad(d, t, [43, 50, 55, 59], 0.035, 1.2, 1.4, 1.8, { cut: 700 })
  pad(d, t + 3.2, [38, 50, 54, 57, 62], 0.045, 1.2, 1.6, 4, { cut: 800, cutTo: 1400, air: 0.2 })
}

// ---------------------------------------------------------------------------
// The API
// ---------------------------------------------------------------------------

export const audio = {
  /** Call from a user gesture. Creates/resumes the AudioContext. Safe to call repeatedly. */
  unlock(): void {
    if (ctx) {
      applyRun()
      return
    }
    if (typeof window === 'undefined') return
    const AC =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    let c: BaseAudioContext
    try {
      c = new AC({ latencyHint: 'interactive' })
    } catch {
      try {
        c = new AC()
      } catch {
        return
      }
    }
    try {
      build(c)
    } catch {
      ctx = null
      return
    }
    hidden = typeof document !== 'undefined' && document.hidden
    setInterval(tick, TICK_MS)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
    if (!offline) kickIOS()
    applyRun()
    if (wantBed !== 'none') startBed(wantBed, 2.5)
  },

  ready(): boolean {
    if (!ctx) return false
    return offline || (ctx as AudioContext).state === 'running'
  },

  setMuted(m: boolean): void {
    isMuted = m
    applyRun()
  },

  muted(): boolean {
    return isMuted
  },

  /** Crossfade ambience + music to a chapter's bed over `fade` seconds (default 3). */
  setBed(bed: Bed, fade = 3): void {
    wantBed = bed
    if (!ctx) return
    startBed(bed, Math.max(0.05, fade))
  },

  /** 0..1 within a chapter. */
  setProgress(p: number): void {
    progress = clamp(Number.isFinite(p) ? p : 0, 0, 1)
  },

  /** Listener pose each frame (world meters; forward is a horizontal unit vector the camera faces). */
  setListener(x: number, y: number, z: number, fx: number, fz: number): void {
    ear.x = x
    ear.y = y
    ear.z = z
    if (fx !== 0 || fz !== 0) {
      ear.fx = fx
      ear.fz = fz
    }
    applyListener()
  },

  /** The boy's whistle: rising then falling, a mouth and not a beep. */
  whistle(): void {
    if (!isLive()) return
    const t = A.currentTime + 0.01
    const k = rand(0.96, 1.04)
    const pn = stereo(-0.04)
    const send = gn(0.16)
    pn.connect(G.sfx)
    chain(pn, send, G.verb)
    // the pitch path, shared by the tone and the breath under it
    const path = (p: AudioParam, m: number): void => {
      p.setValueAtTime(1450 * k * m, t)
      p.exponentialRampToValueAtTime(1680 * k * m, t + 0.05)
      p.exponentialRampToValueAtTime(2280 * k * m, t + 0.22)
      p.linearRampToValueAtTime(2320 * k * m, t + 0.3)
      p.exponentialRampToValueAtTime(2420 * k * m, t + 0.335)
      p.exponentialRampToValueAtTime(1640 * k * m, t + 0.67)
    }
    const o = A.createOscillator()
    o.type = 'sine'
    path(o.frequency, 1)
    const vib = osc('sine', rand(5.2, 6), t)
    const vg = gn(0)
    vg.gain.setValueAtTime(0, t)
    vg.gain.linearRampToValueAtTime(14 * k, t + 0.2)
    vg.gain.linearRampToValueAtTime(26 * k, t + 0.6)
    chain(vib, vg)
    vg.connect(o.frequency)
    const L = MIX.whistle
    const g = gn(0)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(L * 0.85, t + 0.045)
    g.gain.linearRampToValueAtTime(L, t + 0.22)
    g.gain.linearRampToValueAtTime(L * 0.38, t + 0.315)
    g.gain.linearRampToValueAtTime(L * 0.95, t + 0.355)
    g.gain.linearRampToValueAtTime(L * 0.7, t + 0.6)
    g.gain.linearRampToValueAtTime(0, t + 0.7)
    chain(o, g, pn)
    const h2 = A.createOscillator()
    h2.type = 'sine'
    path(h2.frequency, 2)
    const h2g = gn(0.035)
    chain(h2, h2g, g)
    // breath: noise following the note, and a little air at the lips
    const br = noise(G.white, t, 0.75)
    const bp = bq('bandpass', 1800, 3)
    path(bp.frequency, 1)
    const bg = gn(0)
    bg.gain.setValueAtTime(0, t)
    bg.gain.linearRampToValueAtTime(L * 0.5, t + 0.04)
    bg.gain.linearRampToValueAtTime(L * 0.3, t + 0.3)
    bg.gain.linearRampToValueAtTime(0, t + 0.7)
    chain(br, bp, bg, pn)
    const air = noise(G.white, t, 0.75)
    const ahp = bq('highpass', 6000, 0.5)
    const ag = gn(0)
    ag.gain.setValueAtTime(0, t)
    ag.gain.linearRampToValueAtTime(L * 0.12, t + 0.02)
    ag.gain.linearRampToValueAtTime(L * 0.03, t + 0.15)
    ag.gain.linearRampToValueAtTime(0, t + 0.7)
    chain(air, ahp, ag, pn)
    const end = t + 0.75
    o.start(t)
    h2.start(t)
    vib.start(t)
    o.stop(end)
    h2.stop(end)
    vib.stop(end)
    bin(end + 0.1, pn, send, o, vib, vg, g, h2, h2g, br, bp, bg, air, ahp, ag)
  },

  /** The dog's answer, spatialized at a world position. */
  bark(x: number, y: number, z: number, opts?: { echo?: boolean; double?: boolean }): void {
    if (!isLive()) return
    const t = A.currentTime + 0.02
    const echo = !!opts?.echo
    const sp = spatial(x, y, z, true, echo ? 0.12 : 0)
    const pm = rand(0.95, 1.05)
    let end = barkVoice(sp.input, t, pm, MIX.bark)
    if (opts?.double) end = barkVoice(sp.input, t + rand(0.18, 0.23), pm * 1.07, MIX.bark * 0.85)
    const nodes = [...sp.nodes]
    if (echo) {
      // slapback off stone walls, from places the dog is not
      const dx = x - ear.x
      const dz = z - ear.z
      const th = Math.atan2(dx, dz)
      const reflections: [number, number][] = [
        [rand(0.05, 0.085), 0.6],
        [rand(0.11, 0.16), 0.46],
        [rand(0.19, 0.26), 0.32],
      ]
      reflections.forEach(([delay, amp], i) => {
        const a = th + (i % 2 === 0 ? 1 : -1) * rand(0.7, 1.9)
        const r = Math.max(8, sp.dist * rand(1.0, 1.35) + 3)
        const px = ear.x + Math.sin(a) * r
        const pz = ear.z + Math.cos(a) * r
        const dl = A.createDelay(1)
        dl.delayTime.value = delay
        const lp = bq('lowpass', 2600, 0.5)
        const g = gn(amp)
        const p = A.createPanner()
        p.panningModel = 'HRTF'
        p.distanceModel = 'inverse'
        p.refDistance = 6
        p.rolloffFactor = 0.6
        p.maxDistance = 1000
        if (p.positionX) {
          p.positionX.value = px
          p.positionY.value = y
          p.positionZ.value = pz
        } else {
          p.setPosition(px, y, pz)
        }
        // an echo is only as loud as the source allows, a little under
        const comp = (6 + 0.6 * Math.max(0, r - 6)) / (6 + 0.6 * Math.max(0, sp.dist - 6))
        g.gain.value = amp * Math.min(1.4, comp)
        chain(sp.input, dl, lp, g, p, G.sfx)
        nodes.push(dl, lp, g, p)
      })
      end += 0.4
    }
    bin(end + 0.1, ...nodes)
  },

  /** A single footstep for the boy (non-spatial, quiet). intensity 0..1. */
  footstep(surface: Surface, intensity = 0.6): void {
    if (!isLive()) return
    const now = A.currentTime
    if (now - lastStep < 0.07) return
    lastStep = now
    stepSide = -stepSide
    const t = now + 0.005 + rand(0, 0.008)
    const pn = stereo(stepSide * rand(0.03, 0.09))
    pn.connect(G.sfx)
    const L = MIX.step * (0.3 + 0.7 * clamp(intensity, 0, 1)) * rand(0.8, 1.15)
    const end = surfaceHit(pn, t, surface, L, rand(0.88, 1.12))
    bin(end, pn)
  },

  /** Dog paw patter, spatial, very quiet. */
  pawstep(x: number, y: number, z: number, surface: Surface): void {
    if (!isLive()) return
    const d = Math.hypot(x - ear.x, y - ear.y, z - ear.z)
    if (d > 45) return
    const t = A.currentTime + 0.005 + rand(0, 0.01)
    const sp = spatial(x, y, z, false, 0, 0)
    const end = surfaceHit(sp.input, t, surface, MIX.paw * rand(0.75, 1.1), rand(1.2, 1.45))
    bin(end, ...sp.nodes)
  },

  /** A flock lifting: wing flutter burst, spatial. */
  birds(x: number, y: number, z: number, kind: 'small' | 'pigeons' | 'gulls'): void {
    if (!isLive()) return
    const t = A.currentTime + 0.02
    const sp = spatial(x, y, z, true, 0.05)
    const cfg =
      kind === 'small'
        ? { n: 8, rate: [15, 22], f: [2400, 4200], q: 1.4, flaps: [8, 14], lvl: 0.5, spread: 0.3, atk: 0.3, buf: G.white }
        : kind === 'pigeons'
          ? { n: 6, rate: [7.5, 10], f: [900, 1700], q: 1.1, flaps: [8, 12], lvl: 0.75, spread: 0.35, atk: 0.35, buf: G.pink }
          : { n: 3, rate: [3.2, 4.5], f: [450, 850], q: 0.8, flaps: [5, 8], lvl: 0.8, spread: 0.4, atk: 0.4, buf: G.pink }
    const L = MIX.flock * cfg.lvl
    let end = t
    const nodes = [...sp.nodes]
    for (let i = 0; i < cfg.n; i++) {
      const rate = rand(cfg.rate[0], cfg.rate[1])
      const per = 1 / rate
      const flaps = randInt(cfg.flaps[0], cfg.flaps[1])
      const f = rand(cfg.f[0], cfg.f[1])
      const bp = bq('bandpass', f, cfg.q)
      const g = gn(0)
      let ft = t + rand(0, cfg.spread)
      const t0 = ft
      for (let k = 0; k < flaps; k++) {
        const clap = kind === 'pigeons' && k < 2
        const a = L * Math.pow(1 - k / flaps, 1.3) * rand(0.7, 1) * (clap ? 1.5 : 1)
        const p = clap ? per * 0.7 : per * rand(0.92, 1.08)
        g.gain.setValueAtTime(0, ft)
        g.gain.linearRampToValueAtTime(a, ft + p * cfg.atk)
        g.gain.linearRampToValueAtTime(0, ft + p * 0.85)
        ft += p
      }
      bp.frequency.setValueAtTime(f, t0)
      bp.frequency.exponentialRampToValueAtTime(f * 0.7, ft)
      const s = noise(cfg.buf, t0, ft - t0 + 0.05)
      chain(s, bp, g, sp.input)
      nodes.push(s, bp, g)
      end = Math.max(end, ft + 0.05)
    }
    if (kind === 'small') {
      for (let i = 0; i < 3; i++) {
        const at = t + rand(0, 0.5)
        const o = osc('sine', rand(4400, 5400), at)
        o.frequency.exponentialRampToValueAtTime(rand(3200, 3800), at + 0.03)
        const g = gn(0)
        const e = perc(g.gain, at, L * 0.25, 0.002, 0.008)
        chain(o, g, sp.input)
        o.start(at)
        o.stop(e)
        nodes.push(o, g)
        end = Math.max(end, e)
      }
    } else if (kind === 'gulls') {
      end = Math.max(end, gull(sp.input, t + 0.25, L * 0.5), gull(sp.input, t + rand(0.8, 1.0), L * 0.38))
    }
    bin(end + 0.1, ...nodes)
  },

  /** Short musical/emotional punctuation, non-spatial. */
  stinger(s: Stinger): void {
    if (!isLive()) return
    const t = A.currentTime + 0.03
    switch (s) {
      case 'bolt':
        stingBolt(t)
        break
      case 'nearmiss':
        stingNearmiss(t)
        break
      case 'reveal':
        stingReveal(t)
        break
      case 'chapter':
        stingChapter(t)
        break
      case 'eyes':
        stingEyes(t)
        break
      case 'home':
        stingHome(t)
        break
      case 'title':
        stingTitle(t)
        break
    }
  },

  /** A wooden door opening + a faint warm interior murmur swell (no voices/words). */
  door(): void {
    if (!isLive()) return
    const t = A.currentTime + 0.02
    const pn = stereo(0.08)
    pn.connect(G.sfx)
    const send = gn(0.08)
    chain(pn, send, G.verb)
    latch(pn, t, 0.2, 3000)
    latch(pn, t + 0.07, 0.14, 2000)
    creak(pn, t + 0.14, 0.75, 42, 62, [720, 1550], 0.15)
    burst(pn, t + 0.2, G.pink, 'lowpass', 380, 0.6, 0.5, 0.12, 0.2)
    // the house: room tone, an indistinct warmth, a fire
    const r = t + 0.4
    const room = gn(0)
    room.gain.setValueAtTime(0, r)
    room.gain.linearRampToValueAtTime(1, r + 1.6)
    room.gain.setValueAtTime(1, r + 4.2)
    room.gain.linearRampToValueAtTime(0, r + 8)
    room.connect(G.sfx)
    const end = r + 8.1
    const s1 = noise(G.brown, r, 8.1)
    const l1 = bq('lowpass', 420, 0.6)
    const g1 = gn(0.26)
    chain(s1, l1, g1, room)
    const s2 = noise(G.pink, r, 8.1)
    const b2 = bq('bandpass', 360, 1.2)
    const l2 = bq('lowpass', 520, 0.6)
    const g2 = gn(0.04)
    for (let at = r; at < end - 0.3; at += rand(0.15, 0.35)) g2.gain.setTargetAtTime(rand(0.01, 0.06), at, 0.07)
    chain(s2, b2, l2, g2, room)
    pad(room, r, [50, 57, 62, 66], 0.03, 1.8, 2.5, 3.5, { cut: 600 })
    for (let i = 0; i < 14; i++) burst(room, r + rand(0.5, 7), G.white, 'bandpass', rand(1800, 3200), 1.5, 0.004, rand(0.01, 0.03), 0.0005)
    bin(end, pn, send, room, s1, l1, g1, s2, b2, l2, g2)
  },

  /**
   * Small sounds of life, spatial: a goat's bell, brush pushed through, a fish
   * or a drink, the dog digging or shaking off, something small scattering.
   */
  cue(kind: 'goatbell' | 'rustle' | 'plop' | 'splash' | 'scatter' | 'dig' | 'shake' | 'lap' | 'hooves', x: number, y: number, z: number, level = 1): void {
    if (!isLive()) return
    const d = Math.hypot(x - ear.x, y - ear.y, z - ear.z)
    if (d > 70) return
    const t = A.currentTime + 0.01
    const sp = spatial(x, y, z, false, 0.02)
    const o = sp.input
    const L = level
    let end = t
    switch (kind) {
      case 'goatbell': {
        // a small tin bell, knocked twice by a nodding head
        const f = rand(1480, 1720)
        const parts: [number, number, number][] = [[1, 1, 0.18], [2.32, 0.5, 0.09], [3.9, 0.3, 0.05], [5.1, 0.18, 0.03]]
        end = bell(o, t, f, 0.05 * L, parts, 6000)
        end = Math.max(end, bell(o, t + rand(0.16, 0.24), f * rand(0.99, 1.01), 0.035 * L, parts, 6000))
        break
      }
      case 'rustle':
        end = grains(o, t, 26, 0.45, 1800, 5200, 1.2, 0.06 * L, 0.012)
        end = Math.max(end, burst(o, t, G.pink, 'bandpass', 2600, 0.8, 0.4, 0.05 * L, 0.05))
        break
      case 'plop':
        end = thud(o, t, rand(520, 700), 0.09, 0.05 * L)
        end = Math.max(end, grains(o, t + 0.02, 6, 0.12, 2500, 5000, 3, 0.02 * L, 0.008))
        break
      case 'lap':
        for (let i = 0; i < 7; i++) end = Math.max(end, thud(o, t + i * rand(0.2, 0.26), rand(700, 900), 0.05, 0.03 * L))
        break
      case 'splash':
        end = burst(o, t, G.white, 'bandpass', 1500, 0.9, 0.22, 0.07 * L, 0.004, 700)
        end = Math.max(end, grains(o, t + 0.03, 10, 0.2, 2200, 5200, 2, 0.03 * L, 0.01))
        break
      case 'scatter':
        end = grains(o, t, 14, 0.25, 3000, 7000, 1.5, 0.04 * L, 0.006)
        break
      case 'dig':
        end = grains(o, t, 40, 2.6, 900, 2600, 1.1, 0.07 * L, 0.02)
        break
      case 'shake':
        end = burst(o, t, G.pink, 'bandpass', 1100, 0.7, 0.9, 0.06 * L, 0.08)
        end = Math.max(end, grains(o, t + 0.1, 24, 0.9, 2500, 6000, 2, 0.03 * L, 0.008))
        break
      case 'hooves':
        for (let i = 0; i < 8; i++) end = Math.max(end, thud(o, t + i * 0.19 + rand(0, 0.04), rand(90, 130), 0.08, 0.05 * L))
        end = Math.max(end, grains(o, t, 30, 1.6, 900, 2400, 1, 0.04 * L, 0.02))
        break
    }
    bin(end + 0.1, ...sp.nodes)
  },

  /** The boy's breath on a climb: one soft in-and-out, non-spatial. */
  breath(intensity = 0.6): void {
    if (!isLive()) return
    const t = A.currentTime + 0.01
    const pn = stereo(0)
    pn.connect(G.sfx)
    const L = 0.035 * clamp(intensity, 0, 1)
    let end = burst(pn, t, G.pink, 'bandpass', 900, 0.8, 0.5, L * 0.7, 0.18, 1300)
    end = Math.max(end, burst(pn, t + 0.55, G.pink, 'bandpass', 700, 0.8, 0.7, L, 0.06, 500))
    bin(end + 0.1, pn)
  },

  /** A wooden gate latch/creak, spatial. */
  gate(x: number, y: number, z: number): void {
    if (!isLive()) return
    const t = A.currentTime + 0.02
    const sp = spatial(x, y, z, true)
    const d = sp.input
    latch(d, t, 0.3, 3100)
    let end = creak(d, t + 0.1, 0.5, 55, 88, [1100, 2100], 0.18)
    end = Math.max(end, latch(d, t + 0.72, 0.36, 2600))
    latch(d, t + 0.76, 0.2, 3400)
    thud(d, t + 0.78, 165, 0.07, 0.35)
    end = Math.max(end, burst(d, t + 0.78, G.pink, 'bandpass', 320, 3, 0.07, 0.4, 0.002))
    bin(end + 0.1, ...sp.nodes)
  },
}

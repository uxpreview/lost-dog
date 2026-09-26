// Data shapes for src/data/*.json. Conventions:
//   path points   [x, z, y, width?]      (plan first, then height)
//   positions     [x, y, z]              (three.js order) for props, cameras
//   plan points   [x, z]                 for dog nodes, witnesses, landmarks
//   triggers      [x, z, radius]

export type P2 = [number, number]
export type P3 = [number, number, number]
export type PathPt = [number, number, number, number?]

export type Surface = 'dust' | 'gravel' | 'sand' | 'stone' | 'grass' | 'needles' | 'wood' | 'water'

export interface Light {
  at: number
  sun: [number, number] // azimuth (deg, clockwise from north), elevation (deg)
  sunColor: string
  sunI: number
  skyTop: string
  skyHorizon: string
  ambSky: string
  ambGround: string
  ambI: number
  fog: string
  fogNear: number
  fogFar: number
  stars: number
  moon: number
}

export type DogNode =
  | { type: 'heel'; at: P2; until: { time?: number; whistles?: number; progress?: number } }
  | { type: 'bolt'; at: P2; stare: P3; hold: number }
  | { type: 'perch'; at: P2; release: number; pose: 'sit' | 'stand' }
  | { type: 'hazard'; at: P2; clear: P2; pose: 'sit' | 'stand' }
  | { type: 'visit'; at: P2; npc: string; hold: number; release: number }
  | { type: 'eyes'; at: P2; release: number; pose: 'sit' | 'stand' }
  | { type: 'join'; at: P2; release: number; pose: 'sit' }
  | { type: 'gate'; at: P2; release: number; pose: 'sit' }
  | { type: 'nearmiss'; at: P2; approach: number; contact: boolean; hold: number; path: P2[] }
  // business: something a dog does on his way, without waiting for anyone
  | { type: 'business'; at: P2; act: BusinessAct; dur?: number; prop?: P2 }
  // invite: a play-bow and a bark when the boy has fallen behind, then on
  | { type: 'invite'; at: P2; far?: number }
  // double-back: he comes back toward the boy a few meters, checks, goes on
  | { type: 'double-back'; at: P2; back?: number }

export type BusinessAct = 'drink' | 'dig' | 'sniff' | 'roll' | 'shake' | 'butterfly' | 'cat'

export interface Area {
  circle?: [number, number, number]
  poly?: P2[]
  y?: number
  surface: Surface
}

export interface Witness {
  id: string
  kind: 'fishmonger' | 'kids' | 'old-woman' | 'sitter' | 'walker'
  at: P2
  face: P2
  react: 'point' | 'run' | 'treat' | 'look'
  point?: P2
  run?: P2[]
  trigger: number | 'dog'
}

export interface Chapter {
  id: string
  title: string
  bed: 'canyon' | 'town' | 'woods' | 'shore'
  walkSpeed: number
  gait: 'light' | 'tired' | 'calm'
  surface: Surface
  prints: boolean
  whistle: 'honest' | 'misleading' | 'companion'
  map: boolean
  main: PathPt[]
  branches: { path: PathPt[]; bridge?: boolean }[]
  areas: Area[]
  dog: DogNode[]
  witnesses?: Witness[]
  disturbances?: { kind: 'crate' | 'pigeons' | 'basket' | 'cats' | 'broom'; at: P2 }[]
  falseSources?: { zone: [number, number, number]; answerAt: P3; cue: string }[]
  cameras?: { trigger: [number, number, number]; position: P3; lookAt: P3; fov?: number }[]
  props?: Record<string, unknown>[]
  life?: import('./life').LifeDef[]
  /** the town's ambient people: at a plan point, or along a walk (s meters, side -1/1, branch index or main) */
  ambient?: {
    idle: import('./characters').FolkIdle
    at?: P2
    face?: P2
    along?: [number, number, number?]
    pair?: boolean
  }[]
  town?: {
    center: P2
    radius: number
    exclude: [number, number, number][]
    wall: P2[]
    gates: [number, number, number, number][]
    tower: number[]
    palace: P2[]
  }
  pines?: { density: number; clear: number }
  home?: { gate: P3; house: P3; facing: P2 }
  exit: [number, number, number] | null
  landmarks: { id: string; at: P2; r: number; glyph: string }[]
  lighting: Light[]
}

export interface WorldData {
  bounds: [number, number, number, number]
  cell: number
  coast: P2[]
  land: { slope: number; max: number; noise: number; noiseScale: number; seabed: number; cliff: number }
  hills: { path: [number, number, number][]; radius: number; falloff: number }[]
  valleys: {
    path: [number, number, number, number][]
    wall: number
    steep: number
    terrace: number
    soften?: { at: P2; radius: number; steep: number }[]
  }[]
  rivers: { path: [number, number, number, number, number][]; dry?: boolean }[]
  roads: { path: [number, number, number][]; width: number }[]
  cliffPath: P2[]
}

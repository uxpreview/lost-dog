// UI state. The engine writes, React reads. Nothing here drives gameplay.

import { create } from 'zustand'

export type Screen = 'loading' | 'title' | 'play' | 'map' | 'end'

export interface MapData {
  routes: Partial<Record<'ch1' | 'ch2' | 'ch3' | 'ch4', [number, number][]>>
  chapter: number
  passed: string[]
  final: boolean
}

interface UIState {
  screen: Screen
  loadProgress: number
  card: string | null
  map: MapData | null
  legend: boolean
  paused: boolean
  muted: boolean
  reached: number
  touch: boolean
  whistleReady: boolean
  fin: boolean
  set: (p: Partial<UIState>) => void
}

export const useUI = create<UIState>((set) => ({
  screen: 'loading',
  loadProgress: 0,
  card: null,
  map: null,
  legend: false,
  paused: false,
  muted: false,
  reached: 0,
  touch: typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches,
  whistleReady: true,
  fin: false,
  set: (p) => set(p),
}))

// Chapter-level save. One walked polyline per chapter, latest play wins, so the
// final map is always one coherent day.

export interface Save {
  reached: number
  routes: Record<string, [number, number][]>
  passed: string[]
}

const KEY = 'tlwh-save-v2'

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Save
      if (typeof s.reached === 'number' && s.routes && Array.isArray(s.passed)) return s
    }
  } catch {
    // private mode or blocked storage: play without saving
  }
  return { reached: 0, routes: {}, passed: [] }
}

export function writeSave(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

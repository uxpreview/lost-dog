// One input bus for keyboard, touch joystick and the whistle button.
// move is camera-relative: x = right, z = forward.

export const input = {
  move: { x: 0, z: 0 },
  joy: { active: false, x: 0, z: 0 },
  whistle: false,
  menu: false,
  any: false,
  lastAny: 0,
}

const keys = new Set<string>()
const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

function recompute() {
  let x = 0
  let z = 0
  if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
  if (input.joy.active) {
    x = input.joy.x
    z = input.joy.z
  }
  const l = Math.hypot(x, z)
  if (l > 1) {
    x /= l
    z /= l
  }
  input.move.x = x
  input.move.z = z
}

export function setJoy(active: boolean, x = 0, z = 0) {
  input.joy.active = active
  input.joy.x = x
  input.joy.z = z
  if (active) touchAny()
  recompute()
}

export function requestWhistle() {
  input.whistle = true
  touchAny()
}

function touchAny() {
  input.any = true
  input.lastAny = performance.now()
}

export function bindKeyboard() {
  const down = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (MOVE.has(e.code)) {
      keys.add(e.code)
      e.preventDefault()
      recompute()
    }
    if (e.code === 'KeyF' || e.code === 'Space') {
      if (!e.repeat) input.whistle = true
      e.preventDefault()
    }
    if (e.code === 'Escape') input.menu = true
    touchAny()
  }
  const up = (e: KeyboardEvent) => {
    if (MOVE.has(e.code)) {
      keys.delete(e.code)
      recompute()
    }
  }
  const blur = () => {
    keys.clear()
    recompute()
  }
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
  }
}

export function clearKeys() {
  keys.clear()
  recompute()
}

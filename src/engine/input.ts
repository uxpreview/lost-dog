// One input bus for keyboard, touch joystick, gamepad and the whistle button.
// move is camera-relative: x = right, z = forward.

export const input = {
  move: { x: 0, z: 0 },
  /** looking around, accumulated since the game last read it: radians of yaw (positive turns the view right) and pitch */
  look: { x: 0, y: 0 },
  /** held turn from the keyboard or the right stick, -1..1 */
  lookRate: { x: 0, y: 0 },
  joy: { active: false, x: 0, z: 0 },
  whistle: false,
  menu: false,
  any: false,
  lastAny: 0,
}

const keys = new Set<string>()
const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
const TURN = new Set(['KeyQ', 'KeyE'])

function recompute() {
  let x = 0
  let z = 0
  if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
  if (pad.active && (pad.x || pad.z)) {
    x = pad.x
    z = pad.z
  }
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
  input.lookRate.x = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0) + pad.lx
  input.lookRate.y = pad.ly
}

// ---------------------------------------------------------------- gamepad
// Left stick or d-pad walks, any face button whistles, Start is the menu.
const pad = { x: 0, z: 0, lx: 0, ly: 0, whistle: false, menu: false, active: false }
export function pollGamepad() {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
  let gp: Gamepad | null = null
  for (const p of pads) if (p && p.connected) gp = gp ?? p
  if (!gp) {
    if (pad.active) {
      pad.active = false
      pad.x = pad.z = pad.lx = pad.ly = 0
      recompute()
    }
    return
  }
  let x = gp.axes[0] ?? 0
  let z = -(gp.axes[1] ?? 0)
  if (gp.buttons[14]?.pressed) x = -1
  if (gp.buttons[15]?.pressed) x = 1
  if (gp.buttons[12]?.pressed) z = 1
  if (gp.buttons[13]?.pressed) z = -1
  const m = Math.hypot(x, z)
  const k = m < 0.18 ? 0 : Math.min(1, (m - 0.18) / 0.72) / (m || 1)
  pad.x = x * k
  pad.z = z * k
  const dead = (v: number) => (Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8)
  pad.lx = dead(gp.axes[2] ?? 0)
  pad.ly = dead(gp.axes[3] ?? 0)
  pad.active = true
  const w = [0, 1, 2, 3].some((i) => gp!.buttons[i]?.pressed)
  if (w && !pad.whistle) requestWhistle()
  pad.whistle = w
  const mn = !!gp.buttons[9]?.pressed
  if (mn && !pad.menu) input.menu = true
  pad.menu = mn
  if (m > 0.18) touchAny()
  recompute()
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
    if (MOVE.has(e.code) || TURN.has(e.code)) {
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
    if (MOVE.has(e.code) || TURN.has(e.code)) {
      keys.delete(e.code)
      recompute()
    }
  }
  const blur = () => {
    keys.clear()
    recompute()
  }
  // Looking around: drag with the mouse anywhere, or with a finger that
  // starts in the upper part of the screen (the lower part walks).
  let lookId: number | null = null
  let lx = 0
  let ly = 0
  const pdown = (e: PointerEvent) => {
    if (lookId !== null || (e.target as HTMLElement | null)?.closest?.('button, .menu, .lwh-map, .fin')) return
    if (e.pointerType === 'touch' && !isLookZone(e.clientY)) return
    lookId = e.pointerId
    lx = e.clientX
    ly = e.clientY
  }
  const pmove = (e: PointerEvent) => {
    if (e.pointerId !== lookId) return
    const k = e.pointerType === 'touch' ? 0.0075 : 0.0052
    input.look.x += (e.clientX - lx) * k
    input.look.y += (e.clientY - ly) * k * 0.7
    lx = e.clientX
    ly = e.clientY
    touchAny()
  }
  const pup = (e: PointerEvent) => {
    if (e.pointerId === lookId) lookId = null
  }
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)
  window.addEventListener('pointerdown', pdown)
  window.addEventListener('pointermove', pmove)
  window.addEventListener('pointerup', pup)
  window.addEventListener('pointercancel', pup)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
    window.removeEventListener('pointerdown', pdown)
    window.removeEventListener('pointermove', pmove)
    window.removeEventListener('pointerup', pup)
    window.removeEventListener('pointercancel', pup)
  }
}

/** On a touchscreen the upper part of the screen looks around and the rest walks. */
export function isLookZone(clientY: number) {
  return clientY < window.innerHeight * 0.4
}

export function clearKeys() {
  keys.clear()
  recompute()
}

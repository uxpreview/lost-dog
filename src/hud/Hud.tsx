// Everything drawn over the world: the title, the place names, the controls,
// the menu, the map and the last screen. No objective text, no markers, no
// numbers, ever. The only red here is the dotted route line of the wordmark,
// which is the same line the map draws: the route is him.

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Game } from '../engine/game'
import { CHAPTERS } from '../engine/game'
import { useUI } from '../engine/store'
import { input, requestWhistle, setJoy } from '../engine/input'
import { audio } from '../engine/audio'
import { COLLAR, PAL } from '../engine/palette'
import { MapScreen } from './MapScreen'

const NUMERALS = ['I', 'II', 'III', 'IV']

export function Hud({ game }: { game: Game | null }) {
  const screen = useUI((s) => s.screen)
  const map = useUI((s) => s.map)
  const fin = useUI((s) => s.fin)
  return (
    <div className="hud">
      {game && screen === 'title' && <Title game={game} />}
      {(screen === 'play' || screen === 'map') && game && <Play game={game} />}
      <Card />
      {map && game && <MapScreen {...map} onDone={() => game.mapDone()} />}
      {fin && <Fin />}
      <Loading gone={screen !== 'loading'} />
    </div>
  )
}

// ------------------------------------------------------------------ the route line

/** The dotted line of the day, drawn left to right, ending in the one warm light. */
function RouteLine({ className = '', delay = 0 }: { className?: string; delay?: number }) {
  const d = 'M6 34 C 46 8, 86 52, 132 30 S 214 6, 262 28 S 338 54, 392 30 S 470 10, 520 26'
  return (
    <svg className={'route-line ' + className} viewBox="0 0 560 60" aria-hidden style={{ '--d': `${delay}s` } as CSSProperties}>
      <defs>
        <mask id="route-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="560" height="60">
          <path className="route-mask" d={d} pathLength={1} fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" />
        </mask>
      </defs>
      <path d={d} fill="none" stroke={COLLAR} strokeWidth="4.2" strokeLinecap="round" strokeDasharray="0.1 11" mask="url(#route-reveal)" />
      <circle className="route-home" cx="538" cy="27" r="6" fill={PAL.windowGlow} />
    </svg>
  )
}

// ------------------------------------------------------------------ loading

/** Paper, and the line beginning. Compositor-only motion: it moves while the world is being built. */
function Loading({ gone }: { gone: boolean }) {
  const [mounted, setMounted] = useState(true)
  useEffect(() => {
    if (!gone) return
    const id = setTimeout(() => setMounted(false), 1600)
    return () => clearTimeout(id)
  }, [gone])
  if (!mounted) return null
  return (
    <div className={'loading' + (gone ? ' gone' : '')} aria-hidden={gone}>
      <div className="loading-dots" role="progressbar" aria-label="Loading">
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} style={{ '--i': i, background: i === 6 ? PAL.windowGlow : COLLAR } as CSSProperties} />
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ title

function Letters({ text, from }: { text: string; from: number }) {
  return (
    <span className="line">
      {[...text].map((c, i) => (
        <span key={i} className="ch" style={{ '--i': from + i } as CSSProperties}>
          {c === ' ' ? ' ' : c}
        </span>
      ))}
    </span>
  )
}

function Title({ game }: { game: Game }) {
  const reached = useUI((s) => s.reached)
  const touch = useUI((s) => s.touch)
  const [leaving, setLeaving] = useState(false)
  const [chapters, setChapters] = useState(false)
  const go = (ci: number | null) => {
    if (leaving) return
    audio.unlock()
    setLeaving(true)
    setTimeout(() => {
      if (ci === null || ci === 0) game.begin()
      else game.jumpTo(ci)
    }, 1100)
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.code === 'Enter' || e.code === 'Space') && !(e.target as HTMLElement)?.closest?.('button')) go(null)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  const resume = reached > 0 && reached < CHAPTERS.length ? reached : null
  return (
    <div className={'title' + (leaving ? ' leaving' : '')}>
      <div className="title-scrim" />
      <div className="lockup">
        <div className="wordmark">
          <p className="kicker">A wordless walking game</p>
          <h1 aria-label="The Long Way Home">
            <Letters text="The Long" from={0} />
            <Letters text="Way Home" from={8} />
          </h1>
          <RouteLine delay={1.5} />
        </div>
        {!chapters ? (
          <nav className="title-nav">
            <button className="act primary" onClick={() => go(null)}>
              <span>Begin</span>
              <Arrow />
            </button>
            {resume !== null && (
              <button className="act" onClick={() => go(resume)}>
                <span>Continue</span>
                <em>{CHAPTERS[resume].title}</em>
              </button>
            )}
            {reached > 0 && (
              <button className="act" onClick={() => setChapters(true)}>
                <span>Chapters</span>
              </button>
            )}
          </nav>
        ) : (
          <nav className="title-nav">
            <ChapterList reached={reached} onPick={(i) => go(i)} />
            <button className="act back" onClick={() => setChapters(false)}>
              <span>Back</span>
            </button>
          </nav>
        )}
      </div>
      <ul className="title-foot" aria-label="Before you begin">
        <li>
          <Headphones /> Best with sound
        </li>
        <li>About fifteen minutes</li>
        <li>{touch ? 'One thumb' : 'Keyboard, touch or gamepad'}</li>
      </ul>
    </div>
  )
}

function ChapterList({ reached, onPick }: { reached: number; onPick: (i: number) => void }) {
  return (
    <ol className="chapters">
      {CHAPTERS.map((c, i) => (
        <li key={c.id}>
          <button className="chapter" disabled={i > reached} onClick={() => onPick(i)}>
            <i>{NUMERALS[i]}</i>
            <span>{c.title}</span>
            <em>{c.time}</em>
          </button>
        </li>
      ))}
    </ol>
  )
}

// ------------------------------------------------------------------ the place name

function Card() {
  const card = useUI((s) => s.card)
  const [shown, setShown] = useState<number | null>(null)
  useEffect(() => {
    if (card !== null) setShown(card)
  }, [card])
  const c = shown !== null ? CHAPTERS[shown] : null
  return (
    <div className={'card' + (card !== null ? ' on' : '') + (shown !== null && shown >= 2 ? ' dark' : '')} aria-live="polite">
      {c && shown !== null && (
        <>
          <span className="card-n">{NUMERALS[shown]}</span>
          <span className="card-name">{c.title}</span>
          <span className="card-time">{c.time}</span>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ play

function Play({ game }: { game: Game }) {
  const legend = useUI((s) => s.legend)
  const touch = useUI((s) => s.touch)
  const paused = useUI((s) => s.paused)
  const screen = useUI((s) => s.screen)
  const cine = useUI((s) => s.cine)
  const [t, setT] = useState(touch)
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const f = (e: PointerEvent) => setT(e.pointerType === 'touch')
    window.addEventListener('pointerdown', f)
    return () => window.removeEventListener('pointerdown', f)
  }, [])
  // a mouse left alone gets out of the picture
  useEffect(() => {
    let id = 0
    const wake = () => {
      setIdle(false)
      clearTimeout(id)
      id = window.setTimeout(() => setIdle(true), 2600)
    }
    wake()
    window.addEventListener('pointermove', wake)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pointermove', wake)
    }
  }, [])
  useEffect(() => {
    document.body.classList.toggle('no-cursor', idle && !paused && screen === 'play' && !t)
    return () => document.body.classList.remove('no-cursor')
  }, [idle, paused, screen, t])
  if (screen === 'map') return null
  return (
    <div className={'play' + (cine ? ' cine' : '') + (idle && !t ? ' idle' : '')}>
      {t && <Joystick />}
      <WhistleButton touch={t} />
      <button className="menu-btn" aria-label="Menu" onClick={() => useUI.getState().set({ paused: true })}>
        <span />
        <span />
      </button>
      {legend && !cine && <Legend touch={t} />}
      {paused && <Menu game={game} />}
    </div>
  )
}

function Legend({ touch }: { touch: boolean }) {
  return (
    <div className="legend">
      {touch ? (
        <>
          <div className="legend-item">
            <Thumb />
            <span>Drag to walk</span>
          </div>
          <div className="legend-item">
            <WhistleGlyph />
            <span>Whistle</span>
          </div>
        </>
      ) : (
        <>
          <div className="legend-item">
            <div className="keys">
              <kbd className="k-w">W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd>
            </div>
            <span>Walk</span>
          </div>
          <div className="legend-item">
            <kbd className="wide">F</kbd>
            <span>Whistle</span>
          </div>
        </>
      )}
    </div>
  )
}

function WhistleButton({ touch }: { touch: boolean }) {
  const ready = useUI((s) => s.whistleReady)
  const legend = useUI((s) => s.legend)
  return (
    <button
      className={'whistle-btn' + (ready ? '' : ' cooling') + (touch ? ' touch' : '') + (legend && touch ? ' hint' : '')}
      aria-label="Whistle"
      onPointerDown={(e) => {
        e.stopPropagation()
        requestWhistle()
        // a small answer in the hand, where the phone has one to give
        if (e.pointerType === 'touch') navigator.vibrate?.(12)
      }}
    >
      <WhistleGlyph />
    </button>
  )
}

function Joystick() {
  const [st, setSt] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null)
  const id = useRef<number | null>(null)
  useEffect(() => {
    const R = 56
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || id.current !== null) return
      if ((e.target as HTMLElement).closest('button')) return
      if (e.clientX < window.innerWidth * 0.32 && e.clientY > window.innerHeight * 0.6) return
      id.current = e.pointerId
      setSt({ ox: e.clientX, oy: e.clientY, x: 0, y: 0 })
      setJoy(true, 0, 0)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id.current) return
      setSt((s) => {
        if (!s) return s
        let dx = e.clientX - s.ox
        let dy = e.clientY - s.oy
        const l = Math.hypot(dx, dy)
        if (l > R) {
          dx *= R / l
          dy *= R / l
        }
        const nx = dx / R
        const ny = dy / R
        const m = Math.hypot(nx, ny)
        const k = m < 0.12 ? 0 : (m - 0.12) / 0.88 / (m || 1)
        setJoy(true, nx * k, -ny * k)
        return { ...s, x: dx, y: dy }
      })
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id.current) return
      id.current = null
      setSt(null)
      setJoy(false)
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])
  if (!st) return null
  return (
    <div className="joy" style={{ left: st.ox, top: st.oy }}>
      <div className="joy-knob" style={{ transform: `translate(${st.x}px, ${st.y}px)` }} />
    </div>
  )
}

function Menu({ game }: { game: Game }) {
  const reached = useUI((s) => s.reached)
  const muted = useUI((s) => s.muted)
  const [full, setFull] = useState(!!document.fullscreenElement)
  const canFull = typeof document.documentElement.requestFullscreen === 'function'
  const close = () => useUI.getState().set({ paused: false })
  useEffect(() => {
    input.menu = false
    const f = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  return (
    <div className="menu" onClick={close}>
      <div className="menu-panel" role="dialog" aria-label="Paused" onClick={(e) => e.stopPropagation()}>
        <p className="menu-mark">The Long Way Home</p>
        <button className="act primary" onClick={close}>
          <span>Keep walking</span>
          <Arrow />
        </button>
        <ChapterList reached={reached} onPick={(i) => game.jumpTo(i)} />
        <div className="menu-row">
          <button
            className="pill"
            aria-pressed={!muted}
            onClick={() => {
              audio.setMuted(!muted)
              useUI.getState().set({ muted: !muted })
            }}
          >
            {muted ? <SoundOff /> : <SoundOn />}
            <span>{muted ? 'Sound off' : 'Sound on'}</span>
          </button>
          {canFull && (
            <button
              className="pill"
              aria-pressed={full}
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen()
                else void document.documentElement.requestFullscreen().catch(() => {})
              }}
            >
              <Expand />
              <span>{full ? 'Windowed' : 'Full screen'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Fin() {
  const [again, setAgain] = useState(false)
  const [shared, setShared] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setAgain(true), 5200)
    return () => clearTimeout(id)
  }, [])
  const share = async () => {
    const data = { title: 'The Long Way Home', text: 'A wordless walking game. A boy, his dog, and one day on the coast.', url: location.origin + location.pathname }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(data.url)
        setShared(true)
        setTimeout(() => setShared(false), 2400)
      }
    } catch {
      // dismissed: nothing to do
    }
  }
  return (
    <div className="fin">
      <div className="fin-stars" aria-hidden />
      <div className="fin-lockup">
        <h1 aria-label="The Long Way Home">
          <Letters text="The Long" from={0} />
          <Letters text="Way Home" from={8} />
        </h1>
        <RouteLine delay={2.2} />
      </div>
      <div className={'fin-nav' + (again ? ' on' : '')}>
        <button className="act" onClick={() => location.reload()}>
          <span>Walk it again</span>
        </button>
        <button className="act" onClick={() => void share()}>
          <span>{shared ? 'Link copied' : 'Share'}</span>
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ glyphs

function Arrow() {
  return (
    <svg className="arrow" viewBox="0 0 28 12" width="28" height="12" aria-hidden>
      <path d="M1 6h24M20 1.5 25.5 6 20 10.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WhistleGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
      <circle cx="12" cy="18" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 11.5 H27 V16 H18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="12" cy="18" r="1.8" fill="currentColor" />
    </svg>
  )
}

function Headphones() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" fill="currentColor" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" fill="currentColor" />
    </svg>
  )
}

function Thumb() {
  return (
    <svg viewBox="0 0 64 64" width="40" height="40" aria-hidden className="thumb">
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <circle cx="32" cy="32" r="9" fill="currentColor" className="thumb-dot" />
    </svg>
  )
}

function SoundOn() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function SoundOff() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function Expand() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

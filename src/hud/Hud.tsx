// Everything drawn over the world. Place names, glyphs, and the map. No
// objective text, no markers, no numbers, ever.

import { useEffect, useRef, useState } from 'react'
import type { Game } from '../engine/game'
import { CHAPTERS } from '../engine/game'
import { useUI } from '../engine/store'
import { input, requestWhistle, setJoy } from '../engine/input'
import { audio } from '../engine/audio'
import { MapScreen } from './MapScreen'

export function Hud({ game }: { game: Game | null }) {
  const screen = useUI((s) => s.screen)
  const map = useUI((s) => s.map)
  const fin = useUI((s) => s.fin)
  return (
    <div className="hud">
      {screen === 'loading' && <Loading />}
      {screen === 'title' && game && <Title game={game} />}
      {(screen === 'play' || screen === 'map') && game && <Play game={game} />}
      <Card />
      {map && game && <MapScreen {...map} onDone={() => game.mapDone()} />}
      {fin && <Fin />}
    </div>
  )
}

function Loading() {
  const p = useUI((s) => s.loadProgress)
  return (
    <div className="loading">
      <div className="loading-line">
        <span style={{ transform: `scaleX(${0.08 + p * 0.92})` }} />
      </div>
    </div>
  )
}

function Title({ game }: { game: Game }) {
  const reached = useUI((s) => s.reached)
  const [leaving, setLeaving] = useState(false)
  const [chapters, setChapters] = useState(false)
  const go = (ci: number | null) => {
    if (leaving) return
    audio.unlock()
    setLeaving(true)
    setTimeout(() => {
      if (ci === null || ci === 0) game.begin()
      else game.jumpTo(ci)
    }, 900)
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') go(null)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  return (
    <div className={'title' + (leaving ? ' leaving' : '')}>
      <div className="bars top" />
      <div className="bars bottom" />
      <div className="title-actions">
        {!chapters ? (
          <>
            <button className="begin" onClick={() => go(null)} aria-label="Begin">
              <span className="begin-ring" />
              <span className="begin-label">Begin</span>
            </button>
            {reached > 0 && (
              <button className="quiet" onClick={() => setChapters(true)}>
                Chapters
              </button>
            )}
          </>
        ) : (
          <ChapterList reached={reached} onPick={(i) => go(i)} onBack={() => setChapters(false)} />
        )}
        <div className="sound-hint" aria-hidden>
          <Headphones /> <span>sound on</span>
        </div>
      </div>
    </div>
  )
}

function ChapterList({ reached, onPick, onBack }: { reached: number; onPick: (i: number) => void; onBack?: () => void }) {
  return (
    <div className="chapters">
      {CHAPTERS.map((c, i) => (
        <button key={c.id} className="chapter" disabled={i > reached} onClick={() => onPick(i)}>
          {c.title}
        </button>
      ))}
      {onBack && (
        <button className="quiet" onClick={onBack} aria-label="Back">
          ←
        </button>
      )}
    </div>
  )
}

function Card() {
  const card = useUI((s) => s.card)
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    if (card) setShown(card)
  }, [card])
  const dark = shown === 'The Woods' || shown === 'The Shore'
  return (
    <div className={'card' + (card ? ' on' : '') + (dark ? ' dark' : '')} aria-live="polite">
      {shown}
    </div>
  )
}

function Play({ game }: { game: Game }) {
  const legend = useUI((s) => s.legend)
  const touch = useUI((s) => s.touch)
  const paused = useUI((s) => s.paused)
  const screen = useUI((s) => s.screen)
  const [t, setT] = useState(touch)
  useEffect(() => {
    const f = (e: PointerEvent) => setT(e.pointerType === 'touch')
    window.addEventListener('pointerdown', f)
    return () => window.removeEventListener('pointerdown', f)
  }, [])
  if (screen === 'map') return null
  return (
    <>
      {t && <Joystick />}
      <WhistleButton touch={t} />
      <button className="menu-btn" aria-label="Menu" onClick={() => useUI.getState().set({ paused: true })}>
        <span />
        <span />
      </button>
      {legend && <Legend touch={t} />}
      {paused && <Menu game={game} />}
    </>
  )
}

function Legend({ touch }: { touch: boolean }) {
  return (
    <div className="legend">
      {touch ? (
        <>
          <div className="legend-item">
            <Thumb />
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
          </div>
          <div className="legend-item">
            <kbd className="wide">F</kbd>
            <WhistleGlyph />
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
  const close = () => useUI.getState().set({ paused: false })
  useEffect(() => {
    input.menu = false
  }, [])
  return (
    <div className="menu" onClick={close}>
      <div className="menu-panel" onClick={(e) => e.stopPropagation()}>
        <button className="menu-item primary" onClick={close}>
          Resume
        </button>
        <ChapterList reached={reached} onPick={(i) => game.jumpTo(i)} />
        <button
          className="menu-item"
          onClick={() => {
            audio.setMuted(!muted)
            useUI.getState().set({ muted: !muted })
          }}
          aria-label={muted ? 'Sound off' : 'Sound on'}
        >
          {muted ? <SoundOff /> : <SoundOn />}
        </button>
      </div>
    </div>
  )
}

function Fin() {
  const [again, setAgain] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setAgain(true), 5200)
    return () => clearTimeout(id)
  }, [])
  return (
    <div className="fin">
      <h1>The Long Way Home</h1>
      <button className={'quiet again' + (again ? ' on' : '')} onClick={() => location.reload()}>
        Begin again
      </button>
    </div>
  )
}

// ------------------------------------------------------------------ glyphs

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
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" fill="currentColor" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" fill="currentColor" />
    </svg>
  )
}

function Thumb() {
  return (
    <svg viewBox="0 0 64 64" width="54" height="54" aria-hidden className="thumb">
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <circle cx="32" cy="32" r="9" fill="currentColor" className="thumb-dot" />
    </svg>
  )
}

function SoundOn() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function SoundOff() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

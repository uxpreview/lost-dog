import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Game } from './engine/game'
import { bindKeyboard, input } from './engine/input'
import { useUI } from './engine/store'
import { audio } from './engine/audio'
import { Hud } from './hud/Hud'
import './hud/hud.css'

const params = new URLSearchParams(location.search)
const coarse = matchMedia('(pointer: coarse)').matches
const QUALITY = params.has('q') ? Number(params.get('q')) : coarse ? 0.6 : 1

export function Root() {
  const [game, setGame] = useState<Game | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const unbind = bindKeyboard()
    // let the loading screen paint before the world is generated
    const id = setTimeout(() => {
      const g = new Game(QUALITY, (p) => useUI.getState().set({ loadProgress: p }))
      ;(window as unknown as { __game: Game; __input: typeof input }).__game = g
      ;(window as unknown as { __input: typeof input }).__input = input
      setGame(g)
      useUI.getState().set({ screen: 'title' })
      const ch = params.get('ch')
      if (ch !== null) {
        audio.unlock()
        g.jumpTo(Number(ch))
      }
    }, 60)
    return () => {
      clearTimeout(id)
      unbind()
    }
  }, [])

  return (
    <>
      <Canvas
        className="stage"
        flat
        linear
        shadows="soft"
        dpr={[1, QUALITY > 0.7 ? 2 : 1.5]}
        gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') }}
        style={{ position: 'fixed', inset: 0, touchAction: 'none' }}
      >
        {game && <Engine game={game} />}
      </Canvas>
      <Hud game={game} />
    </>
  )
}

function Engine({ game }: { game: Game }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  useEffect(() => {
    gl.shadowMap.enabled = true
    gl.shadowMap.type = THREE.PCFSoftShadowMap
    gl.setClearColor(0x000000)
  }, [gl])
  useEffect(() => {
    game.resize(size.width, size.height, dpr)
  }, [game, size.width, size.height, dpr])
  useFrame((_, dt) => {
    game.update(dt)
    game.render(gl)
  }, 1)
  return null
}

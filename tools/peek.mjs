// Ask the running game a question: node tools/peek.mjs '<js returning a value>' [ch]
// e.g. node tools/peek.mjs 'window.__game.world.ground(68, 34)'. Dev server must be running.
import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const p = await b.newPage({ viewport: { width: 320, height: 200 } })
p.on('pageerror', (e) => console.log('page error:', e.message))
const t0 = Date.now()
await p.goto(`${BASE}/?shot${process.argv[3] ? '&ch=' + process.argv[3] : ''}`)
await p.waitForFunction(() => window.__game, null, { timeout: 180000 })
console.log('loaded in', Date.now() - t0, 'ms')
console.log(JSON.stringify(await p.evaluate(process.argv[2])))
await b.close()

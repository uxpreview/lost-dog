// Stills for judging the picture: node tools/shots.mjs <outdir> [spec...]
// spec: title | <ch>:<progress>[:p]   (p = portrait). Dev server must be running.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const out = process.argv[2]
const specs = process.argv.slice(3)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const VP = { d: { width: 1280, height: 720 }, p: { width: 390, height: 844 } }
const queue = [...specs]
const worker = async () => { for (let spec; (spec = queue.shift()); ) {
  const [a, b, c] = spec.split(':')
  const portrait = a === 'title' ? b === 'p' : c === 'p'
  const page = await browser.newPage({ viewport: portrait ? VP.p : VP.d })
  page.on('pageerror', (e) => console.log(spec, 'page error:', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log(spec, 'console:', m.text()) })
  if (a === 'title') {
    await page.goto(`${BASE}/?shot`)
    await page.waitForFunction(() => window.__game, null, { timeout: 180000 })
    await page.waitForTimeout(Number(process.env.TITLE_WAIT ?? 5000))
  } else {
    await page.goto(`${BASE}/?shot&ch=${a}`)
    await page.waitForFunction(() => window.__game && window.__game.mode === 'play', null, { timeout: 180000 })
    await page.evaluate(async (want) => {
      const g = window.__game
      for (let i = 0; i < 600 && g.progress < want && g.mode === 'play'; i++) g.autopilot(1)
      g.cardTimer = 0.001
    }, Number(b))
    await page.waitForTimeout(Number(process.env.SETTLE ?? 2500))
  }
  const f = join(out, spec.replace(/[:.]/g, '_') + '.jpg')
  await page.screenshot({ path: f, type: 'jpeg', quality: 86, timeout: 120000 })
  console.log('shot', f)
  await page.close()
} }
await Promise.all(Array.from({ length: Number(process.env.JOBS ?? 3) }, worker))
await browser.close()

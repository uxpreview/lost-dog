// Stills of the ending: node tools/ending.mjs <outdir> [p for portrait]. Dev server must be running.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const out = process.argv[2]
const portrait = process.argv[3] === 'p'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: portrait ? { width: 390, height: 844 } : { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('page error:', e.message))
await page.goto(`${BASE}/?shot&ch=3`)
await page.waitForFunction(() => window.__game && window.__game.mode === 'play', null, { timeout: 180000 })
await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 900 && g.mode === 'play'; i++) g.autopilot(1) })
const snap = async (name) => { await page.waitForTimeout(1200); await page.screenshot({ path: join(out, name + (portrait ? '_p' : '') + '.jpg'), type: 'jpeg', quality: 86, timeout: 120000 }); console.log('shot', name) }
for (const t of [2.6, 6.9, 10.5, 13.4]) {
  await page.evaluate((t) => { const g = window.__game; while (g.cutT < t) g.simulate(0.1) }, t)
  await snap('end_' + t)
}
await page.evaluate(() => { const g = window.__game; while (g.cutT < 16.7) g.simulate(0.1) })
await page.waitForTimeout(4000)
await snap('map_early')
await page.waitForTimeout(Number(process.env.MAP_WAIT ?? 30000))
await snap('map_late')
await page.mouse.click(200, 200)
await page.keyboard.press('Enter')
await page.waitForTimeout(7000)
await snap('fin')
await browser.close()

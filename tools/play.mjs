// Stills of the things a hand finds: the opening scene, the whistle, looking
// around, off the path, the log, the rim. node tools/play.mjs <outdir>
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const out = process.argv[2]
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('page error:', e.message))
const snap = async (name, wait = 1300) => { await page.waitForTimeout(wait); await page.screenshot({ path: join(out, name + '.jpg'), type: 'jpeg', quality: 86, timeout: 120000 }); console.log('shot', name) }
const sim = (s) => page.evaluate((s) => window.__game.simulate(s), s)
await page.goto(`${BASE}/?shot`)
await page.waitForFunction(() => window.__game, null, { timeout: 180000 })
await page.waitForTimeout(1500)
// the opening scene, in game time
await page.evaluate(() => { const g = window.__game; g.begin(); g.simulate(2.6) })
await snap('1_intro_kneel')
await sim(2.7); await snap('2_intro_bow')
await sim(1.3); await snap('3_intro_bounce')
await sim(4.5); await snap('4_handed_over')
// bolt, then whistle with him ahead
await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 && g.dog.mode !== 'run'; i++) g.simulate(1); g.simulate(6) })
await snap('5_whistle_hint')
await page.evaluate(() => { window.__input.whistle = true; window.__game.simulate(2.1) })
await snap('6_whistle_answer')
// off the path, and looking around
await page.evaluate(() => { const g = window.__game; g.autopilot(6); window.__input.look.x = 1.2; window.__input.look.y = -0.3; g.simulate(0.4) })
await snap('7_look')
await page.evaluate(() => { const g = window.__game; const st = { x0: g.px, z0: g.pz }; window.__input.move.x = 1; window.__input.move.z = 0; g.simulate(4); window.__input.move.x = 0; window.__offPath = Math.hypot(g.px - st.x0, g.pz - st.z0) })
console.log('walked sideways off the path (m):', await page.evaluate(() => window.__offPath.toFixed(1)), 'walkable there:', await page.evaluate(() => !!window.__game.world.corridor(window.__game.px, window.__game.pz, 0)))
await snap('8_off_path')
// the log
await page.evaluate(() => { const g = window.__game; const want = g.line.project(20, -299); for (let i = 0; i < 800 && g.boyS < want && g.mode === 'play'; i++) g.autopilot(0.2, 1 / 30, false) })
console.log('on the log: boy y', await page.evaluate(() => window.__game.py.toFixed(2)), 'surface', await page.evaluate(() => window.__game.world.surfaceAt(window.__game.px, window.__game.pz, 0)))
await snap('9_log')
// the rim
await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 600 && g.mode === 'play'; i++) g.autopilot(0.5) })
console.log('at the rim: mode', await page.evaluate(() => window.__game.mode + ' ' + window.__game.cutKind))
await sim(3); await snap('10_rim')
await sim(5)
console.log('after the hold: mode', await page.evaluate(() => window.__game.mode))
await browser.close()

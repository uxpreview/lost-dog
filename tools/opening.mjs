// Stills of the first half minute, played for real from the title: node tools/opening.mjs <outdir>
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
await page.goto(`${BASE}/?shot`, { waitUntil: 'commit' })
await page.waitForTimeout(250)
const snap = async (name) => { await page.screenshot({ path: join(out, name + '.jpg'), type: 'jpeg', quality: 86, timeout: 120000 }); console.log('shot', name) }
await snap('0_loading')
await page.waitForFunction(() => window.__game, null, { timeout: 180000 })
await page.waitForTimeout(6000)
await page.getByRole('button', { name: 'Begin' }).click()
await page.waitForTimeout(1500)
await snap('1_leaving')
await page.waitForTimeout(2500)
await snap('2_card')
// walk and whistle
await page.keyboard.down('KeyW')
await page.waitForTimeout(3000)
await page.keyboard.press('KeyF')
await page.waitForTimeout(700)
await snap('3_whistle')
await page.keyboard.up('KeyW')
await page.evaluate(() => window.__game.simulate(9))
await page.waitForTimeout(1500)
await snap('4_rest')
await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 && g.dog.mode !== 'stare'; i++) g.simulate(1); g.simulate(0.6) })
await page.waitForTimeout(1200)
await snap('5_stare')
await page.evaluate(() => window.__game.simulate(2.2))
await page.waitForTimeout(1200)
await snap('6_bolt')
await browser.close()

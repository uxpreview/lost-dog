// Stills of everything drawn over the world: node tools/ui.mjs <outdir>. Dev server must be running.
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
for (const [tag, viewport, touch] of [['d', { width: 1440, height: 810 }, false], ['p', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('page error:', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()) })
  const snap = async (name) => { await page.screenshot({ path: join(out, `${name}_${tag}.jpg`), type: 'jpeg', quality: 88, timeout: 120000 }); console.log('shot', name, tag) }
  await page.addInitScript(() => localStorage.setItem('tlwh-save-v2', JSON.stringify({ reached: 2, routes: {}, passed: [] })))
  await page.goto(`${BASE}/?shot`)
  await page.waitForTimeout(700)
  await snap('loading')
  await page.waitForFunction(() => window.__game, null, { timeout: 180000 })
  await page.waitForTimeout(9000)
  await snap('title')
  await page.getByRole('button', { name: 'Chapters' }).click()
  await page.waitForTimeout(1500)
  await snap('title_chapters')
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.waitForTimeout(5200)
  await snap('card')
  await page.waitForTimeout(5000)
  await snap('legend')
  await page.evaluate(() => { window.__input.menu = true })
  await page.waitForTimeout(2500)
  await snap('menu')
  await ctx.close()
}
await browser.close()

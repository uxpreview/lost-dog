// The session probe: the numbers docs/next-session.md asks for, measured.
//
//   beats   autopilot walks each chapter end to end; reports the seconds
//           between noticeable moments (dog acts, reactions, traversal, life)
//   shots   one screenshot per chapter at desktop (1280x720) and portrait
//           (390x844) into renders/probe/<label>/
//   perf    triangles and draw calls per frame at the nine spots below
//
// Needs the dev server (npm run dev). Software WebGL, so frame times here mean
// nothing; triangle and call counts are exact.
//
// Usage: node tools/probe.mjs [beats|shots|perf|all] [label]

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const what = process.argv[2] ?? 'all'
const label = process.argv[3] ?? 'now'
const out = join(ROOT, 'renders', 'probe', label)
mkdirSync(out, { recursive: true })

// the nine spots: [chapter, progress along the dog's route]
const SPOTS = [
  [0, 0.12], [0, 0.5], [0, 0.95],
  [1, 0.15], [1, 0.45], [1, 0.8],
  [2, 0.3], [2, 0.85],
  [3, 0.5],
]
// the screenshot per chapter
const SHOT_AT = [0.4, 0.42, 0.35, 0.55]

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

async function open(ch, viewport) {
  const p = await browser.newPage({ viewport })
  p.on('pageerror', (e) => console.log('  page error:', e.message))
  await p.goto(`${BASE}/?shot&ch=${ch}`)
  await p.waitForFunction(() => window.__game && window.__game.mode === 'play', null, { timeout: 180000 })
  return p
}

/** Autopilot until the boy is `p` of the way along the chapter. */
async function walkTo(page, p) {
  await page.evaluate(async (want) => {
    const g = window.__game
    for (let i = 0; i < 400 && g.progress < want && g.mode === 'play'; i++) g.autopilot(2)
    g.cardTimer = 0.001
  }, p)
  // let the real loop draw a few frames with the camera settled
  await page.waitForTimeout(1500)
}

const report = { label, when: new Date().toISOString() }

if (what === 'beats' || what === 'all') {
  report.beats = []
  for (let ch = 0; ch < 4; ch++) {
    const page = await open(ch, { width: 320, height: 200 })
    const r = await page.evaluate((ch) => {
      const g = window.__game
      g.autopilot(900)
      // the woods run on into the shore with no map: report the chapter walked
      return g.ci !== ch ? g.prevReport : g.beatReport()
    }, ch)
    console.log(`ch${ch + 1}: ${r.seconds}s walked, ${r.beats} beats, median gap ${r.median}s, max ${r.max}s, gaps over 25s: ${r.over25}`, JSON.stringify(r.kinds))
    report.beats.push({ ch: ch + 1, ...r })
    await page.close()
  }
}

if (what === 'shots' || what === 'all') {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 720 }], ['portrait', { width: 390, height: 844 }]]) {
    for (let ch = 0; ch < 4; ch++) {
      const page = await open(ch, viewport)
      await walkTo(page, SHOT_AT[ch])
      const f = join(out, `ch${ch + 1}-${name}.jpg`)
      await page.screenshot({ path: f, type: 'jpeg', quality: 84 })
      console.log('shot', f)
      await page.close()
    }
  }
}

if (what === 'perf' || what === 'all') {
  report.perf = []
  for (let ch = 0; ch < 4; ch++) {
    const spots = SPOTS.filter((s) => s[0] === ch)
    const page = await open(ch, { width: 1280, height: 720 })
    for (const [, p] of spots) {
      await walkTo(page, p)
      const r = await page.evaluate(() => {
        const g = window.__game
        const i = g.gl.info.render
        return { triangles: i.triangles, calls: i.calls, progress: +g.progress.toFixed(2) }
      })
      console.log(`ch${ch + 1} @${r.progress}: ${r.triangles.toLocaleString()} triangles, ${r.calls} draw calls`)
      report.perf.push({ ch: ch + 1, ...r })
    }
    await page.close()
  }
}

writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1))
await browser.close()

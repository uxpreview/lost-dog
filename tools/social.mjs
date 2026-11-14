// The share image and the app icons, rendered from the game itself.
//   node tools/social.mjs      (dev server running)  ->  public/og.jpg, public/icon-180.png, public/icon-512.png
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
{
  // the title screen as it stands, without the small print
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.goto(`${BASE}/?shot`)
  await page.waitForFunction(() => window.__game, null, { timeout: 180000 })
  await page.addStyleTag({ content: '.title-nav, .title-foot { display: none !important } .lockup { bottom: 84px !important } .lockup h1 { font-size: 128px !important }' })
  await page.waitForTimeout(9000)
  await page.screenshot({ path: join(ROOT, 'public', 'og.jpg'), type: 'jpeg', quality: 88, timeout: 120000 })
  console.log('og.jpg')
  await page.close()
}
for (const size of [180, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(`<body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}"><rect width="32" height="32" fill="#1b2644"/><path d="M6 22c4-6 6 2 10-3s5-1 7-5" fill="none" stroke="#D0342C" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0.1 4.9"/><circle cx="25" cy="11.5" r="3" fill="#F2B950"/></svg></body>`)
  await page.screenshot({ path: join(ROOT, 'public', `icon-${size}.png`), type: 'png' })
  console.log(`icon-${size}.png`)
  await page.close()
}
await browser.close()

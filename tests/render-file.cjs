// Renders every slide of a presentation through the app's import pipeline and saves PNGs.
const { _electron: electron } = require('/opt/npm-tools/node_modules/playwright')
const path = require('path'), fs = require('fs')
;(async () => {
  const file = path.resolve(process.argv[2]); const outDir = path.resolve(process.argv[3]); fs.mkdirSync(outDir, { recursive: true })
  const app = await electron.launch({ executablePath: require('path').join(__dirname, '../node_modules/electron/dist/electron'), args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } })
  const page = await app.firstWindow()
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 300)) })
  page.on('pageerror', e => console.log('[pageerror]', e.message))
  await page.goto('app://prizma/index.html?file=' + encodeURIComponent(file) + '#test')
  await page.waitForFunction(() => document.title === 'ready' || document.title === 'error', null, { timeout: 60000 })
  if (await page.title() === 'error') { console.log(await page.textContent('pre')); await app.close(); process.exit(1) }
  await page.setViewportSize({ width: 1400, height: 900 }).catch(() => {})
  const n = await page.locator('.test-slide').count()
  for (let i = 0; i < n; i++) await page.locator('.test-slide').nth(i).screenshot({ path: path.join(outDir, `slide-${i + 1}.png`) })
  const summary = await page.evaluate(() => window.__doc.slides.map(s => s.elements.map(e => e.type + (e.ph ? ':' + e.ph : '')).join(',')))
  console.log(n, 'slides'); summary.forEach((s, i) => console.log(i + 1, s))
  await app.close()
})().catch(e => { console.error(e); process.exit(1) })

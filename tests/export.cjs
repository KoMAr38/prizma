// Save a presentation through the real app: node tests/export.cjs <out.pptx|.ppsx|.potx> ["<js run before saving>"]
// The setup script can build or open a document, e.g. "__pz.tour.loadTour()".
const { _electron: electron } = require('/opt/npm-tools/node_modules/playwright')
const path = require('path')
;(async () => {
  const [out, setup = '__pz.tour.loadTour()'] = process.argv.slice(2)
  const file = path.resolve(out)
  const app = await electron.launch({ executablePath: path.join(__dirname, '../node_modules/electron/dist/electron'), args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } })
  const page = await app.firstWindow()
  const errors = []
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { errors.push(m.text()); console.log('[console]', m.type(), m.text().slice(0, 500)) } })
  page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message) })
  await page.goto('app://prizma/index.html?test=1&r=' + Date.now() + '#editor')
  await page.waitForFunction(() => window.__pz && window.__pz.store.doc.value, null, { timeout: 20000 })
  await page.evaluate(`(async () => { ${setup} })()`)
  await page.waitForTimeout(400)
  const ext = path.extname(file).slice(1)
  const t0 = Date.now()
  const ok = await page.evaluate(([p, fmt]) => window.__pz.files.writeTo(p, fmt), [file, ext])
  console.log('saved:', ok, file, `${Date.now() - t0} ms`)
  console.log('errors:', errors.length)
  await app.close()
  process.exit(ok ? 0 : 1)
})().catch(e => { console.error(e); process.exit(1) })

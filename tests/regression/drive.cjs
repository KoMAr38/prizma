// node drive.cjs <steps.cjs> <outdir> — launches Prizma in test mode and runs the steps module against it.
// The steps module exports async ({ app, page, ev, shot, wait, errors, OUT }) => {}.
const { _electron: electron } = require('/opt/npm-tools/node_modules/playwright')
const path = require('path'), fs = require('fs')
;(async () => {
  const [stepsFile, OUT] = process.argv.slice(2)
  fs.mkdirSync(OUT, { recursive: true })
  const steps = require(path.resolve(stepsFile))
  const app = await electron.launch({ executablePath: require('path').join(__dirname, '../../node_modules/electron/dist/electron'), args: [require('path').join(__dirname, '../..'), '--no-sandbox'], env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } })
  const errors = []
  const watch = (p, tag) => {
    p.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`))
    p.on('console', m => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text().slice(0, 300)}`) })
  }
  app.on('window', w => watch(w, 'win'))
  const page = await app.firstWindow()
  await page.waitForURL(/^app:\/\/prizma\//, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}) // Prizma's own first load would cut our goto short
  watch(page, 'editor')
  await page.goto('app://prizma/index.html?test=1&r=' + Date.now() + '#editor')
  await page.waitForFunction(() => window.__pz && window.__pz.store.doc.value, null, { timeout: 20000 })
  const ev = (js, arg) => page.evaluate(js, arg)
  const shot = (name, opts = {}) => (opts.page || page).screenshot({ path: path.join(OUT, name + '.png'), ...opts, page: undefined })
  const wait = ms => page.waitForTimeout(ms)
  try {
    await steps({ app, page, ev, shot, wait, errors, OUT, watch })
  } catch (e) {
    errors.push('steps threw: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '))
    await page.screenshot({ path: path.join(OUT, 'fail.png') }).catch(() => {})
  }
  console.log('ERRORS', errors.length)
  for (const e of errors) console.log('  ', e)
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
})().catch(e => { console.error(e); process.exit(1) })

// Evaluate JS in a route: node tests/eval.cjs <hash> "<js expression>" [query]
const { _electron: electron } = require('/opt/npm-tools/node_modules/playwright')
const path = require('path')
;(async () => {
  const [hash, expr, query = ''] = process.argv.slice(2)
  const app = await electron.launch({ executablePath: path.join(__dirname, '../node_modules/electron/dist/electron'), args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } })
  const page = await app.firstWindow()
  page.on('pageerror', e => console.log('[pageerror]', e.message))
  await page.goto('app://prizma/index.html?r=' + Date.now() + (query ? '&' + query : '') + '#' + hash)
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 }).catch(() => {})
  console.log(await page.evaluate(expr))
  await app.close()
})().catch(e => { console.error(e); process.exit(1) })

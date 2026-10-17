// A real crash: kill Prizma mid-work, start it again, the start screen offers the deck and it comes back with the edits
const { _electron: electron } = require('/opt/npm-tools/node_modules/playwright')
const path = require('path'), fs = require('fs')
const OUT = process.argv[2]
fs.mkdirSync(OUT, { recursive: true })
const launch = async () => {
  const app = await electron.launch({ executablePath: require('path').join(__dirname, '../../node_modules/electron/dist/electron'), args: [require('path').join(__dirname, '../..'), '--no-sandbox'], env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } })
  const page = await app.firstWindow()
  await page.waitForURL(/^app:\/\/prizma\//, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}) // Prizma's own first load would cut our goto short
  await page.goto('app://prizma/index.html?test=1&r=' + Date.now() + '#editor')
  await page.waitForFunction(() => window.__pz && window.__pz.store.doc.value, null, { timeout: 20000 })
  return { app, page }
}
;(async () => {
  let { app, page } = await launch()
  const rec = path.join(await app.evaluate(({ app }) => app.getPath('userData')), 'AutoRecover')
  fs.rmSync(rec, { recursive: true, force: true })
  await page.evaluate(() => {
    const z = window.__pz
    z.tour.loadTour(); z.store.backstage.value = null
    z.actions.insertShape('heart', { x: 100, y: 100, w: 120, h: 120 })
    z.store.updateSlide(s => { s.notes = 'crash test note' })
    z.store.settings.value = { ...z.store.settings.value, autosaveMinutes: 0.002 }
    z.files.startAutosave()
  })
  await page.waitForTimeout(2500)
  console.log('copies before the crash:', fs.existsSync(rec) ? fs.readdirSync(rec).join(' ') : 'none')
  app.process().kill('SIGKILL')
  await new Promise(r => setTimeout(r, 1500))
  ;({ app, page } = await launch())
  await page.evaluate(() => window.__pz.files.loadRecovery())
  await page.waitForTimeout(500)
  const list = await page.evaluate(() => window.__pz.store.recovery.value.map(r => r.name))
  console.log('offered after restart:', JSON.stringify(list))
  await page.evaluate(() => { window.__pz.files.newDocIn(); window.__pz.store.backstage.value = 'home' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, 'crash-start.png') })
  let ok = false
  if (list.length) {
    await page.locator('button.btn-primary', { hasText: 'Open' }).first().click()
    await page.waitForTimeout(1500)
    const st = await page.evaluate(() => { const d = window.__pz.store.doc.value; return { slides: d.slides.length, heart: d.slides.some(s => s.elements.some(e => e.shape === 'heart')), notes: d.slides.some(s => s.notes === 'crash test note'), name: window.__pz.store.file.value.name, dirty: window.__pz.store.dirty.value } })
    console.log('restored:', JSON.stringify(st))
    ok = st.heart && st.notes && st.dirty
  }
  console.log(ok ? 'CRASH RECOVERY OK' : 'CRASH RECOVERY FAILED')
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
})().catch(e => { console.error(e); process.exit(1) })

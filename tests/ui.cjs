// Drive the real editor and take screenshots: node tests/ui.cjs <steps.js> <outdir> [width] [height]
// steps.js exports an array of steps: { eval: 'js' } | { click: 'selector' } | { key: 'Control+M' } | { wait: ms } | { shot: 'name.png', clip?: {x,y,width,height} } | { hover: 'selector' } | { type: 'text' }
const { _electron: electron } = require('/opt/npm-tools/node_modules/playwright')
const path = require('path')
const fs = require('fs')
;(async () => {
  const [stepsFile, outDir, W = '1600', H = '1000'] = process.argv.slice(2)
  const steps = require(path.resolve(stepsFile))
  fs.mkdirSync(outDir, { recursive: true })
  const app = await electron.launch({ executablePath: path.join(__dirname, '../node_modules/electron/dist/electron'), args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } })
  const page = await app.firstWindow()
  const errors = []
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text().slice(0, 400); errors.push(t); console.log('[console]', m.type(), t) } })
  page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message) })
  await app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(w, h) }, [+W, +H]).catch(() => {})
  await page.setViewportSize({ width: +W, height: +H }).catch(() => {})
  await page.goto('app://prizma/index.html?test=1&r=' + Date.now() + '#editor')
  await page.waitForFunction(() => window.__pz && window.__pz.store.doc.value, null, { timeout: 20000 })
  await page.waitForTimeout(500)
  for (const s of steps) {
    if (s.eval) { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('eval →', typeof r === 'string' ? r : JSON.stringify(r)) }
    if (s.click) await page.click(s.click, { timeout: 5000 }).catch(e => console.log('click failed', s.click, e.message.split('\n')[0]))
    if (s.dblclick) await page.dblclick(s.dblclick, { timeout: 5000 }).catch(e => console.log('dblclick failed', s.dblclick, e.message.split('\n')[0]))
    if (s.hover) await page.hover(s.hover, { timeout: 5000 }).catch(e => console.log('hover failed', s.hover))
    if (s.mouse) { await page.mouse.move(s.mouse[0], s.mouse[1]); if (s.down) await page.mouse.down(); if (s.up) await page.mouse.up() }
    if (s.key) await page.keyboard.press(s.key)
    if (s.type) await page.keyboard.type(s.type, { delay: 10 })
    if (s.wait) await page.waitForTimeout(s.wait)
    if (s.win) {
      // a helper window (slide show, presenter view …) opened by the previous step
      const wins = app.windows()
      const w = wins[wins.length - 1]
      await w.waitForLoadState('domcontentloaded').catch(() => {})
      await w.waitForTimeout(s.settle ?? 900)
      if (s.winEval) { const r = await w.evaluate(s.winEval).catch(e => 'ERR ' + e.message); console.log('winEval →', r) }
      if (s.winKey) { await w.keyboard.press(s.winKey); await w.waitForTimeout(500) }
      await w.screenshot({ path: path.join(outDir, s.win) }).catch(e => console.log('win shot failed', e.message))
      console.log('win', s.win, 'of', wins.length, 'windows')
      if (s.close) await w.close().catch(() => {})
    }
    if (s.shot) { await page.waitForTimeout(s.settle ?? 250); await page.screenshot({ path: path.join(outDir, s.shot), clip: s.clip }); console.log('shot', s.shot) }
  }
  console.log('errors:', errors.length)
  await app.close()
})().catch(e => { console.error(e); process.exit(1) })

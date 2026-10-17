// Slide show options: From…to range, loop, rehearse timings, automatic advance, laser, highlighter, eraser, B/W screens, typed slide numbers, overview
const path = require('path')
module.exports = async ({ app, page, ev, wait, errors, OUT }) => {
  const start = async (cmd = 'show.start') => {
    const w = app.waitForEvent('window', { timeout: 15000 })
    await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, presenterView: false }; __pz.runCmd('${cmd}')`)
    const win = await w
    await win.waitForLoadState('domcontentloaded'); await win.waitForTimeout(900)
    return win
  }
  const shown = win => win.evaluate(() => document.querySelector('.show-layer:last-of-type [data-slide]')?.dataset.slide || document.querySelector('.show-layer [data-slide]')?.dataset.slide)
  const num = async win => { const id = await shown(win); return 1 + await ev(`__pz.store.doc.value.slides.findIndex(s => s.id === ${JSON.stringify(id)})`) }
  const end = async win => { await win.keyboard.down('Escape').catch(() => {}); await wait(700); if (!win.isClosed()) await win.close().catch(() => {}) }
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  await ev(`__pz.tour.loadTour(); __pz.store.backstage.value = null`)

  // From 3 to 5
  await ev(`__pz.store.update(d => { d.show = { ...(d.show || {}), from: 3, to: 5 } })`)
  let win = await start()
  const seen = [await num(win)]
  for (let i = 0; i < 6 && !(await win.evaluate(() => !!document.querySelector('.show-end'))); i++) { await win.keyboard.press('ArrowRight'); await win.waitForTimeout(700); if (!(await win.evaluate(() => !!document.querySelector('.show-end')))) seen.push(await num(win)) }
  check(JSON.stringify([...new Set(seen)]) === '[3,4,5]', 'range 3–5 shows slides ' + [...new Set(seen)].join(','))
  await end(win)

  // Loop until Esc
  await ev(`__pz.store.update(d => { d.show = { loop: true } }); __pz.store.goSlide(8)`)
  win = await start('show.current')
  await win.keyboard.press('ArrowRight'); await win.waitForTimeout(900)
  check(await num(win) === 1, 'loop: after the last slide comes slide ' + await num(win))
  await end(win)

  // Typed number, black and white screens, overview
  await ev(`__pz.store.update(d => { d.show = {} }); __pz.store.goSlide(0)`)
  win = await start()
  await win.keyboard.type('4'); await win.keyboard.press('Enter'); await win.waitForTimeout(900)
  check(await num(win) === 4, 'typing 4 + Enter goes to slide ' + await num(win))
  await win.keyboard.press('b'); await win.waitForTimeout(200)
  const black = await win.evaluate(() => getComputedStyle(document.querySelector('.show-screen') || document.body).backgroundColor)
  await win.keyboard.press('b'); await win.keyboard.press('w'); await win.waitForTimeout(200)
  const white = await win.evaluate(() => getComputedStyle(document.querySelector('.show-screen') || document.body).backgroundColor)
  await win.keyboard.press('w'); await win.waitForTimeout(200)
  check(black === 'rgb(0, 0, 0)' && white === 'rgb(255, 255, 255)', `B and W screens: ${black} / ${white}`)
  await win.keyboard.press('g'); await win.waitForTimeout(500)
  const ov = await win.evaluate(() => document.querySelectorAll('.show-ov [data-slide], .ov-item, .overview .pz-slide').length)
  await win.screenshot({ path: path.join(OUT, 'overview.png') })
  check(ov >= 9, 'overview lists ' + ov + ' slides')
  await win.keyboard.press('Escape'); await win.waitForTimeout(300)

  // laser, highlighter, eraser
  const vp = await win.evaluate(() => ({ w: innerWidth, h: innerHeight }))
  await win.keyboard.press('Control+l'); await win.mouse.move(vp.w * 0.5, vp.h * 0.5); await win.mouse.move(vp.w * 0.52, vp.h * 0.5); await win.waitForTimeout(200)
  check(await win.evaluate(() => !!document.querySelector('.laser')), 'laser pointer follows the mouse')
  await win.keyboard.press('Control+i'); await win.waitForTimeout(100)
  await win.mouse.move(vp.w * 0.3, vp.h * 0.7); await win.mouse.down(); for (let i = 1; i <= 10; i++) await win.mouse.move(vp.w * (0.3 + i * 0.03), vp.h * 0.7); await win.mouse.up()
  const strokes = await win.evaluate(() => document.querySelectorAll('.show-ink path').length)
  await win.keyboard.press('Control+e'); await win.waitForTimeout(100)
  await win.mouse.move(vp.w * 0.45, vp.h * 0.6); await win.mouse.down(); await win.mouse.move(vp.w * 0.45, vp.h * 0.8, { steps: 8 }); await win.mouse.up()
  const after = await win.evaluate(() => document.querySelectorAll('.show-ink path').length)
  check(strokes === 1 && after === 0, `highlighter drew ${strokes} stroke(s), eraser left ${after}`)
  await end(win)
  await ev(`(() => { const d = __pz.store.dialog.value; if (d && d.resolve) d.resolve('discard'); __pz.store.closeDialog() })()`)

  // rehearse timings → keep → automatic advance
  await ev(`__pz.store.goSlide(0); __pz.store.ribbonTab.value = 'slideshow'`); await wait(300)
  const w2 = app.waitForEvent('window', { timeout: 15000 })
  await page.getByRole('button', { name: 'Rehearse timings' }).click()
  win = await w2
  await win.waitForLoadState('domcontentloaded')
  for (let i = 0; i < 3; i++) { await win.waitForTimeout(1300); await win.keyboard.press('ArrowRight') }
  await end(win)
  await page.getByRole('button', { name: 'Keep timings' }).click({ timeout: 5000 }).catch(e => errors.push('no keep-timings dialog'))
  await wait(300)
  const t = await ev(`({ adv: __pz.store.doc.value.slides.slice(0, 3).map(s => s.advanceAfter), use: __pz.store.doc.value.show && __pz.store.doc.value.show.useTimings })`)
  check(t.adv.every(v => v >= 1) && t.use === true, 'rehearsed timings kept: ' + JSON.stringify(t))
  await ev(`__pz.store.update(d => { for (const s of d.slides) s.advanceAfter = 1 }); __pz.store.goSlide(0)`)
  win = await start()
  await win.waitForTimeout(3300)
  const auto = await num(win)
  check(auto >= 3, 'automatic advance reached slide ' + auto + ' after 3.3 s')
  await end(win)
}

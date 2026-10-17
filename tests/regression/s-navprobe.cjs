// Does clicking a link inside slide text navigate the window away (editor, thumbnails, show, reading view, presenter)?
module.exports = async ({ app, page, ev, wait, errors }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  await app.evaluate(({ shell }) => { global.__opened = []; shell.openExternal = async u => { global.__opened.push(u) } })
  await ev(`__pz.tour.loadTour(); __pz.files.newDocIn(); __pz.store.backstage.value = null`)
  await ev(`(() => { const A = __pz.actions; A.addSlide(); __pz.store.updateSlide(s => { s.elements = [] }); A.insertTextBox({ x: 100, y: 200, w: 600, h: 60 }) })()`)
  await wait(300); await page.keyboard.type('link'); await page.keyboard.press('Escape'); await wait(150); await page.keyboard.press('Escape')
  await ev(`__pz.store.updateSlide(s => { s.elements[0].html = '<p><a href="https://prizma.example/docs">open docs</a> and <a href="#slide:0">back</a></p>' })`)
  await wait(200)
  const a = page.locator('.panel-stage a[href^="https"]').first()
  const b = await a.boundingBox()
  await page.mouse.click(b.x + 5, b.y + b.height / 2); await wait(800)
  check(page.url().startsWith('app://prizma/'), 'editor: plain click on a link keeps the window on Prizma (' + page.url().slice(0, 60) + ')')
  if (!page.url().startsWith('app://prizma/')) return
  check(await ev(`__pz.store.selection.value.length === 1`), 'editor: plain click on a link selects the text box')
  const t = page.locator('.thumbs a[href^="https"]').first()
  if (await t.count()) { const tb = await t.boundingBox(); await page.mouse.click(tb.x + 2, tb.y + tb.height / 2); await wait(800); check(page.url().startsWith('app://prizma/'), 'thumbnail: click on a link keeps the window on Prizma') }
  for (const [cmd, label] of [['show.current', 'show'], ['view.reading', 'reading view']]) {
    const w = app.waitForEvent('window', { timeout: 15000 })
    await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, presenterView: false }; __pz.runCmd('${cmd}')`)
    const win = await w; await win.waitForLoadState('domcontentloaded'); await win.waitForTimeout(900)
    const n0 = (await app.evaluate(() => global.__opened)).length
    const l = await win.locator('a[href^="https"]').last().boundingBox()
    win.on('close', () => console.log('  ', label, 'window closed'))
    win.on('framenavigated', f => console.log('  ', label, 'navigated to', f.url().slice(0, 80)))
    win.on('console', m => console.log('  ', label, 'console', m.type(), m.text().slice(0, 120)))
    console.log('  ', label, 'url before', win.url().slice(0, 70))
    await win.mouse.click(l.x + 5, l.y + l.height / 2); await win.waitForTimeout(800).catch(() => {})
    console.log('  ', label, 'closed?', win.isClosed(), win.isClosed() ? '' : win.url().slice(0, 70))
    const alive = !win.isClosed() && win.url().startsWith('app://prizma/')
    const opened = (await app.evaluate(() => global.__opened)).slice(n0)
    check(alive && opened.length === 1, `${label}: link opens once in the browser and the window stays (${alive ? win.url().slice(0, 50) : 'closed/navigated'}; opened ${JSON.stringify(opened)})`)
    if (alive) { await win.keyboard.down('Escape').catch(() => {}); await wait(800); if (!win.isClosed()) await win.close().catch(() => {}) }
  }
}

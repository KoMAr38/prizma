// Alt+Q command search: what people type finds the command, arrows and Enter run it; the tour opens and plays
module.exports = async ({ app, page, ev, wait, errors, shot }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  await ev(`__pz.tour.loadTour(); __pz.files.newDocIn(); __pz.store.backstage.value = null`)
  await page.locator('.panel-stage').click({ position: { x: 10, y: 10 } })
  const search = async q => {
    await page.keyboard.press('Alt+q'); await wait(120)
    await page.keyboard.press('Control+a'); await page.keyboard.type(q); await wait(150)
    return page.locator('.search-res .mi .mi-l').allTextContents()
  }
  const queries = {
    'pdf': /pdf/i, 'export': /export/i, 'picture': /picture/i, 'new slide': /new slide/i, 'symbol': /symbol/i, 'theme': /theme/i,
    'presenter': /presenter/i, 'print': /print/i, 'undo': /undo/i, 'font size': /font size|grow font|bigger/i, 'bullets': /bullet/i,
    'align left': /align/i, 'group': /group/i, 'crop': /crop/i, 'transition': /transition/i, 'animation': /animation/i, 'chart': /chart/i,
    'table': /table/i, 'video': /video/i, 'comment': /comment/i, 'zoom': /zoom/i, 'ruler': /ruler/i, 'gridlines': /grid/i,
    'slide size': /slide size/i, 'header': /header/i, 'spelling': /spell/i, 'save as': /save as/i, 'duplicate': /duplicate/i,
    'hide slide': /hide slide/i, 'replace': /replace/i, 'find': /find/i, 'shapes': /shape/i, 'text box': /text box/i,
    'line spacing': /line spacing|spacing/i, 'background': /background/i, 'rehearse': /rehearse/i, 'from beginning': /beginning/i,
    'dark mode': /dark|interface|theme/i, 'shortcuts': /shortcut/i, 'select all': /select all/i, 'paste': /paste/i, 'bold': /bold/i,
    'wordart': /wordart/i, 'icons': /icon/i, 'audio': /audio/i, 'link': /link/i, 'notes': /notes/i,
    'outline': /outline/i, 'sorter': /sorter/i, 'grayscale': /gray|grey/i, 'reading view': /reading/i, 'options': /options/i
  }
  const missing = []
  for (const [q, re] of Object.entries(queries)) {
    const res = await search(q)
    if (!res.some(t => re.test(t))) missing.push(`${q} → ${res.slice(0, 3).join(', ') || 'nothing'}`)
  }
  await page.keyboard.press('Escape')
  check(!missing.length, 'search finds what people type: ' + (missing.length ? missing.join(' | ') : 'all ' + Object.keys(queries).length))

  // arrows + Enter run the highlighted command
  const res = await search('symbol'); await shot('search-symbol')
  await page.keyboard.press('Enter'); await wait(300)
  check(await ev(`__pz.store.dialog.value?.type`) === 'symbol', 'Enter runs the first result (Symbol dialog): ' + res.join(', '))
  await page.keyboard.press('Escape'); await wait(150)
  await search('shapes'); await page.keyboard.press('Enter'); await wait(500)
  const sp = await ev(`!!document.querySelector('.pop .shape-picker')`)
  await page.keyboard.press('Escape'); await wait(150)
  await search('wordart'); await page.keyboard.press('Enter'); await wait(500)
  const wa = await ev(`/WordArt styles/.test(document.querySelector('.pop')?.textContent || '')`)
  await page.keyboard.press('Escape'); await wait(150)
  check(sp && wa, `search opens the Shapes (${sp}) and WordArt (${wa}) galleries`)
  const r2 = await search('slide')
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown')
  const act = await page.locator('.search-res .mi.act .mi-l').textContent()
  check(act === r2[2], `arrows move the highlight to the third result (${act})`)
  await page.keyboard.press('Escape'); await wait(150)
  check(await ev(`document.activeElement?.tagName !== 'INPUT'`), 'Esc leaves the search box')
  await page.keyboard.press('Control+q'); await wait(150)
  check(await ev(`document.activeElement?.closest('.tb-search') !== null`), 'Ctrl+Q also opens the search')
  await page.keyboard.press('Escape')

  // the tour: opens from View › Take a tour in this window (the deck is empty) and plays through, morph included
  await ev(`__pz.files.newDocIn(); __pz.store.ribbonTab.value = 'help'`); await wait(200)
  await page.getByRole('button', { name: 'Take a tour' }).click(); await wait(500)
  const n = await ev(`__pz.store.doc.value.slides.length`)
  check(n >= 8 && await ev(`__pz.store.file.value.name`) === 'Welcome to Prizma', 'the tour opens: ' + n + ' slides')
  const w = app.waitForEvent('window', { timeout: 15000 })
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, presenterView: false }; __pz.runCmd('show.start')`)
  const win = await w; await win.waitForLoadState('domcontentloaded'); await win.waitForTimeout(800)
  let steps = 0
  while (!win.isClosed() && steps < 30 && !(await win.evaluate(() => !!document.querySelector('.show-end')).catch(() => true))) { await win.keyboard.press('ArrowRight').catch(() => {}); await win.waitForTimeout(900).catch(() => {}); steps++ }
  check(steps >= n && steps < 30, `the tour plays to the end in ${steps} clicks`)
  if (!win.isClosed()) await win.keyboard.down('Escape').catch(() => {})
  await wait(600)
  // with work in progress the tour opens in a new window instead of replacing it
  await ev(`__pz.files.newDocIn(); __pz.actions.insertShape('rect'); __pz.store.ribbonTab.value = 'help'`); await wait(200)
  const nw = app.waitForEvent('window', { timeout: 15000 }).catch(() => null)
  await page.getByRole('button', { name: 'Take a tour' }).click()
  const tw = await nw
  check(!!tw && await ev(`__pz.store.doc.value.slides[0].elements.some(e => e.type === 'shape')`), 'with unsaved work the tour opens in its own window and the work stays')
  if (tw) { await tw.waitForLoadState('domcontentloaded'); await tw.waitForTimeout(1500); console.log('   tour window title', await tw.title()); await tw.close().catch(() => {}) }
}

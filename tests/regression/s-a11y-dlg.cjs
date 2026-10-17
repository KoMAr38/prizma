// Every dialog: each control has a name a screen reader can say, the dialog is marked modal, and Tab stays inside it
module.exports = async ({ page, ev, wait, errors }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  await ev(`(() => { __pz.tour.loadTour(); __pz.store.backstage.value = null; __pz.store.goSlide(2)
    const A = __pz.actions; const s = A.insertShape('rect', { x: 60, y: 60, w: 200, h: 80 }); __pz.store.updateSlide(sl => { sl.elements.find(e => e.id === s.id).html = '<p>Hello</p>' }); __pz.store.select([s.id]) })()`)
  const audit = sel => ev(`(() => {
    const root = document.querySelector(${JSON.stringify(sel)}); if (!root) return null
    const named = el => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.textContent || el.getAttribute('placeholder') || (el.labels && el.labels.length ? 'l' : '') || (el.closest('label') ? 'l' : '')).trim().length > 0
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
    const bad = [...root.querySelectorAll('button, [role=button], input, select, textarea, [contenteditable=true]')].filter(el => vis(el) && !named(el))
    const dlg = root.querySelector('[role=dialog]') || root.closest('[role=dialog]')
    return { modal: dlg?.getAttribute('aria-modal') === 'true', n: bad.length, ex: bad.slice(0, 6).map(el => (el.dataset.tip || el.className || el.tagName).toString().slice(0, 40)) }
  })()`)
  const types = ['message', 'table', 'chart', 'icons', 'symbol', 'link', 'alt', 'hf', 'size', 'setupShow', 'zoom', 'paragraph', 'font', 'wordcount', 'themeColors', 'themeFonts', 'shortcuts', 'about']
  const bad = []
  for (const t of types) {
    await ev(`__pz.store.openDialog(${JSON.stringify(t)}, ${t === 'message' ? "{ title: 'Note', text: 'Hello' }" : '{}'})`).catch(e => bad.push(`${t}: ${e.message}`))
    await wait(250)
    if (t === 'setupShow') { await page.getByRole('radio', { name: 'From…to' }).check().catch(() => {}); await wait(100) }
    const r = await audit('.modal')
    if (!r) bad.push(`${t}: did not open`)
    else if (r.n || !r.modal) bad.push(`${t}: ${r.n} unnamed ${JSON.stringify(r.ex)}${r.modal ? '' : ' (not marked modal)'}`)
    // Tab from the last control and Shift+Tab from the first go round, not to the window behind
    for (const [k, end] of [['Tab', -1], ['Shift+Tab', 0]]) {
      await ev(`[...document.querySelectorAll('.dlg :is(button, input, select, textarea)')].filter(x => !x.disabled && x.getClientRects().length).at(${end})?.focus()`)
      await page.keyboard.press(k); await wait(30)
      if (!await ev(`!!document.activeElement?.closest('.dlg')`)) bad.push(`${t}: ${k} left the dialog`)
    }
    await ev(`__pz.store.closeDialog()`); await wait(100)
  }
  check(!bad.length, `dialogs (${types.length}): ` + (bad.join(' | ') || 'every control named, all modal, Tab stays inside'))

  // Esc with a dropdown open in a dialog closes only the dropdown
  await ev(`__pz.store.openDialog('font', {})`); await wait(300)
  await page.locator('.dlg .swatch-btn').first().click(); await wait(200)
  const opened = await ev(`!!document.querySelector('.pop')`)
  await page.keyboard.press('Escape'); await wait(150)
  const after = await ev(`({ pop: !!document.querySelector('.pop'), dlg: !!__pz.store.dialog.value })`)
  await page.keyboard.press('Escape'); await wait(150)
  check(opened && !after.pop && after.dlg && !await ev(`!!__pz.store.dialog.value`), 'Esc closes the open colour picker first, then the Font dialog: ' + JSON.stringify({ opened, ...after }))
}

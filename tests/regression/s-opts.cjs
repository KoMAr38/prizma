// Every setting in File › Options does what its label says
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process')
module.exports = async ({ app, page, ev, wait, errors, OUT, shot }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const idle = () => page.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 60000 })
  const userData = await app.evaluate(({ app }) => app.getPath('userData'))
  const saved = () => JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'))
  await ev(`__pz.tour.loadTour(); __pz.files.newDocIn(); __pz.store.backstage.value = 'options'`); await wait(300)
  const pickSelect = (label, optionText) => page.locator('.bs-options label.fld', { hasText: label }).first().locator('select').selectOption({ label: optionText })
  const checkBox = async (label, on) => {
    const cb = page.locator('.bs-options label', { hasText: label }).first().locator('input')
    if ((await cb.isChecked()) !== on) await page.locator('.bs-options label', { hasText: label }).first().click()
  }
  await shot('options')

  // interface: light, dark, same as Windows (and following Windows when it changes)
  await pickSelect('Interface', 'Light'); await wait(200)
  const ui1 = await ev(`document.documentElement.dataset.ui`)
  await pickSelect('Interface', 'Dark'); await wait(200)
  const ui2 = await ev(`document.documentElement.dataset.ui`)
  check(ui1 === 'light' && ui2 === 'dark' && saved().theme === 'dark', `interface light/dark: ${ui1}/${ui2}, saved ${saved().theme}`)
  await pickSelect('Interface', 'Same as Windows'); await wait(200)
  await page.emulateMedia({ colorScheme: 'light' }); await wait(300)
  const ui3 = await ev(`document.documentElement.dataset.ui`)
  await page.emulateMedia({ colorScheme: 'dark' }); await wait(300)
  const ui4 = await ev(`document.documentElement.dataset.ui`)
  check(ui3 === 'light' && ui4 === 'dark', `"Same as Windows" follows Windows switching light → dark while open: ${ui3} → ${ui4}`)
  // the title-bar button flips what is on screen, so one click is enough even when following a dark Windows
  const tip = await page.locator('.tb-theme').getAttribute('data-tip')
  await page.locator('.tb-theme').click(); await wait(200)
  const ui5 = await ev(`document.documentElement.dataset.ui`)
  check(tip === 'Light interface' && ui5 === 'light', `title-bar button on a dark Windows says "${tip}" and one click shows ${ui5}`)
  await pickSelect('Interface', 'Dark'); await page.emulateMedia({ colorScheme: null }); await wait(200)

  // your name: comments and the file's author
  await page.locator('.bs-options input.tin').first().fill('Marko Test'); await wait(200)
  check(saved().author === 'Marko Test', 'your name is saved: ' + saved().author)
  await ev(`__pz.store.backstage.value = null`); await wait(200)
  await ev(`__pz.actions.addComment('hello')`)
  check(await ev(`__pz.store.slide.value.comments[0].author`) === 'Marko Test', 'comments carry your name')
  const f = path.join(OUT, 'author.pptx')
  await app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, f)
  await ev(`__pz.files.saveAs('pptx')`); await wait(300); await idle()
  const core = execFileSync('unzip', ['-p', f, 'docProps/core.xml']).toString()
  check(/<dc:creator>Marko Test<\/dc:creator>/.test(core) && /<cp:lastModifiedBy>Marko Test</.test(core), 'the saved file names you as author: ' + (core.match(/<dc:creator>[^<]*<\/dc:creator>/) || [''])[0])

  // measurement units in the Format pane
  await ev(`(() => { const A = __pz.actions; const s = A.insertShape('rect', { x: 72, y: 72, w: 144, h: 72 }); __pz.store.select([s.id]); __pz.runCmd('obj.format', 'size') })()`); await wait(400)
  const unitsShown = {}
  for (const [u, label] of [['in', 'Inches'], ['pt', 'Points'], ['cm', 'Centimeters']]) {
    await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, units: '${u}' }`); await wait(250)
    unitsShown[u] = await ev(`[...document.querySelectorAll('.pane input')].map(i => i.value).filter(v => /\\d/.test(v)).slice(0, 2).join(' ; ')`)
  }
  check(/2"|2 ?in/.test(unitsShown.in) && /144 ?pt/.test(unitsShown.pt) && /5[.,]08 ?cm/.test(unitsShown.cm), 'width shown in inches, points and centimeters: ' + JSON.stringify(unitsShown))

  // spelling (another test may have switched it off and saved that)
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, spellcheck: true }`)
  await ev(`(() => { const s = __pz.store.slide.value.elements.find(e => e.type === 'shape'); __pz.store.select([s.id]); __pz.store.editing.value = s.id })()`); await wait(250)
  const sp1 = await ev(`document.querySelector('[data-editor] [contenteditable], .pz-editing')?.getAttribute('spellcheck')`)
  await ev(`__pz.store.editing.value = null; __pz.store.settings.value = { ...__pz.store.settings.value, spellcheck: false }`); await wait(150)
  await ev(`(() => { const s = __pz.store.slide.value.elements.find(e => e.type === 'shape'); __pz.store.editing.value = s.id })()`); await wait(250)
  const sp2 = await ev(`document.querySelector('[data-editor] [contenteditable], .pz-editing')?.getAttribute('spellcheck')`)
  await ev(`__pz.store.editing.value = null; __pz.store.settings.value = { ...__pz.store.settings.value, spellcheck: true }`)
  check(sp1 === 'true' && sp2 === 'false', `spell check on/off reaches the text editor: ${sp1}/${sp2}`)
  const notesSp = async v => { await ev(`__pz.store.showNotes.value = true; __pz.store.settings.value = { ...__pz.store.settings.value, spellcheck: ${v} }`); await wait(150); return ev(`document.querySelector('.notes textarea')?.getAttribute('spellcheck')`) }
  const ns = [await notesSp(false), await notesSp(true)].join('/')
  check(ns === 'false/true', `spell check on/off reaches the notes box: ${ns}`)

  // smart guides: a drag that ends 3 pt off another shape's edge snaps only when they are on
  const dragTest = async () => {
    await ev(`(() => { const A = __pz.actions; __pz.store.updateSlide(s => { s.elements = [] }); A.insertShape('rect', { x: 100, y: 300, w: 120, h: 80 }); const b = A.insertShape('ellipse', { x: 400, y: 100, w: 100, h: 100 }); __pz.store.select([b.id]) })()`); await wait(200)
    const id = await ev(`__pz.store.selection.value[0]`)
    const box = await page.locator(`.panel-stage .pz-el[data-id="${id}"]`).boundingBox()
    const k = box.width / 100
    const sx = box.x + box.width / 2, sy = box.y + box.height / 2
    await page.mouse.move(sx, sy); await page.mouse.down()
    await page.mouse.move(sx - (400 - 103) * k / 2, sy, { steps: 6 }); await page.mouse.move(sx - (400 - 103) * k, sy, { steps: 6 }); await page.mouse.up(); await wait(150)
    return ev(`__pz.store.slide.value.elements.find(e => e.id === ${JSON.stringify(id)}).x`)
  }
  const xOn = await dragTest()
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, smartGuides: false }`)
  const xOff = await dragTest()
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, smartGuides: true }`)
  check(Math.abs(xOn - 100) < 0.6 && Math.abs(xOff - 100) > 1.5, `smart guides snap the edge when on (x=${xOn.toFixed(1)}) and not when off (x=${xOff.toFixed(1)})`)

  // new presentations: 4:3
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, newSize: 'standard' }; __pz.files.newDocIn()`)
  const z = await ev(`__pz.store.doc.value.size`)
  check(Math.abs(z.w / z.h - 4 / 3) < 0.01, `new presentations use the chosen size: ${z.w}×${z.h}`)
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, newSize: 'wide' }; __pz.files.newDocIn(); __pz.store.backstage.value = null`)

  // default save format
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, defaultFormat: 'prizma' }`)
  await app.evaluate(({ dialog }) => { global.__saveOpts = null; dialog.showSaveDialog = async (w, o) => { global.__saveOpts = o || w; return { canceled: true } } })
  await page.keyboard.press('Control+s'); await wait(600)
  const so = await app.evaluate(() => global.__saveOpts)
  check(/\.prizma$/i.test(so?.defaultPath || '') && /prizma/i.test(JSON.stringify(so?.filters?.[0] || '')), 'Save on a new deck offers the chosen format first: ' + JSON.stringify({ p: so?.defaultPath, f: so?.filters?.[0] }))
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, defaultFormat: 'pptx' }`)

  // slide show: toolbar and the black end slide
  const show = async () => {
    const w = app.waitForEvent('window', { timeout: 15000 })
    await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, presenterView: false }; __pz.store.goSlide(0); __pz.runCmd('show.start')`)
    const win = await w; await win.waitForLoadState('domcontentloaded'); await win.waitForTimeout(800); return win
  }
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, showToolbar: false, endBlack: false }`)
  let win = await show()
  await win.mouse.move(300, 300); await win.mouse.move(320, 310); await win.waitForTimeout(300)
  const bar = await win.evaluate(() => !!document.querySelector('.show-bar'))
  await win.keyboard.press('ArrowRight').catch(() => {}); await wait(1200)
  const closedAtEnd = win.isClosed()
  check(!bar && closedAtEnd, `no toolbar (${!bar}) and no black end slide: the show closes after the last slide (${closedAtEnd})`)
  if (!win.isClosed()) { await win.keyboard.down('Escape').catch(() => {}); await wait(600) }
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, showToolbar: true, endBlack: true }`)
  win = await show()
  await win.mouse.move(300, 300); await win.mouse.move(320, 310); await win.waitForTimeout(300)
  const bar2 = await win.evaluate(() => !!document.querySelector('.show-bar'))
  await win.keyboard.press('ArrowRight'); await win.waitForTimeout(800)
  const end2 = !win.isClosed() && await win.evaluate(() => !!document.querySelector('.show-end, .show-endscreen') || /end of slide show/i.test(document.body.innerText))
  check(bar2 && end2, `toolbar shows (${bar2}) and the show ends on a black slide (${end2})`)
  if (!win.isClosed()) { await win.keyboard.down('Escape').catch(() => {}); await wait(600) }

  // start screen and AutoRecover reach the settings file
  await ev(`__pz.store.backstage.value = 'options'`); await wait(300)
  await checkBox('Show the start screen', false); await wait(200)
  await pickSelect('Save AutoRecover information every', 'Never'); await wait(200)
  const st = saved()
  check(st.showStart === false && st.autosaveMinutes === 0, 'start screen off and AutoRecover never are saved: ' + JSON.stringify({ showStart: st.showStart, autosaveMinutes: st.autosaveMinutes }))
  await checkBox('Show the start screen', true); await pickSelect('Save AutoRecover information every', '2 minutes')
  await page.locator('.bs-options input.tin').first().fill(''); await wait(200)
}

// End-to-end pass through the real app: editing commands, undo/redo, slide show, presenter view, PDF export.
const { _electron: electron } = require('/opt/npm-tools/node_modules/playwright')
const path = require('path'), fs = require('fs')
const OUT = process.argv[2]
fs.mkdirSync(OUT, { recursive: true })
;(async () => {
  const app = await electron.launch({ executablePath: require('path').join(__dirname, '../../node_modules/electron/dist/electron'), args: [require('path').join(__dirname, '../..'), '--no-sandbox'], env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } })
  const errors = []
  const watch = (p, tag) => {
    p.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`))
    p.on('console', m => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text().slice(0, 200)}`) })
  }
  const page = await app.firstWindow()
  await page.waitForURL(/^app:\/\/prizma\//, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}) // Prizma's own first load would cut our goto short
  watch(page, 'editor')
  await page.goto('app://prizma/index.html?test=1&r=' + Date.now() + '#editor')
  await page.waitForFunction(() => window.__pz && window.__pz.store.doc.value, null, { timeout: 20000 })
  const ev = js => page.evaluate(js)
  const step = async (name, js, wait = 250) => { try { const r = await ev(js); await page.waitForTimeout(wait); console.log('ok  ', name, r !== undefined ? JSON.stringify(r).slice(0, 120) : '') } catch (e) { errors.push(`${name}: ${e.message}`); console.log('FAIL', name, e.message.slice(0, 200)) } }

  await step('load tour', `__pz.tour.loadTour(); __pz.store.backstage.value = null; __pz.store.doc.value.slides.length`, 600)
  await step('go to slide 4', `__pz.store.goSlide(3); __pz.store.slideIdx.value`)
  const n0 = await ev(`__pz.store.slide.value.elements.length`)
  await step('insert shape', `__pz.actions.insertShape('star5').id`)
  await step('insert table', `__pz.actions.insertTable(3, 3).id`)
  await step('insert chart', `__pz.actions.insertChart('pie').id`)
  await step('insert icon', `__pz.actions.insertIcon('sparkles').id`)
  await step('group two', `(() => { const s = __pz.store.slide.value.elements; __pz.store.select([s[s.length - 1].id, s[s.length - 2].id]); __pz.actions.groupSelected(); return __pz.store.slide.value.elements.length })()`)
  await step('align + rotate', `(() => { __pz.actions.align('left'); __pz.actions.rotateSelected(15); return __pz.store.selected.value.map(e => e.rot) })()`)
  await step('add animation', `(() => { __pz.actions.addAnimation('zoom', 'entr'); return __pz.store.slide.value.animations.length })()`)
  await step('set transition', `(() => { __pz.actions.setTransition({ type: 'cube', dir: 'left' }); return __pz.store.slide.value.transition })()`)
  await page.screenshot({ path: path.join(OUT, '1-edited.png') })
  const n1 = await ev(`__pz.store.slide.value.elements.length`)
  await step('undo x6', `(() => { for (let i = 0; i < 6; i++) __pz.store.undo(); return __pz.store.slide.value.elements.length })()`)
  await step('redo x6', `(() => { for (let i = 0; i < 6; i++) __pz.store.redo(); return __pz.store.slide.value.elements.length })()`)
  const n2 = await ev(`__pz.store.slide.value.elements.length`)
  console.log('elements before/after/redo:', n0, n1, n2)
  if (n2 !== n1) errors.push(`redo restored ${n2} elements, expected ${n1}`)
  await step('duplicate + delete slide', `(() => { const id = __pz.store.slide.value.id; __pz.actions.duplicateSlides([id]); const a = __pz.store.doc.value.slides.length; __pz.actions.deleteSlides([__pz.store.slide.value.id]); return [a, __pz.store.doc.value.slides.length] })()`)
  await step('sorter view', `(() => { __pz.store.view.value = 'sorter'; return 1 })()`, 500)
  await page.screenshot({ path: path.join(OUT, '2-sorter.png') })
  await step('normal view', `(() => { __pz.store.view.value = 'normal'; __pz.store.goSlide(5); return 1 })()`, 400)

  // slide show from slide 6 (animations); one display, presenter view on → the presenter window runs the show
  for (const presenter of [false, true]) {
    const before = app.windows().length
    await ev(`__pz.store.goSlide(5); __pz.store.settings.value = { ...__pz.store.settings.value, presenterView: ${presenter} }`)
    const waitWin = app.waitForEvent('window', { timeout: 15000 })
    await ev(presenter ? `__pz.runCmd('show.presenter')` : `__pz.runCmd('show.current')`)
    const win = await waitWin.catch(() => null)
    if (!win) { errors.push(`show window (presenter ${presenter}) did not open`); continue }
    watch(win, presenter ? 'presenter' : 'show')
    await win.waitForLoadState('domcontentloaded')
    await win.waitForTimeout(1500)
    console.log('show window:', win.url().replace(/^.*index\.html/, ''), 'windows:', before, '->', app.windows().length)
    await win.screenshot({ path: path.join(OUT, `3-show-${presenter ? 'presenter' : 'audience'}-a.png`) })
    for (let i = 0; i < 5; i++) { await win.keyboard.press('ArrowRight'); await win.waitForTimeout(900) }
    const endScreen = await win.evaluate(() => !!document.querySelector('.show-end'))
    console.log('end screen after the last slide:', endScreen)
    if (!endScreen) errors.push(`no end screen (presenter ${presenter})`)
    await win.screenshot({ path: path.join(OUT, `3-show-${presenter ? 'presenter' : 'audience'}-b.png`) })
    if (presenter) console.log('presenter says:', await win.evaluate(() => document.querySelector('.pv-count')?.textContent))
    await win.keyboard.down('Escape').catch(() => {}) // the show closes its window on keydown
    await page.waitForTimeout(1200)
    const after = app.windows().length, still = await ev(`__pz.store.showing.value`)
    console.log('after Escape: windows', after, 'showing', still, 'editor on slide', await ev(`__pz.store.slideIdx.value + 1`))
    if (after !== before || still) errors.push(`show (presenter ${presenter}) did not end cleanly`)
  }

  // PDF export and Save as through the real commands; the native save dialog is answered from the main process
  const answerSave = p => app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, p)
  const idle = () => page.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 90000 })
  const pdf = path.join(OUT, 'tour.pdf'), pptx = path.join(OUT, 'tour.pptx')
  await answerSave(pdf)
  await ev(`__pz.runCmd('file.exportPdf')`)
  await page.waitForTimeout(500); await idle()
  const pdfPages = fs.existsSync(pdf) ? (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length : 0
  console.log('pdf:', fs.existsSync(pdf) ? fs.statSync(pdf).size + ' bytes, ' + pdfPages + ' pages' : 'missing', 'slides', await ev(`__pz.store.doc.value.slides.length`))
  if (pdfPages !== await ev(`__pz.store.doc.value.slides.filter(s => !s.hidden).length`) && pdfPages !== await ev(`__pz.store.doc.value.slides.length`)) errors.push(`pdf has ${pdfPages} pages`)

  const shape = await ev(`JSON.stringify(__pz.store.doc.value.slides.map(s => s.elements.length))`)
  await answerSave(pptx)
  await ev(`__pz.runCmd('file.saveAs')`)
  await page.waitForTimeout(500); await idle()
  console.log('pptx:', fs.existsSync(pptx) ? fs.statSync(pptx).size + ' bytes' : 'missing', 'file:', await ev(`JSON.stringify(__pz.store.file.value)`), 'dirty', await ev(`__pz.store.dirty?.value`))
  await ev(`__pz.files.openPath(${JSON.stringify(pptx)}, { here: true })`)
  await page.waitForTimeout(500); await idle()
  const shape2 = await ev(`JSON.stringify(__pz.store.doc.value.slides.map(s => s.elements.length))`)
  console.log('reopened:', shape2 === shape ? 'same element counts' : `DIFFERENT ${shape} -> ${shape2}`)
  if (shape2 !== shape) errors.push('reopened deck differs')
  await page.screenshot({ path: path.join(OUT, '4-reopened.png') })
  console.log('ERRORS', errors.length)
  for (const e of errors) console.log('  ', e)
  await app.close()
})().catch(e => { console.error(e); process.exit(1) })

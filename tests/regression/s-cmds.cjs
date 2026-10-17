// Every command once, in a context where it applies; reports page errors per command and what each one changed
const path = require('path')
const SKIP = new Set(['view.newWindow', 'file.new', 'view.reading', 'show.start', 'show.current', 'show.presenter'])
module.exports = async ({ app, page, ev, wait, errors, OUT, shot }) => {
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
    dialog.showSaveDialog = async () => ({ canceled: true })
  })
  await ev(`__pz.tour.loadTour(); __pz.store.backstage.value = null`)
  const list = require('fs').readFileSync(require('path').join(__dirname, '../../src/renderer/app/commands.js'), 'utf8').match(/^def\('[^']+'/gm).map(s => s.slice(5, -1))
  for (const id of list) {
    if (SKIP.has(id)) continue
    // a fresh, known context: slide 2 (title + bullets), a shape and the bullet box selected
    await page.keyboard.press('Escape').catch(() => {})
    await ev(`(() => {
      const S = __pz.store
      S.closeDialog(); S.backstage.value = null; S.menu.value = null; S.view.value = 'normal'; S.pane.value = null
      S.finishEditing(); S.goSlide(1)
      const s = S.slide.value
      if (!s.elements.some(e => e.name === 'probe')) __pz.actions.insertShape('rect', { x: 700, y: 380, w: 120, h: 80 })
      const probe = S.slide.value.elements.find(e => e.type === 'shape' && !e.ph)
      if (probe && probe.name !== 'probe') S.updateEl(probe.id, e => { e.name = 'probe' })
      const body = S.slide.value.elements.find(e => e.ph === 'body') || S.slide.value.elements[1]
      S.select(${JSON.stringify(id)}.startsWith('obj.') || ${JSON.stringify(id)}.startsWith('align.') ? S.slide.value.elements.filter(e => !e.ph).map(e => e.id).concat([body.id]) : [body.id])
    })()`)
    const before = errors.length
    const snap = await ev(`JSON.stringify(__pz.store.doc.value).length + ':' + __pz.store.doc.value.slides.length + ':' + __pz.store.slideIdx.value`)
    let threw = null
    console.log('… ' + id)
    try { threw = await ev(`Promise.race([Promise.resolve(__pz.runCmd(${JSON.stringify(id)})).then(() => null), new Promise(r => setTimeout(() => r('still running after 4 s'), 4000))])`) } catch (e) { threw = e.message.split('\n')[0] }
    await wait(250)
    const after = await ev(`JSON.stringify(__pz.store.doc.value).length + ':' + __pz.store.doc.value.slides.length + ':' + __pz.store.slideIdx.value`)
    const ui = await ev(`[__pz.store.dialog.value?.type, __pz.store.backstage.value, __pz.store.pane.value, document.querySelector('.pop') ? 'pop' : null, __pz.store.view.value !== 'normal' ? __pz.store.view.value : null, __pz.store.editing.value ? 'editing' : null].filter(Boolean).join(',')`)
    const newErr = errors.slice(before)
    console.log(`${(newErr.length || threw) ? 'ERR ' : 'ok  '}${id.padEnd(22)} doc ${snap === after ? 'same' : 'changed'}${ui ? ' | ' + ui : ''}${threw ? ' | threw ' + threw : ''}${newErr.length ? ' | ' + newErr.join(' / ').slice(0, 300) : ''}`)
    if (ui.includes('pop') || ui.includes(',') || /hf|setupShow|size|symbol|zoom|link|alt|about|shortcuts|confirm/.test(ui)) await shot('cmd-' + id.replace(/[^\w.]/g, '_'))
    // a confirm dialog (File › Close) is answered with Cancel
    await ev(`(() => { const d = __pz.store.dialog.value; if (d && d.resolve) d.resolve('cancel'); __pz.store.closeDialog() })()`)
    await page.keyboard.press('Escape').catch(() => {})
  }
}

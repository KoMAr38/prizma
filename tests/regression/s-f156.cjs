// F1 close → Save → PDF must keep the window open; F5 edits during a save stay unsaved; F6 one recovery copy per window
const path = require('path'), fs = require('fs')
module.exports = async ({ app, page, ev, wait, errors, OUT }) => {
  const answerSave = p => app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, p)
  const idle = pg => pg.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 60000 })

  // ---- F5: a change made while the file is being written must leave the document unsaved
  await ev(`__pz.tour.loadTour(); __pz.store.backstage.value = null`)
  const f5 = path.join(OUT, 'f5.pptx')
  const r5 = await ev(`(async () => {
    const pr = __pz.files.writeTo(${JSON.stringify(f5)}, 'pptx')
    await new Promise(r => setTimeout(r, 5))
    __pz.actions.insertShape('star5')
    const ok = await pr
    return { ok, dirty: __pz.store.dirty.value }
  })()`)
  console.log('F5', JSON.stringify(r5))
  if (!r5.ok || r5.dirty !== true) errors.push(`F5: edit during save was marked saved ${JSON.stringify(r5)}`)
  // two saves at once must both finish and leave a readable file
  const r5b = await ev(`(async () => { const a = __pz.files.writeTo(${JSON.stringify(f5)}, 'pptx'), b = __pz.files.writeTo(${JSON.stringify(f5)}, 'pptx'); return [await a, await b, __pz.store.dirty.value] })()`)
  const head = fs.readFileSync(f5).subarray(0, 2).toString()
  console.log('F5 double save', JSON.stringify(r5b), 'zip header', head)
  if (!r5b[0] || !r5b[1] || r5b[2] || head !== 'PK') errors.push('F5: concurrent saves misbehaved')

  // ---- F1: closing a new, never saved deck → Save → choosing PDF writes the PDF but keeps the presentation open
  await ev(`__pz.files.newDocIn(); __pz.actions.insertShape('rect')`)
  const pdf = path.join(OUT, 'f1.pdf')
  await answerSave(pdf)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click({ timeout: 10000 })
  await wait(800); await idle(page); await wait(400)
  const alive = !page.isClosed()
  console.log('F1 window open:', alive, 'pdf:', fs.existsSync(pdf), alive ? 'dirty ' + await ev(`__pz.store.dirty.value`) : '')
  if (!alive) { errors.push('F1: window closed after saving only a PDF'); return }
  if (!fs.existsSync(pdf)) errors.push('F1: no PDF written')
  if (await ev(`__pz.store.dirty.value`) !== true) errors.push('F1: document not dirty after PDF export')

  // ---- F6: the same .prizma open in two windows keeps two recovery copies
  const deck = path.join(OUT, 'f6.prizma')
  await answerSave(deck)
  await ev(`__pz.files.saveAs('prizma')`); await idle(page)
  const rec = path.join(await app.evaluate(({ app }) => app.getPath('userData')), 'AutoRecover')
  fs.rmSync(rec, { recursive: true, force: true })
  const winB = app.waitForEvent('window', { timeout: 15000 })
  await ev(`window.prizmaNative.newWindow(null)`)
  const pageB = await winB
  await pageB.waitForLoadState('load')
  await pageB.waitForTimeout(800)
  await pageB.goto('app://prizma/index.html?test=1&r=' + Date.now() + '#editor')
  await pageB.waitForFunction(() => window.__pz && window.__pz.store.doc.value, null, { timeout: 20000 })
  for (const pg of [page, pageB]) {
    await pg.evaluate(async p => { await window.__pz.files.openPath(p, { here: true }); window.__pz.actions.insertShape('heart') }, deck)
    await pg.evaluate(() => { const s = window.__pz.store; s.settings.value = { ...s.settings.value, autosaveMinutes: 0.002 }; window.__pz.files.startAutosave() })
  }
  await wait(2500)
  const copies = () => (fs.existsSync(rec) ? fs.readdirSync(rec).filter(f => f.endsWith('.prizma')) : [])
  console.log('F6 copies after both windows autosaved:', copies().length)
  if (copies().length !== 2) errors.push(`F6: expected 2 recovery copies, found ${copies().length}`)
  for (const pg of [page, pageB]) await pg.evaluate(() => { const s = window.__pz.store; s.settings.value = { ...s.settings.value, autosaveMinutes: 0 }; window.__pz.files.startAutosave() })
  await pageB.evaluate(() => window.__pz.files.save()); await idle(pageB)
  console.log('F6 copies after window B saved:', copies().length)
  if (copies().length !== 1) errors.push(`F6: window B's save should remove only its own copy, ${copies().length} left`)
}

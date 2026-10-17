// A copy left by a crashed session is listed, restores into this window and moves to this window's key
const path = require('path'), fs = require('fs')
module.exports = async ({ app, page, ev, wait, errors, OUT }) => {
  const rec = path.join(await app.evaluate(({ app }) => app.getPath('userData')), 'AutoRecover')
  fs.rmSync(rec, { recursive: true, force: true }); fs.mkdirSync(rec, { recursive: true })
  // a .prizma of the tour, written by this build, stands in for the crashed session's copy
  await ev(`__pz.tour.loadTour()`)
  const deck = path.join(OUT, 'tour.prizma')
  await app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, deck)
  await ev(`__pz.files.saveAs('prizma')`)
  await page.waitForFunction(() => !window.__pz.store.busy.value)
  fs.copyFileSync(deck, path.join(rec, 'wold1.prizma'))
  fs.writeFileSync(path.join(rec, 'wold1.json'), JSON.stringify({ name: 'Crashed deck', path: null, id: 'wold1', time: Date.now() - 60000, pid: 999999 }))
  await ev(`__pz.files.newDocIn()`)
  const list = await ev(`(async () => { await __pz.files.loadRecovery(); return __pz.store.recovery.value.map(r => r.id) })()`)
  console.log('listed', JSON.stringify(list))
  if (!list.includes('wold1')) { errors.push('crashed copy not listed'); return }
  await ev(`__pz.files.openRecovered(__pz.store.recovery.value.find(r => r.id === 'wold1'))`)
  await wait(1500)
  const st = await ev(`({ slides: __pz.store.doc.value.slides.length, name: __pz.store.file.value.name, dirty: __pz.store.dirty.value })`)
  const files = fs.readdirSync(rec).sort()
  console.log('restored', JSON.stringify(st), 'files now', files.join(' '))
  if (st.slides !== 9 || !st.dirty) errors.push('restore did not load the deck as unsaved')
  if (files.includes('wold1.prizma') || files.filter(f => f.endsWith('.prizma')).length !== 1) errors.push('the restored copy was not moved to this window')
}

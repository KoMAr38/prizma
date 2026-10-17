// Older formats through LibreOffice: .ppt, .pps, .odp and a .ppt that was renamed to .pptx
const path = require('path')
module.exports = async ({ ev, wait, errors, shot }) => {
  for (const f of ['deck.ppt', 'deck.pps', 'deck.odp', 'misnamed.pptx']) {
    const r = await ev(`(async () => {
      const ok = await __pz.files.openPath(${JSON.stringify(path.join(__dirname, 'legacy', f))}, { here: true })
      const d = __pz.store.doc.value
      const msg = [...document.querySelectorAll('.toast')].map(t => t.textContent).pop() || (__pz.store.dialog.value && __pz.store.dialog.value.text) || null
      __pz.store.closeDialog()
      return { ok, slides: d.slides.length, els: d.slides.map(s => s.elements.length).join(','), media: d.slides.flatMap(s => s.elements).filter(e => e.src).map(e => e.type + (__pz.store.mediaInfo(e.src) ? '' : ':LOST')).join(','), file: __pz.store.file.value.path, msg }
    })()`)
    console.log(f.padEnd(14), JSON.stringify(r))
    if (!r.ok) errors.push(f + ' did not open')
    await shot('legacy-' + f.replace('.', '-'))
  }
}

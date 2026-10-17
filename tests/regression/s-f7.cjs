// F7: a picture used as a table cell fill survives Save as .prizma → reopen (and the AutoRecover copy, same writer)
const path = require('path')
module.exports = async ({ app, page, ev, wait, errors, OUT }) => {
  const deck = path.join(OUT, 'cellfill.prizma')
  const r = await ev(`(async () => {
    __pz.files.newDocIn()
    const c = document.createElement('canvas'); c.width = 64; c.height = 64
    const g = c.getContext('2d'); g.fillStyle = '#2DD4BF'; g.fillRect(0, 0, 64, 64)
    const bytes = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer())
    const src = __pz.store.addMedia(bytes, 'image/png')
    const t = __pz.actions.insertTable(2, 2)
    __pz.store.updateEl(t.id, e => { e.cells[0][0].fill = { type: 'image', src, mode: 'cover' } })
    await __pz.files.writeTo(${JSON.stringify(deck)}, 'prizma')
    await __pz.files.openPath(${JSON.stringify(deck)}, { here: true })
    const tt = __pz.store.doc.value.slides[0].elements.find(e => e.type === 'table')
    const id = tt.cells[0][0].fill?.src
    return { id, kept: !!__pz.store.mediaInfo(id)?.bytes?.length }
  })()`)
  console.log('F7', JSON.stringify(r))
  if (!r.kept) errors.push('F7: table cell picture lost after .prizma round trip')
}

// F3: picture export at every size keeps the whole slide; a selection saved as PNG keeps a transparent background
const path = require('path'), fs = require('fs')
module.exports = async ({ app, page, ev, wait, errors, OUT }) => {
  const answerSave = p => app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, p)
  const idle = () => page.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 60000 })
  // a blank slide: red square bottom-right, blue square top-left, green circle in the middle
  await ev(`(() => {
    __pz.files.newDocIn()
    const A = __pz.actions, S = __pz.store
    S.updateSlide(s => { s.elements = [] })
    const put = (shape, box, color) => { const e = A.insertShape(shape, box); S.updateEl(e.id, x => { x.fill = { type: 'solid', color }; x.line = null; x.shadow = null }); return e.id }
    put('rect', { x: 860, y: 440, w: 100, h: 100 }, '#FF0000')
    put('rect', { x: 0, y: 0, w: 100, h: 100 }, '#0000FF')
    window.__circle = put('ellipse', { x: 400, y: 200, w: 160, h: 160 }, '#00AA00')
  })()`)
  for (const scale of [1, 1.5, 2, 3]) {
    const p = path.join(OUT, `x${scale}.png`)
    await answerSave(p)
    await ev(`__pz.printing.exportImagesDialog({ fmt: 'png', which: 'current', scale: ${scale} })`)
    await wait(300); await idle()
  }
  await ev(`__pz.store.select([window.__circle])`)
  await answerSave(path.join(OUT, 'circle.png'))
  await ev(`__pz.printing.saveSelectionAsPicture()`)
  await wait(300); await idle()
  await answerSave(path.join(OUT, 'x2.jpg'))
  await ev(`__pz.store.select([]); __pz.printing.exportImagesDialog({ fmt: 'jpg', which: 'current', scale: 2 })`)
  await wait(300); await idle()
  console.log('files', fs.readdirSync(OUT).filter(f => /\.(png|jpg)$/.test(f)).join(' '))
}

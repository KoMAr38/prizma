// F2: a picture on the current slide must render in Slide Show, Presenter view and Reading view
module.exports = async ({ app, page, ev, wait, errors, OUT }) => {
  await ev(`(async () => {
    __pz.tour.loadTour(); __pz.store.backstage.value = null; __pz.store.goSlide(1)
    const c = document.createElement('canvas'); c.width = 320; c.height = 180
    const g = c.getContext('2d'); g.fillStyle = '#E5484D'; g.fillRect(0, 0, 320, 180); g.fillStyle = '#fff'; g.font = 'bold 48px sans-serif'; g.fillText('PNG', 90, 110)
    const bytes = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer())
    __pz.actions.insertImageBytes(bytes, 'image/png', 320, 180)
  })()`)
  await wait(300)
  const runs = [['show', `__pz.store.settings.value = { ...__pz.store.settings.value, presenterView: false }; __pz.runCmd('show.current')`],
    ['presenter', `__pz.runCmd('show.presenter')`],
    ['reading', `__pz.runCmd('view.reading')`]]
  for (const [name, js] of runs) {
    const waitWin = app.waitForEvent('window', { timeout: 15000 })
    await ev(js)
    const win = await waitWin
    await win.waitForLoadState('domcontentloaded')
    await win.waitForTimeout(1500)
    const r = await win.evaluate(() => ({ img: document.querySelectorAll('.pz-imgclip img').length, missing: document.querySelectorAll('.pz-missing').length }))
    console.log(name, JSON.stringify(r))
    if (!r.img || r.missing) errors.push(`${name}: picture not shown (${JSON.stringify(r)})`)
    await win.screenshot({ path: require('path').join(OUT, `f2-${name}.png`) })
    await win.keyboard.down('Escape').catch(() => {})
    await wait(800)
    if (await win.isClosed() === false) await win.close().catch(() => {})
    await wait(300)
  }
}

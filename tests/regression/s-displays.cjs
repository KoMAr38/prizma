// Two monitors (the screen list is faked in the main process): which monitor gets the show and which the presenter view
module.exports = async ({ app, page, ev, wait, errors }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const fake = async list => app.evaluate(({ screen }, list) => {
    const ds = list.map(([id, x, w, h]) => ({ id, label: 'Monitor ' + id, bounds: { x, y: 0, width: w, height: h }, workArea: { x, y: 0, width: w, height: h - 40 }, size: { width: w, height: h }, scaleFactor: 1 }))
    screen.getAllDisplays = () => ds
    screen.getPrimaryDisplay = () => ds[0]
  }, list)
  await ev(`(() => { const S = __pz.store; __pz.tour.loadTour(); __pz.files.newDocIn('aurora'); S.backstage.value = null; __pz.actions.addSlide('titleContent') })()`)
  const run = async (label, setup, want, cmd = 'show.start') => {
    await ev(setup)
    const opened = []
    const onWin = w => opened.push(w)
    app.on('window', onWin)
    await ev(`__pz.runCmd(${JSON.stringify(cmd)})`)
    await wait(2500)
    app.off('window', onWin)
    const got = {}
    for (const w of opened) {
      const u = new URL(w.url())
      got[u.hash.slice(1)] = u.searchParams.get('display') + (u.searchParams.get('solo') ? ' solo' : '')
    }
    for (const w of opened) await w.close().catch(() => {})
    await wait(800)
    check(JSON.stringify(got) === JSON.stringify(want), `${label}: ${JSON.stringify(got)}`)
  }
  await fake([[1, 0, 1920, 1080], [2, 1920, 1280, 720]])
  const S = `__pz.store`
  await run('two monitors, automatic', `${S}.settings.value = { ...${S}.settings.value, presenterView: true }`, { show: '2', presenter: '1' })
  await run('show on the main monitor', `(() => { const d = ${S}.doc.value; ${S}.doc.value = { ...d, show: { ...d.show, display: '1' } } })()`, { show: '1', presenter: '2' })
  await run('a monitor that is gone falls back', `(() => { const d = ${S}.doc.value; ${S}.doc.value = { ...d, show: { ...d.show, display: '999' } } })()`, { show: '2', presenter: '1' })
  await run('without presenter view', `${S}.settings.value = { ...${S}.settings.value, presenterView: false }`, { show: '2' })
  await fake([[1, 0, 1920, 1080]])
  // like PowerPoint: F5 on one screen is the normal show; Alt+F5 opens presenter view, which then runs the show itself
  await run('one monitor, F5', `${S}.settings.value = { ...${S}.settings.value, presenterView: true }`, { show: '1' })
  await run('one monitor, Alt+F5', '0', { presenter: '1 solo' }, 'show.presenter')
  await run('one monitor without presenter view', `${S}.settings.value = { ...${S}.settings.value, presenterView: false }`, { show: '1' })
}

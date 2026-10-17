// The fixes from the 1.0.3 audit: slide links in 1.0.1 decks, untrusted text in files, photos stored as they are,
// the show's handle, one file in two windows, settings shared between windows, closing a window whose page crashed.
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process')
module.exports = async ({ app, page, ev, wait, errors, OUT }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const idle = (p = page) => p.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 60000 })
  const saveAs = async (f, fmt) => {
    await app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, f)
    await ev(`__pz.files.saveAs('${fmt}')`); await idle()
  }
  const open = async f => { await ev(`__pz.files.openPath(${JSON.stringify(f)}, { here: true })`); await idle(); await wait(400) }
  const fresh = `__pz.tour.loadTour(); __pz.files.newDocIn('aurora'); __pz.store.backstage.value = null`

  // 1. A .pptx saved by 1.0.1 keeps slide links as positions inside Prizma's own copy of the deck
  const ids = await ev(`(() => { const A = __pz.actions, S = __pz.store; ${fresh}
    A.addSlide('titleContent'); A.addSlide('titleContent')
    const first = S.doc.value.slides[0].id
    S.updateSlide(s => { s.elements[0].link = { slide: first }; s.elements[1].html = '<p><a href="#slide:' + first + '">back</a></p>' })
    return S.doc.value.slides.map(s => s.id) })()`)
  const cur = path.join(OUT, 'links.pptx'), old = path.join(OUT, 'links-101.pptx')
  await saveAs(cur, 'pptx')
  execFileSync('python3', ['-c', `import zipfile, sys
zi = zipfile.ZipFile(sys.argv[1]); zo = zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED)
for n in zi.namelist():
  d = zi.read(n)
  if n == 'customXml/item1.xml': d = d.replace(('"link":{"slide":"' + sys.argv[3] + '"}').encode(), b'"link":{"slide":0}').replace(('#slide:' + sys.argv[3]).encode(), b'#slide:0')
  zo.writestr(n, d)
zo.close()`, cur, old, ids[0]])
  await open(old)
  const l = await ev(`(() => { const s = __pz.store.doc.value.slides; return { first: s[0].id, link: s[2].elements[0].link, html: s[2].elements[1].html } })()`)
  check(l.link?.slide === l.first, '1.0.1 deck: the shape link points at the first slide again: ' + JSON.stringify(l.link))
  check(l.html.includes('#slide:' + l.first), '1.0.1 deck: the link inside the text points at the first slide again')

  // 2. Text html in a file is untrusted: a <style> in it must not restyle Prizma (.prizma and Prizma's copy in .pptx)
  for (const fmt of ['prizma', 'pptx']) {
    await ev(`(() => { ${fresh}; __pz.store.updateSlide(s => { s.elements[0].html = '<p>Hello</p><style>.ribbon, .thumbs { visibility: hidden !important }</style>' }) })()`)
    const f = path.join(OUT, 'styled.' + fmt)
    await saveAs(f, fmt)
    await ev(fresh); await wait(300)
    await open(f)
    const r = await ev(`({ vis: getComputedStyle(document.querySelector('.ribbon')).visibility, html: __pz.store.doc.value.slides[0].elements[0].html })`)
    check(r.vis === 'visible' && !/<style/i.test(r.html) && /Hello/.test(r.html), `.${fmt}: a <style> in the text is dropped on open (ribbon ${r.vis}, text ${r.html})`)
  }

  // 3. Photos go into a .prizma as they are (deflating a JPEG only costs time)
  const jpg = fs.readFileSync(path.join(__dirname, 'fx', 'photo.jpg')).toString('base64')
  await ev(`(() => { ${fresh}; const b = Uint8Array.from(atob(${JSON.stringify(jpg)}), c => c.charCodeAt(0)); __pz.actions.insertImageBytes(b, 'image/jpeg', 640, 480) })()`)
  const pf = path.join(OUT, 'photo.prizma')
  await saveAs(pf, 'prizma')
  const methods = execFileSync('python3', ['-c', 'import zipfile, sys; print(" ".join(f"{i.filename}:{i.compress_type}" for i in zipfile.ZipFile(sys.argv[1]).infolist() if i.filename.startswith("media/")))', pf]).toString().trim()
  check(/\.jpg:0\b/.test(methods) && methods.split(' ').every(m => m.endsWith(':0')), 'the photo in a .prizma is stored, not deflated: ' + methods)

  // 4. After the show the editor lets go of the show's copy of the deck
  const shown = app.waitForEvent('window', { timeout: 15000 })
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, presenterView: false }; __pz.runCmd('show.start')`)
  const sw = await shown
  await sw.waitForLoadState('domcontentloaded'); await sw.waitForTimeout(900)
  const during = await ev(`!!window.__prizmaShow`)
  await sw.keyboard.down('Escape').catch(() => {}); await wait(900)
  if (!sw.isClosed()) await sw.close().catch(() => {})
  await wait(300)
  check(during && await ev(`window.__prizmaShow === null`), 'the show handle is cleared when the show ends')

  // 5. Window B opens the file window A has open: A comes forward, B doesn't load a second copy
  const shared = path.join(OUT, 'shared.pptx')
  await ev(`(() => { ${fresh}; __pz.actions.insertShape('rect') })()`)
  await saveAs(shared, 'pptx')
  const nb = app.waitForEvent('window', { timeout: 15000 })
  await ev(`window.prizmaNative.newWindow(null)`)
  const b = await nb
  await b.waitForLoadState('load'); await b.waitForTimeout(800)
  await b.goto('app://prizma/index.html?test=1&w=B&r=' + Date.now() + '#editor')
  await b.waitForFunction(() => window.__pz && window.__pz.store.doc.value, null, { timeout: 20000 })
  await b.evaluate(() => { window.__pz.store.backstage.value = null })
  await b.evaluate(p => window.__pz.files.openPath(p), shared); await idle(b); await wait(800)
  const inB = await b.evaluate(() => window.__pz.store.file.value.path)
  const wins = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  check(inB === null && wins === 2, `the file open in window A is not opened again in B (B has ${inB}, ${wins} windows)`)

  // 6. The interface theme chosen in window A reaches window B
  const theme = await ev(`__pz.store.settings.value.theme`)
  const ui = p => p.evaluate(() => document.documentElement.dataset.ui)
  const b0 = await ui(b)
  await ev(`__pz.runCmd('view.uiTheme')`); await wait(600)
  const a1 = await ui(page), b1 = await ui(b)
  check(a1 !== b0 && b1 === a1 && await b.evaluate(() => window.__pz.store.settings.value.theme) === await ev(`__pz.store.settings.value.theme`), `the theme set in A reaches B (A ${a1}, B ${b1})`)
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, theme: ${JSON.stringify(theme)} }; window.prizmaNative.setSettings({ theme: ${JSON.stringify(theme)} })`)

  // 7. Window B's page crashes with unsaved work: B starts over and offers its last autosave back, and X closes it
  const bName = await b.evaluate(() => window.__pz.store.file.value.name)
  await b.evaluate(() => { const z = window.__pz; z.actions.insertShape('ellipse'); z.store.settings.value = { ...z.store.settings.value, autosaveMinutes: 0.002 }; z.files.startAutosave() })
  await wait(1500) // one autosave lands
  // Playwright gives up on a crashed page, so B is read through Electron from here on
  const inWinB = (js, ms = 0) => app.evaluate(async ({ BrowserWindow }, [js, ms]) => {
    await new Promise(res => setTimeout(res, ms))
    const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().includes('w=B'))
    return w ? w.webContents.executeJavaScript(js).catch(e => 'error: ' + e.message) : 'no window B'
  }, [js, ms])
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(x => x.webContents.getURL().includes('w=B')).webContents.forcefullyCrashRenderer())
  let offered = null
  for (let i = 0; i < 20 && !(Array.isArray(offered) && offered.includes(bName)); i++) offered = await inWinB(`window.__pz ? window.__pz.store.recovery.value.map(r => r.name) : null`, 500)
  check(Array.isArray(offered) && offered.includes(bName), `after the crash window B starts over and offers the autosaved copy of ${bName}: ` + JSON.stringify(offered))
  await inWinB(`window.__pz.files.discardRecovered(window.__pz.store.recovery.value.find(r => r.name === ${JSON.stringify(bName)}))`)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(x => x.webContents.getURL().includes('w=B')).webContents.forcefullyCrashRenderer())
  const r = await app.evaluate(async ({ BrowserWindow }) => {
    // a second crash right after the first: no more restarts, and X still closes the window
    const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().includes('w=B'))
    await new Promise(res => setTimeout(res, 1500))
    w.close() // the X button
    await new Promise(res => setTimeout(res, 2000))
    const closed = w.isDestroyed()
    if (!closed) w.destroy()
    return { closed, left: BrowserWindow.getAllWindows().length }
  })
  check(r.closed && r.left === 1, `a crashed window closes on X (closed ${r.closed}, ${r.left} window left)`)
}

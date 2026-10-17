// Pictures, video and audio: insert through the real commands, play in the editor and in the show, survive .pptx and .prizma
const path = require('path'), fs = require('fs')
const FX = path.join(__dirname, 'fx')
module.exports = async ({ app, page, ev, wait, errors, OUT, shot }) => {
  const answerOpen = files => app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: f }) }, files)
  const answerSave = p => app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, p)
  const idle = () => page.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 60000 })
  await ev(`__pz.files.newDocIn(); __pz.store.updateSlide(s => { s.elements = [] })`)

  // ---- pictures of every type the Insert › Pictures dialog offers (plus a TIFF through "All files")
  const pics = ['photo.jpg', 'logo.png', 'art.svg', 'pic.gif', 'pic.webp', 'pic.bmp', 'pic.ico', 'pic.avif', 'pic.tif']
  await answerOpen(pics.map(f => path.join(FX, f)))
  await ev(`__pz.runCmd('ins.picture')`)
  await wait(2000)
  const imgs = await ev(`[...document.querySelectorAll('.stage-canvas .pz-image')].map(n => { const i = n.querySelector('img'); return i ? (i.naturalWidth > 0 ? 'ok' : 'broken') : 'none' })`)
  const toasts = await ev(`[...document.querySelectorAll('.toast')].map(t => t.textContent)`)
  console.log('pictures', pics.length, '→', JSON.stringify(imgs), 'toasts', JSON.stringify(toasts))
  if (imgs.length !== 8 || imgs.some(x => x !== 'ok')) errors.push('pictures: expected 8 shown and the TIFF refused')
  if (!toasts.some(t => /pic\.tif/.test(t))) errors.push('no message for the TIFF')
  await shot('media-pictures')

  // ---- video and audio on a new slide
  await ev(`__pz.actions.addSlide ? __pz.actions.addSlide() : __pz.runCmd('slide.new'); __pz.store.updateSlide(s => { s.elements = [] })`)
  for (const [kind, f] of [['video', 'clip.mp4'], ['video', 'clip.webm'], ['video', 'clip.mov'], ['audio', 'tone.wav'], ['audio', 'tone.mp3'], ['audio', 'tone.ogg'], ['audio', 'tone.m4a']]) {
    await answerOpen([path.join(FX, f)])
    await ev(`__pz.runCmd('ins.${kind}')`)
    await wait(400)
  }
  await ev(`__pz.store.updateSlide(s => s.elements.forEach((e, i) => { e.x = 20 + (i % 4) * 230; e.y = 30 + Math.floor(i / 4) * 220; e.w = 200; e.h = e.type === 'audio' ? 48 : 112 }))`)
  const els = await ev(`__pz.store.slide.value.elements.map(e => e.type + ':' + __pz.store.mediaInfo(e.src)?.mime)`)
  console.log('media elements', JSON.stringify(els))
  const play = await ev(`(async () => {
    const out = []
    for (const e of __pz.store.slide.value.elements) {
      const m = document.createElement(e.type === 'video' ? 'video' : 'audio')
      m.muted = true; m.src = __pz.store.mediaUrl(e.src)
      const r = await new Promise(res => { m.onloadedmetadata = () => res(m.duration.toFixed(1)); m.onerror = () => res('ERROR ' + (m.error && m.error.code)); setTimeout(() => res('timeout'), 5000) })
      out.push(e.type + ' ' + __pz.store.mediaInfo(e.src)?.mime + ' ' + r)
    }
    return out
  })()`)
  console.log('decodes', JSON.stringify(play))
  for (const p of play) if (!/ \d+\.\d$/.test(p)) errors.push('media does not decode: ' + p)
  await shot('media-slide')

  // ---- in the slide show: click the first video, it plays
  await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, presenterView: false }`)
  const waitWin = app.waitForEvent('window', { timeout: 15000 })
  await ev(`__pz.runCmd('show.current')`)
  const win = await waitWin
  await win.waitForLoadState('domcontentloaded'); await win.waitForTimeout(1500)
  const vbox = await win.evaluate(() => { const v = document.querySelector('video.pz-media-node'); const r = v && v.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  if (vbox) { await win.mouse.click(vbox.x, vbox.y); await win.waitForTimeout(1500) }
  const st = await win.evaluate(() => [...document.querySelectorAll('.pz-media-node')].map(m => m.tagName + ' paused=' + m.paused + ' t=' + m.currentTime.toFixed(1) + ' ready=' + m.readyState))
  console.log('show media', JSON.stringify(st))
  if (!st.length || !/paused=false/.test(st[0])) errors.push('clicking the video in the show did not play it')
  await win.screenshot({ path: path.join(OUT, 'media-show.png') })
  await win.keyboard.down('Escape').catch(() => {}); await wait(800)

  // ---- round trips keep every medium
  for (const ext of ['pptx', 'prizma']) {
    const f = path.join(OUT, 'media.' + ext)
    await answerSave(f)
    await ev(`__pz.files.saveAs('${ext}')`); await wait(300); await idle()
    await ev(`__pz.files.openPath(${JSON.stringify(f)}, { here: true })`); await wait(300); await idle()
    const back = await ev(`__pz.store.doc.value.slides.map(s => s.elements.map(e => e.type + (e.src ? ':' + (__pz.store.mediaInfo(e.src)?.bytes?.length > 0 ? 'ok' : 'LOST') : '')).join(','))`)
    console.log(ext, 'reopened', JSON.stringify(back))
    if (JSON.stringify(back).includes('LOST')) errors.push(ext + ': media lost on reopen')
  }
}

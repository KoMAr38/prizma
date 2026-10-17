// A big deck: 200 slides, each with its own photo. Build, save (.prizma and .pptx), reopen, scroll, sorter, memory.
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process')
module.exports = async ({ app, page, ev, wait, errors, OUT, shot }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const idle = () => page.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 300000 })
  const N = 200
  const dir = path.join(OUT, 'imgs'); fs.mkdirSync(dir, { recursive: true })
  execFileSync('python3', ['-c', `import sys, numpy as np
from PIL import Image
d, n = sys.argv[1], int(sys.argv[2]); rng = np.random.default_rng(7)
for i in range(n):
  y, x = np.mgrid[0:540, 0:960]
  base = np.stack([(x * (i % 7 + 1) // 9) % 256, (y * (i % 5 + 2) // 4) % 256, ((x + y) * (i % 3 + 1) // 6) % 256], -1)
  im = (base + rng.integers(0, 40, base.shape)).clip(0, 255).astype('uint8')
  Image.fromarray(im).save(f'{d}/p{i}.jpg', quality=82)`, dir, String(N)])
  const total = fs.readdirSync(dir).reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0)
  console.log(`   ${N} photos, ${(total / 1e6).toFixed(1)} MB`)

  let t = Date.now()
  await ev(`(() => { const S = __pz.store; __pz.tour.loadTour(); __pz.files.newDocIn('aurora'); S.backstage.value = null })()`)
  for (let i = 0; i < N; i += 20) {
    const batch = []
    for (let k = i; k < Math.min(N, i + 20); k++) batch.push(fs.readFileSync(path.join(dir, `p${k}.jpg`)).toString('base64'))
    await ev(`(async () => {
      const A = __pz.actions, S = __pz.store, list = ${JSON.stringify(batch)}
      for (let j = 0; j < list.length; j++) {
        const n = ${i} + j
        if (n) A.addSlide('titleOnly'); else A.setLayout('titleOnly')
        S.updateSlide(s => { s.elements.find(e => e.ph === 'title').html = '<p>Photo ' + (n + 1) + '</p>' })
        const bin = Uint8Array.from(atob(list[j]), c => c.charCodeAt(0))
        A.insertImageBytes(bin, 'image/jpeg', 960, 540)
      }
    })()`)
  }
  const built = (Date.now() - t) / 1000
  const n = await ev(`__pz.store.doc.value.slides.length`)
  const pics = await ev(`__pz.store.doc.value.slides.filter(s => s.elements.some(e => e.type === 'image')).length`)
  check(n === N && pics === N, `built ${n} slides with ${pics} photos in ${built.toFixed(1)} s`)

  // save both formats
  const timeSave = async (fmt, f) => {
    await app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, f)
    const t0 = Date.now(); await ev(`__pz.files.saveAs(${JSON.stringify(fmt)})`); await wait(200); await idle()
    return { s: (Date.now() - t0) / 1000, mb: fs.existsSync(f) ? fs.statSync(f).size / 1e6 : 0 }
  }
  const fN = path.resolve(OUT, 'big.prizma'), fP = path.resolve(OUT, 'big.pptx')
  const sN = await timeSave('prizma', fN), sP = await timeSave('pptx', fP)
  check(sN.mb > total / 1e6 * 0.9 && sN.s < 20, `saved .prizma in ${sN.s.toFixed(1)} s (${sN.mb.toFixed(1)} MB)`)
  check(sP.mb > total / 1e6 * 0.9 && sP.s < 30, `saved .pptx in ${sP.s.toFixed(1)} s (${sP.mb.toFixed(1)} MB)`)

  // reopen both
  for (const f of [fN, fP]) {
    await ev(`__pz.files.newDocIn('aurora')`)
    const t0 = Date.now()
    const ok = await ev(`__pz.files.openPath(${JSON.stringify(f)}, { here: true })`); await idle()
    const secs = (Date.now() - t0) / 1000
    const r = await ev(`(() => { const d = __pz.store.doc.value; return { n: d.slides.length, pics: d.slides.filter(s => s.elements.some(e => e.type === 'image')).length, name: __pz.store.file.value.name } })()`)
    check(ok && r.n === N && r.pics === N, `reopened ${path.basename(f)} in ${secs.toFixed(1)} s: ${r.n} slides, ${r.pics} photos`)
  }
  // no graphics card here: the glass panels drop their background blur (the CPU would redraw it every frame)
  const soft = await app.evaluate(({ app }) => !/^enabled/.test(app.getGPUFeatureStatus().gpu_compositing || ''))
  const gpu = await ev(`[document.documentElement.dataset.gpu, getComputedStyle(document.querySelector('.panel')).backdropFilter]`)
  check(gpu[0] === (soft ? 'off' : 'on') && (gpu[1] === 'none') === soft, `GPU compositing ${soft ? 'off' : 'on'}: panels' backdrop filter is ${gpu[1]}`)

  // scrolling the slide list to the end and jumping there
  t = Date.now()
  await ev(`__pz.store.goSlide(${N - 1})`)
  await page.waitForFunction(() => { const th = [...document.querySelectorAll('.thumbs .th')]; const last = th[th.length - 1]; const r = last?.getBoundingClientRect(); return r && r.bottom <= innerHeight + 2 && last.querySelector('img')?.complete }, null, { timeout: 30000 }).catch(() => null)
  const jump = (Date.now() - t) / 1000
  await wait(300); await shot('big-last')
  const broken = await ev(`[...document.querySelectorAll('.panel-stage img, .thumbs img')].filter(im => im.complete && !im.naturalWidth).length`)
  check(jump < 5 && broken === 0, `jump to slide ${N}: ${jump.toFixed(1)} s, broken pictures: ${broken}`)

  // slide sorter with every slide
  t = Date.now()
  await ev(`__pz.store.view.value = 'sorter'`)
  await page.waitForFunction(n => document.querySelectorAll('.sorter .pz-slide').length >= Math.min(n, 12), N, { timeout: 30000 })
  const sorter = (Date.now() - t) / 1000
  await wait(500); await shot('big-sorter')
  const drawn = await ev(`document.querySelectorAll('.sorter .pz-slide').length`)
  check(sorter < 5, `sorter opens in ${sorter.toFixed(1)} s (${drawn} slides drawn now)`)
  // scrolling the sorter stays responsive: frames while scrolling
  const fps = await ev(`(async () => {
    const el = document.querySelector('.sorter'); let frames = 0, run = true
    const tick = () => { frames++; if (run) requestAnimationFrame(tick) }; requestAnimationFrame(tick)
    const t0 = performance.now()
    for (let y = 0; y < el.scrollHeight; y += 400) { el.scrollTop = y; await new Promise(r => setTimeout(r, 16)) }
    run = false
    return Math.round(frames / ((performance.now() - t0) / 1000))
  })()`)
  console.log(`   sorter scrolls at ${fps} frames/s here (software rendering, no GPU)`)
  await ev(`__pz.store.view.value = 'normal'`)

  const mem = await app.evaluate(({ app }) => app.getAppMetrics().reduce((a, m) => a + (m.memory?.workingSetSize || 0), 0) / 1024)
  check(mem < 2500, `memory for everything: ${Math.round(mem)} MB`)

  // undo still works on a big deck and is quick
  t = Date.now()
  await ev(`__pz.actions.deleteSlides ? __pz.actions.deleteSlides([__pz.store.doc.value.slides[5].id]) : null`)
  const del = await ev(`__pz.store.doc.value.slides.length`)
  await page.keyboard.press('Control+z'); await wait(200)
  const back = await ev(`__pz.store.doc.value.slides.length`)
  check(del === N - 1 && back === N, `delete and undo a slide (${del} → ${back}) in ${((Date.now() - t) / 1000).toFixed(1)} s`)
}

// A photo album: 40 camera-size photos (4000 × 3000). Memory, responsiveness, save and reopen.
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process')
module.exports = async ({ app, page, ev, wait, errors, OUT, shot }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const idle = () => page.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 300000 })
  const N = 40, dir = path.join(OUT, 'cam'); fs.mkdirSync(dir, { recursive: true })
  if (fs.readdirSync(dir).length < N) execFileSync('python3', ['-c', `import sys, numpy as np
from PIL import Image
d, n = sys.argv[1], int(sys.argv[2]); rng = np.random.default_rng(3)
y, x = np.mgrid[0:3000, 0:4000]
for i in range(n):
  base = np.stack([(x * (i % 7 + 1) // 31) % 256, (y * (i % 5 + 2) // 23) % 256, ((x + y) * (i % 3 + 1) // 41) % 256], -1)
  im = (base + rng.integers(0, 24, base.shape)).clip(0, 255).astype('uint8')
  Image.fromarray(im).save(f'{d}/c{i}.jpg', quality=88)`, dir, String(N)], { timeout: 600000 })
  const total = fs.readdirSync(dir).reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0)
  console.log(`   ${N} photos 4000×3000, ${(total / 1e6).toFixed(0)} MB`)
  const memMB = () => app.evaluate(({ app }) => Math.round(app.getAppMetrics().reduce((a, m) => a + (m.memory?.workingSetSize || 0), 0) / 1024))
  const before = await memMB()
  await ev(`(() => { const S = __pz.store; __pz.tour.loadTour(); __pz.files.newDocIn('aurora'); S.backstage.value = null })()`)
  let t = Date.now()
  for (let i = 0; i < N; i++) {
    // the way Insert › Pictures goes: Prizma reads the file, loadPicture sizes it, then it lands on the slide
    await ev(`(async () => { const A = __pz.actions
      if (${i}) A.addSlide('blank'); else A.setLayout('blank')
      const p = await A.loadPicture(await window.prizmaNative.readFile(${JSON.stringify(path.join(dir, `c${i}.jpg`))}), 'image/jpeg')
      A.insertImageBytes(p.bytes, p.mime, p.w, p.h) })()`)
  }
  await wait(2000)
  const built = (Date.now() - t) / 1000
  const after = await memMB()
  console.log(`   inserted in ${built.toFixed(1)} s; memory ${before} → ${after} MB`)
  // the way every insert goes (Insert › Pictures, paste, drop): a camera photo is scaled to what the slide shows at 220 ppi
  const dims = await ev(`[...new Set(__pz.store.doc.value.slides.flatMap(s => s.elements.filter(e => e.type === 'image').map(e => e.natW + 'x' + e.natH)))]`)
  check(dims.length === 1 && dims[0] === '2200x1650', 'photos are stored at ' + dims.join(', ') + ' (220 ppi of a 16:9 slide)')
  const one = fs.readFileSync(path.join(dir, 'c0.jpg'))
  const kept = await ev(`(async () => { const S = __pz.store; S.settings.value = { ...S.settings.value, keepPictures: true }
    const p = await __pz.actions.loadPicture(Uint8Array.from(atob(${JSON.stringify(one.toString('base64'))}), c => c.charCodeAt(0)), 'image/jpeg')
    S.settings.value = { ...S.settings.value, keepPictures: false }
    return p.w + 'x' + p.h + ' ' + p.bytes.length })()`)
  check(kept === `4000x3000 ${one.length}`, 'with "Keep pictures at full size" the photo goes in untouched: ' + kept)
  // responsiveness: how long a click on a thumbnail takes to show the slide
  const lat = []
  for (const i of [5, 25, 39, 0]) {
    const t0 = Date.now()
    await page.locator('.thumbs .th').nth(i).click()
    await page.waitForFunction(i => window.__pz.store.slideIdx.value === i && document.querySelector('.panel-stage img')?.complete, i, { timeout: 30000 })
    lat.push(Date.now() - t0)
  }
  check(Math.max(...lat) < 1500, `switching slides takes ${lat.join(', ')} ms`)
  t = Date.now(); await ev(`__pz.store.view.value = 'sorter'`); await page.waitForFunction(() => [...document.querySelectorAll('.sorter img')].length >= 12 && [...document.querySelectorAll('.sorter img')].every(i => i.complete), null, { timeout: 60000 })
  const sorter = (Date.now() - t) / 1000; await wait(1500)
  const sorterMem = await memMB()
  check(sorter < 5, `sorter shows ${N} photos in ${sorter.toFixed(1)} s; memory ${sorterMem} MB`)
  // thumbnails draw 800 px copies of the photos (the canvas keeps the full picture)
  const sizes = await ev(`[...document.querySelectorAll('.sorter .pz-image img')].map(i => i.naturalWidth)`)
  check(sizes.length >= 12 && Math.max(...sizes) === 800, `sorter pictures are small copies: ${[...new Set(sizes)].join(', ')} px wide`)
  await ev(`__pz.store.view.value = 'normal'`)
  const f = path.resolve(OUT, 'album.pptx')
  await app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, f)
  t = Date.now(); await ev(`__pz.files.saveAs('pptx')`); await wait(200); await idle()
  const saved = (Date.now() - t) / 1000, mb = fs.statSync(f).size / 1e6
  check(saved < 20 && mb < 40, `saved album.pptx (${mb.toFixed(0)} MB, the photos alone are ${(total / 1e6).toFixed(0)} MB) in ${saved.toFixed(1)} s`)
  await ev(`__pz.files.newDocIn('aurora')`)
  t = Date.now(); const ok = await ev(`__pz.files.openPath(${JSON.stringify(f)}, { here: true })`); await idle()
  const opened = (Date.now() - t) / 1000
  const n = await ev(`__pz.store.doc.value.slides.filter(s => s.elements.some(e => e.type === 'image')).length`)
  check(ok && n === N && opened < 15, `reopened in ${opened.toFixed(1)} s with ${n} photos; memory ${await memMB()} MB`)

  // a deck made elsewhere with the full camera photos in it: opening it keeps the JS heap near the file size
  // (pictures once went through base64 copies, about 16 times the file, and a 280 MB deck crashed the window)
  const deck = path.join(OUT, 'camera-deck.pptx')
  execFileSync('python3', ['-c', `import sys, glob
from pptx import Presentation
from pptx.util import Emu
p = Presentation(); p.slide_width, p.slide_height = Emu(12192000), Emu(6858000)
for f in sorted(glob.glob(sys.argv[1] + '/c*.jpg')): p.slides.add_slide(p.slide_layouts[6]).shapes.add_picture(f, Emu(609600), Emu(457200), Emu(10972800), Emu(5943600))
p.save(sys.argv[2])`, dir, deck])
  const deckMB = fs.statSync(deck).size / 1e6
  await ev(`__pz.files.newDocIn('aurora')`)
  t = Date.now()
  const big = await ev(`(async () => { const h = () => performance.memory.usedJSHeapSize, base = h(); let max = base
    const t = setInterval(() => { max = Math.max(max, h()) }, 20)
    const ok = await __pz.files.openPath(${JSON.stringify(deck)}, { here: true }); clearInterval(t)
    return { ok, rise: Math.round((Math.max(max, h()) - base) / 1e6), n: __pz.store.doc.value.slides.length } })()`); await idle()
  check(big.ok && big.n === N && big.rise < 4 * deckMB, `opened a ${deckMB.toFixed(0)} MB camera deck in ${((Date.now() - t) / 1000).toFixed(1)} s, JS heap rose ${big.rise} MB`)

  // A big file crosses between Prizma's two halves in pieces of a few MB, so the window keeps drawing while it is read,
  // saved or copied for AutoRecover (in one piece a 280 MB deck held it still for 3 to 4 s each time)
  const frozen = async fn => {
    await ev(`window.__worst = 0; window.__last = performance.now(); window.__run = true; (function t (x) { if (x) { window.__worst = Math.max(window.__worst, x - window.__last); window.__last = x } if (window.__run) requestAnimationFrame(t) })()`)
    await fn()
    return ev(`(window.__run = false, Math.round(window.__worst))`)
  }
  await wait(4000) // the slide list's small copies of the photos are made first
  for (const fmt of ['prizma', 'pptx']) {
    const out = path.resolve(OUT, 'camera-out.' + fmt)
    await app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, out)
    const sw = await frozen(async () => { await ev(`__pz.files.saveAs('${fmt}')`); await wait(200); await idle() })
    const same = execFileSync('python3', ['-c', `import sys, zipfile, hashlib
z = zipfile.ZipFile(sys.argv[1]); print(len([n for n in z.namelist() if n.endswith('.jpeg') or n.endswith('.jpg')]), z.testzip())`, out]).toString().trim()
    check(sw < 400 && same === `${N} None`, `saving it as .${fmt}: the window stood still at most ${sw} ms, and the file holds the ${N} photos intact (${same})`)
  }
  const rec = path.join(await app.evaluate(({ app }) => app.getPath('userData')), 'AutoRecover')
  const copies = () => fs.existsSync(rec) ? fs.readdirSync(rec).filter(f => f.endsWith('.json')) : []
  const had = copies().length
  await ev(`__pz.actions.insertShape('ellipse')`)
  const aw = await frozen(async () => {
    await ev(`(() => { const s = __pz.store; s.settings.value = { ...s.settings.value, autosaveMinutes: 0.002 }; __pz.files.startAutosave() })()`)
    for (let i = 0; i < 160 && copies().length <= had; i++) await wait(250)
    await ev(`(() => { const s = __pz.store; s.settings.value = { ...s.settings.value, autosaveMinutes: 0 }; __pz.files.startAutosave() })()`)
  })
  const mine = copies().map(f => JSON.parse(fs.readFileSync(path.join(rec, f), 'utf8'))).find(m => m.pid !== 999999 && m.name === 'camera-out')
  const back = mine ? await ev(`__pz.store.native.readFile(${JSON.stringify(path.join(rec, mine.id + '.prizma'))}).then(b => b.length)`) : 0
  check(mine && back > deckMB * 1e6 * 0.9 && aw < 400, `the AutoRecover copy (${((back || 0) / 1e6).toFixed(0)} MB) is written while the window stands still at most ${aw} ms`)
  if (mine) for (const ext of ['.prizma', '.json']) fs.rmSync(path.join(rec, mine.id + ext), { force: true }) // not offered to the next test
  const huge = path.join(OUT, 'huge.bin'); fs.writeFileSync(huge, Buffer.alloc(300e6, 7))
  let read = 0
  const rw = await frozen(async () => { read = await ev(`__pz.store.native.readFile(${JSON.stringify(huge)}).then(b => b.length)`) })
  fs.rmSync(huge, { force: true })
  check(read === 300e6 && rw < 400, `reading a 300 MB file, the longest the window stood still was ${rw} ms`)

  // a photo turned by its EXIF tag: the slide list's small copy is turned the same way as the canvas
  const ex = path.join(OUT, 'exif6.jpg')
  execFileSync('python3', ['-c', `import sys, numpy as np
from PIL import Image
a = np.random.default_rng(5).integers(0, 255, (1500, 3000, 3), dtype='uint8'); a[:, :1000] = [220, 30, 30]
e = Image.Exif(); e[0x0112] = 6
Image.fromarray(a).save(sys.argv[1], quality=90, exif=e.tobytes())`, ex])
  await ev(`__pz.files.newDocIn('aurora')`)
  await ev(`(async () => { const A = __pz.actions; A.setLayout('blank'); A.insertImageBytes(await window.prizmaNative.readFile(${JSON.stringify(ex)}), 'image/jpeg', 1500, 3000) })()`)
  await page.waitForFunction(() => document.querySelector('.thumbs .pz-image img')?.naturalWidth && document.querySelector('.panel-stage .pz-image img')?.naturalWidth, null, { timeout: 20000 }).catch(() => {})
  const turned = await ev(`['.panel-stage', '.thumbs'].map(p => { const i = document.querySelector(p + ' .pz-image img'); return i ? i.naturalWidth + 'x' + i.naturalHeight : '' })`)
  check(turned[0] === '1500x3000' && turned[1] === '400x800', `EXIF-turned photo: canvas ${turned[0]}, slide list copy ${turned[1]}`)
}

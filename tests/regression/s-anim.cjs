// Every animation effect (each direction) and every transition: plays in the show, ends in the right state, survives .pptx
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process')
module.exports = async ({ app, page, ev, wait, errors, OUT, shot }) => {
  const answerSave = p => app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, p)
  const idle = () => page.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 60000 })
  // slide 1..n: one slide per animation variant (effect × direction), a shape and a text box animated on click
  const src = fs.readFileSync(require('path').join(__dirname, '../../src/renderer/show/effects.js'), 'utf8')
  const cat = JSON.parse(execFileSync('node', ['--input-type=module', '-e', src + '\nconsole.log(JSON.stringify({ anims: ANIMS, trans: TRANSITIONS }))']).toString())
  const list = []
  for (const a of cat.anims) for (const dir of a.dirs || [null]) list.push({ effect: a.id, kind: a.kind, dir })
  await ev(`(async () => {
    const S = __pz.store, A = __pz.actions
    __pz.files.newDocIn(); S.backstage.value = null
    const list = ${JSON.stringify(list)}
    for (let i = 0; i < list.length; i++) {
      if (i) A.addSlide()
      S.updateSlide(s => { s.elements = [] })
      const sh = A.insertShape('roundRect', { x: 380, y: 200, w: 200, h: 140 })
      S.select([sh.id])
      A.addAnimation(list[i].effect, list[i].kind, true)
      if (list[i].dir) { const a = S.slide.value.animations[0]; A.updateAnimation(a.id, { dir: list[i].dir }) }
    }
  })()`)
  const n = await ev(`__pz.store.doc.value.slides.length`)
  console.log('animation slides', n, 'variants', list.length)
  // transitions: one more slide per transition and direction
  const tlist = []
  for (const t of cat.trans) if (t.id !== 'none') for (const dir of t.dirs || [null]) tlist.push({ type: t.id, dir })
  await ev(`(() => {
    const S = __pz.store, A = __pz.actions
    for (const t of ${JSON.stringify(tlist)}) { A.addSlide(); S.updateSlide(s => { s.elements = []; s.transition = { type: t.type, dur: 0.4, ...(t.dir ? { dir: t.dir } : {}) } }); A.insertShape('ellipse', { x: 100 + Math.random() * 500, y: 120, w: 160, h: 160 }) }
  })()`)
  const total = await ev(`__pz.store.doc.value.slides.length`)
  console.log('slides with transitions', total - n, 'total', total)

  // play the whole show: each animated slide gets one click for its effect, one to move on
  await ev(`__pz.store.goSlide(0); __pz.store.settings.value = { ...__pz.store.settings.value, presenterView: false }`)
  const waitWin = app.waitForEvent('window', { timeout: 15000 })
  await ev(`__pz.runCmd('show.start')`)
  const win = await waitWin
  await win.waitForLoadState('domcontentloaded'); await win.waitForTimeout(800)
  const wrong = []
  const ids = await ev(`__pz.store.doc.value.slides.map(s => s.elements[0] && s.elements[0].id)`)
  const state = id => win.evaluate(id => { const el = [...document.querySelectorAll('.show-layer .pz-el[data-id="' + id + '"]')].pop(); if (!el) return 'none'; const cs = getComputedStyle(el); return cs.visibility + '/' + Number(cs.opacity).toFixed(2) }, id)
  for (let i = 0; i < n; i++) {
    const start = await state(ids[i])
    const startWant = list[i].kind === 'entr' ? /^hidden/ : /^visible\/1\.00$/
    if (!startWant.test(start)) wrong.push(`${list[i].effect}${list[i].dir ? '-' + list[i].dir : ''} before the click: ${start}`)
    await win.keyboard.press('ArrowRight'); await win.waitForTimeout(list[i].effect === 'bounce' || list[i].kind === 'emph' ? 1300 : 750)
    const vis = await state(ids[i])
    // Transparency stays at 50% until the slide ends, as in PowerPoint
    const want = list[i].kind === 'exit' ? /^hidden|\/0\.00$/ : list[i].effect === 'transparency' ? /^visible\/0\.50$/ : /^visible\/1\.00$/
    if (!want.test(vis)) wrong.push(`${list[i].effect}${list[i].dir ? '-' + list[i].dir : ''}: ${vis}`)
    if (i === 5) await win.screenshot({ path: path.join(OUT, 'anim-mid.png') })
    await win.keyboard.press('ArrowRight'); await win.waitForTimeout(150)
  }
  for (let i = n; i < total; i++) { await win.keyboard.press('ArrowRight'); await win.waitForTimeout(550) }
  console.log('effects not in their end state:', wrong.length ? wrong.join(', ') : 'none')
  if (wrong.length) errors.push('animations end wrong: ' + wrong.join(', '))
  await win.keyboard.down('Escape').catch(() => {}); await wait(800)

  // .pptx: schema-valid, and the PowerPoint reader path (without Prizma's own copy) gets every effect back
  const f = path.join(OUT, 'anim.pptx')
  await answerSave(f)
  await ev(`__pz.files.saveAs('pptx')`); await wait(300); await idle()
  const val = execFileSync('bash', ['-c', `cd ${path.join(__dirname, 'val')} && java -cp ".:*" Validate ${f} 2>&1 | tail -3`]).toString()
  console.log('schema:', val.trim().split('\n').pop())
  if (!/invalid 0/.test(val)) errors.push('pptx schema errors: ' + val.slice(0, 400))
  const bare = path.join(OUT, 'anim-bare.pptx')
  execFileSync('python3', ['-c', `import zipfile,sys\nzi=zipfile.ZipFile(sys.argv[1]);zo=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED)\nfor n in zi.namelist():\n  d=zi.read(n)\n  if n.startswith('customXml/'): continue\n  if n=='ppt/_rels/presentation.xml.rels': d=d.replace(b'Target="../customXml/item1.xml"',b'Target="../customXml/missing.xml"')\n  zo.writestr(n,d)\nzo.close()`, f, bare])
  const opened = await ev(`__pz.files.openPath(${JSON.stringify(bare)}, { here: true })`); await wait(300); await idle()
  const openedName = await ev(`__pz.store.file.value.name`)
  if (!opened || !/bare/.test(openedName)) errors.push('the plain PowerPoint copy did not open: ' + openedName)
  const back = await ev(`__pz.store.doc.value.slides.map(s => (s.animations || []).map(a => a.effect + (a.dir ? '-' + a.dir : '')).join('+') + '|' + (s.transition ? s.transition.type + (s.transition.dir ? '-' + s.transition.dir : '') : ''))`)
  const lost = []
  list.forEach((v, i) => { const want = v.effect + (v.dir ? '-' + v.dir : ''); if (back[i].split('|')[0] !== want) lost.push(`${want} → ${back[i].split('|')[0] || 'nothing'}`) })
  tlist.forEach((t, j) => { const want = t.type + (t.dir ? '-' + t.dir : ''); const got = back[n + j].split('|')[1]; if (got !== want) lost.push(`${want} → ${got || 'nothing'}`) })
  console.log('changed through PowerPoint XML:', lost.length ? lost.join(', ') : 'none')
  if (lost.length) errors.push('effects changed through .pptx: ' + lost.join(', '))
}

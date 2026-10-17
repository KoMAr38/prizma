// The fixes from the 1.0.3 code review: model and actions, editing on the canvas, dialogs, files and the shell.
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process')
module.exports = async ({ app, page, ev, wait, errors, OUT }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const sec = async (name, fn) => { try { await fn() } catch (e) { check(false, `${name} threw: ${(e.stack || e.message).split('\n').slice(0, 2).join(' | ')}`) } }
  const idle = () => page.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 60000 })
  const fresh = async () => { await ev(`(() => { const S = __pz.store; __pz.files.newDocIn(); S.backstage.value = null; S.closeDialog(); S.cropMode.value = null; S.updateSlide(s => { s.elements = [] }); S.select([]) })()`); await wait(250) }
  const el = id => ev(`JSON.parse(JSON.stringify(__pz.store.slide.value.elements.find(e => e.id === ${JSON.stringify(id)}) || null))`)
  const box = async (sel, p = page) => { const b = await p.locator(sel).first().boundingBox(); return { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 } }
  const elBox = id => box(`.panel-stage .pz-el[data-id="${id}"]`)
  const drag = async (x, y, dx, dy, opts = {}) => {
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 }); await page.mouse.move(x + dx, y + dy, { steps: 4 })
    if (opts.before) await opts.before()
    await page.mouse.up(); await wait(250)
  }
  const saveAs = async (f, fmt) => {
    await app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, f)
    await ev(`__pz.files.saveAs('${fmt}')`); await idle()
  }
  const toasts = () => ev(`__pz.store.toasts.value.map(t => t.text).join(' | ')`)
  const jpg = fs.readFileSync(path.join(__dirname, 'fx', 'photo.jpg')).toString('base64')
  const insertPhoto = () => ev(`(() => { const b = Uint8Array.from(atob(${JSON.stringify(jpg)}), c => c.charCodeAt(0)); return __pz.actions.insertImageBytes(b, 'image/jpeg', 640, 480).id })()`)

  // ---------------- model and actions ----------------
  await sec('undo', async () => {
    await fresh()
    const n = await ev(`(() => { const A = __pz.actions, S = __pz.store; A.addSlide(); A.addSlide(); S.slideSel.value = [S.doc.value.slides[2].id]; S.undo(); return S.slideSel.value.length })()`)
    check(n === 0, 'undo clears the slide selection (it could name a slide that is gone)')
  })
  await sec('ungroup', async () => {
    await fresh()
    const r = await ev(`(() => { const A = __pz.actions, S = __pz.store
      const a = A.insertShape('rect', { x: 100, y: 120, w: 80, h: 60 }), b = A.insertShape('ellipse', { x: 300, y: 200, w: 50, h: 90 })
      S.select([a.id, b.id]); A.groupSelected(); A.ungroupSelected()
      return S.slide.value.elements.map(e => [e.x, e.y, e.w, e.h].join()).sort() })()`)
    check(JSON.stringify(r) === JSON.stringify(['100,120,80,60', '300,200,50,90']), 'group then ungroup puts both shapes back where they were: ' + r)
  })
  await sec('refit', async () => {
    await fresh()
    const g = await ev(`(() => { const A = __pz.actions, S = __pz.store
      const a = A.insertShape('rect', { x: 100, y: 100, w: 100, h: 100 }), b = A.insertShape('rect', { x: 300, y: 100, w: 100, h: 100 })
      S.select([a.id, b.id]); A.groupSelected()
      const g = S.slide.value.elements[0]
      S.updateEl(g.children[0].id, c => { c.x -= 50 })
      const n = S.slide.value.elements[0]; return { x: n.x, w: n.w, c0: n.children[0].x, c1: n.children[1].x } })()`)
    check(g.x === 50 && g.w === 350 && g.c0 === 0 && g.c1 === 250, 'a group fits itself around a child that moved out of it: ' + JSON.stringify(g))
  })
  await sec('flip', async () => {
    await fresh()
    const r = await ev(`(() => { const A = __pz.actions, S = __pz.store; const a = A.insertShape('rightArrow', { x: 100, y: 100, w: 150, h: 80 }); S.updateEl(a.id, e => { e.rot = 30 }); S.select([a.id]); A.flipSelected('h'); const e = S.slide.value.elements[0]; return [e.rot, !!e.flipH] })()`)
    check(r[0] === 330 && r[1], 'a mirrored shape turns the other way (30° becomes 330°): ' + r)
  })
  await sec('table merges', async () => {
    await fresh()
    const r = await ev(`(() => { const A = __pz.actions, S = __pz.store; const t = A.insertTable(3, 3)
      S.updateEl(t.id, x => { x.cells[0][0].colspan = 2; x.cells[0][0].html = '<p>AB</p>'; x.cells[0][1].merged = true })
      S.editCell.value = { id: t.id, r: 0, c: 0 }; A.tableOp('colRight')
      const a = S.slide.value.elements[0].cells[0].map(c => (c.colspan || 1) + (c.merged ? 'm' : ''))
      A.tableOp('delCol')
      const b = S.slide.value.elements[0].cells[0].map(c => (c.colspan || 1) + (c.merged ? 'm' : '') + (/AB/.test(c.html || '') ? '+text' : ''))
      S.editCell.value = null; return { a, b } })()`)
    check(r.a.join() === '3,1m,1m,1', 'a new column inside a merged cell widens the merge: ' + r.a)
    check(r.b.join() === '2+text,1m,1', 'deleting the merge\'s first column hands the merge and its text to the next cell: ' + r.b)
  })
  await sec('replace', async () => {
    await fresh()
    const r = await ev(`(() => { const A = __pz.actions, S = __pz.store; const t = A.insertTextBox({ x: 60, y: 60, w: 500, h: 60 }); S.editing.value = null
      S.updateEl(t.id, e => { e.html = '<p><b>Hel</b>lo, čaša i čašica</p>' })
      const n1 = A.replaceAll('Hello', 'Bye', {}), n2 = A.replaceAll('čaša', 'X', { wholeWord: true })
      return { n1, n2, html: S.slide.value.elements[0].html } })()`)
    check(r.n1 === 1 && r.n2 === 1 && /Bye/.test(r.html) && !/Hel/.test(r.html) && /X i čašica/.test(r.html), 'Replace finds a word split over formatting, and whole words in Serbian: ' + JSON.stringify(r))
  })
  await sec('move slides', async () => {
    await fresh()
    const r = await ev(`(() => { const A = __pz.actions, S = __pz.store; for (let i = 0; i < 4; i++) A.addSlide()
      const ids = S.doc.value.slides.map(s => s.id), at = () => S.doc.value.slides.map(s => ids.indexOf(s.id)).join('')
      S.goSlide(1); S.slideSel.value = [ids[1], ids[2]]; __pz.runCmd('slide.moveDown'); const down = at()
      S.slideSel.value = [ids[2], ids[1]]; __pz.runCmd('slide.moveUp'); const up = at()
      return { down, up } })()`)
    check(r.down === '03124' && r.up === '01234', 'Move slide down/up moves the selected block, whatever order the slides were picked in: ' + JSON.stringify(r))
  })
  await sec('coalesce', async () => {
    await fresh()
    const r = await ev(`(() => { const A = __pz.actions, S = __pz.store; A.addSlide()
      S.goSlide(0); S.updateSlide(s => { s.notes = 'first' }, { coalesce: 'k' }); S.goSlide(1); S.updateSlide(s => { s.notes = 'second' }, { coalesce: 'k' }); S.undo()
      return S.doc.value.slides.map(s => s.notes || '') })()`)
    check(r[0] === 'first' && r[1] === '', 'one undo takes back only the change on the last slide: ' + JSON.stringify(r))
  })

  // ---------------- editing on the canvas ----------------
  await sec('esc drag', async () => {
    await fresh()
    const id = await ev(`__pz.actions.insertShape('rect', { x: 200, y: 150, w: 120, h: 80 }).id`); await wait(250)
    const b = await elBox(id)
    await drag(b.cx, b.cy, 90, 50, { before: () => page.keyboard.press('Escape') })
    const e = await el(id), sel = await ev(`__pz.store.selection.value`)
    check(e.x === 200 && e.y === 150 && sel.includes(id), `Esc in the middle of a drag puts the shape back and keeps it selected (${e.x}, ${e.y})`)
  })
  await sec('multi resize', async () => {
    await fresh()
    const ids = await ev(`(() => { const A = __pz.actions, S = __pz.store; const a = A.insertShape('rect', { x: 100, y: 100, w: 100, h: 100 }), b = A.insertShape('rect', { x: 300, y: 150, w: 100, h: 100 }); S.select([a.id, b.id]); return [a.id, b.id] })()`); await wait(300)
    const k = (await elBox(ids[0])).width / 100
    const hs = await page.locator('.selbox .hdl-e').all()
    const hb = (await Promise.all(hs.map(h => h.boundingBox()))).sort((p, q) => q.x - p.x)[0]
    await drag(hb.x + hb.width / 2 + 3, hb.y + hb.height / 2, 60, 0) // grabbed 3 px right of the handle's centre
    const es = await Promise.all(ids.map(el)), right = Math.max(...es.map(e => e.x + e.w)), left = Math.min(...es.map(e => e.x))
    check(Math.abs(right - left - (300 + 60 / k)) < 0.6, `resizing two shapes follows the pointer's movement, not where the handle was grabbed (${(right - left).toFixed(1)} vs ${(300 + 60 / k).toFixed(1)})`)
  })
  await sec('shift arrow table', async () => {
    await fresh()
    await ev(`(() => { __pz.actions.insertTable(2, 3); document.activeElement?.blur?.() })()`); await wait(200)
    await page.keyboard.press('Shift+ArrowRight'); await wait(200)
    const t = await ev(`(() => { const t = __pz.store.slide.value.elements[0]; return { w: t.w, cols: t.cols.reduce((a, b) => a + b, 0) } })()`)
    check(Math.abs(t.w - t.cols) < 0.01, `Shift+Right widens a table's columns with it (width ${t.w}, columns ${t.cols})`)
  })
  // clicks into a turned group: s-rotgroup.cjs
  await sec('crop flipped', async () => {
    await fresh()
    const id = await insertPhoto()
    await ev(`(() => { const S = __pz.store; S.updateEl(${JSON.stringify(id)}, e => { e.flipH = true }); S.select([${JSON.stringify(id)}]); S.cropMode.value = ${JSON.stringify(id)} })()`); await wait(400)
    const before = await el(id), k = (await elBox(id)).width / before.w
    const h = await box('.chdl-e')
    await drag(h.cx, h.cy, -40, 0)
    const after = await el(id)
    check(after.crop && after.crop.l > 0.03 && !after.crop.r && Math.abs(after.x - before.x) < 0.5 && Math.abs(before.w - after.w - 40 / k) < 1,
      'cropping the right side of a mirrored picture cuts what shows on the right: ' + JSON.stringify({ crop: after.crop, dx: after.x - before.x, dw: before.w - after.w }))
  })
  await sec('crop turned', async () => {
    await fresh()
    const id = await insertPhoto()
    await ev(`(() => { const S = __pz.store; S.updateEl(${JSON.stringify(id)}, e => { e.rot = 90 }); S.select([${JSON.stringify(id)}]); S.cropMode.value = ${JSON.stringify(id)} })()`); await wait(400)
    const west = e => { const a = (e.rot || 0) * Math.PI / 180; return { x: e.x + e.w / 2 - Math.cos(a) * e.w / 2, y: e.y + e.h / 2 - Math.sin(a) * e.w / 2 } }
    const before = await el(id)
    const h = await box('.chdl-e') // the picture's right side, at the bottom on screen when turned 90°
    await drag(h.cx, h.cy, 0, -40)
    const after = await el(id), w0 = west(before), w1 = west(after)
    check(after.crop && after.crop.r > 0.03 && !after.crop.l && Math.hypot(w0.x - w1.x, w0.y - w1.y) < 1,
      'cropping a turned picture cuts the side that was dragged and keeps the other side in place: ' + JSON.stringify({ crop: after.crop, moved: Math.hypot(w0.x - w1.x, w0.y - w1.y).toFixed(2) }))
    await ev(`__pz.store.cropMode.value = null`)
  })
  await sec('bold at word edge', async () => {
    await fresh()
    const id = await ev(`(() => { const A = __pz.actions, S = __pz.store; const t = A.insertTextBox({ x: 60, y: 60, w: 500, h: 60 }); S.editing.value = null; S.updateEl(t.id, e => { e.html = '<p>hello world</p>' }); S.select([t.id]); S.editorReq.value = { mode: 'end' }; S.editing.value = t.id; return t.id })()`)
    await page.waitForSelector('[data-editor]'); await wait(200)
    const caret = (word, at) => ev(`(() => { const d = document.querySelector('[data-editor]'); const tw = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode()) && !n.nodeValue.includes(${JSON.stringify(word)})); const r = document.createRange(); r.setStart(n, n.nodeValue.indexOf(${JSON.stringify(word)}) + ${at}); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r) })()`)
    const weight = word => ev(`(() => { const d = document.querySelector('[data-editor]'); const tw = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) if (n.nodeValue.replace(/\\u200b/g, '') === ${JSON.stringify(word)}) return getComputedStyle(n.parentNode).fontWeight; return 'none' })()`)
    await caret('hello', 5); await wait(150); await page.keyboard.press('Control+b'); await page.keyboard.type('X'); await wait(200)
    const hello = await ev(`(() => { const d = document.querySelector('[data-editor]'); const tw = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) if (n.nodeValue.includes('hello')) return getComputedStyle(n.parentNode).fontWeight; return '?' })()`)
    const x = await weight('X')
    await caret('world', 2); await wait(150); await page.keyboard.press('Control+b'); await wait(200)
    const world = await weight('world'), collapsed = await ev(`getSelection().isCollapsed`)
    check(+hello < 600 && +x >= 600, `Ctrl+B at the end of a word bolds what is typed next, not the word (hello ${hello}, X ${x})`)
    check(+world >= 600 && collapsed, `Ctrl+B inside a word bolds the whole word and leaves the caret where it was (world ${world}, caret ${collapsed})`)
    await ev(`__pz.store.finishEditing()`)
  })
  await sec('cyrillic shortcut', async () => {
    await fresh()
    await ev(`(() => { __pz.actions.insertShape('rect', { x: 100, y: 100, w: 80, h: 80 }); document.activeElement?.blur?.() })()`); await wait(200)
    const cdp = await page.context().newCDPSession(page)
    for (const type of ['rawKeyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'в', code: 'KeyD', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68, modifiers: 2 })
    await wait(300)
    const n = await ev(`__pz.store.slide.value.elements.length`)
    check(n === 2, 'Ctrl+D with the Serbian Cyrillic keyboard (Ctrl+в) duplicates, as in Office: ' + n + ' shapes')
  })

  // ---------------- dialogs ----------------
  await sec('table dialog enter', async () => {
    await fresh()
    await ev(`__pz.store.openDialog('table')`); await wait(400)
    await page.keyboard.type('5'); await page.keyboard.press('Enter'); await wait(400)
    const t = await ev(`(() => { const t = __pz.store.slide.value.elements.find(e => e.type === 'table'); return t ? t.cols.length : 0 })()`)
    check(t === 5, 'Insert table: a number typed and then Enter is used (5 columns): ' + t)
  })
  await sec('font dialog mixed', async () => {
    await fresh()
    const id = await ev(`(() => { const A = __pz.actions, S = __pz.store; const t = A.insertTextBox({ x: 60, y: 60, w: 500, h: 80 }); S.editing.value = null; S.updateEl(t.id, e => { e.html = '<p><span style="font-size: 12pt;">small</span> <span style="font-size: 30pt;">big</span></p>' }); S.select([t.id]); return t.id })()`); await wait(300)
    await ev(`__pz.store.openDialog('font')`); await wait(400)
    await page.locator('.dlg label.chk', { hasText: 'Underline' }).click(); await wait(100)
    await page.locator('.dlg button.btn-primary', { hasText: 'OK' }).click(); await wait(400)
    const html = (await el(id)).html
    check(/12pt/.test(html) && /30pt/.test(html) && /underline/.test(html), 'the Font dialog changes only what was changed in it; mixed sizes stay: ' + html)
  })
  await sec('crop fields', async () => {
    await fresh()
    const id = await insertPhoto()
    await ev(`(() => { const S = __pz.store; S.select([${JSON.stringify(id)}]); S.pane.value = 'format'; S.formatTab.value = 'picture' })()`); await wait(500)
    const full = await el(id)
    const field = async (label, v) => { const i = page.locator('.pane .fld', { has: page.locator('.fld-l', { hasText: new RegExp('^' + label + '$') }) }).locator('input').first(); await i.click(); await i.fill(String(v)); await i.press('Enter'); await wait(250) }
    await field('Left', 60); await field('Right', 60)
    const e = await el(id)
    check(Math.abs(e.crop.l - 0.6) < 0.001 && Math.abs(e.crop.r - 0.35) < 0.001 && Math.abs(e.x - (full.x + 0.6 * full.w)) < 0.5, 'Crop fields: the two sides leave at least 5% and a cut left side moves the left edge: ' + JSON.stringify({ crop: e.crop, x: e.x, expect: full.x + 0.6 * full.w }))
    await page.locator('.pane button', { hasText: 'Reset crop' }).click(); await wait(300)
    const r = await el(id)
    check(!r.crop && Math.abs(r.w - full.w) < 0.5 && Math.abs(r.x - full.x) < 0.5, 'Reset crop shows the whole picture again at its full size: ' + JSON.stringify({ w: r.w, full: full.w, x: r.x }))
    await ev(`__pz.store.pane.value = null`)
  })
  await sec('merge', async () => {
    await fresh()
    const id = await ev(`(() => { const A = __pz.actions, S = __pz.store; const t = A.insertTable(3, 3)
      S.updateEl(t.id, x => { x.cells[0][0].rowspan = 2; x.cells[1][0].merged = true; x.cells[0][0].html = '<p>A</p>'; x.cells[0][1].html = '<p>B</p>'; x.cells[1][1].html = '<p>E</p>' })
      S.editCell.value = { id: t.id, r: 0, c: 0 }; S.ribbonTab.value = 'tableLayout'; return t.id })()`); await wait(500)
    await page.locator('.ribbon button', { hasText: 'Merge right' }).click(); await wait(500)
    const t = await el(id), a = t.cells[0][0]
    check(a.colspan === 2 && a.rowspan === 2 && t.cells[1][1].merged && t.cells[0][1].merged && /A/.test(a.html) && /B/.test(a.html) && /E/.test(a.html),
      'Merge right on a two-row cell takes both rows and keeps their text: ' + JSON.stringify({ a, m: [t.cells[0][1].merged, t.cells[1][1].merged] }))
    await ev(`__pz.store.finishEditing()`)
  })
  await sec('icons', async () => {
    await fresh()
    await ev(`__pz.store.openDialog('icons')`); await wait(500)
    await page.locator('.dlg .icon-cell').nth(3).dblclick(); await wait(500)
    const n = await ev(`__pz.store.slide.value.elements.filter(e => e.type === 'icon').length`), open = await ev(`!!__pz.store.dialog.value`)
    check(n === 1 && !open, `a double-click in Insert icons inserts that one icon (${n})`)
  })
  await sec('chart data comma', async () => {
    await fresh()
    const id = await ev(`__pz.actions.insertChart('column').id`)
    await ev(`__pz.store.openDialog('chartData', { id: ${JSON.stringify(id)} })`); await wait(400)
    await page.locator('.dlg input.num-in').first().fill('2,5'); await wait(300)
    const v = (await el(id)).series[0].values[0]
    check(v === 2.5, 'chart data takes a decimal comma (2,5): ' + v)
    await ev(`__pz.store.closeDialog()`)
  })

  // ---------------- files and the shell ----------------
  await sec('missing file', async () => {
    await fresh()
    await ev(`__pz.files.openPath('/tmp/prizma-nowhere/missing.pptx', { here: true })`); await idle()
    const t = await toasts()
    check(/Couldn't find missing\.pptx\. It was moved, renamed or deleted\./.test(t), 'a file that is gone says so plainly: ' + t)
  })
  const deck = path.join(OUT, 'review.pptx')
  await sec('chart gridlines and short property', async () => {
    await fresh()
    await ev(`(() => { const A = __pz.actions, S = __pz.store; const c = A.insertChart('column'); S.updateEl(c.id, e => { e.opts.gridlines = false }) })()`)
    await saveAs(deck, 'pptx')
    const bare = path.join(OUT, 'review-bare.pptx')
    const prop = execFileSync('python3', ['-c', `import zipfile, sys, re
zi = zipfile.ZipFile(sys.argv[1]); zo = zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED)
for n in zi.namelist():
  if n.startswith('customXml/'): continue
  zo.writestr(n, zi.read(n))
zo.close()
print(re.search(r'<vt:lpwstr>(.*?)</vt:lpwstr>', zi.read('docProps/custom.xml').decode()).group(1))`, deck, bare]).toString().trim()
    const info = JSON.parse(prop.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
    check(prop.length < 255 && Object.keys(info).join() === 'v,theme', 'the Prizma document property stays short (theme only): ' + prop.length + ' ' + Object.keys(info))
    await ev(`__pz.files.openPath(${JSON.stringify(bare)}, { here: true })`); await idle()
    const g = await ev(`__pz.store.doc.value.slides[0].elements.find(e => e.type === 'chart')?.opts?.gridlines`)
    check(g === false, 'a chart without gridlines keeps that when PowerPoint has changed the file: ' + g)
  })
  await sec('start at', async () => {
    await fresh()
    const id = await ev(`(() => { const A = __pz.actions, S = __pz.store; const t = A.insertTextBox({ x: 60, y: 60, w: 500, h: 120 }); S.editing.value = null; const p = '<p data-lvl="0" data-num="arabicPeriod" data-start="5">X</p>'; S.updateEl(t.id, e => { e.html = p.replace('X', 'a') + p.replace('X', 'b') + p.replace('X', 'c') }); S.select([]); return t.id })()`); await wait(300)
    const st = await ev(`[...document.querySelectorAll('.panel-stage .pz-el[data-id="${id}"] p')].map(p => p.style.counterSet || '-')`)
    const html = (await el(id)).html
    check(st.join('|') === 'pzn0 5|-|-' && !/counter-set/.test(html), 'a list that starts at 5 sets the counter on its first item only, on screen only: ' + st.join('|'))
  })
  await sec('window rules', async () => {
    await fresh()
    // 1. saving over a file another window has open is refused
    await ev(`__pz.files.openPath(${JSON.stringify(deck)}, { here: true })`); await idle()
    const nw = app.waitForEvent('window', { timeout: 20000 })
    await ev(`window.prizmaNative.newWindow(null)`)
    const B = await nw
    await B.waitForFunction(() => document.querySelector('.ribbon, .backstage'), null, { timeout: 20000 }); await B.waitForTimeout(800)
    const msg = await B.evaluate(f => window.prizmaNative.writeFile(f, new Uint8Array([1, 2, 3])).then(() => 'written', e => e.message), deck)
    check(/is open in another Prizma window/.test(msg) && fs.statSync(deck).size > 100, 'Save as over a file open in another window is refused: ' + msg)
    await B.close().catch(() => {}); await wait(500)
    // 2. the show's windows can't open windows of their own
    const shown = app.waitForEvent('window', { timeout: 15000 })
    await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, presenterView: false }; __pz.runCmd('show.start')`)
    const sw = await shown
    await sw.waitForLoadState('domcontentloaded'); await sw.waitForTimeout(900)
    const n0 = (await app.windows()).length
    const nul = await sw.evaluate(() => window.open('app://prizma/index.html#editor', 'x') === null)
    await sw.waitForTimeout(800)
    check(nul && (await app.windows()).length === n0, 'a page in the slide show window cannot open another window')
    await sw.close().catch(() => {}); await wait(600)
    // 3. a window with unsaved work is not replaced by a file opened from Explorer
    await ev(`__pz.files.closeDocument()`); await wait(400)
    await ev(`(() => { const S = __pz.store; S.backstage.value = null; S.updateSlide(s => { s.notes = 'my work' }) })()`); await wait(300)
    const count = (await app.windows()).length
    const next = app.waitForEvent('window', { timeout: 20000 })
    await app.evaluate(({ app }, f) => app.emit('second-instance', {}, ['prizma', f]), deck)
    const C = await next.catch(() => null)
    const notes = await ev(`__pz.store.doc.value.slides[0].notes || ''`)
    check(!!C && notes === 'my work' && (await app.windows()).length === count + 1, 'a file opened from Explorer gets its own window when this one has unsaved work')
    if (C) { await C.waitForTimeout(1500); await C.close().catch(() => {}) }
  })
  await sec('libreoffice temp', async () => {
    await fresh()
    const mine = () => fs.readdirSync(os.tmpdir()).filter(n => /^prizma-[A-Za-z0-9]{6}$/.test(n)).sort().join()
    const t0 = mine()
    await ev(`__pz.files.openPath(${JSON.stringify(path.join(__dirname, 'legacy', 'deck.odp'))}, { here: true })`); await idle()
    const slides = await ev(`__pz.store.doc.value.slides.length`)
    check(slides > 0 && mine() === t0, `an .odp opens through LibreOffice and leaves no temporary folder behind (${slides} slides)`)
  })
}

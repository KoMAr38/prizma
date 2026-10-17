// Editing features the report did not reach: symbols, header & footer, links, format painter,
// clipboard, comments and the Selection pane. Real clicks and keys where the user would use them.
const path = require('path')
module.exports = async ({ app, page, ev, wait, errors, OUT, shot }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const idle = () => page.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 60000 })
  const els = () => ev(`__pz.store.slide.value.elements.map(e => ({ id: e.id, type: e.type, shape: e.shape, x: e.x, y: e.y, html: e.html, link: e.link, name: e.name, hidden: !!e.hidden, fill: e.fill, line: e.line, shadow: e.shadow, src: e.src }))`)
  const center = async (id, p = page) => {
    const b = await p.locator(`.panel-stage .pz-el[data-id="${id}"]`).first().boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  const clickEl = async id => { const c = await center(id); await page.mouse.click(c.x, c.y); await wait(150) }
  const dlgOpen = () => ev(`!!__pz.store.dialog.value`)
  await app.evaluate(({ shell }) => { global.__opened = []; shell.openExternal = async u => { global.__opened.push(u) } })

  await ev(`__pz.tour.loadTour(); __pz.files.newDocIn(); __pz.store.backstage.value = null`)
  await ev(`(() => { const A = __pz.actions, S = __pz.store; for (let i = 0; i < 4; i++) A.addSlide(); S.goSlide(1); S.updateSlide(s => { s.elements = [] }) })()`)

  // ---------- symbol with nothing selected, then inside text being edited ----------
  await ev(`__pz.store.select([]); __pz.runCmd('ins.symbol')`); await wait(300)
  await page.locator('.dlg .seg button', { hasText: 'Greek' }).click()
  await page.locator('.dlg .sym-grid button', { hasText: 'Ω' }).first().click()
  await page.locator('.dlg button.btn-primary', { hasText: 'Insert' }).click()
  await wait(500)
  await page.keyboard.press('Escape'); await wait(200)
  let list = await els()
  check(list.some(e => e.type === 'text' && /Ω/.test(e.html || '')), 'Symbol with nothing selected makes a text box with Ω: ' + JSON.stringify(list.map(e => e.html)))
  const symBox = list.find(e => /Ω/.test(e.html || ''))
  if (symBox) {
    const c = await center(symBox.id)
    await page.mouse.dblclick(c.x, c.y); await wait(250)
    await page.keyboard.press('End'); await page.keyboard.type(' x')
    await ev(`__pz.store.ribbonTab.value = 'insert'`); await wait(200)
    await page.getByRole('button', { name: 'Insert symbol' }).click(); await wait(300)
    const editingAtOpen = await ev(`!!__pz.store.editing.value`)
    await page.locator('.dlg .seg button', { hasText: 'Currency' }).click()
    await page.locator('.dlg .sym-grid button', { hasText: '€' }).first().click()
    await page.locator('.dlg button.btn-primary', { hasText: 'Insert' }).click(); await wait(400)
    await page.keyboard.press('Escape'); await wait(200)
    const h = (await els()).find(e => e.id === symBox.id)?.html || ''
    check(/Ω x€/.test(h.replace(/<[^>]+>/g, '')), `Symbol while editing goes in at the caret (editing when the dialog opened: ${editingAtOpen}): ${h}`)
  }

  // ---------- header & footer through the dialog ----------
  await ev(`__pz.runCmd('ins.hf')`); await wait(300)
  for (const l of ['Date and time', 'Slide number', 'Footer']) await page.locator('.dlg label', { hasText: l }).first().click()
  await page.locator('.dlg .dlg-indent input').last().fill('Prizma test footer')
  await page.locator('.dlg button.btn-primary', { hasText: 'Apply to all' }).click(); await wait(300)
  const hfEditor = await ev(`[...document.querySelectorAll('.panel-stage .pz-hf')].map(x => x.textContent).join('|')`)
  const today = await ev(`new Date().toLocaleDateString()`)
  check(hfEditor.includes('Prizma test footer') && hfEditor.includes('2') && hfEditor.includes(today), 'footer, number and date on slide 2 in the editor: ' + hfEditor)
  await ev(`__pz.store.goSlide(0)`); await wait(200)
  check(await ev(`!document.querySelector('.panel-stage .pz-hf')`), 'no footer on the title slide')
  await ev(`__pz.store.goSlide(1)`); await wait(200)

  // ---------- links: web, email, slide on shapes and a link inside text ----------
  await ev(`(() => { const A = __pz.actions; ['rect', 'ellipse', 'roundRect'].forEach((s, i) => A.insertShape(s, { x: 60 + i * 220, y: 140, w: 180, h: 120 })); A.insertTextBox({ x: 80, y: 320, w: 500, h: 50 }) })()`)
  await wait(300); await page.keyboard.type('Visit the site'); await page.keyboard.press('Escape'); await wait(200); await page.keyboard.press('Escape')
  list = await els()
  const [shWeb, shMail, shSlide] = list.filter(e => e.type === 'shape').slice(-3)
  const tb = list[list.length - 1]
  await clickEl(shWeb.id); await page.keyboard.press('Control+k'); await wait(300)
  await page.keyboard.type('example.com'); await page.keyboard.press('Enter'); await wait(200)
  await clickEl(shMail.id); await page.keyboard.press('Control+k'); await wait(300)
  await shot('before-email'); await page.locator('.dlg .seg button', { hasText: 'Email' }).click(); await shot('email')
  await page.locator('.dlg input').first().fill('marko@example.com')
  await page.locator('.dlg input').nth(1).fill('Pitanje o prezentaciji')
  await page.keyboard.press('Enter'); await wait(200)
  await clickEl(shSlide.id); await page.keyboard.press('Control+k'); await wait(300)
  await page.locator('.dlg .seg button', { hasText: 'Slide in this deck' }).click()
  await page.locator('.dlg .slide-pick button').nth(3).click()
  await page.keyboard.press('Enter'); await wait(200)
  { const c = await center(tb.id); await page.mouse.dblclick(c.x, c.y); await wait(250); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+k'); await wait(300) }
  await page.locator('.dlg input').nth(1).fill('https://prizma.example/docs')
  await page.keyboard.press('Enter'); await wait(300)
  await page.keyboard.press('Escape'); await wait(200)
  list = await els()
  const byId = id => list.find(e => e.id === id)
  check(byId(shWeb.id).link?.url === 'https://example.com', 'web link on a shape: ' + JSON.stringify(byId(shWeb.id).link))
  check(/^mailto:marko@example\.com\?subject=Pitanje/.test(byId(shMail.id).link?.url || ''), 'email link on a shape: ' + JSON.stringify(byId(shMail.id).link))
  check(byId(shSlide.id).link?.slide !== undefined, 'slide link on a shape: ' + JSON.stringify(byId(shSlide.id).link))
  check(/<a [^>]*href="https:\/\/prizma\.example\/docs"[^>]*>Visit the site<\/a>/.test(byId(tb.id).html || ''), 'link on selected text: ' + byId(tb.id).html)
  const target4 = await ev(`__pz.store.doc.value.slides[3].id`)

  // in the show: web and mail go to the system, the slide link jumps
  const startShow = async () => {
    const w = app.waitForEvent('window', { timeout: 15000 })
    await ev(`__pz.store.settings.value = { ...__pz.store.settings.value, presenterView: false }; __pz.runCmd('show.current')`)
    const win = await w; await win.waitForLoadState('domcontentloaded'); await win.waitForTimeout(900); return win
  }
  const showClick = async (win, id) => {
    const b = await win.locator(`.show-layer .pz-el[data-id="${id}"]`).last().boundingBox()
    await win.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await win.waitForTimeout(700)
  }
  const shownId = win => win.evaluate(() => [...document.querySelectorAll('.show-layer [data-slide]')].pop()?.dataset.slide)
  let win = await startShow()
  await showClick(win, shWeb.id); await showClick(win, shMail.id)
  const b = await win.locator('.show-layer a[href]').last().boundingBox()
  await win.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await win.waitForTimeout(500)
  await showClick(win, shSlide.id)
  const opened = await app.evaluate(() => global.__opened)
  check(opened[0] === 'https://example.com' && /^mailto:marko@/.test(opened[1] || '') && opened[2] === 'https://prizma.example/docs', 'show opens web, email and text links: ' + JSON.stringify(opened))
  check(await shownId(win) === target4, 'slide link jumps to slide 4')
  await win.keyboard.down('Escape').catch(() => {}); await wait(800)

  // the slide link must keep pointing at the same slide after slides move
  await ev(`__pz.actions.moveSlides([${JSON.stringify(target4)}], 5)`); await wait(200)
  const after = await ev(`(() => { const d = __pz.store.doc.value; const e = d.slides.flatMap(s => s.elements).find(e => e.id === ${JSON.stringify(shSlide.id)}); const t = e.link.slide; return { link: e.link, pointsAt: typeof t === 'number' ? d.slides[t]?.id : t } })()`)
  check(after.pointsAt === target4, 'slide link follows its slide when the slide moves: ' + JSON.stringify(after))
  await ev(`__pz.store.goSlide(1)`); await wait(200)
  // and the show still jumps to it
  win = await startShow(); await showClick(win, shSlide.id)
  check(await shownId(win) === target4, 'after the move the slide link still jumps to the same slide')
  await win.keyboard.down('Escape').catch(() => {}); await wait(800)
  await ev(`__pz.store.goSlide(1)`); await wait(200)

  // ---------- format painter ----------
  await ev(`(() => { const A = __pz.actions; A.setFill({ type: 'solid', color: '#E5484D' }, [${JSON.stringify(shWeb.id)}]); A.setLine({ color: '#2DD4BF', w: 5 }, [${JSON.stringify(shWeb.id)}]); A.setProps({ shadow: { blur: 12, dist: 6, dir: 45, color: '#000000', alpha: 0.5 } }, [${JSON.stringify(shWeb.id)}]) })()`)
  await ev(`__pz.store.ribbonTab.value = 'home'`); await clickEl(shWeb.id)
  await page.getByRole('button', { name: 'Format painter' }).first().click(); await wait(150)
  await clickEl(shSlide.id)
  list = await els()
  const src = byId(shWeb.id), dst = list.find(e => e.id === shSlide.id)
  check(JSON.stringify(dst.fill) === JSON.stringify(list.find(e => e.id === shWeb.id).fill) && dst.line?.w === 5 && dst.shadow?.blur === 12, 'format painter copies fill, line and shadow: ' + JSON.stringify({ fill: dst.fill, line: dst.line, shadow: dst.shadow }))
  check(await ev(`!__pz.store.painter.value`), 'format painter is done after one use')

  // ---------- clipboard ----------
  await clickEl(shMail.id)
  let n0 = (await els()).length
  await page.keyboard.press('Control+c'); await wait(200); await page.keyboard.press('Control+v'); await wait(400)
  list = await els()
  const pasted = list[list.length - 1]
  check(list.length === n0 + 1 && Math.abs(pasted.x - list.find(e => e.id === shMail.id).x - 14) < 0.5, 'copy and paste a shape on the same slide (offset 14): ' + (list.length - n0))
  await page.keyboard.press('Control+x'); await wait(300)
  check((await els()).length === n0, 'cut removes the pasted shape')
  await ev(`__pz.store.goSlide(2)`); await wait(200)
  await page.mouse.click(5, 300) // away from the ribbon
  const n2 = (await els()).length
  await page.locator('.panel-stage').click({ position: { x: 10, y: 10 } }); await page.keyboard.press('Control+v'); await wait(400)
  list = await els()
  check(list.length === n2 + 1 && /^mailto:/.test(list[list.length - 1].link?.url || ''), 'paste on another slide keeps the shape and its link: ' + (list.length - n2))
  // text from another program
  await app.evaluate(({ clipboard }) => clipboard.writeText('Plain text from Notepad'))
  await page.locator('.panel-stage').click({ position: { x: 10, y: 10 } }); await page.keyboard.press('Control+v'); await wait(400)
  list = await els()
  check(list.some(e => /Plain text from Notepad/.test(e.html || '')), 'pasting text from another program makes a text box')
  // a picture from another program
  // a picture put on the system clipboard (as a browser or a screenshot tool would)
  await page.bringToFront(); await page.locator('.panel-stage').click({ position: { x: 10, y: 10 } })
  await ev(`(async () => { const b = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAYAAABe3VzdAAAAPElEQVR4nO3OIRUAIBBAMYJd/0criID8iIn5rT1zfrbqgKBgHRAUrAOCgnVAULAOCArWAUHBOiAoWAdeLt3gh+ekPwQGAAAAAElFTkSuQmCC'), c => c.charCodeAt(0)); try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([b], { type: 'image/png' }) })]); return 'written' } catch (e) { return 'write failed: ' + e.message } })()`).then(r => console.log('   clipboard', r))
  await page.locator('.panel-stage').click({ position: { x: 10, y: 10 } }); await page.keyboard.press('Control+v'); await wait(500)
  list = await els()
  console.log('   after picture paste', JSON.stringify(list.map(e => e.type)), await ev(`document.hasFocus()`))
  const img = list.find(e => e.type === 'image')
  check(!!img && await ev(`!!__pz.store.mediaInfo(${JSON.stringify(img?.src || '')})`), 'pasting a picture from another program inserts it')
  // whole slides through the slide list
  const sc0 = await ev(`__pz.store.doc.value.slides.length`)
  await page.locator('.thumbs .th').nth(2).click(); await wait(150)
  await page.keyboard.press('Control+c'); await wait(200); await page.keyboard.press('Control+v'); await wait(400)
  const sc1 = await ev(`__pz.store.doc.value.slides.length`)
  check(sc1 === sc0 + 1, `copy and paste a slide in the slide list: ${sc0} → ${sc1}`)

  // ---------- comments ----------
  await ev(`__pz.store.goSlide(1)`); await wait(200)
  await clickEl(shWeb.id)
  await ev(`__pz.runCmd('ins.comment')`); await wait(300)
  await page.keyboard.type('Promeni boju u plavu')
  await page.keyboard.press('Control+Enter'); await wait(200)
  const cms = await ev(`__pz.store.slide.value.comments`)
  check(cms.length === 1 && cms[0].text === 'Promeni boju u plavu', 'comment posted: ' + JSON.stringify(cms))
  check(cms[0]?.el === shWeb.id, 'comment is tied to the selected shape')
  const onTxt = await page.locator('.cm .cm-on').first().textContent().catch(() => '')
  check(/On /.test(onTxt), 'comment says which object it is on: ' + onTxt)
  await shot('comments')

  // ---------- selection pane ----------
  await ev(`__pz.runCmd('view.selectionPane')`); await wait(300)
  const rows = page.locator('.sp-row')
  const rowCount = await rows.count()
  check(rowCount === (await els()).length, `selection pane lists every object (${rowCount})`)
  const firstRow = rows.first()
  await firstRow.dblclick(); await wait(200)
  await page.keyboard.press('Control+a'); await page.keyboard.type('Logo box')
  await page.keyboard.press('Delete'); await page.keyboard.press('Enter'); await wait(200)
  list = await els()
  const top = list[list.length - 1]
  check(top.name === 'Logo box' && list.length === rowCount, 'rename in the selection pane (Delete while typing does not delete the object): ' + top.name + ' / ' + list.length)
  await firstRow.dblclick(); await wait(200)
  await page.keyboard.press('Control+a'); await page.keyboard.type('Cancelled name'); await page.keyboard.press('Escape'); await wait(200)
  list = await els()
  check(list[list.length - 1].name === 'Logo box', 'Esc cancels a rename: ' + list[list.length - 1].name)
  await firstRow.locator('.sp-eye').click(); await wait(200)
  const hiddenId = list[list.length - 1].id
  check(await ev(`(() => { const n = document.querySelector('.panel-stage .pz-el[data-id="${hiddenId}"]'); return !n || getComputedStyle(n).display === 'none' || getComputedStyle(n).visibility === 'hidden' })()`), 'hidden object disappears from the slide')
  await shot('selection-pane')

  // ---------- round trip through .pptx: links, comments, names, footer ----------
  const f = path.join(OUT, 'edit.pptx')
  await app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, f)
  await ev(`__pz.files.saveAs('pptx')`); await wait(300); await idle()
  const before = await ev(`__pz.store.doc.value.slides.map(s => ({ c: (s.comments || []).map(c => c.author + ':' + c.text).join(','), l: s.elements.map(e => e.link ? JSON.stringify(e.link) : '').join(''), n: s.elements.map(e => e.name || '').join('') }))`)
  await ev(`__pz.files.openPath(${JSON.stringify(f)}, { here: true })`); await wait(300); await idle()
  const back = await ev(`__pz.store.doc.value.slides.map(s => ({ c: (s.comments || []).map(c => c.author + ':' + c.text).join(','), l: s.elements.map(e => e.link ? JSON.stringify(e.link) : '').join(''), n: s.elements.map(e => e.name || '').join('') }))`)
  check(JSON.stringify(before) === JSON.stringify(back), 'links, comments and names survive .pptx')
  if (JSON.stringify(before) !== JSON.stringify(back)) console.log(JSON.stringify(before), '\n', JSON.stringify(back))
}

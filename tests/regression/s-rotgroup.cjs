// Editing inside a turned group: a click goes into the group, and moving, resizing, turning, arrow keys, typed
// positions, copies, text, line ends and cropping all work on what the slide shows
const path = require('path'), fs = require('fs')
module.exports = async ({ page, ev, wait, errors }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const sec = async (name, fn) => { try { await fn() } catch (e) { check(false, `${name} threw: ${(e.stack || e.message).split('\n').slice(0, 2).join(' | ')}`) } }
  const fresh = async () => { await ev(`(() => { const S = __pz.store; __pz.files.newDocIn(); S.backstage.value = null; S.closeDialog(); S.cropMode.value = null; S.updateSlide(s => { s.elements = [] }); S.select([]) })()`); await wait(250) }
  const box = async sel => { const b = await page.locator(sel).first().boundingBox(); return { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 } }
  const elBox = id => box(`.panel-stage .pz-el[data-id="${id}"]`)
  const drag = async (x, y, dx, dy, mid) => {
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 }); await page.mouse.move(x + dx, y + dy, { steps: 4 })
    if (mid) await mid()
    await page.mouse.up(); await wait(250)
  }
  // the slide's own geometry, worked out here independently of the app
  const turn = (p, c, deg) => { const a = deg * Math.PI / 180, dx = p.x - c.x, dy = p.y - c.y; return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) } }
  const els = () => ev(`JSON.parse(JSON.stringify(__pz.store.slide.value.elements))`)
  const chainTo = (list, id, gs = []) => { for (const e of list) { if (e.id === id) return { el: e, gs }; if (e.children) { const r = chainTo(e.children, id, [e, ...gs]); if (r) return r } } return null }
  // a point of element `id` given in its own unturned box (0..1), on the slide
  const pt = async (id, u, v) => {
    const { el, gs } = chainTo(await els(), id)
    let p = turn({ x: el.x + el.w * u, y: el.y + el.h * v }, { x: el.x + el.w / 2, y: el.y + el.h / 2 }, el.rot || 0)
    for (const g of gs) p = turn({ x: g.x + p.x, y: g.y + p.y }, { x: g.x + g.w / 2, y: g.y + g.h / 2 }, g.rot || 0)
    return p
  }
  const total = async id => { const { el, gs } = chainTo(await els(), id); return ((gs.reduce((a, g) => a + (g.rot || 0), el.rot || 0) % 360) + 360) % 360 }
  const frame = async () => { const f = await box('.panel-stage .slide-frame'); const w = await ev(`__pz.store.doc.value.size.w`); return { x: f.x, y: f.y, k: f.width / w } }
  const screen = async p => { const f = await frame(); return { x: f.x + p.x * f.k, y: f.y + p.y * f.k } }
  const near = (a, b, t) => Math.hypot(a.x - b.x, a.y - b.y) < t
  const fmt = p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`
  const sel = () => ev(`__pz.store.selection.value.join()`)
  // two boxes grouped and the group turned 30°; two clicks select the first box
  const setup = async () => {
    await fresh()
    const r = await ev(`(() => { const A = __pz.actions, S = __pz.store
      const a = A.insertShape('rect', { x: 200, y: 150, w: 120, h: 80 }), b = A.insertShape('rect', { x: 380, y: 150, w: 120, h: 80 })
      S.select([a.id, b.id]); A.groupSelected(); const g = S.slide.value.elements[0]; S.updateEl(g.id, x => { x.rot = 30 }); S.select([])
      return { g: g.id, a: a.id, b: b.id } })()`); await wait(300)
    const c = await elBox(r.a)
    await page.mouse.click(c.cx, c.cy); await wait(350)
    const first = await sel()
    await page.mouse.click(c.cx, c.cy); await wait(350)
    return { ...r, first, second: await sel() }
  }

  await sec('select', async () => {
    const r = await setup()
    check(r.first === r.g && r.second === r.a, `the first click selects the turned group, the second the box inside it (${r.first === r.g}, ${r.second === r.a})`)
    const sb = await box('.selbox'), c = await elBox(r.a)
    const tf = await ev(`document.querySelector('.selbox').style.transform`)
    check(near({ x: sb.cx, y: sb.cy }, { x: c.cx, y: c.cy }, 1.5) && /rotate\(30deg\)/.test(tf), `the box's handles sit on it, turned with the group: ${tf}, ${Math.hypot(sb.cx - c.cx, sb.cy - c.cy).toFixed(2)} px off`)
  })

  await sec('move', async () => {
    const r = await setup()
    const a0 = await elBox(r.a), b0 = await elBox(r.b)
    let live = null
    await page.keyboard.down('Alt') // no smart guides: the box should go exactly where the pointer goes
    await drag(a0.cx, a0.cy, 90, 40, async () => { await wait(100); live = await elBox(r.a) })
    await page.keyboard.up('Alt')
    const a1 = await elBox(r.a), b1 = await elBox(r.b)
    check(near({ x: live.cx, y: live.cy }, { x: a0.cx + 90, y: a0.cy + 40 }, 2), `while dragged the box follows the pointer on screen: ${fmt({ x: live.cx - a0.cx, y: live.cy - a0.cy })} for (90, 40)`)
    check(near({ x: a1.cx, y: a1.cy }, { x: a0.cx + 90, y: a0.cy + 40 }, 2) && near({ x: b1.cx, y: b1.cy }, { x: b0.cx, y: b0.cy }, 1), `dropped where the pointer went, the other box stays put: ${fmt({ x: a1.cx - a0.cx, y: a1.cy - a0.cy })}, other ${fmt({ x: b1.cx - b0.cx, y: b1.cy - b0.cy })}`)
    const g = (await els())[0]
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const inGroup = async id => { for (const [u, v] of corners) { const p = await pt(id, u, v), q = turn(p, { x: g.x + g.w / 2, y: g.y + g.h / 2 }, -g.rot); if (q.x < g.x - 0.5 || q.y < g.y - 0.5 || q.x > g.x + g.w + 0.5 || q.y > g.y + g.h + 0.5) return false } return true }
    check(g.rot === 30 && await inGroup(r.a) && await inGroup(r.b), 'the turned group closes around its boxes again')
    await ev(`__pz.store.undo()`); await wait(250)
    const a2 = await elBox(r.a)
    check(near({ x: a2.cx, y: a2.cy }, { x: a0.cx, y: a0.cy }, 1), 'undo puts the box back')
  })

  await sec('copy and delete', async () => {
    const r = await setup()
    const a0 = await elBox(r.a), b0 = await elBox(r.b)
    await page.keyboard.down('Control'); await page.keyboard.down('Alt')
    await drag(a0.cx, a0.cy, 0, 140)
    await page.keyboard.up('Alt'); await page.keyboard.up('Control')
    const g = (await els())[0], copy = g.children.find(c => c.id !== r.a && c.id !== r.b)
    const cb = copy && await elBox(copy.id), a1 = await elBox(r.a)
    const hug = async () => { const gg = (await els())[0]; const ps = []; for (const c of gg.children) for (const [u, v] of [[0, 0], [1, 1], [1, 0], [0, 1]]) ps.push(turn(await pt(c.id, u, v), { x: gg.x + gg.w / 2, y: gg.y + gg.h / 2 }, -gg.rot)); return Math.max(Math.abs(Math.min(...ps.map(p => p.x)) - gg.x), Math.abs(Math.min(...ps.map(p => p.y)) - gg.y), Math.abs(Math.max(...ps.map(p => p.x)) - gg.x - gg.w), Math.abs(Math.max(...ps.map(p => p.y)) - gg.y - gg.h)) }
    check(g.children.length === 3 && cb && near({ x: cb.cx, y: cb.cy }, { x: a0.cx, y: a0.cy + 140 }, 2) && near({ x: a1.cx, y: a1.cy }, { x: a0.cx, y: a0.cy }, 1) && await hug() < 0.5, `Ctrl+drag drops a copy inside the turned group where the pointer went, and the group closes around it (${g.children.length} boxes)`)
    await page.keyboard.press('Delete'); await wait(250)
    await ev(`__pz.store.select([${JSON.stringify(r.a)}])`); await page.keyboard.press('Delete'); await wait(250)
    const left = (await els())[0], b1 = await elBox(r.b)
    check(left.children.length === 1 && Math.abs(left.w - 120) < 0.01 && Math.abs(left.h - 80) < 0.01 && near({ x: b1.cx, y: b1.cy }, { x: b0.cx, y: b0.cy }, 1), `deleting boxes from a turned group shrinks it to what is left without moving it (${left.w}×${left.h})`)
  })

  await sec('resize', async () => {
    const r = await setup()
    const f = await frame(), w0 = (await chainTo(await els(), r.a)).el.w, west0 = await pt(r.a, 0, 0.5)
    const h = await box('.selbox .hdl-e')
    await drag(h.cx, h.cy, 50 * Math.cos(Math.PI / 6), 50 * Math.sin(Math.PI / 6))
    const w1 = (await chainTo(await els(), r.a)).el.w, west1 = await pt(r.a, 0, 0.5)
    check(Math.abs(w1 - w0 - 50 / f.k) < 1 && near(west0, west1, 0.5), `pulling the right handle along the turned box widens it by the pull and keeps its left side: +${(w1 - w0).toFixed(1)} pt (pull ${(50 / f.k).toFixed(1)}), left side moved ${Math.hypot(west1.x - west0.x, west1.y - west0.y).toFixed(2)} pt`)
  })

  await sec('rotate', async () => {
    const r = await setup()
    const c0 = await pt(r.a, 0.5, 0.5), t0 = await total(r.a), cs = await screen(c0)
    const h = await box('.selbox .hdl-rot')
    const to = turn({ x: h.cx, y: h.cy }, cs, 40)
    await page.mouse.move(h.cx, h.cy); await page.mouse.down()
    for (let i = 1; i <= 8; i++) { const q = turn({ x: h.cx, y: h.cy }, cs, 40 * i / 8); await page.mouse.move(q.x, q.y) }
    await page.mouse.move(to.x, to.y); await page.mouse.up(); await wait(250)
    const c1 = await pt(r.a, 0.5, 0.5), t1 = await total(r.a)
    check(Math.abs(t1 - t0 - 40) < 2 && near(c0, c1, 0.5), `turning the box inside the group turns it about its own centre: ${t0.toFixed(1)}° → ${t1.toFixed(1)}°, centre moved ${Math.hypot(c1.x - c0.x, c1.y - c0.y).toFixed(2)} pt`)
  })

  await sec('arrows and position', async () => {
    const r = await setup()
    const c0 = await pt(r.a, 0.5, 0.5)
    await page.keyboard.press('ArrowRight'); await wait(200)
    const c1 = await pt(r.a, 0.5, 0.5)
    check(Math.abs(c1.x - c0.x - 3) < 0.05 && Math.abs(c1.y - c0.y) < 0.05, `the right arrow moves the box right on screen: ${fmt({ x: c1.x - c0.x, y: c1.y - c0.y })}`)
    const shown = await ev(`(() => { __pz.store.pane.value = 'format'; __pz.store.formatTab.value = 'size'; return true })()`); await wait(300)
    const fields = await ev(`[...document.querySelectorAll('.pane .fld')].filter(f => /^(Horizontal|Vertical)$/.test(f.querySelector('.fld-l')?.textContent)).map(f => parseFloat(f.querySelector('input').value.replace(',', '.')))`)
    const { el } = chainTo(await els(), r.a), at = { x: c1.x - el.w / 2, y: c1.y - el.h / 2 }
    const cm = v => v * 2.54 / 72
    check(shown && fields.length === 2 && Math.abs(fields[0] - cm(at.x)) < 0.011 && Math.abs(fields[1] - cm(at.y)) < 0.011, `Size and position shows where the box is on the slide: ${fields.join(', ')} cm (expected ${cm(at.x).toFixed(2)}, ${cm(at.y).toFixed(2)})`)
    await ev(`__pz.actions.setPosition(${JSON.stringify(r.a)}, { x: 100 })`); await wait(200)
    const c2 = await pt(r.a, 0.5, 0.5)
    check(Math.abs(c2.x - el.w / 2 - 100) < 0.05 && Math.abs(c2.y - c1.y) < 0.05, `a typed horizontal position puts the box there on the slide: left ${(c2.x - el.w / 2).toFixed(2)} pt, height kept ${Math.abs(c2.y - c1.y) < 0.05}`)
    await ev(`__pz.store.pane.value = null`)
    await ev(`__pz.actions.align('left')`); await wait(200)
    const xs = []; for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) xs.push((await pt(r.a, u, v)).x)
    const c3 = await pt(r.a, 0.5, 0.5)
    check(Math.abs(Math.min(...xs)) < 0.05 && Math.abs(c3.y - c2.y) < 0.05, `Align left puts the turned box's left edge on the slide's edge: ${Math.min(...xs).toFixed(2)} pt`)
  })

  await sec('copy', async () => {
    const r = await setup()
    const c0 = await pt(r.a, 0.5, 0.5), t0 = await total(r.a)
    await ev(`__pz.actions.duplicateSelected()`); await wait(200)
    const top = await els(), copy = top[top.length - 1]
    const cc = { x: copy.x + copy.w / 2, y: copy.y + copy.h / 2 }
    check(top.length === 2 && near(cc, { x: c0.x + 12, y: c0.y + 12 }, 0.05) && Math.abs(copy.rot - t0) < 0.01, `a copy of the box lands on the slide turned as it shows: centre off by ${fmt({ x: cc.x - c0.x, y: cc.y - c0.y })}, ${copy.rot}° for ${t0}°`)
  })

  await sec('text', async () => {
    const r = await setup()
    const c = await elBox(r.a)
    await page.mouse.dblclick(c.cx, c.cy); await wait(400)
    const open = await ev(`__pz.store.editing.value`)
    await page.keyboard.type('Turned'); await page.keyboard.press('Escape'); await wait(300)
    const html = (await chainTo(await els(), r.a)).el.html || ''
    check(open === r.a && /Turned/.test(html), `a double-click on the box opens its text, and typing lands in it (${open === r.a}, ${JSON.stringify(html.replace(/<[^>]+>/g, ''))})`)
  })

  await sec('line end', async () => {
    await fresh()
    const r = await ev(`(() => { const A = __pz.actions, S = __pz.store
      const l = A.insertLine('straight', { x: 200, y: 300 }, { x: 400, y: 300 }), b = A.insertShape('rect', { x: 450, y: 250, w: 100, h: 100 })
      S.select([l.id, b.id]); A.groupSelected(); const g = S.slide.value.elements[0]; S.updateEl(g.id, x => { x.rot = 45 }); S.select([])
      return { g: g.id, l: l.id } })()`); await wait(300)
    const c = await elBox(r.l)
    await page.mouse.click(c.cx, c.cy); await wait(350); await page.mouse.click(c.cx, c.cy); await wait(350)
    const p0 = await pt(r.l, 0, 0)
    const h = await box('.hdl-pt[data-h="p1"]')
    const target = { x: h.cx + 40, y: h.cy - 60 }
    await drag(h.cx, h.cy, 40, -60)
    const f = await frame(), ends = [await pt(r.l, 0, 0), await pt(r.l, 1, 1)], ln = (await chainTo(await els(), r.l)).el
    const e1 = ln.flipH || ln.flipV ? [await pt(r.l, ln.flipH ? 1 : 0, ln.flipV ? 1 : 0), await pt(r.l, ln.flipH ? 0 : 1, ln.flipV ? 0 : 1)] : ends
    const want = { x: (target.x - f.x) / f.k, y: (target.y - f.y) / f.k }
    check((await sel()) === r.l && near(e1[0], p0, 0.5) && near(e1[1], want, 1), `dragging a line's end inside a turned group puts it under the pointer: off by ${Math.hypot(e1[1].x - want.x, e1[1].y - want.y).toFixed(2)} pt, the other end moved ${Math.hypot(e1[0].x - p0.x, e1[0].y - p0.y).toFixed(2)} pt`)
  })

  await sec('crop', async () => {
    await fresh()
    const jpg = fs.readFileSync(path.join(__dirname, 'fx', 'photo.jpg')).toString('base64')
    const r = await ev(`(() => { const A = __pz.actions, S = __pz.store
      const bin = Uint8Array.from(atob(${JSON.stringify(jpg)}), c => c.charCodeAt(0))
      const p = A.insertImageBytes(bin, 'image/jpeg', 640, 480, { x: 150, y: 120, w: 320, h: 240 }), b = A.insertShape('rect', { x: 520, y: 150, w: 100, h: 100 })
      S.select([p.id, b.id]); A.groupSelected(); const g = S.slide.value.elements[0]; S.updateEl(g.id, x => { x.rot = 30 }); S.select([p.id]); S.cropMode.value = p.id
      return { p: p.id } })()`); await wait(400)
    const west0 = await pt(r.p, 0, 0.5), f = await frame(), w0 = (await chainTo(await els(), r.p)).el.w
    const h = await box('.chdl-e')
    await drag(h.cx, h.cy, -40 * Math.cos(Math.PI / 6), -40 * Math.sin(Math.PI / 6))
    const after = (await chainTo(await els(), r.p)).el, west1 = await pt(r.p, 0, 0.5)
    check(after.crop && after.crop.r > 0.05 && !after.crop.l && near(west0, west1, 0.5) && Math.abs(w0 - after.w - 40 / f.k) < 1, `cropping a picture inside a turned group cuts the dragged side and keeps the other: ${JSON.stringify(after.crop)}, left side moved ${Math.hypot(west1.x - west0.x, west1.y - west0.y).toFixed(2)} pt`)
    await ev(`__pz.store.cropMode.value = null`)
  })

  await sec('nested', async () => {
    await fresh()
    const r = await ev(`(() => { const A = __pz.actions, S = __pz.store
      const a = A.insertShape('rect', { x: 200, y: 150, w: 120, h: 80 }), b = A.insertShape('rect', { x: 380, y: 150, w: 120, h: 80 }), c = A.insertShape('ellipse', { x: 300, y: 320, w: 90, h: 90 })
      S.select([a.id, b.id]); A.groupSelected(); const inner = S.slide.value.elements.find(e => e.type === 'group'); S.updateEl(inner.id, x => { x.rot = 30 })
      S.select([inner.id, c.id]); A.groupSelected(); const outer = S.slide.value.elements[0]; S.updateEl(outer.id, x => { x.rot = 20 }); S.select([])
      return { a: a.id, inner: inner.id, outer: outer.id } })()`); await wait(300)
    const a0 = await elBox(r.a)
    for (let i = 0; i < 4; i++) { await page.mouse.click(a0.cx, a0.cy); await wait(350) }
    const s = await sel(), t = await total(r.a)
    await drag(a0.cx, a0.cy, -60, 30)
    const a1 = await elBox(r.a)
    check(s === r.a && t === 50 && near({ x: a1.cx, y: a1.cy }, { x: a0.cx - 60, y: a0.cy + 30 }, 2), `a box two turned groups deep (${t}°) is reached by clicking in and follows the pointer: ${fmt({ x: a1.cx - a0.cx, y: a1.cy - a0.cy })} for (-60, 30)`)
  })

  // ungroup, flip and delete on two turned groups: every object stays (or mirrors) where the slide shows it
  await sec('structure', async () => {
    await fresh()
    const r = await ev(`(() => { const A = __pz.actions, S = __pz.store
      const a = A.insertShape('rect', { x: 200, y: 150, w: 120, h: 80 }), b = A.insertShape('rect', { x: 380, y: 150, w: 120, h: 80 }), c = A.insertShape('ellipse', { x: 300, y: 320, w: 90, h: 90 })
      S.updateEl(a.id, e => { e.rot = 10 })
      S.select([a.id, b.id]); A.groupSelected(); const inner = S.slide.value.elements.find(e => e.type === 'group'); S.updateEl(inner.id, x => { x.rot = 30 })
      S.select([inner.id, c.id]); A.groupSelected(); const outer = S.slide.value.elements[0]; S.updateEl(outer.id, x => { x.rot = 20 })
      S.select([outer.id]); A.addAnimation('fadeIn', 'entr'); S.select([])
      return { a: a.id, b: b.id, c: c.id, inner: inner.id, outer: outer.id } })()`)
    const ids = [r.a, r.b, r.c]
    const at = async () => { const o = {}; for (const id of ids) o[id] = { p: await pt(id, 0.5, 0.5), t: await total(id) }; return o }
    const turnOff = (x, y) => Math.abs(((x - y) % 360 + 540) % 360 - 180)
    const same = (x, y) => ids.every(id => near(x[id].p, y[id].p, 0.05) && turnOff(x[id].t, y[id].t) < 0.05)
    const s0 = await at()
    await ev(`(() => { const A = __pz.actions, S = __pz.store; S.select([${JSON.stringify(r.outer)}]); A.ungroupSelected(); S.select([${JSON.stringify(r.inner)}]); A.ungroupSelected() })()`)
    const anims = await ev(`__pz.store.slide.value.animations.length`)
    check(same(s0, await at()) && (await els()).every(e => e.type !== 'group') && anims === 0, `ungrouping two turned groups, outer then inner, leaves every object where it showed, turned as it was, and drops the group's animation (${anims} left)`)
    await ev(`__pz.store.undo(); __pz.store.undo()`); await wait(200)
    check(same(s0, await at()) && (await els()).length === 1 && await ev(`__pz.store.slide.value.animations.length`) === 1, 'two undos bring both groups and the animation back')
    const g = (await els())[0], gc = { x: g.x + g.w / 2, y: g.y + g.h / 2 }
    await ev(`__pz.store.select([${JSON.stringify(r.outer)}]); __pz.actions.flipSelected('h')`)
    const s1 = await at()
    check(ids.every(id => near(s1[id].p, { x: 2 * gc.x - s0[id].p.x, y: s0[id].p.y }, 0.05) && turnOff(s1[id].t, 360 - s0[id].t) < 0.05), 'flipping the turned outer group mirrors every object across its centre line, each turned the other way')
    const c0 = await pt(r.c, 0.5, 0.5)
    await ev(`(() => { const A = __pz.actions, S = __pz.store; S.select([${JSON.stringify(r.a)}]); A.deleteSelected(); S.select([${JSON.stringify(r.b)}]); A.deleteSelected() })()`)
    const left = await els(), o = left[0]
    check(left.length === 1 && o.children.length === 1 && o.children[0].id === r.c && Math.abs(o.w - 90) < 0.01 && Math.abs(o.h - 90) < 0.01 && near(await pt(r.c, 0.5, 0.5), c0, 0.05), `deleting both boxes of the inner group drops the emptied group, and the outer group closes around the circle without moving it (${o.children.map(k => k.type).join()}, ${o.w.toFixed(2)}×${o.h.toFixed(2)})`)
  })
}

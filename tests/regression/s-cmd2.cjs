// Commands that left the document unchanged in the sweep: run each on a fresh deck and show what it did
module.exports = async ({ app, page, ev, wait, errors }) => {
  const cases = [
    ['fmt.shrink', 'body'], ['fmt.upper', 'body'], ['fmt.lower', 'body'], ['fmt.sentence', 'body'], ['fmt.title', 'body'], ['fmt.toggleCase', 'body'],
    ['para.indent', 'body'], ['para.outdent', 'body'], ['para.vBottom', 'body'], ['para.vTop', 'body'],
    ['obj.back', 'probe'], ['obj.backward', 'probe'], ['obj.front', 'title'], ['obj.forward', 'title'],
    ['align.distH', 'two'], ['align.distV', 'two'], ['obj.alt', 'probe'], ['edit.undo', 'body']
  ]
  for (const [id, what] of cases) {
    await page.keyboard.press('Escape').catch(() => {})
    const r = await ev(`(async () => {
      const S = __pz.store
      __pz.tour.loadTour(); S.backstage.value = null; S.closeDialog(); S.goSlide(1)
      const probe = __pz.actions.insertShape('rect', { x: 700, y: 380, w: 120, h: 80 })
      const els = S.slide.value.elements
      const body = els.find(e => e.ph === 'body') || els[1], title = els[0]
      if (${JSON.stringify(id)} === 'edit.undo') __pz.actions.rotateSelected(10)
      S.select(${JSON.stringify(what)} === 'body' ? [body.id] : ${JSON.stringify(what)} === 'title' ? [title.id] : ${JSON.stringify(what)} === 'two' ? [probe.id, body.id] : [probe.id])
      const pick = () => { const s = S.slide.value; return JSON.stringify({ order: s.elements.map(e => e.name || e.type), body: (() => { const b = s.elements.find(e => e.id === body.id); return b && { html: (b.html || '').replace(/<[^>]+>/g, '|').slice(0, 90), sz: (b.html || '').match(/font-size:[^;"]+/g)?.slice(0, 2), lvl: (b.html || '').match(/data-lvl="\\d"/g)?.slice(0, 3), anchor: b.anchor || b.vAlign || b.ts?.anchor, x: Math.round(b.x), y: Math.round(b.y) } })(), probe: (() => { const p = s.elements.find(e => e.id === probe.id); return p && { x: Math.round(p.x), y: Math.round(p.y), rot: p.rot, alt: p.alt } })() }) }
      const before = pick()
      await __pz.runCmd(${JSON.stringify(id)})
      await new Promise(r => setTimeout(r, 200))
      const after = pick()
      return { same: before === after, before, after, dialog: S.dialog.value?.type || null, toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).pop() || null }
    })()`)
    console.log(`${r.same ? 'SAME' : 'diff'} ${id} (${what}) dialog=${r.dialog} toast=${r.toast}`)
    if (!r.same) { console.log('   before', r.before); console.log('   after ', r.after) } else console.log('   state ', r.before)
    await ev(`__pz.store.closeDialog()`)
  }
}

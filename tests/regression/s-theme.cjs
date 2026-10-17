// Switching the theme: every placeholder keeps its own style (a comparison slide has headings and bodies),
// untouched placeholders move to the new theme's layout, moved ones stay put; layouts get only the accents they can use
const path = require('path')
module.exports = async ({ page, ev, wait, errors, OUT }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const r = await ev(`(() => {
    const A = __pz.actions, S = __pz.store
    __pz.tour.loadTour(); __pz.files.newDocIn('blank'); S.backstage.value = null
    A.addSlide('comparison'); A.addSlide('contentCaption'); A.addSlide('section')
    S.goSlide(3); S.updateSlide(s => { const t = s.elements.find(e => e.ph === 'title'); t.x += 40 })
    A.applyTheme('neon')
    const d = S.doc.value, W = d.size.w
    const ts = s => s.elements.filter(e => e.ph).map(e => ({ ph: e.ph, bold: !!e.ts.bold, size: e.ts.size, color: e.ts.color, x: e.x, w: e.w }))
    const out = { W, title: ts(d.slides[0]), comp: ts(d.slides[1]), cap: ts(d.slides[2]), sec: ts(d.slides[3]) }
    A.applyTheme('aurora')
    out.back = ts(S.doc.value.slides[0])
    return out
  })()`)
  const W = r.W
  const heads = r.comp.filter(e => e.ph === 'body')
  check(heads.map(e => e.bold).join() === 'true,false,true,false', 'comparison headings stay bold, bodies stay plain: ' + heads.map(e => e.bold).join())
  const cap = r.cap.filter(e => e.ph === 'body')
  check(cap[1].size < cap[0].size && cap[1].color === 'dk2', `the caption keeps its small grey text (${cap[1].size}pt ${cap[1].color} vs ${cap[0].size}pt)`)
  check(Math.abs(r.title[0].w - W * 0.55) < 1, `the title slide title makes room for the neon art (${r.title[0].w} of ${W})`)
  check(Math.abs(r.back[0].w - W * 0.86) < 1, `and widens again in aurora (${r.back[0].w})`)
  const st = r.sec.find(e => e.ph === 'title')
  check(Math.abs(st.x - (W * 0.07 + 40)) < 1 && Math.abs(st.w - W * 0.86) < 1, `a title moved by hand stays where it was put (x ${st.x}, w ${st.w})`)

  // decorations: the top-title accent only on layouts with a top title, statement slides without the section art
  const { slideDecor, THEMES, makeDocTheme } = await import(require('path').join(__dirname, '../../src/renderer/core/themes.js'))
  const size = { w: 960, h: 540 }, wrong = []
  for (const t of THEMES) {
    const th = makeDocTheme(t.id), decor = l => slideDecor({ layout: l }, th, size)
    const bars = l => decor(l).filter(e => Math.abs(e.y - size.h * 0.228) < 3).length
    for (const l of ['blank', 'contentCaption', 'pictureCaption', 'statement']) if (bars(l)) wrong.push(`${t.id}/${l} has a title accent`)
    if (t.titleBar && !bars('titleContent')) wrong.push(`${t.id}/titleContent lost its title accent`)
    if (decor('statement').length !== decor('blank').length) wrong.push(`${t.id}/statement carries the section art`)
  }
  check(!wrong.length, 'theme accents sit only where the layout has a title for them: ' + (wrong.join(', ') || 'all ' + THEMES.length + ' themes'))
}

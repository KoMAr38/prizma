// Reading files Prizma did not write: the fixtures in imp/ are small decks with the objects that used to go wrong
const path = require('path')
const IMP = path.join(__dirname, 'imp')
module.exports = async ({ page, ev, wait, errors, OUT }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const sec = async (name, fn) => { try { await fn() } catch (e) { check(false, `${name} threw: ${(e.stack || e.message).split('\n').slice(0, 2).join(' | ')}`) } }
  await ev(`__pz.tour.loadTour(); __pz.store.backstage.value = null`)
  // opens imp/<name> (or a full path) in this window; returns the result, the message shown and the document
  const open = name => ev(`(async () => {
    const res = await __pz.files.openPath(${JSON.stringify(path.resolve(IMP, name))}, { here: true })
    const toast = [...document.querySelectorAll('.toast')].map(t => t.textContent).pop() || null
    for (const t of document.querySelectorAll('.toast-x')) t.click()
    return { res, toast, doc: JSON.parse(JSON.stringify(__pz.store.doc.value)) }
  })()`)
  const texts = s => s.elements.map(e => (e.html || '').replace(/<[^>]+>/g, '')).join('|')

  await sec('odd objects', async () => {
    // a picture without blipFill, a gradient without stops, an empty blipFill, a scatter chart with text X values
    const r = await open('odd-objects.pptx')
    check(r.res === true && r.doc.slides.length === 4, `a deck with objects pptxtojson can't read still opens (${r.res}, ${r.toast || 'no message'})`)
    check(r.doc.slides.every((s, i) => texts(s).includes('keep ' + (i + 1))), 'each slide keeps its other objects: ' + r.doc.slides.map(texts).join(' / '))
  })

  await sec('charts', async () => {
    // blank cells and names with "&", two-level categories, date categories, a column + line combo
    const charts = d => d.slides.map(s => s.elements.find(e => e.type === 'chart'))
    const data = c => JSON.stringify([c?.categories, c?.series?.map(s => [s.name, s.values])])
    const [a, b, c, d] = charts((await open('charts.pptx')).doc)
    check(data(a) === '[["R&D","Sales & Marketing","Ops","HR"],[["Plan & Actual",[1,0,3,4]],["B",[5,6,0,8]]]]', 'a blank cell keeps the later values in place, names keep "&": ' + data(a))
    check(JSON.stringify(b?.categories) === '["2023 Q1","2023 Q2","2024 Q1","2024 Q2"]', 'two-level categories: ' + data(b))
    check(c?.categories?.length === 3 && c.categories.every(t => /2024/.test(t) && !/^[\d.]+$/.test(t)), 'date categories read as dates: ' + data(c))
    check(d?.chartType === 'column' && data(d) === '[["a","b","c"],[["Bars",[1,2,3]],["Line",[3,2,1]]]]', 'a column + line combo keeps both series: ' + d?.chartType + ' ' + data(d))
    // saved and opened again, every chart still has all its data
    const p = path.join(OUT, 'charts-saved.pptx')
    await ev(`__pz.files.writeTo(${JSON.stringify(p)}, 'pptx')`)
    const r = await open(p), back = charts(r.doc)
    check(r.res === true && [a, b, c, d].every((x, i) => data(x) === data(back[i])), `a save keeps the data of every chart (${r.res}, ${r.toast || 'no message'}): ` + back.map(data).join(' / '))
  })

  await sec('embedded objects', async () => {
    await open('ole.pptx')
    // per slide: the pictures on the slide and on its layout, by type (the VML pictures are GIFs)
    const [a, b, c] = await ev(`__pz.store.doc.value.slides.map(s => [s.elements, s.master || []].map(l => l.filter(e => e.type === 'image').map(e => __pz.store.mediaInfo(e.src)?.mime).join()).join(' | '))`)
    check(a === 'image/png | ', 'the picture PowerPoint 2010 keeps in the object comes before the VML one: ' + a)
    check(b === 'image/gif | ', 'a VML picture is found by its o:spid: ' + b)
    check(c === ' | image/png', 'an object on the layout shows its picture: ' + c)
  })

  await sec('guide geometry', async () => {
    // freeforms whose points are guides (formulas): lines, arcs, curves
    const els = (await open('geometry.pptx')).doc.slides[0].elements
    const [a, b, c, d] = ['Freeform 4', 'Freeform 8', 'Freeform 9', 'Unknown'].map(n => els.find(e => e.name === n))
    check(a?.path === 'M0 0 L0 24.45 L150.87 24.45 L150.87 35.87', 'a freeform drawn with guides: ' + a?.path)
    for (const e of [b, c]) {
      const nums = (e?.path || '').split(/[^\d.-]+/).filter(Boolean).map(Number)
      const inBox = nums.length > 8 && nums.every((v, i) => v > -0.5 && v < (i % 2 ? e.pathVB.h : e.pathVB.w) + 0.5)
      check(inBox && !/[^\d .MLCZ-]/.test(e.path), `${e?.name} is drawn from its guides, inside its box: ${e?.path?.slice(0, 120)}`)
    }
    // a guide Prizma can't work out (at2) never leaves a path of NaNs
    check(d && d.path === null, 'a path with a value that is not a number is not used: ' + d?.path)
  })

  await sec('flipped groups', async () => {
    // G1 (288 x 144 pt) is flipped left-right and holds A (turned 30°) and group B; G2 is upside down and turned 90°
    const els = (await open('flipped-groups.pptx')).doc.slides[0].elements
    const find = (l, n) => { for (const e of l) { const f = e.name === n ? e : e.children && find(e.children, n); if (f) return f } }
    const at = n => { const e = find(els, n); return e && [e.x, e.y, e.rot].map(Math.round).concat(!!e.flipH, !!e.flipV).join() }
    check(at('G1') === '72,72,0,false,false' && at('G2') === '432,288,90,false,false', 'flipped groups keep their place and turn, without a flip: ' + [at('G1'), at('G2')].join(' / '))
    check(at('A') === '216,0,330,true,false' && at('E') === '0,108,0,true,false', 'a flipped group\'s shapes are mirrored in it: ' + [at('A'), at('E')].join(' / '))
    check(at('B') === '0,72,0,false,false' && at('C') === '108,0,0,true,false' && at('C2') === '0,36,0,true,false', 'and so are the shapes of a group inside it: ' + ['B', 'C', 'C2'].map(at).join(' / '))
    check(at('D') === '0,108,0,false,true' && at('D2') === '108,0,0,false,true', 'upside down too: ' + [at('D'), at('D2')].join(' / '))
  })
}

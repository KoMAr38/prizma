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
}

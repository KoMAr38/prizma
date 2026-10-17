// Reading files from elsewhere: the fixtures in imp/ are small decks with the objects that used to go wrong, and
// .prizma files made here that no Prizma would write
const path = require('path'), fs = require('fs')
const JSZip = require('../../node_modules/jszip')
const IMP = path.join(__dirname, 'imp')
module.exports = async ({ app, page, ev, wait, errors, OUT }) => {
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

  await sec('entities', async () => {
    // names and chart texts with "&" and "<" (&amp; and &lt; in the file), on a slide and on its layout
    const d = (await open('entities.pptx')).doc
    const names = l => (l || []).map(e => e.name)
    check(names(d.slides[0].elements).includes('R&D box') && names(d.slides[0].master).includes('Tom & Jerry'), 'names keep "&": ' + JSON.stringify([names(d.slides[0].elements), names(d.slides[0].master)]))
    const [a, b] = [d.slides[0].master, d.slides[1].elements].map(l => (l || []).find(e => e.type === 'chart')).map(c => JSON.stringify([c?.categories, c?.series?.map(s => s.name)]))
    check(a === '[["A&B","C<D"],["S&P"]]' && b === a, 'chart texts keep "&" and "<", on a layout too: ' + a + ' / ' + b)
  })

  await sec('text and outlines', async () => {
    // slide numbers, vertical text, outlines with a colour and no width
    const d = (await open('text.pptx')).doc
    const by = n => d.slides[0].elements.find(e => e.name === n)
    const left = d.slides.map(s => s.elements.filter(e => /Slide Number/.test(e.name || '')).length).join()
    check(d.hf.number === true && left === '0,0' && /Page/.test(by('Page')?.html), `slide number placeholders become the deck's slide number, other text stays: ${d.hf.number} ${left} ${by('Page')?.html}`)
    check(['V1', 'V2', 'V3'].map(n => by(n)?.vertical).join() === 'true,vert270,stacked', 'vertical text: ' + ['V1', 'V2', 'V3'].map(n => by(n)?.vertical).join())
    const ln = n => JSON.stringify(by(n)?.line && [by(n).line.color, by(n).line.width])
    check(ln('O1') === '["#FF0000",0.75]' && ln('O2') === '["#00B050",2]', 'an outline with a colour and no width is kept: ' + ln('O1') + ' ' + ln('O2'))
  })

  await sec('file links', async () => {
    // links to files survive import and saving (.pptx and .prizma); javascript:, data: and vbscript: do not
    const links = () => ev(`(() => {
      const els = __pz.store.doc.value.slides[0].elements, t = document.createElement('template')
      t.innerHTML = els.find(e => e.name === 'Links')?.html || ''
      return [...t.content.querySelectorAll('a')].map(a => a.textContent + '=' + (a.getAttribute('href') || '')).join(' ') + ' | ' + els.find(e => e.name === 'Obj')?.link?.url
    })()`)
    const want = 'a=file:///C:/docs/a.pdf b=C:\\docs\\b.pdf c=\\\\server\\share\\c.pdf d=docs/d.pdf web=https://example.com/?a=1&b=2 js= data= vbs= js2= | \\\\server\\share\\c.pdf'
    await open('links.pptx')
    const got = [await links()]
    for (const fmt of ['pptx', 'prizma']) {
      const p = path.join(OUT, 'links-saved.' + fmt)
      await ev(`__pz.files.writeTo(${JSON.stringify(p)}, '${fmt}')`)
      await open(p)
      got.push(await links())
    }
    check(got.every(g => g === want), 'file links are kept, script and data links are not, after saving too:\n      ' + got.join('\n      '))
  })

  await sec('morph names', async () => {
    // "!!Box" twice on slide 1 and once on slide 2: one id per slide pairs them, never two on one slide
    const [a, b] = (await open('morph.pptx')).doc.slides.map(s => s.elements.filter(e => e.name === 'Box').map(e => e.id))
    check(a.length === 2 && a[0] !== a[1] && b.length === 1 && b[0] === a[0], 'a Morph name used twice on a slide gives two ids, the first pairs with the next slide: ' + JSON.stringify([a, b]))
  })

  await sec('reuse slides media', async () => {
    // the other file's pictures go when the dialog closes, but for those the inserted slides use; nothing else goes
    await open('ole.pptx')
    await app.evaluate(({ dialog }, fp) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fp] }) }, path.join(IMP, 'ole.pptx'))
    const spare = await ev(`__pz.store.addMedia(new Uint8Array([1, 2, 3]), 'image/png')`) // used by no slide, as after an undo
    const media = () => ev(`(() => { const j = JSON.stringify(__pz.store.doc.value); return [...__pz.store.allMedia().keys()].map(id => [id, j.includes('"' + id + '"')]) })()`)
    const before = new Set((await media()).map(([id]) => id))
    const reuse = async close => {
      await ev(`__pz.store.ribbonTab.value = 'home'`); await wait(150)
      await page.getByRole('button', { name: 'New slide options' }).first().click(); await wait(250)
      await page.locator('.pop button, .pop .mi, .pop [role=menuitem]', { hasText: 'Slides from another presentation' }).first().click()
      await page.waitForSelector('.dlg-reuse', { timeout: 15000 })
      await close(); await wait(300)
      const now = await media()
      return { kept: [...before].every(id => now.some(([x]) => x === id)), fresh: now.filter(([id]) => !before.has(id)) }
    }
    const c = await reuse(() => ev(`__pz.store.closeDialog()`))
    check(before.has(spare) && c.kept && !c.fresh.length, 'closing the dialog frees the other file\'s pictures and nothing else: ' + JSON.stringify(c))
    const i = await reuse(() => page.locator('.dlg-reuse .reuse-item').first().dblclick())
    check(i.kept && i.fresh.length === 1 && i.fresh[0][1], 'inserting a slide keeps its picture and frees the others: ' + JSON.stringify(i))
  })

  await sec('prizma files', async () => {
    const good = (await open('flipped-groups.pptx')).doc
    const prizma = async (name, doc, more) => {
      const z = new JSZip()
      z.file('document.json', JSON.stringify({ app: 'Prizma', format: 1, doc, media: {} }))
      more?.(z)
      const p = path.join(OUT, name)
      fs.writeFileSync(p, await z.generateAsync({ type: 'nodebuffer' }))
      return p
    }
    // a refused file logs its error (files.js); those lines are expected here and judged by the checks
    const refused = async p => {
      const n = errors.length, r = await open(p)
      await wait(300)
      for (let i = errors.length - 1; i >= n; i--) if (/^editor console: Error: (This presentation is damaged|This file unpacks)/.test(errors[i])) errors.splice(i, 1)
      return r
    }
    // a slide id with markup in it, in a slide link of a text: the text is cleaned after the id went in
    const bad = JSON.parse(JSON.stringify(good))
    bad.slides[0].id = 'x"><img src=x onerror="window.__pwned=1">'
    bad.slides[0].elements.push({ ...bad.slides[0].elements[0].children[0], id: 'link1', html: '<p><a href="#slide:0">go</a></p>' })
    const r = await open(await prizma('link.prizma', bad))
    const h = r.doc.slides[0]?.elements.find(e => e.id === 'link1')?.html
    check(r.res === true && h && !/onerror|<img/.test(h), 'a slide id from a file puts no markup into text: ' + h)
    // a document that says it unpacks to 4 GB
    const big = await prizma('big.prizma', good, z => z.file('big.bin', 'x'))
    const b = fs.readFileSync(big)
    b.writeUInt32LE(0xC0000000, b.lastIndexOf('big.bin') - 46 + 24) // its size in the central directory: 3 GB
    fs.writeFileSync(big, b)
    const r2 = await refused(big)
    check(r2.res === false && /1\.5 GB/.test(r2.toast), 'a .prizma that unpacks to more than 1.5 GB is refused: ' + r2.toast)
    for (const [name, doc] of [['no-theme', { ...good, theme: null }], ['no-slides', { ...good, slides: {} }], ['no-size', { ...good, size: {} }]]) {
      const r3 = await refused(await prizma(name + '.prizma', doc))
      check(r3.res === false && /damaged/.test(r3.toast), `a .prizma with ${name.replace('-', ' ')} is refused with a clear message: ` + r3.toast)
    }
    // the copy of the document in a .pptx Prizma saved: without its theme it is passed over and the slides are read
    const p = path.join(OUT, 'twin.pptx'), q = path.join(OUT, 'twin-no-theme.pptx')
    await ev(`__pz.files.writeTo(${JSON.stringify(p)}, 'pptx')`)
    const id = await ev(`__pz.store.doc.value.id`)
    const z = await JSZip.loadAsync(fs.readFileSync(p))
    const x = await z.file('customXml/item1.xml').async('string')
    const json = /<pz:document[^>]*>([^<]*)</.exec(x)[1]
    const data = JSON.parse(json.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
    delete data.doc.theme
    z.file('customXml/item1.xml', x.replace(json, () => JSON.stringify(data).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')))
    fs.writeFileSync(q, await z.generateAsync({ type: 'nodebuffer' }))
    const [t1, t2] = [await open(p), await open(q)]
    check(t1.doc.id === id && t2.res === true && t2.doc.id !== id && t2.doc.slides.length === good.slides.length, `a Prizma copy without a theme is passed over (${t1.doc.id === id}, ${t2.res}, ${t2.doc.id !== id})`)
  })
}

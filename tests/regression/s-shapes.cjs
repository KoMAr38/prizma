// Every shape and every chart type: draws cleanly, saves as valid PowerPoint XML and comes back the same
// through the plain PowerPoint reader (Prizma's own copy removed), and LibreOffice opens the file.
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process')
module.exports = async ({ app, page, ev, wait, errors, OUT, shot }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const idle = () => page.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 120000 })
  const shapeIds = Object.keys((await import(require('path').join(__dirname, '../../src/renderer/core/shapes.js'))).SHAPES)
  const charts = []
  for (const t of ['column', 'bar', 'line', 'area']) for (const g of ['clustered', 'stacked', 'percent']) charts.push({ t, g })
  for (const t of ['pie', 'doughnut', 'scatter', 'radar']) charts.push({ t, g: 'clustered' })
  const looks = ['3d', 'flat']
  await ev(`(() => {
    const A = __pz.actions, S = __pz.store
    __pz.tour.loadTour(); __pz.files.newDocIn(); S.backstage.value = null
    const ids = ${JSON.stringify(shapeIds)}
    for (let i = 0; i < ids.length; i++) {
      if (i % 20 === 0) { if (i) A.addSlide('blank'); else A.setLayout('blank'); S.updateSlide(s => { s.elements = [] }) }
      const k = i % 20, col = k % 5, row = Math.floor(k / 5)
      const el = A.insertShape(ids[i], { x: 40 + col * 180, y: 30 + row * 125, w: 150, h: 100 })
      if (i % 7 === 0) S.updateSlide(s => { const e = s.elements.find(x => x.id === el.id); e.html = '<p>' + ids[i] + '</p>' })
    }
    for (const look of ${JSON.stringify(looks)}) {
      const list = ${JSON.stringify(charts)}
      for (let i = 0; i < list.length; i++) {
        if (i % 4 === 0) { A.addSlide('blank'); S.updateSlide(s => { s.elements = [] }) }
        const c = A.insertChart(list[i].t)
        S.updateSlide(s => { const e = s.elements.find(x => x.id === c.id); Object.assign(e, { x: 20 + (i % 2) * 470, y: 20 + (Math.floor(i / 2) % 2) * 260, w: 450, h: 240, grouping: list[i].g, look, name: list[i].t + ' ' + list[i].g + ' ' + look }) })
      }
    }
    S.select([])
  })()`)
  const nSlides = await ev(`__pz.store.doc.value.slides.length`)
  console.log('slides', nSlides, 'shapes', shapeIds.length, 'charts', charts.length * looks.length)

  // drawing: every shape path is a real path, every chart draws marks
  const bad = []
  for (let i = 0; i < nSlides; i++) {
    await ev(`__pz.store.goSlide(${i})`); await wait(250)
    const r = await ev(`[...document.querySelectorAll('.panel-stage .pz-slide > .pz-el, .panel-stage .pz-slide .pz-el')].map(n => {
      const ds = [...n.querySelectorAll('path')].map(p => p.getAttribute('d') || '')
      const box = n.getBoundingClientRect()
      return { id: n.dataset.id, kind: n.className, paths: ds.length, broken: ds.some(d => /NaN|undefined|Infinity/.test(d)), empty: ds.length > 0 && ds.every(d => d.trim().length < 4), marks: n.querySelectorAll('rect, path, circle, ellipse, polygon').length, w: box.width, h: box.height }
    })`)
    for (const e of r) if (e.broken || e.empty || e.marks === 0 || e.w < 2 || e.h < 2) bad.push(`slide ${i + 1} ${e.id}: ${JSON.stringify(e)}`)
    if (i === 0 || i === nSlides - 1) await shot('shapes-' + (i + 1))
  }
  check(!bad.length, 'every shape and chart draws (no NaN, no empty path): ' + (bad.slice(0, 5).join(' | ') || 'all fine'))

  // .pptx: schema, then the plain PowerPoint reading path
  const f = path.resolve(OUT, "shapes.pptx")
  await app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }) }, f)
  await ev(`__pz.files.saveAs('pptx')`); await wait(300); await idle()
  const val = execFileSync('bash', ['-c', `cd ${path.join(__dirname, 'val')} && java -cp ".:*" Validate ${f} 2>&1 | tail -4`]).toString()
  console.log('schema:', val.trim().split('\n').pop())
  check(/invalid 0/.test(val), 'shapes.pptx is schema-valid')
  if (!/invalid 0/.test(val)) console.log(val.slice(0, 1500))
  const before = await ev(`__pz.store.doc.value.slides.map(s => s.elements.map(e => e.type === 'chart' ? 'chart:' + e.chartType + ':' + (e.grouping || 'clustered') + ':' + e.series.map(x => x.values.join('/')).join('|') : e.type + ':' + e.shape).join(','))`)
  const bare = path.join(OUT, 'shapes-bare.pptx')
  execFileSync('python3', ['-c', `import zipfile,sys\nzi=zipfile.ZipFile(sys.argv[1]);zo=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED)\nfor n in zi.namelist():\n  d=zi.read(n)\n  if n.startswith('customXml/'): continue\n  if n=='ppt/_rels/presentation.xml.rels': d=d.replace(b'Target="../customXml/item1.xml"',b'Target="../customXml/missing.xml"')\n  zo.writestr(n,d)\nzo.close()`, f, bare])
  const opened = await ev(`__pz.files.openPath(${JSON.stringify(bare)}, { here: true })`); await wait(300); await idle()
  const openedName = await ev(`__pz.store.file.value.name`)
  if (!opened || !/bare/.test(openedName)) errors.push('the plain PowerPoint copy did not open: ' + openedName)
  const back = await ev(`__pz.store.doc.value.slides.map(s => s.elements.map(e => e.type === 'chart' ? 'chart:' + e.chartType + ':' + (e.grouping || 'clustered') + ':' + e.series.map(x => x.values.join('/')).join('|') : e.type + ':' + e.shape).join(','))`)
  const diffs = []
  before.forEach((b, i) => { const x = b.split(','), y = (back[i] || '').split(','); x.forEach((v, j) => { if (v !== y[j]) diffs.push(`slide ${i + 1} #${j + 1}: ${v} → ${y[j] || 'missing'}`) }) })
  check(!diffs.length, 'every shape and chart comes back from PowerPoint XML: ' + (diffs.slice(0, 12).join(' | ') || 'identical'))
  if (diffs.length > 12) console.log('   …and', diffs.length - 12, 'more')

  // LibreOffice opens it and draws every slide
  const pdfDir = path.join(OUT, 'lo'); fs.mkdirSync(pdfDir, { recursive: true })
  try {
    execFileSync('soffice', ['-env:UserInstallation=file:///tmp/lo-prizma-test', '--headless', '--convert-to', 'pdf', '--outdir', pdfDir, f], { timeout: 180000, stdio: 'pipe' })
    const pdf = path.join(pdfDir, 'shapes.pdf')
    const pages = +execFileSync('bash', ['-c', `pdfinfo ${pdf} | awk '/^Pages/{print $2}'`]).toString().trim()
    check(pages === nSlides, `LibreOffice opens the file and draws ${pages} of ${nSlides} slides`)
    execFileSync('pdftoppm', ['-r', '40', '-png', '-f', '1', '-l', String(nSlides), pdf, path.join(pdfDir, 'p')])
  } catch (e) { check(false, 'LibreOffice conversion: ' + (e.message || e).slice(0, 200)) }
}

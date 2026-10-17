// Reuse slides from another file: animations, comments and links between the reused slides must keep working
const path = require('path')
module.exports = async ({ app, page, ev, wait, errors, OUT }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const idle = () => page.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 60000 })
  await ev(`__pz.tour.loadTour()`)
  for (const fmt of ['prizma', 'pptx']) {
    await ev(`__pz.files.newDocIn(); __pz.store.backstage.value = null`)
    await ev(`(() => {
      const A = __pz.actions, S = __pz.store
      A.addSlide(); A.addSlide()
      S.goSlide(1)
      const sh = A.insertShape('rect', { x: 100, y: 120, w: 200, h: 120 }); S.select([sh.id]); A.addAnimation('flyIn', 'entr', true)
      A.addComment('check this box')
      A.setLink({ slide: S.doc.value.slides[2].id }, [sh.id])
    })()`)
    const f = path.join(OUT, 'src.' + fmt)
    await app.evaluate(({ dialog }, fp) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fp] }) }, f)
    await ev(`__pz.files.saveAs('${fmt}')`); await wait(300); await idle()
    await ev(`__pz.files.newDocIn(); __pz.store.backstage.value = null`)
    await ev(`__pz.store.ribbonTab.value = 'home'`); await wait(150)
    await page.getByRole('button', { name: 'New slide options' }).first().click(); await wait(250)
    await page.locator('.pop button, .pop .mi, .pop [role=menuitem]', { hasText: 'Slides from another presentation' }).first().click()
    await page.waitForSelector('.dlg-reuse', { timeout: 15000 })
    await page.locator('.dlg-reuse button', { hasText: 'Insert all' }).click(); await wait(400)
    const r = await ev(`(() => {
      const d = __pz.store.doc.value
      const out = []
      d.slides.forEach((s, i) => {
        const ids = new Set(); const all = [...s.elements]; while (all.length) { const e = all.pop(); ids.add(e.id); if (e.children) all.push(...e.children) }
        for (const a of s.animations || []) out.push('slide ' + (i + 1) + ' animation on ' + (ids.has(a.el) ? 'its shape' : 'a missing object'))
        for (const c of s.comments || []) out.push('slide ' + (i + 1) + ' comment on ' + (c.el ? (ids.has(c.el) ? 'its shape' : 'a missing object') : 'the slide'))
        for (const e of s.elements) if (e.link && e.link.slide) out.push('slide ' + (i + 1) + ' link to slide ' + (d.slides.findIndex(x => x.id === e.link.slide) + 1))
      })
      return out
    })()`)
    console.log('  ', fmt, JSON.stringify(r))
    check(r.includes('slide 3 animation on its shape'), fmt + ': reused slide keeps its animation')
    check(r.includes('slide 3 comment on its shape'), fmt + ': reused slide keeps its comment on the shape')
    check(r.includes('slide 3 link to slide 4'), fmt + ': link between reused slides still points at the reused slide')
  }
  // a file saved by Prizma 1.0.1 points links at slide positions; opening it aims them at those slides
  const { execFileSync } = require('child_process')
  const legacy = path.join(OUT, 'legacy.prizma')
  execFileSync('python3', ['-c', `import zipfile,json,sys
zi=zipfile.ZipFile(sys.argv[1]);zo=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED)
for n in zi.namelist():
  d=zi.read(n)
  if n=='document.json':
    j=json.loads(d)
    for s in j['doc']['slides']:
      for e in s['elements']:
        if e.get('link',{}).get('slide'): e['link']={'slide':2}
    s=j['doc']['slides'][1]['elements'][0]; s['html']='<p><a href="#slide:0">home</a></p>'
    d=json.dumps(j).encode()
  zo.writestr(n,d)
zo.close()`, path.join(OUT, 'src.prizma'), legacy])
  await ev(`__pz.files.openPath(${JSON.stringify(legacy)}, { here: true })`); await wait(300); await idle()
  const lg = await ev(`(() => { const d = __pz.store.doc.value, e = d.slides[1].elements.find(x => x.link); return { link: d.slides.findIndex(s => s.id === e?.link?.slide), text: d.slides[1].elements[0].html, first: d.slides[0].id } })()`)
  check(lg.link === 2 && lg.text.includes('#slide:' + lg.first), 'old file: links aimed at slide positions now name those slides ' + JSON.stringify(lg))
}

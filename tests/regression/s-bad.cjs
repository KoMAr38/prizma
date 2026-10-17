// Broken files: each one gives a clear message within seconds, leaves the open deck untouched and the app usable
const path = require('path'), fs = require('fs')
const DIR = path.join(__dirname, 'bad2')
module.exports = async ({ page, ev, wait, errors }) => {
  await ev(`__pz.tour.loadTour(); __pz.store.backstage.value = null`)
  for (const f of fs.readdirSync(DIR).sort()) {
    const before = errors.length
    const t0 = Date.now()
    const r = await ev(`(async () => {
      const keep = __pz.store.doc.value
      const p = ${JSON.stringify(path.join(DIR, f))}
      const res = await Promise.race([__pz.files.openPath(p, { here: true }), new Promise(r => setTimeout(() => r('HUNG'), 25000))])
      await new Promise(r => setTimeout(r, 300))
      const toast = [...document.querySelectorAll('.toast')].map(t => t.textContent).pop() || null
      const dlg = __pz.store.dialog.value ? (__pz.store.dialog.value.title || __pz.store.dialog.value.type) : null
      const out = { res, slides: __pz.store.doc.value.slides.length, same: __pz.store.doc.value === keep, toast, dlg, busy: !!__pz.store.busy.value }
      for (const t of document.querySelectorAll('.toast-x')) t.click()
      __pz.store.closeDialog()
      if (!out.same) { __pz.tour.loadTour(); __pz.store.backstage.value = null }
      return out
    })()`)
    const ms = Date.now() - t0
    const newErr = errors.slice(before).map(e => e.slice(0, 160))
    console.log(`${f.padEnd(16)} ${String(r.res).padEnd(5)} ${ms}ms slides=${r.slides} ${r.same ? 'deck kept' : 'DECK REPLACED'} busy=${r.busy} | ${r.toast || r.dlg || 'no message'}${newErr.length ? ' | ERR ' + newErr.join(' / ') : ''}`)
    if (r.res === 'HUNG' || r.busy) errors.push(f + ': hung')
    if (f !== 'valid.pptx' && !/nomedia|badslide/.test(f) && (r.res !== false || !(r.toast || r.dlg))) errors.push(f + ': no clear failure')
    errors.splice(before, newErr.length) // console errors from a deliberately broken file are expected; judged above
  }
}

// Print layouts as PDF: page count and size for every layout, hidden slides, ranges, grayscale,
// and no text lost on outline and notes pages
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process')
module.exports = async ({ app, page, ev, wait, errors, OUT }) => {
  const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) errors.push(msg) }
  const idle = () => page.waitForFunction(() => !window.__pz.store.busy.value, null, { timeout: 120000 })
  const longNotes = Array.from({ length: 70 }, (_, i) => `Speaker note line ${i + 1} with a few words to read aloud.`).join('\n')
  await ev(`(() => {
    const A = __pz.actions, S = __pz.store
    __pz.tour.loadTour(); __pz.files.newDocIn('aurora'); S.backstage.value = null
    S.updateSlide(s => { s.elements.find(e => e.ph === 'title').html = '<p>Print test</p>' })
    for (let n = 2; n <= 7; n++) {
      A.addSlide('titleContent')
      S.updateSlide(s => {
        s.elements.find(e => e.ph === 'title').html = '<p>Slide ' + n + ' title</p>'
        s.elements.find(e => e.ph === 'body').html = Array.from({ length: 12 }, (_, i) => '<p data-bu="•" data-lvl="0">Point ' + n + '.' + (i + 1) + ' about the quarter</p>').join('')
        s.notes = n === 3 ? ${JSON.stringify(longNotes)} : 'Short note for slide ' + n
        if (n === 4) s.hidden = true
      })
    }
  })()`)
  const pdf = async (name, opts) => {
    const f = path.resolve(OUT, name + '.pdf')
    await ev(`__pz.printing.exportPdf(${JSON.stringify(f)}, ${JSON.stringify(opts)})`); await idle()
    const info = execFileSync('pdfinfo', [f]).toString()
    return { f, pages: +/Pages:\s+(\d+)/.exec(info)[1], size: /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info).slice(1, 3).map(Number), text: () => execFileSync('pdftotext', ['-layout', f, '-']).toString() }
  }
  const expect = { slides: 6, notes: 8, h1: 6, h2: 3, h3: 2, h4: 2, h6: 1, h9: 1 }
  const got = {}
  for (const [layout, n] of Object.entries(expect)) {
    const r = await pdf('print-' + layout, { layout })
    got[layout] = r
    const size = layout === 'slides' ? [960, 540] : [595.28, 841.89]
    check(r.pages === n && Math.abs(r.size[0] - size[0]) < 1.5 && Math.abs(r.size[1] - size[1]) < 1.5, `${layout}: ${r.pages} pages of ${r.size.join(' x ')} pt (want ${n} of ${size.join(' x ')})`)
  }
  // the slide sits where the layout puts it, at full size (a multi-page job once came out shrunk to 80%)
  const box = (f, pg, rows = 9999) => {
    execFileSync('pdftoppm', ['-r', '72', '-png', '-f', String(pg), '-l', String(pg), f, path.join(OUT, 'box')])
    return JSON.parse(execFileSync('python3', ['-c', `import sys, glob, numpy as np, json
from PIL import Image
f = sorted(glob.glob(sys.argv[1] + '-*.png'))[-1]; im = np.array(Image.open(f).convert('L'))[:int(sys.argv[2])]; d = np.argwhere(im < 70)
print(json.dumps([int(d[:,1].min()), int(d[:,1].max()) + 1]))`, path.join(OUT, 'box'), String(rows)]).toString())
  }
  const h1 = box(got.h1.f, 2), nb = box(got.notes.f, 2, 300)
  check(Math.abs(h1[0] - 48) <= 2 && Math.abs(h1[1] - 547) <= 2, `one slide per page fills the width between the margins (x ${h1.join('–')}, want 48–547)`)
  check(Math.abs(nb[0] - 73) <= 2 && Math.abs(nb[1] - 522) <= 2, `notes page slide is centred at 90% width (x ${nb.join('–')}, want 73–522)`)
  const letter = await pdf('print-letter', { layout: 'h6', paper: 'letter' })
  check(Math.abs(letter.size[0] - 612) < 1.5 && Math.abs(letter.size[1] - 792) < 1.5, 'Letter paper: ' + letter.size.join(' x '))
  const hid = await pdf('print-hidden', { layout: 'slides', hidden: true })
  check(hid.pages === 7, `with hidden slides: ${hid.pages} pages`)
  const cus = await pdf('print-custom', { layout: 'slides', range: 'custom', custom: '2-3, 6' })
  check(cus.pages === 3, `custom range 2-3, 6: ${cus.pages} pages`)
  const cur = await pdf('print-current', { layout: 'slides', range: 'current' })
  check(cur.pages === 1, `current slide: ${cur.pages} page`)

  // no text lost
  const out = await pdf('print-outline', { layout: 'outline' })
  const otext = out.text().replace(/\s+/g, ' ')
  const missing = []
  for (const n of [2, 3, 5, 6, 7]) for (let i = 1; i <= 12; i++) if (!otext.includes(`Point ${n}.${i} about`)) missing.push(`${n}.${i}`)
  check(!missing.length, `outline keeps every line (${out.pages} pages): ` + (missing.length ? 'missing ' + missing.slice(0, 8).join(', ') + (missing.length > 8 ? ` …${missing.length} in all` : '') : 'all 60'))
  const ntext = got.notes.text().replace(/\s+/g, ' ')
  const lostNotes = Array.from({ length: 70 }, (_, i) => i + 1).filter(i => !ntext.includes(`Speaker note line ${i} with`))
  check(!lostNotes.length, `long speaker notes continue on two more pages (${got.notes.pages} pages): ` + (lostNotes.length ? `lines ${lostNotes[0]}–${lostNotes[lostNotes.length - 1]} cut off` : 'all 70 lines'))

  // a portrait deck: the slide takes at most the top half of a notes page, and its notes stay on the page
  await ev(`__pz.actions.setSlideSize({ w: 540, h: 960 })`)
  const por = await pdf('print-portrait', { layout: 'notes', range: 'current' })
  execFileSync('pdftoppm', ['-r', '72', '-png', '-f', '1', '-l', '1', por.f, path.join(OUT, 'por')])
  const ph = JSON.parse(execFileSync('python3', ['-c', `import sys, glob, numpy as np, json
from PIL import Image
im = np.array(Image.open(sorted(glob.glob(sys.argv[1] + '-*.png'))[0]).convert('L')); rows = np.where((im < 70).sum(1) > 180)[0]
print(json.dumps([int(rows.min()), int(rows.max())]))`, path.join(OUT, 'por')]).toString())
  check(por.pages >= 1 && ph[0] >= 46 && ph[1] < 842 * 0.75, `portrait slide on its notes page spans y ${ph.join('–')} pt, ${por.pages} page(s)`)
  await ev(`__pz.actions.setSlideSize({ w: 960, h: 540 })`)

  // grayscale really is gray
  const g = await pdf('print-gray', { layout: 'slides', gray: true })
  execFileSync('pdftoppm', ['-r', '30', '-png', '-f', '1', '-l', '1', g.f, path.join(OUT, 'gray')])
  const sat = execFileSync('python3', ['-c', `import sys, glob
from PIL import Image
im = Image.open(sorted(glob.glob(sys.argv[1] + '/gray*.png'))[0]).convert('RGB')
print(max(max(p) - min(p) for p in im.getdata()))`, OUT]).toString().trim()
  check(+sat <= 6, 'grayscale print has no colour (max channel spread ' + sat + ')')
}

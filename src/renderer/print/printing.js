// Printing, PDF export and picture export.
// PDF and printing render the pages into the editor window (see .print-root in App) and print that window.
// Pictures are rendered in a hidden window at the exact pixel size and captured.
import { signal } from '@preact/signals'
import { doc, file, slideIdx, selection, slide, native, toast, busy, allMedia, finishEditing, appInfo } from '../core/store.js'
import { printOptsDefault } from './PrintPages.jsx'
import { findEl, onSlide, unionBounds, PX } from '../core/model.js'

export const printJob = signal(null) // { doc, opts } while pages are being printed

const frames = n => new Promise(resolve => { const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step)); step() })
// Waits for the fonts and until every picture under root is decoded: photos, video posters, slide and cell backgrounds,
// picture fills. A picture export taken sooner showed a large background photo as the bare page colour.
export async function settle (root) {
  await frames(2)
  try { await document.fonts.ready } catch {}
  const pics = new Map() // url -> the <img> showing it, or null
  for (const n of (root || document).querySelectorAll('*')) {
    const own = n.localName === 'img' ? n.currentSrc || n.src : n.localName === 'image' ? n.getAttribute('href') : n.localName === 'video' ? n.poster : ''
    if (own && !pics.has(own)) pics.set(own, n.localName === 'img' ? n : null)
    for (const m of getComputedStyle(n).backgroundImage.matchAll(/url\("?(.*?)"?\)/g)) if (!pics.has(m[1])) pics.set(m[1], null)
  }
  // one at a time: a deck of large photos decoded all at once can take gigabytes
  for (const [url, img] of pics) await Promise.race([(img || Object.assign(new Image(), { src: url })).decode().catch(() => {}), new Promise(resolve => setTimeout(resolve, 4000))])
  await frames(2)
  // shortcut: a fixed 60 ms for the compositor to draw what was just decoded; if blank pictures come back, wait for a frame known to be drawn
  await new Promise(resolve => setTimeout(resolve, 60))
}
const sepOf = p => (String(p).includes('\\') ? '\\' : '/')
const dirOf = p => String(p).replace(/[\\/][^\\/]*$/, '')
function besideDoc (ext) {
  const f = file.value
  if (f.path) return f.path.replace(/\.[^.\\/]+$/, '') + '.' + ext
  const docs = appInfo.value.documents
  return docs ? docs + sepOf(docs) + f.name + '.' + ext : f.name + '.' + ext
}
const showInFolder = p => ({ label: 'Show in folder', run: () => native.showInFolder(p) })

async function withPrintJob (opts, fn) {
  finishEditing()
  printJob.value = { doc: doc.value, opts: { ...printOptsDefault(), ...opts, current: slideIdx.value } }
  try {
    await settle(document.querySelector('.print-root'))
    return await fn()
  } finally {
    printJob.value = null
  }
}

export async function exportPdf (path, opts = {}) {
  busy.value = { label: 'Creating PDF…' }
  try {
    await withPrintJob(opts, () => native.printToPDF({ path }))
    toast(`PDF saved: ${String(path).split(/[\\/]/).pop()}`, { action: showInFolder(path) })
    return true
  } catch (e) {
    console.error(e)
    toast(`Couldn't create the PDF: ${e.message || e}`, { kind: 'error' })
    return false
  } finally {
    busy.value = null
  }
}
export async function exportPdfDialog (opts = {}) {
  const p = await native.saveDialog({ title: 'Export to PDF', defaultPath: besideDoc('pdf'), filters: [{ name: 'PDF (*.pdf)', extensions: ['pdf'] }] })
  if (!p) return false
  return exportPdf(p, opts)
}
export async function printSystem (opts = {}) {
  try {
    const r = await withPrintJob(opts, () => native.printSystem())
    if (r && !r.ok && r.reason && !/cancel/i.test(r.reason)) toast(`Printing failed: ${r.reason}`, { kind: 'error' })
  } catch (e) {
    toast(`Printing failed: ${e.message || e}`, { kind: 'error' })
  }
}

// ---------- pictures ----------
let capturing = false
// items: [{ slideIndex, path, fmt } | { elements, bounds, slideIndex, path, fmt }], all rendered at pw × ph pixels
function capture (items, { pw, ph, transparent }) {
  if (capturing) return Promise.reject(new Error('Another export is still running'))
  capturing = true
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(16, Math.round(pw / dpr)), h = Math.max(16, Math.round(ph / dpr))
  return new Promise((resolve, reject) => {
    let win = null
    const finish = (fn, v) => {
      capturing = false
      clearTimeout(watchdog)
      window.__prizmaCapture = null
      try { if (win && !win.closed) win.close() } catch {}
      fn(v)
    }
    const errors = []
    window.__prizmaCapture = {
      doc: doc.value,
      media: [...allMedia().entries()],
      items,
      pw, ph,
      transparent: !!transparent,
      done: r => finish(resolve, { ...r, errors }),
      error: msg => errors.push(msg)
    }
    // generous: a few seconds per picture
    const watchdog = setTimeout(() => finish(reject, new Error('The export timed out')), 20000 + items.length * 6000)
    win = window.open(`index.html?w=${w}&h=${h}${transparent ? '&t=1' : ''}#capture`, 'pz-print')
    if (!win) finish(reject, new Error('Could not open the export window'))
  })
}

export async function exportImagesDialog ({ fmt = 'png', which = 'all', scale = 2 } = {}) {
  finishEditing()
  const d = doc.value
  if (!d) return
  const ext = fmt === 'jpg' ? 'jpg' : 'png'
  const all = which === 'all' && d.slides.length > 1
  const p = await native.saveDialog({
    title: all ? 'Export all slides as pictures' : 'Export slide as a picture',
    defaultPath: all ? besideDoc(ext) : besideDoc(ext).replace(/(\.[^.]+)$/, `-slide${slideIdx.value + 1}$1`),
    filters: [ext === 'png' ? { name: 'PNG picture (*.png)', extensions: ['png'] } : { name: 'JPEG picture (*.jpg)', extensions: ['jpg', 'jpeg'] }]
  })
  if (!p) return
  let items, folder = null
  if (all) {
    // like PowerPoint: a folder named after the file, with Slide1.png, Slide2.png, …
    const sep = sepOf(p)
    folder = p.replace(/\.[^.\\/]+$/, '')
    items = d.slides.map((s, i) => ({ slideIndex: i, path: `${folder}${sep}Slide${i + 1}.${ext}`, fmt: ext }))
  } else items = [{ slideIndex: slideIdx.value, path: p, fmt: ext }]
  const pw = Math.round(d.size.w * PX * scale), ph = Math.round(d.size.h * PX * scale)
  busy.value = { label: all ? `Exporting ${items.length} pictures…` : 'Exporting picture…' }
  try {
    const r = await capture(items, { pw, ph })
    if (r.errors?.length) toast(`Some pictures could not be saved: ${r.errors[0]}`, { kind: 'error' })
    else toast(all ? `${items.length} pictures saved in ${folder.split(/[\\/]/).pop()}` : `Picture saved: ${p.split(/[\\/]/).pop()}`, { action: showInFolder(all ? items[0].path : p) })
  } catch (e) {
    toast(`Couldn't export: ${e.message || e}`, { kind: 'error' })
  } finally {
    busy.value = null
  }
}

// Right-click › Save as picture: the selected objects only, on a transparent background (PNG)
export async function saveSelectionAsPicture () {
  finishEditing()
  const s = slide.value
  if (!s || !selection.value.length) return
  const els = []
  for (const id of selection.value) {
    const hit = findEl(s, id)
    if (!hit) continue
    els.push(onSlide(s, hit.el)) // a group's child as it shows on the slide
  }
  if (!els.length) return
  const b = unionBounds(els)
  const pad = 2
  const bounds = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }
  const name = els.length === 1 ? (els[0].name || 'Picture') : 'Picture'
  const dir = file.value.path ? dirOf(file.value.path) : appInfo.value.documents
  const p = await native.saveDialog({
    title: 'Save as picture',
    defaultPath: (dir ? dir + sepOf(dir) : '') + name.replace(/[\\/:*?"<>|]/g, '') + '.png',
    filters: [{ name: 'PNG picture (*.png)', extensions: ['png'] }, { name: 'JPEG picture (*.jpg)', extensions: ['jpg', 'jpeg'] }]
  })
  if (!p) return
  const fmt = /\.jpe?g$/i.test(p) ? 'jpg' : 'png'
  // about 2× screen size, capped so huge selections stay reasonable
  const k = Math.min(3, 4000 / Math.max(bounds.w * PX, bounds.h * PX)) || 2
  const pw = Math.max(16, Math.round(bounds.w * PX * k)), ph = Math.max(16, Math.round(bounds.h * PX * k))
  busy.value = { label: 'Saving picture…' }
  try {
    const r = await capture([{ elements: els, bounds, slideIndex: slideIdx.value, path: p, fmt }], { pw, ph, transparent: fmt === 'png' })
    if (r.errors?.length) toast(`Couldn't save the picture: ${r.errors[0]}`, { kind: 'error' })
    else toast(`Picture saved: ${p.split(/[\\/]/).pop()}`, { action: showInFolder(p) })
  } catch (e) {
    toast(`Couldn't save the picture: ${e.message || e}`, { kind: 'error' })
  } finally {
    busy.value = null
  }
}

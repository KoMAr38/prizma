// Document operations used by the ribbon, menus, keyboard shortcuts and panes.
import { batch } from '@preact/signals'
import {
  doc, slide, slideIdx, selection, editing, editCell, slideSel, update, updateSlide, updateEls, select, goSlide,
  selected, toast, addMedia, mediaInfo, bytesToBase64, dataUrlToBytes, painter, settings, appInfo, theme as themeSig, redraw
} from './store.js'
import {
  uid, findEl, walk, parentGroups, cloneEl, bounds, unionBounds, textBox, shapeEl, lineEl, imageEl, tableEl, chartEl, iconEl, mediaEl, solid, onSlide, parentFrame, rotatePt, mapSlideLinks, cssColor, removeEls
} from './model.js'
import { newSlide, layoutPlaceholders, makeDocTheme, themeById, THEMES } from './themes.js'
import { setRunStyleAll, setParaStyleAll, setBulletsAll, changeLevelAll, normalize, richState, isEmptyHtml, htmlFromText, textOf, replaceText, searchRe } from './html.js'
import { SHAPES } from './shapes.js'

const S = () => doc.value.size
const curIdx = () => slideIdx.value

// ---------------- slides ----------------
export function addSlide (layoutId) {
  const d = doc.value
  const i = curIdx()
  const cur = d.slides[i]
  const layout = layoutId || (cur && cur.layout === 'title' ? 'titleContent' : cur?.layout) || 'titleContent'
  const s = newSlide(layout, d.size, d.theme)
  if (d.theme.id === 'imported' && cur) {
    // keep the look of imported decks: reuse the current slide's master graphics and background
    const twin = d.slides.find(x => x.layout === layout && x.master) || cur
    s.master = twin.master ? JSON.parse(JSON.stringify(twin.master)) : null
    s.bg = twin.bg ? JSON.parse(JSON.stringify(twin.bg)) : null
    for (const ph of s.elements) styleImportedPlaceholder(ph, twin)
  }
  update(dd => { dd.slides.splice(i + 1, 0, s) })
  goSlide(i + 1)
  return s
}
// Borrow font family/colour from a similar placeholder on an imported slide
function styleImportedPlaceholder (ph, twin) {
  const src = twin.elements.find(e => e.ph === ph.ph) || twin.elements.find(e => e.ph === 'body')
  if (!src || !src.html) return
  const st = richState(src.html, {})
  if (st.font) ph.ts.font = st.font
  if (st.color) ph.ts.color = st.color
  if (st.size && ph.ph === 'title') ph.ts.size = st.size
}
export function duplicateSlides (ids) {
  const d = doc.value
  ids = ids && ids.length ? ids : [d.slides[curIdx()].id]
  const idxs = ids.map(id => d.slides.findIndex(s => s.id === id)).filter(i => i >= 0).sort((a, b) => a - b)
  if (!idxs.length) return
  const last = idxs[idxs.length - 1]
  const copies = idxs.map(i => ({ ...JSON.parse(JSON.stringify(d.slides[i])), id: uid('s') }))
  update(dd => { dd.slides.splice(last + 1, 0, ...copies) })
  goSlide(last + 1)
  slideSel.value = copies.map(c => c.id)
}
export function deleteSlides (ids) {
  const d = doc.value
  ids = (ids || []).filter(id => d.slides.some(s => s.id === id)) // the slide list may still name slides an undo took away
  if (!ids.length) ids = [d.slides[curIdx()].id]
  if (ids.length >= d.slides.length) {
    // never leave a deck empty: replace with a blank title slide
    update(dd => { dd.slides = [newSlide('title', dd.size, dd.theme)] })
    goSlide(0)
    return
  }
  const first = d.slides.findIndex(s => ids.includes(s.id))
  update(dd => { dd.slides = dd.slides.filter(s => !ids.includes(s.id)) })
  goSlide(Math.min(first, doc.value.slides.length - 1))
}
export function toggleHideSlides (ids) {
  const d = doc.value
  ids = ids && ids.length ? ids : [d.slides[curIdx()].id]
  const hide = !d.slides.find(s => s.id === ids[0])?.hidden
  update(dd => { for (const s of dd.slides) if (ids.includes(s.id)) s.hidden = hide })
}
export function moveSlides (ids, to) {
  const d = doc.value
  ids = ids.filter(id => d.slides.some(s => s.id === id))
  if (!ids.length) return
  const moving = d.slides.filter(s => ids.includes(s.id))
  const rest = d.slides.filter(s => !ids.includes(s.id))
  const before = d.slides.slice(0, to).filter(s => !ids.includes(s.id)).length
  const out = [...rest.slice(0, before), ...moving, ...rest.slice(before)]
  if (out.every((s, i) => s.id === d.slides[i].id)) return
  update(dd => { dd.slides = out.map(s => dd.slides.find(x => x.id === s.id)) })
  const ni = out.findIndex(s => ids.includes(s.id))
  batch(() => { slideIdx.value = ni; slideSel.value = ids })
}
export function setLayout (layoutId, ids) {
  const d = doc.value
  ids = ids && ids.length ? ids : [d.slides[curIdx()].id]
  update(dd => {
    for (const s of dd.slides) {
      if (!ids.includes(s.id)) continue
      const fresh = layoutPlaceholders(layoutId, dd.size, dd.theme)
      const old = s.elements.filter(e => e.ph)
      const used = new Map() // old placeholder -> the new one that takes its place
      for (const ph of fresh) {
        const match = old.find(o => !used.has(o) && (o.ph === ph.ph || (ph.ph === 'subTitle' && o.ph === 'body') || (ph.ph === 'body' && o.ph === 'subTitle')))
        if (match) {
          used.set(match, ph)
          if (!isEmptyHtml(match.html)) ph.html = ph.ph === 'body' && match.ph === 'body' ? match.html : normalize(match.html)
          ph.id = match.id
        }
      }
      // everything keeps its place in the stacking order (a photo sent to the back stays behind the title);
      // placeholders that no longer fit keep their content as ordinary text boxes
      const placed = new Set(used.values())
      const leftover = o => { const c = JSON.parse(JSON.stringify(o)); delete c.ph; return c }
      s.elements = [...fresh.filter(p => !placed.has(p)), ...s.elements.flatMap(e => !e.ph ? [e] : used.has(e) ? [used.get(e)] : isEmptyHtml(e.html) ? [] : [leftover(e)])]
      s.layout = layoutId
      if (dd.theme.id !== 'imported') s.master = null
    }
  })
  selection.value = []
}
export function resetSlide () {
  const s = slide.value
  if (s) setLayout(s.layout || 'titleContent', [s.id])
}

// ---------------- themes, background, size ----------------
export function applyTheme (themeId, variant = 0) {
  const t = themeById(themeId)
  const fresh = makeDocTheme(t.id, variant)
  update(dd => {
    const wasImported = dd.theme.id === 'imported'
    const old = dd.theme
    dd.theme = fresh
    for (const s of dd.slides) {
      s.master = null
      s.bg = null
      const was = layoutPlaceholders(s.layout || 'titleContent', dd.size, old), now = layoutPlaceholders(s.layout || 'titleContent', dd.size, fresh)
      for (const e of s.elements) {
        if (!e.ph) continue
        // the layout placeholder this one came from: same role, nearest spot (a comparison slide has four bodies)
        const olds = was.filter(p => p.ph === e.ph), news = now.filter(p => p.ph === e.ph)
        const i = olds.reduce((best, p, j) => Math.hypot(p.x - e.x, p.y - e.y) < Math.hypot(olds[best].x - e.x, olds[best].y - e.y) ? j : best, 0)
        const ph = news[i]
        if (ph) e.ts = { ...ph.ts }
        // not moved by hand, so it follows the new theme's layout, as in PowerPoint
        if (ph && ['x', 'y', 'w', 'h'].every(k => Math.abs(e[k] - olds[i][k]) < 0.5)) Object.assign(e, { x: ph.x, y: ph.y, w: ph.w, h: ph.h })
        if (wasImported && e.html) {
          // let imported placeholder text follow the new theme
          e.html = setRunStyleAll(setRunStyleAll(e.html, 'font', null), 'color', null)
        }
      }
    }
  })
}
export function applyVariant (variant) {
  const t = doc.value.theme
  if (t.id === 'imported') return
  const fresh = makeDocTheme(t.id, variant)
  update(dd => { dd.theme.colors = fresh.colors; dd.theme.variant = variant })
}
export function setThemeColors (colors) { update(dd => { dd.theme.colors = { ...dd.theme.colors, ...colors } }) }
export function setThemeFonts (fonts) { update(dd => { dd.theme.fonts = { ...dd.theme.fonts, ...fonts } }) }
export function setBackground (fill, all = false) {
  update(dd => { for (const [i, s] of dd.slides.entries()) if (all || i === curIdx()) s.bg = fill ? JSON.parse(JSON.stringify(fill)) : null })
}
export function setHideMaster (v, all = false) {
  update(dd => { for (const [i, s] of dd.slides.entries()) if (all || i === curIdx()) s.hideMaster = v })
}
export function setSlideSize (size, mode = 'fit') {
  update(dd => { fitSlides(dd.slides, dd.size, size, mode); dd.size = { w: size.w, h: size.h } })
}
// Content made for one slide size, scaled to another (fit: all of it stays on the slide, centred). Also used when
// slides come from a deck with another size (paste, Reuse slides).
export function fitSlides (slides, from, size, mode = 'fit') {
  const sx = size.w / from.w, sy = size.h / from.h
  if (sx === 1 && sy === 1) return
  const k = mode === 'maximize' ? Math.max(sx, sy) : Math.min(sx, sy)
  const ox = (size.w - from.w * k) / 2, oy = (size.h - from.h * k) / 2
  const scaleEl = (e, top) => {
    e.x = e.x * k + (top ? ox : 0); e.y = e.y * k + (top ? oy : 0); e.w *= k; e.h *= k
    if (e.path && e.pathVB) e.pathLocked = true
    if (e.ts?.size) e.ts.size = Math.max(1, Math.round(e.ts.size * k * 10) / 10)
    if (e.html && k !== 1) e.html = scaleFontSizes(e.html, k)
    if (e.type === 'table') { e.cols = e.cols.map(v => v * k); e.rows = e.rows.map(v => v * k); for (const row of e.cells) for (const c of row) if (c.html) c.html = scaleFontSizes(c.html, k) }
    if (e.line?.width) e.line.width = Math.max(0.25, e.line.width * Math.sqrt(k))
    if (e.children) e.children.forEach(c => scaleEl(c, false))
  }
  for (const s of slides) { s.elements.forEach(e => scaleEl(e, true)); if (s.master) s.master.forEach(e => scaleEl(e, true)) }
}
function scaleFontSizes (html, k) {
  return html.replace(/font-size:\s*([\d.]+)pt/g, (m, v) => `font-size: ${Math.max(1, Math.round(+v * k * 10) / 10)}pt`).replace(/--bu-sz:\s*([\d.]+)pt/g, (m, v) => `--bu-sz: ${Math.max(1, Math.round(+v * k * 10) / 10)}pt`)
}

// ---------------- elements ----------------
export function insertElement (el, opts = {}) {
  updateSlide(s => { s.elements.push(el) })
  select([el.id])
  if (opts.edit) editing.value = el.id
  return el
}
export function centerBox (w, h) {
  const z = S()
  return { x: (z.w - w) / 2, y: (z.h - h) / 2, w, h }
}
export function insertTextBox (b) {
  const box = b || { ...centerBox(320, 40) }
  return insertElement(textBox({ ...box, h: Math.max(box.h, 30) }, '<p><br></p>', { autofit: 'shape', wrap: box.w > 60 }), { edit: true })
}
export function insertShape (shape, b) {
  const box = b || centerBox(140, 140)
  const def = SHAPES[shape]
  const t = themeSig.value
  const el = shapeEl(shape, box, {
    ts: { font: '+minor', size: 18, color: themeShapeText(t), align: 'center' },
    ...(def?.strokeOnly ? { fill: null, line: { color: 'accent1', width: 1.5 } } : {})
  })
  return insertElement(el)
}
function themeShapeText (t) {
  const spec = THEMES.find(x => x.id === t?.id)
  if (spec?.shapeText) return spec.shapeText
  return 'lt1'
}
export function insertLine (kind, p1, p2) {
  const z = S()
  return insertElement(lineEl(kind, p1 || { x: z.w / 2 - 100, y: z.h / 2 }, p2 || { x: z.w / 2 + 100, y: z.h / 2 }))
}
export function insertImageBytes (bytes, mime, natW, natH, box) {
  const src = addMedia(bytes, mime)
  const z = S()
  let w = natW * 0.75, h = natH * 0.75
  const maxW = z.w * 0.8, maxH = z.h * 0.8
  const k = Math.min(1, maxW / w, maxH / h)
  w *= k; h *= k
  const b = box || { x: (z.w - w) / 2, y: (z.h - h) / 2, w, h }
  // fill an empty picture placeholder if one is selected or present
  const ph = slide.value?.elements.find(e => e.ph === 'pic' && isEmptyHtml(e.html) && (selection.value.includes(e.id) || selection.value.length === 0))
  if (ph && !box) {
    const k2 = Math.max(ph.w / w, ph.h / h)
    const cw = w * k2, ch = h * k2
    const crop = { l: (cw - ph.w) / 2 / cw, r: (cw - ph.w) / 2 / cw, t: (ch - ph.h) / 2 / ch, b: (ch - ph.h) / 2 / ch }
    const img = imageEl(src, { x: ph.x, y: ph.y, w: ph.w, h: ph.h }, { crop, natW, natH })
    updateSlide(s => { const i = s.elements.findIndex(e => e.id === ph.id); s.elements.splice(i, 1, img) })
    select([img.id])
    return img
  }
  return insertElement(imageEl(src, b, { natW, natH }))
}
// Natural size of a picture, or null when this format can't be shown (TIFF, HEIC …)
// `url`: the picture's blob URL when it already has one (copying a big photo into a new Blob is slow)
export function imageSize (bytes, mime, url) {
  return new Promise(resolve => {
    const own = !url
    if (own) url = URL.createObjectURL(new Blob([bytes], { type: mime }))
    const img = new Image()
    const done = r => { resolve(r); if (own) URL.revokeObjectURL(url) }
    img.onload = () => done({ w: img.naturalWidth || 400, h: img.naturalHeight || 300 })
    img.onerror = () => done(null)
    img.src = url
  })
}
// A picture about to be inserted: { bytes, mime, w, h }, or null when Prizma can't show it. Like PowerPoint's default
// compression, a photo bigger than the slide can show at 220 ppi is scaled down to that (a 12 MP photo keeps about a third
// of its pixels); Options › "Keep pictures at full size" turns this off. WebP, AVIF and the other formats PowerPoint
// can't read become a JPEG (a PNG when see-through) here, once; GIF, BMP and SVG go in as they are.
export async function loadPicture (bytes, mime) {
  const sz = await imageSize(bytes, mime)
  if (!sz) return null
  const z = S(), k = Math.min(z.w / 72 * 220 / sz.w, z.h / 72 * 220 / sz.h)
  const web = !/^image\/(jpeg|png|gif|bmp|svg\+xml)$/.test(mime)
  const shrink = k <= 0.9 && !settings.value.keepPictures && (web || /^image\/(jpeg|png)$/.test(mime))
  if (!web && !shrink) return { bytes, mime, ...sz }
  try {
    return await redraw(bytes, mime, shrink ? Math.round(sz.w * k) : 0, shrink ? Math.round(sz.h * k) : 0, web ? null : mime)
  } catch (e) { console.warn('picture kept as it is', e); return { bytes, mime, ...sz } }
}
export const cantShowPicture = name => toast(`Prizma can't show ${name || 'this picture'}. Save it as PNG or JPEG, then insert it again.`, { kind: 'error' })
export function insertTable (rows, cols) {
  const z = S()
  const w = Math.min(z.w * 0.8, cols * 140)
  const el = tableEl(rows, cols, { x: (z.w - w) / 2, y: z.h * 0.28, w, h: rows * 34 })
  return insertElement(el)
}
export function insertChart (type) {
  const el = chartEl(type, centerBox(Math.min(S().w * 0.6, 560), Math.min(S().h * 0.62, 320)))
  return insertElement(el)
}
export function insertIcon (name) {
  return insertElement(iconEl(name, centerBox(72, 72)))
}
export function insertMedia (kind, bytes, mime) {
  const src = addMedia(bytes, mime)
  const box = kind === 'audio' ? centerBox(48, 48) : centerBox(S().w * 0.5, S().w * 0.5 * 9 / 16)
  return insertElement(mediaEl(kind, src, box))
}
export function insertSymbol (ch) {
  insertTextBox()
  setTimeout(() => document.execCommand('insertText', false, ch), 30)
}

const isTop = (s, id) => s.elements.some(e => e.id === id)
// The selected objects that sit on the slide itself: what Group and Ungroup work on
export const topSelected = () => (slide.value?.elements || []).filter(e => selection.value.includes(e.id))
// Selected ids reduced to those sharing a container (so group operations stay sane)
export function topSelection () {
  const s = slide.value
  if (!s) return []
  const ids = selection.value
  const tops = ids.filter(id => isTop(s, id))
  return tops.length ? tops : ids
}
export function deleteSelected () {
  const ids = selection.value
  if (!ids.length) return
  update(d => { removeEls(d.slides[curIdx()], ids) })
  select([])
}
export function duplicateSelected (offset = 12) {
  const s = slide.value
  const els = topSelection().map(id => findEl(s, id)?.el).filter(Boolean)
  if (!els.length) return
  // a copy of something inside a group lands on the slide itself, so it takes the group's offset and turn along
  const copies = els.map(e => { const c = cloneEl(e), o = onSlide(s, e); c.x = o.x + offset; c.y = o.y + offset; c.rot = o.rot; return c })
  updateSlide(sl => { sl.elements.push(...copies) })
  select(copies.map(c => c.id))
}
export function selectAll () {
  const s = slide.value
  if (s) select(s.elements.filter(e => !e.hidden).map(e => e.id))
}
// The selection with id added; the groups around it and the objects inside it leave (a drag would move them twice)
export function addToSelection (sel, id) {
  const s = slide.value, around = parentGroups(s, id).map(g => g.id)
  return [...sel.filter(x => !around.includes(x) && !parentGroups(s, x).some(g => g.id === id)), id]
}

// ---------------- clipboard ----------------
const clip = { at: 0, text: '', payload: null }
async function collectMedia (els) {
  const ids = new Set()
  const scan = e => {
    if (e.src) ids.add(e.src); if (e.poster) ids.add(e.poster); if (e.fill?.src) ids.add(e.fill.src); e.children?.forEach(scan)
    if (e.cells) for (const row of e.cells) for (const c of row) if (c?.fill?.src) ids.add(c.fill.src)
  }
  els.forEach(scan)
  const out = {}
  await Promise.all([...ids].map(async id => { const m = mediaInfo(id); if (m) out[id] = { mime: m.mime, b64: m.bytes.length < 30e6 ? await bytesToBase64(m.bytes).catch(() => null) : null } }))
  return out
}
const WIN = uid('w')
// A cut removes the objects at once: writing the clipboard takes a while, and the selection may change meanwhile
export async function copySelection (cut = false) {
  const s = slide.value
  const els = topSelection().map(id => findEl(s, id)?.el).filter(Boolean)
  if (!els.length) return false
  const flat = els.map(e => JSON.parse(JSON.stringify(onSlide(s, e)))) // group children as they show on the slide
  const media = collectMedia(els)
  if (cut) deleteSelected()
  await writeClipboard({ kind: 'elements', win: WIN, elements: flat, media: await media, slideId: s.id }, els.map(e => textOf(e.html || '')).filter(Boolean).join('\n'))
  return true
}
export async function copySlides (ids, cut = false) {
  const d = doc.value
  const slides = d.slides.filter(s => ids.includes(s.id))
  if (!slides.length) return
  const media = collectMedia(slides.flatMap(s => [...s.elements, ...(s.master || []), ...(s.bg ? [{ fill: s.bg }] : [])]))
  if (cut) deleteSlides(ids)
  await writeClipboard({ kind: 'slides', win: WIN, slides: JSON.parse(JSON.stringify(slides)), media: await media, size: d.size }, slides.map(s => s.elements.map(e => textOf(e.html || '')).join('\n')).join('\n\n'))
}
async function writeClipboard (payload, text) {
  clip.at = Date.now(); clip.text = text || ' '; clip.payload = payload
  try {
    const json = JSON.stringify(payload)
    await navigator.clipboard.write([new ClipboardItem({
      'text/plain': new Blob([clip.text], { type: 'text/plain' }),
      'web application/x-prizma': new Blob([json], { type: 'application/x-prizma' })
    })])
  } catch (e) {
    try { await navigator.clipboard.writeText(clip.text) } catch {}
  }
}
// Paste from the system clipboard (our own format first, then images, then text)
export async function pasteFromClipboard (dt) {
  let payload = null
  try {
    const items = await navigator.clipboard.read()
    for (const it of items) {
      if (it.types.includes('web application/x-prizma')) { payload = JSON.parse(await (await it.getType('web application/x-prizma')).text()); break }
    }
    if (!payload) {
      for (const it of items) {
        const img = it.types.find(t => t.startsWith('image/'))
        if (img) {
          const blob = await it.getType(img)
          const pic = await loadPicture(new Uint8Array(await blob.arrayBuffer()), img)
          if (!pic) { cantShowPicture(); return true }
          insertImageBytes(pic.bytes, pic.mime, pic.w, pic.h)
          return true
        }
      }
    }
  } catch (e) {
    if (clip.payload && Date.now() - clip.at < 36e5) payload = clip.payload
  }
  if (payload) return pastePayload(payload)
  let text = dt?.getData?.('text/plain')
  if (text === undefined) { try { text = await navigator.clipboard.readText() } catch { text = '' } }
  if (text && text.trim()) {
    const z = S()
    insertElement(textBox({ x: z.w * 0.1, y: z.h * 0.35, w: z.w * 0.8, h: 40 }, htmlFromText(text)))
    return true
  }
  return false
}
// The pasted pictures: kept when this window still has them, else made from the copy in the clipboard (this window
// may have closed or opened another file since the copy, which frees its media)
function remapMedia (payload, els) {
  const map = {}
  for (const [id, m] of Object.entries(payload.media || {})) {
    if (mediaInfo(id)) { map[id] = id; continue }
    if (!m.b64) continue
    const r = dataUrlToBytes(`data:${m.mime};base64,${m.b64}`)
    map[id] = addMedia(r.bytes, m.mime, id)
  }
  const fix = e => {
    if (e.src && map[e.src]) e.src = map[e.src]; if (e.fill?.src && map[e.fill.src]) e.fill.src = map[e.fill.src]; e.children?.forEach(fix)
    if (e.cells) for (const row of e.cells) for (const c of row) if (c?.fill?.src && map[c.fill.src]) c.fill.src = map[c.fill.src]
  }
  els.forEach(fix)
}
function pastePayload (payload) {
  if (payload.kind === 'elements') {
    const els = payload.elements.map(e => cloneEl(e))
    remapMedia(payload, els)
    const same = payload.slideId === slide.value?.id
    if (same) for (const e of els) { e.x += 14; e.y += 14 }
    updateSlide(s => { s.elements.push(...els) })
    select(els.map(e => e.id))
    return true
  }
  if (payload.kind === 'slides') {
    // a slide keeps its id when this deck doesn't have it (cut and paste, another deck), so links to it still work;
    // links between the pasted slides follow any id that had to change
    const have = new Set(doc.value.slides.map(s => s.id)), ids = new Map()
    const slides = payload.slides.map(s => { const c = JSON.parse(JSON.stringify(s)); if (have.has(c.id)) { ids.set(c.id, uid('s')); c.id = ids.get(s.id) } return c })
    mapSlideLinks(slides, t => ids.get(t) || t)
    if (payload.size) fitSlides(slides, payload.size, doc.value.size)
    remapMedia(payload, slides.flatMap(s => [...s.elements, ...(s.master || []), ...(s.bg ? [{ fill: s.bg }] : [])]))
    const i = curIdx()
    update(d => { d.slides.splice(i + 1, 0, ...slides) })
    goSlide(i + 1)
    return true
  }
  return false
}

// ---------------- grouping & arrangement ----------------
export function groupSelected () {
  const els = topSelected()
  if (els.length < 2) return
  const ids = els.map(e => e.id)
  const b = unionBounds(els)
  const g = { id: uid(), type: 'group', name: 'Group', x: b.x, y: b.y, w: b.w, h: b.h, rot: 0, children: els.map(e => ({ ...JSON.parse(JSON.stringify(e)), x: e.x - b.x, y: e.y - b.y })) }
  updateSlide(sl => {
    const firstIdx = Math.max(...ids.map(id => sl.elements.findIndex(e => e.id === id)))
    sl.elements.splice(firstIdx + 1, 0, g)
    sl.elements = sl.elements.filter(e => !ids.includes(e.id))
  })
  select([g.id])
}
export function ungroupSelected () {
  const s = slide.value
  const groups = topSelected().filter(e => e.type === 'group')
  if (!groups.length) return
  const newIds = []
  updateSlide(sl => {
    for (const g of groups) {
      const i = sl.elements.findIndex(e => e.id === g.id)
      const kids = g.children.map(c => JSON.parse(JSON.stringify(onSlide(s, c)))) // children are stored in the group's own frame
      newIds.push(...kids.map(k => k.id))
      sl.elements.splice(i, 1, ...kids)
    }
    // an animation of a group that is gone would point at nothing
    sl.animations = (sl.animations || []).filter(a => !groups.some(g => g.id === a.el))
  })
  select(newIds)
}
export function arrange (op) {
  const ids = topSelection()
  if (!ids.length) return
  updateSlide(s => {
    // the list the selection lives in: the slide, or the group a selected child belongs to
    const hit = findEl(s, ids[0]), owner = hit?.parent || s, key = hit?.parent ? 'children' : 'elements'
    const list = owner[key]
    const sel = list.filter(e => ids.includes(e.id))
    const rest = list.filter(e => !ids.includes(e.id))
    let out = list
    if (op === 'front') out = [...rest, ...sel]
    else if (op === 'back') out = [...sel, ...rest]
    else if (op === 'forward' || op === 'backward') {
      out = [...list]
      const order = op === 'forward' ? [...out.keys()].reverse() : [...out.keys()]
      for (const i of order) {
        if (!ids.includes(out[i].id)) continue
        const j = op === 'forward' ? i + 1 : i - 1
        if (j < 0 || j >= out.length || ids.includes(out[j].id)) continue
        ;[out[i], out[j]] = [out[j], out[i]]
      }
    }
    if (out.some((e, i) => e !== list[i])) owner[key] = out // already in place: no undo step
  })
}
// An element's box on the slide (children of a group are stored in the group's frame)
const slideBox = (s, e) => bounds(onSlide(s, e))
// A move on the slide, turned into the frame of the group the element sits in (arrow keys, align, distribute)
export const localMove = (s, id, dx, dy) => rotatePt({ x: dx, y: dy }, { x: 0, y: 0 }, -parentFrame(s, id).rot)
export function align (op) {
  const s = slide.value
  const els = selection.value.map(id => findEl(s, id)?.el).filter(Boolean)
  if (!els.length) return
  const boxes = new Map(els.map(e => [e.id, slideBox(s, e)]))
  const ref = els.length === 1 ? { x: 0, y: 0, w: S().w, h: S().h } : unionBounds([...boxes.values()])
  updateEls(els.map(e => e.id), e => {
    const b = boxes.get(e.id)
    const dx = op === 'left' ? ref.x - b.x : op === 'center' ? ref.x + ref.w / 2 - (b.x + b.w / 2) : op === 'right' ? ref.x + ref.w - (b.x + b.w) : 0
    const dy = op === 'top' ? ref.y - b.y : op === 'middle' ? ref.y + ref.h / 2 - (b.y + b.h / 2) : op === 'bottom' ? ref.y + ref.h - (b.y + b.h) : 0
    const m = localMove(s, e.id, dx, dy)
    e.x += m.x; e.y += m.y
  })
}
export function distribute (axis) {
  const s = slide.value
  const els = selection.value.map(id => findEl(s, id)?.el).filter(Boolean)
  if (els.length < 3) { toast('Select three or more objects to distribute them.'); return }
  const bs = els.map(e => ({ id: e.id, b: slideBox(s, e) })).sort((a, b) => axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y)
  const first = bs[0].b, last = bs[bs.length - 1].b
  const total = bs.reduce((a, x) => a + (axis === 'h' ? x.b.w : x.b.h), 0)
  const span = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y
  const gap = (span - total) / (bs.length - 1)
  let pos = axis === 'h' ? first.x : first.y
  const target = {}
  for (const x of bs) { target[x.id] = pos - (axis === 'h' ? x.b.x : x.b.y); pos += (axis === 'h' ? x.b.w : x.b.h) + gap }
  updateEls(Object.keys(target), e => { const m = localMove(s, e.id, axis === 'h' ? target[e.id] : 0, axis === 'h' ? 0 : target[e.id]); e.x += m.x; e.y += m.y })
}
export function rotateSelected (deg) { updateEls(selection.value, e => { e.rot = (((e.rot || 0) + deg) % 360 + 360) % 360 }) }
// A mirror image turns the other way, so a rotated object's angle is negated. A group mirrors its children inside its
// box (the group itself carries no flip, which the slide wouldn't show but PowerPoint would).
function flipEl (e, axis) {
  if (e.rot) e.rot = 360 - e.rot
  if (e.type !== 'group') { if (axis === 'h') e.flipH = !e.flipH; else e.flipV = !e.flipV; return }
  for (const c of e.children) { if (axis === 'h') c.x = e.w - c.x - c.w; else c.y = e.h - c.y - c.h; flipEl(c, axis) }
}
export function flipSelected (axis) { updateEls(selection.value, e => flipEl(e, axis)) }
// A position typed on the slide (the box's top-left before its turn); a group's child gets there through its groups
export function setPosition (id, p) {
  const s = slide.value, el = findEl(s, id)?.el
  if (!el) return
  const at = onSlide(s, el), c = parentFrame(s, id).fromSlide({ x: (p.x ?? at.x) + el.w / 2, y: (p.y ?? at.y) + el.h / 2 })
  setGeometry(id, { x: c.x - el.w / 2, y: c.y - el.h / 2 })
}
export function setGeometry (id, g, opts) {
  updateEls([id], e => {
    if (g.w !== undefined || g.h !== undefined) resizeEl(e, g.w ?? e.w, g.h ?? e.h)
    Object.assign(e, g)
  }, opts)
}
// A size typed in the Size boxes. One object keeps its aspect when locked; several scale together, as one undo step.
// A side of length 0 (a straight line's height) can't be scaled: it takes the typed value.
export function setSize (ids, k, v) {
  const s = slide.value, els = ids.map(id => findEl(s, id)?.el).filter(Boolean)
  if (!els.length || !v) return
  const o = k === 'w' ? 'h' : 'w', b = els.length === 1 ? els[0] : unionBounds(els)
  updateEls(els.map(e => e.id), e => {
    const n = { [k]: els.length === 1 || !b[k] ? v : e[k] * v / b[k] }
    if (els.length === 1 && (e.lockAspect || e.type === 'image') && e[k] && e[o]) n[o] = e[o] * v / e[k]
    resizeEl(e, n.w ?? e.w, n.h ?? e.h)
  })
}
// A new size for an element, with its content following: a group's children, a table's columns and rows, and an
// imported outline (kept rather than swapped for the preset shape). Dragging, the Size boxes and Shift+arrows use it.
export function resizeEl (e, w, h) {
  if (e.type === 'group') scaleGroupChildren(e, w, h)
  if (e.type === 'table') { const sx = w / (e.w || 1), sy = h / (e.h || 1); e.cols = e.cols.map(v => v * sx); e.rows = e.rows.map(v => v * sy) }
  if (e.path && e.pathVB) e.pathLocked = true
  e.w = w; e.h = h
}
export function scaleGroupChildren (g, w, h) {
  const sx = w / (g.w || 1), sy = h / (g.h || 1)
  const rec = (list, sx, sy) => list.forEach(c => {
    c.x *= sx; c.y *= sy; c.w *= sx; c.h *= sy
    if (c.path && c.pathVB) c.pathLocked = true
    if (c.type === 'table') { c.cols = c.cols.map(v => v * sx); c.rows = c.rows.map(v => v * sy) }
    if (c.children) rec(c.children, sx, sy)
  })
  rec(g.children, sx, sy)
}
export function setProps (patch, ids = selection.value, opts) {
  updateEls(ids, e => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete e[k]
      else e[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? JSON.parse(JSON.stringify(v)) : v
    }
  }, opts)
}
export function setFill (fill, ids = selection.value) {
  updateEls(ids, e => {
    if (e.type === 'table') { for (const row of e.cells) for (const c of row) c.fill = fill ? { ...fill } : null; return }
    if (e.type === 'icon') { e.color = fill?.color || e.color; return }
    if (e.type === 'chart' || e.type === 'image' || e.type === 'line') return
    e.fill = fill ? JSON.parse(JSON.stringify(fill)) : null
    if (e.children) for (const c of e.children) if (c.type === 'shape' || c.type === 'text') c.fill = fill ? JSON.parse(JSON.stringify(fill)) : null
  })
}
export function setLine (patch, ids = selection.value) {
  updateEls(ids, e => {
    const apply = x => {
      if (patch === null) { x.line = null; return }
      x.line = { color: x.line?.color || 'dk1', width: x.line?.width || 1, dash: x.line?.dash || 'solid', ...(x.line || {}), ...patch }
    }
    if (e.type === 'group') e.children.forEach(apply); else if (e.type === 'icon') { if (patch?.color) e.color = patch.color; if (patch?.width) e.stroke = patch.width } else apply(e)
  })
}
export function changeShape (shape) {
  updateEls(selection.value, e => {
    if (e.type === 'shape' || e.type === 'text') { e.type = 'shape'; e.shape = shape; delete e.path; delete e.pathVB; e.adj = {} }
    if (e.type === 'image') e.geom = shape
  })
}
export function setLink (link, ids = selection.value) { setProps({ link: link || undefined }, ids) }

// ---------------- text formatting ----------------
// Applies to the live text selection when editing, otherwise to every text run of the selected elements.
const TEXTY = new Set(['text', 'shape', 'table'])
export function textTargets () {
  return selected.value.filter(e => TEXTY.has(e.type) || e.type === 'group')
}
function mapHtml (fn, ids) {
  const s = slide.value
  const els = (ids || selection.value).map(id => findEl(s, id)?.el).filter(Boolean)
  updateEls(els.map(e => e.id), e => {
    const rec = x => {
      if (x.type === 'table') { for (const row of x.cells) for (const c of row) c.html = fn(c.html || '<p><br></p>', x) }
      else if (x.type === 'group') x.children.forEach(rec)
      else if (x.type === 'text' || x.type === 'shape') x.html = fn(x.html || '<p><br></p>', x)
    }
    rec(e)
  })
}
export function textRunAll (key, value) {
  // swatches give model colours ('accent2', 'accent2:40'); text wants CSS, as the live editor writes it
  const v = (key === 'color' || key === 'highlight') && value ? cssColor(value) : value
  mapHtml(h => setRunStyleAll(h, key, v))
}
export function textParaAll (prop, value) { mapHtml(h => setParaStyleAll(h, prop, value)) }
export function textBulletsAll (kind, opts) { mapHtml(h => setBulletsAll(h, kind, opts)) }
export function textLevelAll (delta) { mapHtml(h => changeLevelAll(h, delta)) }
export function setTs (patch) { updateEls(selection.value, e => { e.ts = { ...(e.ts || {}), ...patch }; if (e.children) e.children.forEach(c => { c.ts = { ...(c.ts || {}), ...patch } }) }) }

// ---------------- tables ----------------
export function tableOp (op) {
  const s = slide.value
  const id = editCell.value?.id || selection.value[0]
  const t = findEl(s, id)?.el
  if (!t || t.type !== 'table') return
  const r = editCell.value?.r ?? 0, c = editCell.value?.c ?? 0
  const blank = () => ({ html: '<p><br></p>' })
  // merged cells: a new row or column through a merge widens it; deleting the merge's first row or column hands
  // the merge (text and all) to the next cell
  const merges = e => e.cells.flatMap((row, rr) => row.flatMap((x, cc) => x && !x.merged && (x.colspan > 1 || x.rowspan > 1) ? [{ x, r0: rr, c0: cc, cs: x.colspan || 1, rs: x.rowspan || 1 }] : []))
  const handOn = (x, to, k, n) => { const m = JSON.parse(JSON.stringify(x)); m[k] = n; delete m.merged; return Object.assign(to, m, { merged: false }) }
  updateEls([id], e => {
    const m = merges(e)
    if (op === 'rowAbove' || op === 'rowBelow') {
      const at = op === 'rowAbove' ? r : r + 1
      e.cells.splice(at, 0, e.cols.map(blank)); e.rows.splice(at, 0, e.rows[r] || 30); e.h = e.rows.reduce((a, b) => a + b, 0)
      for (const { x, r0, c0, cs, rs } of m) if (r0 < at && at < r0 + rs) { x.rowspan = rs + 1; for (let cc = c0; cc < c0 + cs; cc++) e.cells[at][cc].merged = true }
    } else if (op === 'colLeft' || op === 'colRight') {
      const at = op === 'colLeft' ? c : c + 1
      const w = e.cols[c] || 100
      for (const row of e.cells) row.splice(at, 0, blank())
      e.cols.splice(at, 0, w)
      const k = e.w / (e.w + w); e.cols = e.cols.map(v => v * k)
      for (const { x, r0, c0, cs, rs } of m) if (c0 < at && at < c0 + cs) { x.colspan = cs + 1; for (let rr = r0; rr < r0 + rs; rr++) e.cells[rr][at].merged = true }
    } else if (op === 'delRow' && e.rows.length > 1) {
      for (const { x, r0, c0, rs } of m) { if (r0 === r && rs > 1) handOn(x, e.cells[r + 1][c0], 'rowspan', rs - 1); else if (r0 < r && r < r0 + rs) x.rowspan = rs - 1 }
      e.cells.splice(r, 1); const h = e.rows.splice(r, 1)[0]; e.h -= h
    } else if (op === 'delCol' && e.cols.length > 1) {
      for (const { x, r0, c0, cs } of m) { if (c0 === c && cs > 1) handOn(x, e.cells[r0][c + 1], 'colspan', cs - 1); else if (c0 < c && c < c0 + cs) x.colspan = cs - 1 }
      for (const row of e.cells) row.splice(c, 1)
      e.cols.splice(c, 1)
      const tot = e.cols.reduce((a, b) => a + b, 0); e.cols = e.cols.map(v => v * e.w / tot)
    } else if (op === 'distRows') {
      const avg = e.rows.reduce((a, b) => a + b, 0) / e.rows.length; e.rows = e.rows.map(() => avg)
    } else if (op === 'distCols') {
      const avg = e.w / e.cols.length; e.cols = e.cols.map(() => avg)
    }
  })
  if (op === 'delTable') { select([id]); deleteSelected() }
}
export function setTableStyle (patch) {
  updateEls(selection.value.length ? selection.value : [editCell.value?.id].filter(Boolean), e => { if (e.type === 'table') e.style = { ...(e.style || {}), ...patch } })
}

// ---------------- notes, comments, find ----------------
export function setNotes (text) { updateSlide(s => { s.notes = text }, { coalesce: 'notes:' + slide.value?.id }) }
export function addComment (text) {
  const author = settings.value.author || appInfo.value.userName || 'Me'
  updateSlide(s => { s.comments = [...(s.comments || []), { id: uid('c'), author, text, time: Date.now(), el: selection.value[0] || null }] })
}
export function deleteComment (id) { updateSlide(s => { s.comments = (s.comments || []).filter(c => c.id !== id) }) }
export function replaceAll (find, repl, opts) {
  let count = 0
  update(d => {
    for (const s of d.slides) {
      walk(s.elements, e => {
        if (e.html) { const r = replaceText(e.html, find, repl, opts); if (r.count) { e.html = r.html; count += r.count } }
        if (e.type === 'table') for (const row of e.cells) for (const c of row) { const r = replaceText(c.html || '', find, repl, opts); if (r.count) { c.html = r.html; count += r.count } }
      })
    }
  })
  return count
}
// Search hits, one per occurrence: [{ slide, id, r, c, k }] (k: which match inside that text)
export function findAll (query, opts = {}) {
  const hits = []
  if (!query) return hits
  const re = searchRe(query, opts)
  const count = t => (t.match(re) || []).length
  doc.value.slides.forEach((s, si) => {
    walk(s.elements, e => {
      const n = e.html ? count(textOf(e.html)) : 0
      for (let k = 0; k < n; k++) hits.push({ slide: si, id: e.id, k })
      if (e.type === 'table') e.cells.forEach((row, r) => row.forEach((c, ci) => { const m = count(textOf(c?.html || '')); for (let k = 0; k < m; k++) hits.push({ slide: si, id: e.id, r, c: ci, k }) }))
    })
    if (opts.notes && count(s.notes || '')) hits.push({ slide: si, notes: true })
  })
  return hits
}

// ---------------- transitions & animations ----------------
export function setTransition (patch, all = false) {
  update(d => {
    d.slides.forEach((s, i) => {
      if (!all && i !== curIdx() && !(slideSel.value.length > 1 && slideSel.value.includes(s.id))) return
      if (patch === null) { s.transition = null; return }
      s.transition = { type: 'fade', dur: 0.8, ...(s.transition || {}), ...patch }
      if (s.transition.type === 'none') s.transition = null
    })
  })
}
export function addAnimation (effect, kind, replace = true) {
  const ids = topSelection()
  if (!ids.length) { toast('Select an object to animate first.'); return }
  updateSlide(s => {
    s.animations = s.animations || []
    for (const id of ids) {
      const existing = s.animations.findIndex(a => a.el === id)
      const a = { id: uid('a'), el: id, kind, effect, start: 'click', dur: kind === 'emph' ? 1 : 0.6, delay: 0, dir: defaultDir(effect) }
      if (replace && existing >= 0) s.animations[existing] = { ...s.animations[existing], kind, effect, dir: a.dir }
      else s.animations.push(a)
    }
  })
}
const defaultDir = e => (e === 'flyIn' || e === 'flyOut' || e === 'wipe' || e === 'floatIn') ? 'bottom' : undefined
export function updateAnimation (id, patch) { updateSlide(s => { const a = s.animations.find(x => x.id === id); if (a) Object.assign(a, patch) }) }
export function removeAnimation (id) { updateSlide(s => { s.animations = s.animations.filter(a => a.id !== id) }) }
export function removeAnimationsOfSelection () { const ids = selection.value; updateSlide(s => { s.animations = (s.animations || []).filter(a => !ids.includes(a.el)) }) }
export function moveAnimation (id, delta) {
  updateSlide(s => {
    const i = s.animations.findIndex(a => a.id === id), j = i + delta
    if (i < 0 || j < 0 || j >= s.animations.length) return
    const arr = s.animations; [arr[i], arr[j]] = [arr[j], arr[i]]
  })
}

// ---------------- format painter ----------------
export function pickFormat () {
  const e = selected.value[0]
  if (!e) return
  painter.value = { fill: e.fill, line: e.line, shadow: e.shadow, ts: e.ts, run: e.html ? richState(e.html, e.ts || {}) : null, type: e.type }
}
export function applyFormat (id) {
  const p = painter.value
  if (!p) return
  updateEls([id], e => {
    if (p.fill !== undefined && e.type !== 'image' && e.type !== 'line') e.fill = p.fill ? JSON.parse(JSON.stringify(p.fill)) : null
    if (p.line !== undefined) e.line = p.line ? JSON.parse(JSON.stringify(p.line)) : null
    if (p.shadow !== undefined) e.shadow = p.shadow ? { ...p.shadow } : undefined
    if (p.ts) e.ts = { ...(e.ts || {}), ...p.ts }
    if (p.run && e.html) {
      let h = e.html
      if (p.run.font) h = setRunStyleAll(h, 'font', p.run.font)
      if (p.run.size) h = setRunStyleAll(h, 'size', p.run.size)
      if (p.run.color) h = setRunStyleAll(h, 'color', p.run.color.startsWith('#') ? p.run.color : `var(--c-${p.run.color.split(':')[0]})`)
      h = setRunStyleAll(h, 'bold', !!p.run.bold)
      h = setRunStyleAll(h, 'italic', !!p.run.italic)
      e.html = h
    }
  })
  painter.value = null
}

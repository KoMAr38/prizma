// Application state (Preact signals) with immer-based undo/redo.
import { signal, computed, batch } from '@preact/signals'
import { produce } from 'immer'
import { findEl, parentGroups, refitGroup } from './model.js'

// Big files cross from the main process a few MB at a time. As one piece the preload bridge copies a file twice,
// which held the window still for about 4 seconds when a 280 MB deck was read.
export const PIECE = 4 << 20
const bridge = window.prizmaNative || null
async function readInPieces (p) {
  const { id, size } = await bridge.openRead(p)
  try {
    const out = new Uint8Array(size)
    let at = 0
    while (at < size) {
      const b = await bridge.readPiece(id, PIECE)
      if (!b.length) break // the file got shorter while it was read
      out.set(b, at)
      at += b.length
    }
    return at < size ? out.slice(0, at) : out
  } finally {
    bridge.closeFile(id).catch(() => {})
  }
}
export const native = bridge && { ...bridge, readFile: readInPieces }

// ---------- document & history ----------
export const doc = signal(null)
export const dirty = signal(false)
export const file = signal({ path: null, name: 'Presentation1', format: null })
export const docVersion = signal(0)
const undoStack = []
const redoStack = []
export const canUndo = signal(false)
export const canRedo = signal(false)
let lastKey = null
let lastTime = 0
let lastSlide = -1
const MAX_UNDO = 300

// ---------- editor UI state ----------
export const slideIdx = signal(0)
export const selection = signal([]) // element ids on the current slide (may include group children)
export const editing = signal(null) // id of the element whose text is being edited
export const editCell = signal(null) // { id, r, c } for table cell editing
export const slideSel = signal([]) // multi-selected slide ids in the thumbnail pane
export const tool = signal(null) // { kind: 'shape'|'line'|'text'|'pen'|'highlighter'|'eraser', ... }
export const live = signal(null) // transient geometry overrides while dragging: { [id]: {x,y,w,h,rot} }
export const guides = signal([]) // smart guides while dragging
export const zoom = signal(0) // 0 = fit
export const fitZoom = signal(1)
export const view = signal('normal') // normal | sorter | outline
export const ribbonTab = signal('home')
export const ribbonCollapsed = signal(false)
export const backstage = signal(null) // null | 'home' | 'new' | 'open' | 'info' | 'save' | 'export' | 'print' | 'options' | 'about'
export const pane = signal(null) // right pane: null | 'format' | 'anim' | 'comments' | 'selection'
export const formatTab = signal('fill')
export const showNotes = signal(true)
export const showRuler = signal(false)
export const showGrid = signal(false)
export const showGuides = signal(false)
export const snapGrid = signal(false)
export const grayscale = signal(false)
export const dialog = signal(null) // { type, ...props }
export const menu = signal(null) // context menu { x, y, items }
export const toasts = signal([])
export const settings = signal({ theme: 'dark', author: '', autosaveMinutes: 2, defaultFormat: 'pptx', presenterView: true })
export const appInfo = signal({ platform: 'win32', version: '1.0.0', recent: [], hasLibreOffice: false, userName: '' })
export const fonts = signal([])
export const lastColors = signal({ font: '#E4572E', fill: 'accent1', line: 'dk1', highlight: '#FFFF00' })
export const recentColors = signal([])
export const painter = signal(null) // format painter payload
export const findState = signal({ query: '', replace: '', matchCase: false })
export const busy = signal(null) // { label }
export const recovery = signal([])
export const fmtTick = signal(0) // bumps when the text selection changes (ribbon state refresh)
export const focusArea = signal('canvas') // canvas | thumbs | notes | pane
export const cropMode = signal(null) // id of the picture being cropped
export const editorReq = signal(null) // how to place the caret when a text editor opens: { x, y } | { mode: 'end' | 'all' }
export const stageZoom = signal(1) // effective zoom of the editing canvas (1 = 100 %)
export const searchOpen = signal(false)
export const showing = signal(false) // a slide show window is open
export const mediaPlaying = signal(null) // id of the video/audio previewed on the canvas

export const slide = computed(() => doc.value?.slides[Math.min(slideIdx.value, (doc.value?.slides.length || 1) - 1)] || null)
export const theme = computed(() => doc.value?.theme)
export const selected = computed(() => {
  const s = slide.value
  if (!s) return []
  return selection.value.map(id => findEl(s, id)?.el).filter(Boolean)
})

// ---------- media ----------
const mediaMap = new Map() // id -> { mime, bytes, url, w, h }
export const mediaTick = signal(0)
export function addMedia (bytes, mime, id) {
  id = id || 'm' + Math.random().toString(36).slice(2, 10)
  if (mediaMap.has(id)) { URL.revokeObjectURL(mediaMap.get(id).url); dropSmall(id) }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }))
  mediaMap.set(id, { mime, bytes, url })
  mediaTick.value++
  return id
}
// Thumbnails draw photos from an 800 px copy. A phone photo shown 200 px wide otherwise costs a full decode
// (0.2-0.4 s on a slow CPU) each time it scrolls into view, which makes the slide list stutter without a graphics card.
const small = new Map() // id -> signal(url of the copy, or null while it is being made)
let smallQueue = Promise.resolve()
export function smallUrl (id) {
  const m = id && mediaMap.get(id)
  if (!m || m.bytes.length < 200000 || !/^image\/(jpeg|png|bmp|webp)$/.test(m.mime)) return mediaUrl(id)
  let s = small.get(id)
  if (!s) {
    small.set(id, s = signal(null))
    smallQueue = smallQueue.then(() => smallCopy(m)).catch(() => m.url).then(url => {
      if (small.get(id) === s) s.value = url; else if (url !== m.url) URL.revokeObjectURL(url)
    })
  }
  return s.value
}
async function smallCopy (m) {
  const bmp = await createImageBitmap(new Blob([m.bytes], { type: m.mime }))
  const k = 800 / Math.max(bmp.width, bmp.height)
  if (k >= 1) { bmp.close(); return m.url }
  const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k))
  const g = c.getContext('2d')
  g.imageSmoothingQuality = 'high'
  g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close()
  return URL.createObjectURL(await c.convertToBlob(m.mime === 'image/jpeg' ? { type: 'image/jpeg', quality: 0.85 } : { type: 'image/png' }))
}
function dropSmall (id) {
  const u = small.get(id)?.value
  if (u && u !== mediaMap.get(id)?.url) URL.revokeObjectURL(u)
  small.delete(id)
}
// Reuse media objects owned by another window (slide show / print windows share the editor's blobs)
export function adoptMedia (entries) {
  for (const [id, m] of entries) mediaMap.set(id, { mime: m.mime, bytes: m.bytes, url: m.url })
  mediaTick.value++
}
export const mediaUrl = id => (id && mediaMap.get(id)?.url) || ''
export const mediaInfo = id => mediaMap.get(id)
export const allMedia = () => mediaMap
export function clearMedia () {
  for (const [id, m] of mediaMap) { dropSmall(id); URL.revokeObjectURL(m.url) }
  mediaMap.clear()
}
// Frees the media the open document no longer uses, once another file has replaced it
export function keepMedia (ids) {
  for (const [id, m] of mediaMap) if (!ids.has(id)) { dropSmall(id); URL.revokeObjectURL(m.url); mediaMap.delete(id) }
}
export function dataUrlToBytes (dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || '')
  if (!m) return null
  const mime = m[1] || 'application/octet-stream'
  if (m[2]) {
    const bin = atob(m[3])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes, mime }
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), mime }
}
// FileReader encodes off the main thread: btoa on a big picture held the window still for seconds
export const bytesToBase64 = bytes => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result.slice(r.result.indexOf(',') + 1))
  r.onerror = () => reject(r.error)
  r.readAsDataURL(new Blob([bytes]))
})

// ---------- mutations ----------
export function update (recipe, opts = {}) {
  const prev = doc.value
  if (!prev) return
  const next = produce(prev, recipe)
  if (next === prev) return
  const now = Date.now()
  // quick repeats merge into one undo step, but only on the same slide (duplicated slides share element ids)
  const coalesce = opts.merge || (opts.coalesce && opts.coalesce === lastKey && now - lastTime < (opts.window || 1200) && slideIdx.value === lastSlide)
  if (!coalesce || !undoStack.length) {
    undoStack.push({ doc: prev, slideIdx: slideIdx.value, selection: selection.value })
    if (undoStack.length > MAX_UNDO) undoStack.shift()
  }
  if (!opts.merge) { lastKey = opts.coalesce || null; lastTime = now; lastSlide = slideIdx.value }
  redoStack.length = 0
  batch(() => {
    doc.value = next
    dirty.value = true
    canUndo.value = undoStack.length > 0
    canRedo.value = false
    docVersion.value++
  })
}
// Replace the document without history (open/new)
export function loadDoc (d, f = {}) {
  undoStack.length = 0; redoStack.length = 0; lastKey = null
  batch(() => {
    doc.value = d
    file.value = { path: f.path || null, name: f.name || 'Presentation1', format: f.format || null }
    dirty.value = false
    slideIdx.value = 0
    selection.value = []
    editing.value = null
    editCell.value = null
    slideSel.value = []
    canUndo.value = false
    canRedo.value = false
    zoom.value = 0
    view.value = 'normal'
    docVersion.value++
  })
}
export function undo () {
  if (!undoStack.length) return
  const s = undoStack.pop()
  redoStack.push({ doc: doc.value, slideIdx: slideIdx.value, selection: selection.value })
  lastKey = null
  batch(() => {
    editing.value = null; editCell.value = null; cropMode.value = null
    doc.value = s.doc
    slideIdx.value = Math.min(s.slideIdx, s.doc.slides.length - 1)
    selection.value = s.selection
    slideSel.value = [] // the slide list's selection may name slides the undo removed
    dirty.value = true
    canUndo.value = undoStack.length > 0
    canRedo.value = true
    docVersion.value++
  })
}
export function redo () {
  if (!redoStack.length) return
  const s = redoStack.pop()
  undoStack.push({ doc: doc.value, slideIdx: slideIdx.value, selection: selection.value })
  lastKey = null
  batch(() => {
    editing.value = null; editCell.value = null; cropMode.value = null
    doc.value = s.doc
    slideIdx.value = Math.min(s.slideIdx, s.doc.slides.length - 1)
    selection.value = s.selection
    slideSel.value = []
    dirty.value = true
    canUndo.value = true
    canRedo.value = redoStack.length > 0
    docVersion.value++
  })
}

// The text editor registers how to finish an edit (normalise html, drop empty text boxes)
let editHooks = { finish: null }
export const setEditHooks = h => { editHooks = h }
export function finishEditing () {
  if (editing.value && editHooks.finish) editHooks.finish()
  if (editCell.value && editHooks.finishCell) editHooks.finishCell()
  batch(() => { editing.value = null; editCell.value = null })
}

// Run a recipe against the current slide's element `id` (searching groups)
export function updateEl (id, fn, opts) { updateEls([id], fn, opts) }
export function updateEls (ids, fn, opts) {
  const i = slideIdx.value
  update(d => {
    const s = d.slides[i]
    for (const id of ids) { const hit = findEl(s, id); if (hit) fn(hit.el, s, d) }
    for (const id of ids) for (const g of parentGroups(s, id)) refitGroup(g) // a moved child changes its group's box
  }, opts)
}
export function setSetting (patch) {
  settings.value = { ...settings.value, ...patch }
  native?.setSettings(patch)
}
export function updateSlide (fn, opts, idx = slideIdx.value) {
  update(d => { if (d.slides[idx]) fn(d.slides[idx], d) }, opts)
}
export function select (ids) {
  if ((editing.value && !ids.includes(editing.value)) || editCell.value) finishEditing()
  batch(() => { selection.value = ids; cropMode.value = null })
}
export function goSlide (i) {
  const n = doc.value?.slides.length || 0
  if (!n) return
  // a ribbon or pane field commits on blur: let it write to the slide it was typed for before the slide changes
  const a = document.activeElement
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.closest('.ribbon, .pane, .notes')) a.blur()
  i = Math.max(0, Math.min(n - 1, i))
  if (editing.value || editCell.value) finishEditing()
  batch(() => { slideIdx.value = i; selection.value = []; cropMode.value = null; slideSel.value = [doc.value.slides[i].id] })
}

// ---------- notifications ----------
let toastId = 0
export function toast (text, opts = {}) {
  const id = ++toastId
  toasts.value = [...toasts.value, { id, text, kind: opts.kind || 'info', action: opts.action }]
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, opts.ms || (opts.kind === 'error' ? 7000 : 3200))
}
export const openDialog = (type, props = {}) => { dialog.value = { type, ...props } }
export const closeDialog = () => { dialog.value = null }
export function confirmDialog (opts) {
  return new Promise(resolve => openDialog('confirm', { ...opts, resolve }))
}

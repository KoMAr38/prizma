// Document lifecycle: new, open, save, save as, autosave, recovery, closing.
import { effect } from '@preact/signals'
import {
  doc, file, dirty, loadDoc, native, settings, appInfo, toast, busy, backstage, recovery, clearMedia, keepMedia, confirmDialog, openDialog, finishEditing, docVersion, PIECE
} from '../core/store.js'
import { newDocument } from '../core/themes.js'
import { SLIDE_SIZES } from '../core/model.js'
import { isEmptyHtml } from '../core/html.js'

const lazy = {
  pptx: () => import('../io/importPptx.js'),
  native: () => import('../io/nativeFormat.js'),
  export: () => import('../io/exportPptx.js'),
  pdf: () => import('../io/importPdf.js')
}
export const extOf = p => (String(p).match(/\.([^.\\/]+)$/)?.[1] || '').toLowerCase()
export const baseName = p => String(p).split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
const PPTX_LIKE = ['pptx', 'pptm', 'ppsx', 'ppsm', 'potx', 'potm']
const LEGACY = ['ppt', 'pps', 'pot', 'odp', 'otp', 'key']
export const OPEN_EXT = [...PPTX_LIKE, 'prizma', ...LEGACY, 'pdf']

let untitled = 1
export function isPristine () {
  const d = doc.value
  if (!d) return true
  if (file.value.path || dirty.value) return false
  return d.slides.length === 1 && d.slides[0].elements.every(e => e.ph && isEmptyHtml(e.html))
}
export function newDocIn (themeId = 'aurora', variant = 0, size) {
  clearMedia()
  const z = size || SLIDE_SIZES.find(x => x.id === settings.value.newSize) || SLIDE_SIZES[0]
  const d = newDocument(themeId, variant, { w: z.w, h: z.h })
  loadDoc(d, { name: 'Presentation' + untitled++ })
  native?.setFile(null)
  native?.setIdle(false)
  return d
}
// New presentation: reuse this window when it is still empty, otherwise open another window
export function newPresentation (themeId, variant) {
  backstage.value = null
  if (isPristine() || !native) { newDocIn(themeId, variant); return }
  // this window already holds work: the new presentation gets its own window
  native.newWindow(themeId ? `:new:${themeId}:${variant || 0}` : null)
}

export async function chooseAndOpen () {
  const paths = await native.openDialog({ title: 'Open presentation' })
  if (paths && paths[0]) return openPath(paths[0])
}

export async function openPath (p, opts = {}) {
  // a file that is already open in a window is brought forward, never opened twice
  if (!opts.here && await native.focusFile(p)) { backstage.value = null; return }
  if (!opts.here && !isPristine()) { native.newWindow(p); backstage.value = null; return }
  const ext = extOf(p)
  const name = baseName(p)
  busy.value = { label: `Opening ${name}` }
  try {
    let d, keepPath = false, format = ext
    // the open deck keeps its media until the new file has loaded: a file that fails to open must not cost it its pictures
    const bytes = PPTX_LIKE.includes(ext) ? await native.readFile(p) : null
    const oldBinary = bytes && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0 // an old .ppt saved under a new name
    if (bytes && !oldBinary) {
      d = await (await lazy.pptx()).importPptx(bytes, label => { busy.value = { label: `${label}…` } })
      keepPath = ext === 'pptx' || ext === 'ppsx'
      format = ext === 'ppsx' ? 'ppsx' : 'pptx'
    } else if (ext === 'prizma') {
      d = await (await lazy.native()).readNative(await native.readFile(p))
      keepPath = true
    } else if (LEGACY.includes(ext) || oldBinary) {
      busy.value = { label: `Converting ${name} with LibreOffice…` }
      const r = await native.convert(p)
      if (!r.ok) {
        busy.value = null
        openDialog('message', {
          title: 'This format needs LibreOffice',
          text: r.error === 'notfound'
            ? `${name}.${ext} is an older or non-PowerPoint format. Prizma converts it with the free LibreOffice suite, which isn't installed on this PC. Install LibreOffice from libreoffice.org, then open the file again.`
            : `LibreOffice couldn't convert ${name}.${ext}. The file may be damaged or protected.`,
          link: r.error === 'notfound' ? { label: 'Get LibreOffice', url: 'https://www.libreoffice.org/download/' } : null
        })
        return false
      }
      d = await (await lazy.pptx()).importPptx(r.data)
      format = 'pptx'
    } else if (ext === 'pdf') {
      d = await (await lazy.pdf()).importPdf(await native.readFile(p), label => { busy.value = { label } })
      format = 'pptx'
    } else {
      throw new Error(`Prizma can't open .${ext} files.`)
    }
    finishEditing()
    loadDoc(d, { path: keepPath ? p : null, name, format })
    keepMedia((await lazy.native()).usedMedia(d))
    native.setFile(keepPath ? p : null)
    if (!keepPath) native.recent('add', p).then(r => { appInfo.value = { ...appInfo.value, recent: r } })
    else native.recent('list').then(r => { appInfo.value = { ...appInfo.value, recent: r } })
    backstage.value = null
    if (/^pps/.test(ext) && opts.fromShell) setTimeout(() => import('../show/launch.js').then(m => m.startShow(Math.max(0, doc.value.slides.findIndex(s => !s.hidden)))), 300)
    return true
  } catch (e) {
    // a reader's own error (zip, XML, JSON, PDF) means nothing to the user; Prizma's own messages are kept
    const damaged = e instanceof TypeError || e instanceof SyntaxError || /zip|central directory|end of data|pdf/i.test(e.message || '')
    if (/ENOENT/.test(e.message)) toast(`Couldn't find ${name}.${ext}. It was moved, renamed or deleted.`, { kind: 'error' })
    else { console.error(e); toast(`Couldn't open ${name}.${ext}: ${damaged ? `the file is damaged or isn't really a .${ext} file.` : e.message || e}`, { kind: 'error' }) }
    return false
  } finally {
    busy.value = null
  }
}

export const SAVE_FILTERS = {
  pptx: { name: 'PowerPoint Presentation (*.pptx)', extensions: ['pptx'] },
  prizma: { name: 'Prizma Presentation (*.prizma)', extensions: ['prizma'] },
  ppsx: { name: 'PowerPoint Show (*.ppsx)', extensions: ['ppsx'] },
  potx: { name: 'PowerPoint Template (*.potx)', extensions: ['potx'] },
  pdf: { name: 'PDF (*.pdf)', extensions: ['pdf'] }
}
export async function save () {
  finishEditingSoft()
  const f = file.value
  if (!f.path || !['pptx', 'prizma', 'ppsx'].includes(f.format)) return saveAs()
  return writeTo(f.path, f.format)
}
export async function saveAs (fmt) {
  finishEditingSoft()
  const first = fmt || (file.value.format === 'prizma' ? 'prizma' : settings.value.defaultFormat || 'pptx')
  const order = [first, ...['pptx', 'prizma', 'ppsx', 'potx', 'pdf'].filter(x => x !== first)]
  const dir = file.value.path ? file.value.path.replace(/[\\/][^\\/]*$/, '') : (appInfo.value.documents || '')
  const sep = appInfo.value.platform === 'win32' ? '\\' : '/'
  const p = await native.saveDialog({ title: 'Save as', defaultPath: (dir ? dir + sep : '') + file.value.name + '.' + first, filters: order.map(k => SAVE_FILTERS[k]) })
  if (!p) return false
  const ext = extOf(p)
  if (ext === 'pdf') { const m = await import('../print/printing.js'); return m.exportPdf(p) }
  return writeTo(p, ['prizma', 'ppsx', 'potx'].includes(ext) ? ext : 'pptx')
}
// Saves run one after another, so an earlier save can't finish last and leave older content in the file
let writing = Promise.resolve()
export function writeTo (p, fmt) {
  writing = writing.then(() => write(p, fmt))
  return writing
}
// The zip goes to disk a few MB at a time while it is being made. Glued into one piece, the file was then copied twice
// by the preload bridge, which held the window still for 3 to 4 seconds on a 280 MB deck.
async function saveZip (zip, p, level) {
  const id = await native.openWrite(p)
  try {
    await new Promise((resolve, reject) => {
      const s = zip.generateInternalStream({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level } })
      let parts = [], size = 0, queue = Promise.resolve(), waiting = 0, ended = false
      const send = () => {
        const b = new Uint8Array(size)
        let at = 0
        for (const x of parts) { b.set(x, at); at += x.length }
        parts = []; size = 0; waiting++
        queue = queue.then(() => native.writePiece(id, b)).then(() => { if (--waiting === 0 && !ended) s.resume() })
        queue.catch(e => { s.pause(); reject(e) })
      }
      // the zip waits while pieces are on their way, so only a few MB are ever in flight
      s.on('data', x => { parts.push(x); size += x.length; if (size >= PIECE) { s.pause(); send() } })
      s.on('error', reject)
      s.on('end', () => { ended = true; if (size) send(); queue.then(resolve, reject) })
      s.resume()
    })
    await native.closeFile(id, true)
  } catch (e) {
    native.closeFile(id, false).catch(() => {})
    throw e
  }
}
async function write (p, fmt) {
  busy.value = { label: `Saving ${baseName(p)}…` }
  try {
    const d = doc.value
    const zip = fmt === 'prizma'
      ? (await lazy.native()).writeNative(d)
      : await (await lazy.export()).exportPptx(d, { kind: fmt })
    await saveZip(zip, p, 6)
    const keep = fmt !== 'potx'
    if (keep && doc.value?.id === d.id) {
      file.value = { path: p, name: baseName(p), format: fmt }
      dirty.value = doc.value !== d // edits made while the file was being written are not in it
      native.setFile(p)
      native.setDirty(dirty.value)
      if (!dirty.value) native.autosave('delete', { id: recoveryId }).catch(() => {})
    } else if (!keep) native.recent('add', p)
    native.recent('list').then(r => { appInfo.value = { ...appInfo.value, recent: r } })
    toast(fmt === 'potx' ? `Template saved: ${baseName(p)}.potx` : `Saved to ${p}`)
    return true
  } catch (e) {
    console.error(e)
    toast(`Couldn't save: ${e.message || e}`, { kind: 'error' })
    return false
  } finally {
    busy.value = null
  }
}
// Commit the text being edited without leaving the editor
export function finishEditingSoft () {
  const ed = document.querySelector('[data-editor]')
  if (ed && ed._pzCommit) ed._pzCommit()
}

// ---------- autosave & recovery ----------
// One AutoRecover copy per window: two windows showing the same file must not overwrite or delete each other's copy
const recoveryId = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
let autosaveTimer = 0
let lastAutosave = 0
async function autosaveNow () {
  const d = doc.value
  if (!d || !dirty.value || !native) return
  if (Date.now() - lastAutosave < 20000) return
  lastAutosave = Date.now()
  try {
    // level 1: the copy is written every few minutes while you work, so speed counts more than size
    await saveZip((await lazy.native()).writeNative(d), await native.autosave('file', { id: recoveryId }), 1)
    await native.autosave('write', { id: recoveryId, meta: { name: file.value.name, path: file.value.path } })
  } catch (e) { console.warn('autosave failed', e) }
}
export function startAutosave () {
  clearInterval(autosaveTimer)
  const mins = Number(settings.value.autosaveMinutes) || 0
  if (mins > 0) autosaveTimer = setInterval(autosaveNow, mins * 60000)
}
export async function loadRecovery () {
  try { recovery.value = await native.autosave('list') } catch { recovery.value = [] }
}
export async function openRecovered (item) {
  if (!isPristine()) { toast('Open recovered files from a new window: File › New, then Open › Recovered.'); return }
  busy.value = { label: 'Restoring…' }
  try {
    const bytes = await native.readFile(item.file)
    clearMedia()
    const d = await (await lazy.native()).readNative(bytes)
    loadDoc(d, { path: null, name: (item.name || 'Presentation') + ' (Recovered)', format: 'pptx' })
    dirty.value = true
    backstage.value = null
    recovery.value = recovery.value.filter(r => r.id !== item.id)
    // the copy now belongs to this window; the old one goes only once the new one is written
    native.autosave('adopt', { from: item.id, id: recoveryId, meta: { name: item.name, path: item.path } }).catch(() => {})
  } catch (e) { toast('That recovered file could not be opened.', { kind: 'error' }) } finally { busy.value = null }
}
export async function discardRecovered (item) {
  await native.autosave('delete', { id: item.id })
  recovery.value = recovery.value.filter(r => r.id !== item.id)
}

// ---------- window title & close ----------
export function wireWindow () {
  effect(() => {
    const f = file.value
    const t = `${f.name}${dirty.value ? ' •' : ''} - Prizma`
    document.title = t
    native?.setTitle(`${f.name} - Prizma`)
    native?.setDirty(dirty.value)
  })
  native?.onRequestClose(async () => {
    finishEditingSoft()
    if (!dirty.value) { native.forceClose(); return }
    const r = await confirmDialog({
      title: 'Save your changes?',
      text: `Do you want to save the changes you made to ${file.value.name}?`,
      buttons: [{ id: 'save', label: 'Save', primary: true }, { id: 'discard', label: "Don't save" }, { id: 'cancel', label: 'Cancel' }]
    })
    if (r === 'save') { if (await savedForClose()) native.forceClose() } else if (r === 'discard') {
      native.autosave('delete', { id: recoveryId }).catch(() => {})
      native.forceClose()
    }
  })
  native?.onOpenFile((p, fromShell) => openPath(p, { here: true, fromShell }))
  window.addEventListener('beforeunload', () => { clearInterval(autosaveTimer) })
}
// Save before closing; true only when the document itself is saved (a PDF or template from Save as is just a copy)
async function savedForClose () {
  const f = file.value
  const ok = await save()
  if (dirty.value && ok && file.value === f) toast('Only a copy was saved. To close, save the presentation as .pptx or .prizma.')
  return !dirty.value
}
// Close the presentation but keep the window (File › Close)
export async function closeDocument () {
  finishEditingSoft()
  if (dirty.value) {
    const r = await confirmDialog({ title: 'Save your changes?', text: `Do you want to save the changes you made to ${file.value.name}?`, buttons: [{ id: 'save', label: 'Save', primary: true }, { id: 'discard', label: "Don't save" }, { id: 'cancel', label: 'Cancel' }] })
    if (r === 'cancel' || !r) return
    if (r === 'save' && !(await savedForClose())) return
    if (r === 'discard') native?.autosave('delete', { id: recoveryId }).catch(() => {})
  }
  newDocIn()
  native?.setIdle(true)
  backstage.value = 'home'
}
export { docVersion }

// Command registry: one place that defines what every ribbon button, menu item, shortcut and search result does.
import { computed, signal } from '@preact/signals'
import {
  doc, slide, slideIdx, selection, editing, editCell, slideSel, selected, canUndo, canRedo, undo, redo, zoom, fitZoom, view, ribbonTab,
  ribbonCollapsed, backstage, pane, formatTab, showNotes, showRuler, showGrid, showGuides, snapGrid, settings, native, painter, fmtTick,
  docVersion, focusArea, tool, cropMode, openDialog, toast, select, goSlide, finishEditing, editorReq, theme as themeSig, searchOpen, update, grayscale, setSetting
} from '../core/store.js'
import * as A from '../core/actions.js'
import { richState, stepSize } from '../core/html.js'
import { findEl, textBox } from '../core/model.js'
import { activeEditor, applyRun, paraOps, liveState } from '../editor/richEdit.js'
import { fitPatch } from '../editor/TextEditor.jsx'
import * as F from './files.js'

export const CMDS = {}
const def = (id, o) => { CMDS[id] = { id, ...o } }
export function runCmd (id, ...args) {
  const c = CMDS[id]
  if (!c) { console.warn('unknown command', id); return }
  if (c.enabled && !c.enabled()) return
  return c.run(...args)
}
export const cmdEnabled = id => { const c = CMDS[id]; return !!c && (!c.enabled || c.enabled()) }

const hasSel = () => selection.value.length > 0
const isEditingText = () => !!activeEditor()
const one = () => selected.value.length === 1 ? selected.value[0] : null
const selType = t => selected.value.length > 0 && selected.value.every(e => e.type === t)

// ---------------- text formatting ----------------
// Text commands apply to the live text selection while editing, otherwise to all text of the selected objects.
export const fmtState = computed(() => {
  fmtTick.value; docVersion.value; selection.value; editing.value; editCell.value
  const live = liveState()
  const els = A.textTargets()
  if (live) return { ...live, editing: true, vAlign: els[0]?.vAlign }
  if (!els.length) return null
  const e = els[0]
  const base = { ...(e.ts || {}) }
  let html = e.html
  if (e.type === 'table') html = (e.cells.flat().find(c => c && c.html && c.html.replace(/<[^>]+>/g, '').trim()) || {}).html || '<p></p>'
  if (e.type === 'group') { const c = (e.children || []).find(x => x.html); html = c?.html || '<p></p>'; Object.assign(base, c?.ts || {}) }
  return { ...richState(html || '<p></p>', base), vAlign: e.vAlign, editing: false, el: e }
})
export const fontLabel = f => {
  const t = themeSig.value
  if (!f) return ''
  if (f === '+major') return (t?.fonts.major || 'Headings') + ' (Headings)'
  if (f === '+minor') return (t?.fonts.minor || 'Body') + ' (Body)'
  return f
}
// After whole-object formatting, let autofit text boxes catch up with their new size
export function refitSoon (ids = selection.value) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const s = slide.value
    if (!s) return
    for (const id of ids) {
      const el = findEl(s, id)?.el
      if (!el || !el.autofit || !el.html) continue
      const d = document.querySelector(`.stage .pz-slide [data-id="${id}"] .pz-rt`)
      if (!d || d.dataset.editor) continue
      const fit = fitPatch(d, el)
      if (fit) A.setProps(fit, [id], { merge: true })
    }
  }))
}
export function textRun (key, value) {
  if (isEditingText()) return applyRun(key, value)
  if (!A.textTargets().length) return
  A.textRunAll(key, value)
  refitSoon()
}
function toggleRun (key) {
  const st = fmtState.value
  textRun(key, !(st && st[key] === true))
}
export function textPara (op, ...args) {
  if (isEditingText()) return paraOps[op](...args)
  if (!A.textTargets().length) return
  if (op === 'align') A.textParaAll('text-align', args[0])
  else if (op === 'lineH') A.textParaAll('line-height', args[0] ? String(args[0]) : null)
  else if (op === 'before') A.textParaAll('margin-top', args[0] + 'pt')
  else if (op === 'after') A.textParaAll('margin-bottom', args[0] + 'pt')
  else if (op === 'bullets') A.textBulletsAll(args[0], args[1])
  else if (op === 'level') A.textLevelAll(args[0])
  refitSoon()
}
function sizeStep (dir) {
  if (isEditingText()) return applyRun('sizeBy', { dir })
  const st = fmtState.value
  A.textRunAll('sizeBy', { dir, base: st?.size || 18 })
  refitSoon()
}
export function setFontSize (v) {
  const n = parseFloat(String(v).replace(',', '.'))
  if (!n || n < 1 || n > 4000) { toast('Enter a font size between 1 and 4000.'); return }
  textRun('size', Math.round(n * 10) / 10)
}
export function setFontFace (f) {
  f = String(f || '').trim()
  if (!f) return
  textRun('font', / \(Headings\)$/.test(f) ? '+major' : / \(Body\)$/.test(f) ? '+minor' : f)
}

def('fmt.bold', { label: 'Bold', icon: 'bold', keys: 'Ctrl+B', run: () => toggleRun('bold'), checked: () => fmtState.value?.bold === true, text: true })
def('fmt.italic', { label: 'Italic', icon: 'italic', keys: 'Ctrl+I', run: () => toggleRun('italic'), checked: () => fmtState.value?.italic === true, text: true })
def('fmt.underline', { label: 'Underline', icon: 'underline', keys: 'Ctrl+U', run: () => toggleRun('underline'), checked: () => fmtState.value?.underline === true, text: true })
def('fmt.strike', { label: 'Strikethrough', icon: 'strikethrough', run: () => toggleRun('strike'), checked: () => fmtState.value?.strike === true, text: true })
def('fmt.grow', { label: 'Increase font size', icon: 'a-arrow-up', keys: 'Ctrl+]', alt: ['Ctrl+Shift+>', 'Ctrl+Shift+.'], run: () => sizeStep(1), text: true })
def('fmt.shrink', { label: 'Decrease font size', icon: 'a-arrow-down', keys: 'Ctrl+[', alt: ['Ctrl+Shift+<', 'Ctrl+Shift+,'], run: () => sizeStep(-1), text: true })
def('fmt.clear', { label: 'Clear all formatting', icon: 'remove-formatting', keys: 'Ctrl+Space', run: () => textRun('clear', true), text: true })
def('fmt.sup', { label: 'Superscript', icon: 'superscript', keys: 'Ctrl+Shift+=', run: () => textRun('baseline', fmtState.value?.baseline === 'sup' ? null : 'sup'), checked: () => fmtState.value?.baseline === 'sup', text: true })
def('fmt.sub', { label: 'Subscript', icon: 'subscript', keys: 'Ctrl+=', run: () => textRun('baseline', fmtState.value?.baseline === 'sub' ? null : 'sub'), checked: () => fmtState.value?.baseline === 'sub', text: true })
def('fmt.upper', { label: 'UPPERCASE', icon: 'case-upper', run: () => textRun('case', 'upper'), text: true })
def('fmt.lower', { label: 'lowercase', icon: 'case-lower', run: () => textRun('case', 'lower'), text: true })
def('fmt.sentence', { label: 'Sentence case.', icon: 'case-sensitive', run: () => textRun('case', 'sentence'), text: true })
def('fmt.title', { label: 'Capitalize Each Word', icon: 'type', run: () => textRun('case', 'title'), text: true })
def('fmt.toggleCase', { label: 'tOGGLE cASE', icon: 'arrow-up-down', keys: 'Shift+F3', run: () => textRun('case', 'toggle'), text: true })
def('para.left', { label: 'Align left', icon: 'align-left', keys: 'Ctrl+L', run: () => textPara('align', 'left'), checked: () => fmtState.value?.align === 'left', text: true })
def('para.center', { label: 'Center', icon: 'align-center', keys: 'Ctrl+E', run: () => textPara('align', 'center'), checked: () => fmtState.value?.align === 'center', text: true })
def('para.right', { label: 'Align right', icon: 'align-right', keys: 'Ctrl+R', run: () => textPara('align', 'right'), checked: () => fmtState.value?.align === 'right', text: true })
def('para.justify', { label: 'Justify', icon: 'align-justify', keys: 'Ctrl+J', run: () => textPara('align', 'justify'), checked: () => fmtState.value?.align === 'justify', text: true })
def('para.bullets', { label: 'Bullets', icon: 'list', run: (opts) => textPara('bullets', fmtState.value?.bullets === 'bu' && !opts ? null : 'bu', opts), checked: () => fmtState.value?.bullets === 'bu', text: true })
def('para.numbering', { label: 'Numbering', icon: 'list-ordered', run: (opts) => textPara('bullets', fmtState.value?.bullets === 'num' && !opts ? null : 'num', opts), checked: () => fmtState.value?.bullets === 'num', text: true })
def('para.indent', { label: 'Increase list level', icon: 'indent-increase', keys: 'Alt+Shift+Right', run: () => textPara('level', 1), text: true })
def('para.outdent', { label: 'Decrease list level', icon: 'indent-decrease', keys: 'Alt+Shift+Left', run: () => textPara('level', -1), text: true })
def('para.dialog', { label: 'Line spacing and indents…', icon: 'pilcrow', tags: 'paragraph spacing indentation before after', run: () => openDialog('paragraph') })
def('fmt.dialog', { label: 'Font…', icon: 'type', tags: 'font face character spacing', run: () => openDialog('font') })
def('para.vTop', { label: 'Align text top', icon: 'align-vertical-justify-start', run: () => A.setProps({ vAlign: 'top' }), checked: () => fmtState.value?.vAlign === 'top' })
def('para.vMiddle', { label: 'Align text middle', icon: 'align-vertical-justify-center', run: () => A.setProps({ vAlign: 'middle' }), checked: () => fmtState.value?.vAlign === 'middle' })
def('para.vBottom', { label: 'Align text bottom', icon: 'align-vertical-justify-end', run: () => A.setProps({ vAlign: 'bottom' }), checked: () => fmtState.value?.vAlign === 'bottom' })

// ---------------- clipboard & editing ----------------
def('edit.undo', { label: 'Undo', icon: 'undo-2', keys: 'Ctrl+Z', run: () => { F.finishEditingSoft(); undo() }, enabled: () => canUndo.value, global: true })
def('edit.redo', { label: 'Redo', icon: 'redo-2', keys: 'Ctrl+Y', alt: ['Ctrl+Shift+Z'], run: () => { F.finishEditingSoft(); redo() }, enabled: () => canRedo.value, global: true })
def('edit.cut', { label: 'Cut', icon: 'scissors', keys: 'Ctrl+X', run: () => { if (isEditingText()) { document.execCommand('cut'); return } if (focusArea.value === 'thumbs') A.copySlides(slideIds(), true); else A.copySelection(true) } })
def('edit.copy', { label: 'Copy', icon: 'copy', keys: 'Ctrl+C', run: () => { if (isEditingText()) { document.execCommand('copy'); return } if (focusArea.value === 'thumbs') A.copySlides(slideIds()); else A.copySelection() } })
def('edit.paste', { label: 'Paste', icon: 'clipboard-paste', keys: 'Ctrl+V', run: () => { if (isEditingText()) { pasteText(); return } A.pasteFromClipboard() } })
def('edit.pasteText', { label: 'Keep text only', icon: 'clipboard-type', keys: 'Ctrl+Shift+V', run: () => { if (isEditingText()) pasteText(); else navigator.clipboard.readText().then(t => { if (t) A.insertElement(textBoxFor(t)) }).catch(() => {}) } })
// the clipboard's text into the text being edited; Windows line ends would leave a stray \r in every line
const pasteText = () => navigator.clipboard.readText().then(t => document.execCommand('insertText', false, t.replace(/\r\n?/g, '\n'))).catch(() => {})
def('edit.duplicate', { label: 'Duplicate', icon: 'copy-plus', keys: 'Ctrl+D', run: () => { if (focusArea.value === 'thumbs' || !hasSel()) A.duplicateSlides(slideIds()); else A.duplicateSelected() } })
def('edit.delete', { label: 'Delete', icon: 'trash-2', keys: 'Delete', run: () => { if (focusArea.value === 'thumbs') A.deleteSlides(slideIds()); else A.deleteSelected() } })
def('edit.selectAll', { label: 'Select all', icon: 'box-select', keys: 'Ctrl+A', run: () => { if (focusArea.value === 'thumbs') slideSel.value = doc.value.slides.map(s => s.id); else A.selectAll() } })
def('edit.painter', { label: 'Format painter', icon: 'paintbrush', keys: 'Ctrl+Shift+C', run: () => { if (painter.value) painter.value = null; else A.pickFormat() }, checked: () => !!painter.value, enabled: () => hasSel() || !!painter.value })
def('edit.find', { label: 'Find', icon: 'search', keys: 'Ctrl+F', run: () => openDialog('find', { replace: false }), global: true })
def('edit.replace', { label: 'Replace', icon: 'replace', keys: 'Ctrl+H', run: () => openDialog('find', { replace: true }), global: true })
const slideIds = () => slideSel.value.length ? slideSel.value : [slide.value?.id].filter(Boolean)
function textBoxFor (t) {
  const z = doc.value.size
  return textBox({ x: z.w * 0.1, y: z.h * 0.35, w: z.w * 0.8, h: 40 }, t.split(/\r?\n/).map(l => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;') || '<br>'}</p>`).join(''))
}

// ---------------- slides ----------------
def('slide.new', { label: 'New slide', icon: 'square-plus', keys: 'Ctrl+M', run: l => A.addSlide(l), global: true })
def('slide.duplicate', { label: 'Duplicate slide', icon: 'copy-plus', run: () => A.duplicateSlides(slideIds()) })
def('slide.delete', { label: 'Delete slide', icon: 'trash-2', run: () => A.deleteSlides(slideIds()) })
def('slide.hide', { label: 'Hide slide', icon: 'eye-off', run: () => A.toggleHideSlides(slideIds()), checked: () => !!slide.value?.hidden })
def('slide.reset', { label: 'Reset slide', icon: 'rotate-ccw', run: () => A.resetSlide() })
def('slide.prev', { label: 'Previous slide', icon: 'chevron-up', keys: 'PageUp', run: () => goSlide(slideIdx.value - 1) })
def('slide.next', { label: 'Next slide', icon: 'chevron-down', keys: 'PageDown', run: () => goSlide(slideIdx.value + 1) })
// the selected slides' first and last place in the deck, whatever order they were clicked in
const slideSpan = () => { const ids = slideIds(), at = doc.value.slides.flatMap((s, i) => ids.includes(s.id) ? [i] : []); return { ids, first: at[0], last: at[at.length - 1] } }
def('slide.moveUp', { label: 'Move slide up', icon: 'arrow-up', run: () => { const { ids, first } = slideSpan(); if (first > 0) A.moveSlides(ids, first - 1) } })
def('slide.moveDown', { label: 'Move slide down', icon: 'arrow-down', run: () => { const { ids, last } = slideSpan(); if (last < doc.value.slides.length - 1) A.moveSlides(ids, last + 2) } })

// ---------------- objects ----------------
def('obj.group', { label: 'Group', icon: 'group', keys: 'Ctrl+G', run: () => A.groupSelected(), enabled: () => A.topSelected().length > 1 })
def('obj.ungroup', { label: 'Ungroup', icon: 'ungroup', keys: 'Ctrl+Shift+G', run: () => A.ungroupSelected(), enabled: () => A.topSelected().some(e => e.type === 'group') })
def('obj.front', { label: 'Bring to front', icon: 'bring-to-front', keys: 'Ctrl+Shift+]', run: () => A.arrange('front'), enabled: hasSel })
def('obj.forward', { label: 'Bring forward', icon: 'arrow-up-from-line', run: () => A.arrange('forward'), enabled: hasSel })
def('obj.back', { label: 'Send to back', icon: 'send-to-back', keys: 'Ctrl+Shift+[', run: () => A.arrange('back'), enabled: hasSel })
def('obj.backward', { label: 'Send backward', icon: 'arrow-down-to-line', run: () => A.arrange('backward'), enabled: hasSel })
for (const [k, l, ic] of [['left', 'Align left', 'align-start-vertical'], ['center', 'Align center', 'align-center-vertical'], ['right', 'Align right', 'align-end-vertical'], ['top', 'Align top', 'align-start-horizontal'], ['middle', 'Align middle', 'align-center-horizontal'], ['bottom', 'Align bottom', 'align-end-horizontal']]) {
  def('align.' + k, { label: l, icon: ic, run: () => A.align(k), enabled: hasSel })
}
def('align.distH', { label: 'Distribute horizontally', icon: 'align-horizontal-distribute-center', run: () => A.distribute('h'), enabled: () => selection.value.length > 2 })
def('align.distV', { label: 'Distribute vertically', icon: 'align-vertical-distribute-center', run: () => A.distribute('v'), enabled: () => selection.value.length > 2 })
def('obj.rotR', { label: 'Rotate right 90°', icon: 'rotate-cw', run: () => A.rotateSelected(90), enabled: hasSel })
def('obj.rotL', { label: 'Rotate left 90°', icon: 'rotate-ccw', run: () => A.rotateSelected(-90), enabled: hasSel })
def('obj.flipV', { label: 'Flip vertical', icon: 'flip-vertical-2', run: () => A.flipSelected('v'), enabled: hasSel })
def('obj.flipH', { label: 'Flip horizontal', icon: 'flip-horizontal-2', run: () => A.flipSelected('h'), enabled: hasSel })
def('obj.format', { label: 'Format pane', icon: 'panel-right', keys: 'Ctrl+1', run: (tab) => { pane.value = 'format'; if (tab) formatTab.value = tab } })
def('obj.link', { label: 'Link', icon: 'link', keys: 'Ctrl+K', tags: 'hyperlink url web address', run: () => openDialog('link'), global: true })
def('obj.alt', { label: 'Alt text', icon: 'message-square-text', run: () => openDialog('alt'), enabled: () => !!one() })
def('obj.crop', { label: 'Crop', icon: 'crop', run: () => { const e = one(); if (e && e.type === 'image') { cropMode.value = cropMode.value === e.id ? null : e.id } }, checked: () => !!cropMode.value, enabled: () => selType('image') && selected.value.length === 1 })
def('obj.editText', { label: 'Edit text', icon: 'text-cursor-input', run: () => { const e = one(); if (e && (e.type === 'text' || e.type === 'shape')) { editorReq.value = { mode: 'end' }; editing.value = e.id } }, enabled: () => !!one() && ['text', 'shape'].includes(one().type) })

// ---------------- insert ----------------
def('ins.textbox', { label: 'Text box', icon: 'type', run: () => { tool.value = { kind: 'text' } } })
def('ins.picture', { label: 'Pictures', icon: 'image', run: () => pickPictures(), global: true })
def('ins.table', { label: 'Table', icon: 'table', run: () => openDialog('table') })
def('ins.chart', { label: 'Chart', icon: 'chart-column', run: () => openDialog('chart') })
def('ins.icons', { label: 'Icons', icon: 'shapes', run: () => openDialog('icons') })
def('ins.symbol', { label: 'Symbol', icon: 'omega', run: () => openDialog('symbol') })
def('ins.video', { label: 'Video', icon: 'film', run: () => pickMedia('video') })
def('ins.audio', { label: 'Audio', icon: 'volume-2', run: () => pickMedia('audio') })
def('ins.hf', { label: 'Header & footer', icon: 'panel-bottom', run: () => openDialog('hf') })
def('ins.slideNumber', { label: 'Slide number', icon: 'hash', run: () => openDialog('hf') })
def('ins.date', { label: 'Date & time', icon: 'calendar', run: () => openDialog('hf') })
// galleries open from the ribbon, so search switches to the tab and opens them
const openDrop = (tab, tip) => { ribbonTab.value = tab; setTimeout(() => document.querySelector(`.ribbon .drop button[data-tip="${tip}"]`)?.click(), 40) }
def('ins.shapes', { label: 'Shapes', icon: 'shapes', tags: 'rectangle circle arrow star', run: () => openDrop('insert', 'Insert shapes') })
def('ins.wordart', { label: 'WordArt', icon: 'pilcrow', tags: 'fancy text effects', run: () => openDrop('insert', 'WordArt') })
def('ins.comment', { label: 'New comment', icon: 'message-square-plus', keys: 'Ctrl+Alt+M', run: () => { pane.value = 'comments'; setTimeout(() => document.querySelector('.cm-new textarea')?.focus(), 60) } })
const PICTURES = { name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif'] }
export async function pickPictures () {
  const paths = await native.openDialog({ title: 'Insert picture', multi: true, filters: [PICTURES, { name: 'All files', extensions: ['*'] }] })
  for (const p of paths || []) await insertPictureFile(p)
}
// A picture file as the slide shows it (a big photo made smaller); null, after telling the user, when it can't be shown
export async function readPicture (p) {
  const pic = await A.loadPicture(await native.readFile(p), mimeOf(p))
  if (!pic) A.cantShowPicture(p.split(/[\\/]/).pop())
  return pic
}
// The picture chosen in an open dialog, read as readPicture does; null when none
export async function pickPicture (title) {
  const paths = await native.openDialog({ title, filters: [PICTURES] })
  return paths?.[0] ? readPicture(paths[0]) : null
}
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac' }
export const mimeOf = p => MIME[F.extOf(p)] || 'application/octet-stream'
export async function insertPictureFile (p, box) {
  const pic = await readPicture(p)
  return pic && A.insertImageBytes(pic.bytes, pic.mime, pic.w, pic.h, box)
}
async function pickMedia (kind) {
  const paths = await native.openDialog({ title: kind === 'video' ? 'Insert video' : 'Insert audio', filters: [kind === 'video' ? { name: 'Video', extensions: ['mp4', 'm4v', 'webm', 'mov'] } : { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] }] })
  if (!paths?.[0]) return
  const bytes = await native.readFile(paths[0])
  A.insertMedia(kind, bytes, mimeOf(paths[0]))
}

// ---------------- view ----------------
const zoomSteps = [0.1, 0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.25, 1.5, 2, 3, 4]
export function zoomBy (dir) {
  const cur = zoom.value || fitZoom.value
  const next = dir > 0 ? zoomSteps.find(z => z > cur + 0.005) || 4 : [...zoomSteps].reverse().find(z => z < cur - 0.005) || 0.1
  zoom.value = next
}
def('view.zoomIn', { label: 'Zoom in', icon: 'zoom-in', keys: 'Ctrl+Plus', run: () => zoomBy(1), global: true })
def('view.zoomOut', { label: 'Zoom out', icon: 'zoom-out', keys: 'Ctrl+-', run: () => zoomBy(-1), global: true })
def('view.fit', { label: 'Fit slide to window', icon: 'maximize', run: () => { zoom.value = 0 }, checked: () => zoom.value === 0 })
def('view.zoom', { label: 'Zoom…', icon: 'search', run: () => openDialog('zoom') })
def('view.normal', { label: 'Normal', icon: 'layout-panel-left', run: () => { view.value = 'normal' }, checked: () => view.value === 'normal' })
def('view.sorter', { label: 'Slide sorter', icon: 'layout-grid', run: () => { finishEditing(); view.value = 'sorter' }, checked: () => view.value === 'sorter' })
def('view.outline', { label: 'Outline view', icon: 'list-tree', run: () => { finishEditing(); view.value = 'outline' }, checked: () => view.value === 'outline' })
def('view.reading', { label: 'Reading view', icon: 'book-open', run: () => import('../show/launch.js').then(m => m.startShow(slideIdx.value, { reading: true })) })
def('view.ruler', { label: 'Ruler', icon: 'ruler', run: () => { showRuler.value = !showRuler.value }, checked: () => showRuler.value })
def('view.grid', { label: 'Gridlines', icon: 'grid-3x3', keys: 'Shift+F9', run: () => { showGrid.value = !showGrid.value }, checked: () => showGrid.value })
def('view.guides', { label: 'Guides', icon: 'crosshair', keys: 'Alt+F9', run: () => { showGuides.value = !showGuides.value }, checked: () => showGuides.value })
def('view.snap', { label: 'Snap to grid', icon: 'magnet', run: () => { snapGrid.value = !snapGrid.value }, checked: () => snapGrid.value })
def('view.notes', { label: 'Notes', icon: 'notebook-pen', run: () => { showNotes.value = !showNotes.value }, checked: () => showNotes.value })
def('view.comments', { label: 'Comments', icon: 'messages-square', run: () => { pane.value = pane.value === 'comments' ? null : 'comments' }, checked: () => pane.value === 'comments' })
def('view.selectionPane', { label: 'Selection pane', icon: 'layers', keys: 'Alt+F10', run: () => { pane.value = pane.value === 'selection' ? null : 'selection' }, checked: () => pane.value === 'selection' })
def('view.animPane', { label: 'Animation pane', icon: 'list-video', run: () => { pane.value = pane.value === 'anim' ? null : 'anim' }, checked: () => pane.value === 'anim' })
def('view.collapseRibbon', { label: 'Collapse the ribbon', icon: 'chevrons-up', keys: 'Ctrl+F1', run: () => { ribbonCollapsed.value = !ribbonCollapsed.value }, checked: () => ribbonCollapsed.value, global: true })
def('view.newWindow', { label: 'New window', icon: 'app-window', run: () => native.newWindow(null) })
def('view.gray', { label: 'Grayscale', icon: 'contrast', tags: 'black and white grey', run: () => { grayscale.value = !grayscale.value }, checked: () => grayscale.value })
def('view.spelling', { label: 'Check spelling as you type', icon: 'spell-check', tags: 'spelling proofing', run: () => setSetting({ spellcheck: settings.value.spellcheck === false }), checked: () => settings.value.spellcheck !== false })
// the interface on screen: "Same as Windows" resolves to whatever Windows uses now
export const uiShown = signal('dark')
def('view.uiTheme', { label: 'Switch light/dark interface', icon: 'sun-moon', tags: 'dark mode light mode night', run: () => setUiTheme(uiShown.value === 'dark' ? 'light' : 'dark') })
export function setUiTheme (t) {
  setSetting({ theme: t })
  applyUiTheme()
}
export function applyUiTheme () {
  const t = settings.value.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.value.theme
  document.documentElement.dataset.ui = uiShown.value = t
  native?.setTheme(t)
}

// ---------------- design ----------------
def('design.themes', { label: 'Themes', icon: 'palette', tags: 'design look style colors variants', run: () => { ribbonTab.value = 'design' } })
def('design.size', { label: 'Slide size', icon: 'ratio', run: () => openDialog('size') })
def('design.bg', { label: 'Format background', icon: 'paint-bucket', run: () => { pane.value = 'format'; formatTab.value = 'background'; select([]) } })

// ---------------- slide show ----------------
def('show.start', { label: 'From beginning', icon: 'play', keys: 'F5', tags: 'slide show play present start', run: () => import('../show/launch.js').then(m => m.startShow(firstShown())), global: true })
def('show.current', { label: 'From current slide', icon: 'presentation', keys: 'Shift+F5', run: () => import('../show/launch.js').then(m => m.startShow(slideIdx.value)), global: true })
def('show.presenter', { label: 'Presenter view', icon: 'monitor-speaker', keys: 'Alt+F5', run: () => import('../show/launch.js').then(m => m.startShow(slideIdx.value, { presenter: true, force: true })), global: true })
def('show.transitions', { label: 'Transitions', icon: 'sparkles', tags: 'slide transition morph fade', run: () => { ribbonTab.value = 'transitions' } })
def('show.rehearse', { label: 'Rehearse timings', icon: 'timer', tags: 'practice stopwatch timer', run: () => import('../show/launch.js').then(m => m.startShow(firstShown(), { rehearse: true })) })
// From beginning starts at the first slide that isn't hidden, as in PowerPoint
export const firstShown = () => Math.max(0, doc.value.slides.findIndex(s => !s.hidden))
def('show.setup', { label: 'Set up slide show', icon: 'settings-2', run: () => openDialog('setupShow') })

// ---------------- file ----------------
def('file.new', { label: 'New presentation', icon: 'file-plus-2', keys: 'Ctrl+N', run: () => F.newPresentation(), global: true })
def('file.open', { label: 'Open…', icon: 'folder-open', keys: 'Ctrl+O', run: () => F.chooseAndOpen(), global: true })
def('file.save', { label: 'Save', icon: 'save', keys: 'Ctrl+S', run: () => F.save(), global: true })
def('file.saveAs', { label: 'Save as…', icon: 'save-all', keys: 'F12', alt: ['Ctrl+Shift+S'], run: () => F.saveAs(), global: true })
def('file.print', { label: 'Print', icon: 'printer', keys: 'Ctrl+P', run: () => { finishEditing(); backstage.value = 'print' }, global: true })
def('file.exportPdf', { label: 'Export to PDF', icon: 'file-text', run: () => import('../print/printing.js').then(m => m.exportPdfDialog()) })
def('file.close', { label: 'Close presentation', icon: 'x', keys: 'Ctrl+W', run: () => F.closeDocument(), global: true })
def('file.options', { label: 'Options', icon: 'settings', run: () => { backstage.value = 'options' } })
def('file.backstage', { label: 'File', icon: 'menu', run: () => { finishEditing(); backstage.value = 'home' } })
def('help.shortcuts', { label: 'Keyboard shortcuts', icon: 'keyboard', keys: 'F1', run: () => openDialog('shortcuts'), global: true })
def('help.about', { label: 'About Prizma', icon: 'info', run: () => openDialog('about') })
def('app.search', { label: 'Search commands', icon: 'search', keys: 'Alt+Q', alt: ['Ctrl+Q'], run: () => { searchOpen.value = true; setTimeout(() => document.querySelector('.tb-search input')?.focus(), 20) }, global: true })

// ---------------- keyboard ----------------
const keyName = e => {
  let k = e.key
  const ctrl = e.ctrlKey || e.metaKey
  // with Ctrl, a Cyrillic letter stands for the Latin key it sits on (Ctrl+С is Ctrl+C), as in Office; AltGr
  // (Ctrl+Alt) is left alone so it still types characters
  if (ctrl && !e.altKey && k.length === 1 && k > '\x7f' && e.keyCode >= 65 && e.keyCode <= 90) return String.fromCharCode(e.keyCode)
  // the key right of 0 is '=' on US keyboards and '+' on Nordic ones; Office goes by the key (Ctrl+= subscript,
  // Ctrl+Shift+= superscript), so Prizma does too. The numpad + stays Plus (zoom in).
  if (ctrl && e.keyCode === 187) return '='
  if (k === ' ') k = 'Space'
  else if (k === '+') k = 'Plus'
  else if (k.length === 1) k = k.toUpperCase()
  else if (k.startsWith('Arrow')) k = k.slice(5)
  return k
}
export function comboOf (e) {
  return (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + keyName(e)
}
const KEYMAP = new Map()
const norm = k => k.replace(/Ctrl\+Alt\+Shift|Ctrl\+Shift\+Alt/, 'Ctrl+Alt+Shift')
export function buildKeymap () {
  KEYMAP.clear()
  for (const c of Object.values(CMDS)) for (const k of [c.keys, ...(c.alt || [])].filter(Boolean)) {
    // combos are stored as Ctrl+Alt+Shift+Key, whatever order the command lists them in
    const parts = k.split('+'); const key = parts.pop()
    const kk = (parts.includes('Ctrl') ? 'Ctrl+' : '') + (parts.includes('Alt') ? 'Alt+' : '') + (parts.includes('Shift') ? 'Shift+' : '') + (key.length === 1 ? key.toUpperCase() : key)
    KEYMAP.set(norm(kk), c.id)
  }
}
export const commandForKey = e => KEYMAP.get(comboOf(e)) || null

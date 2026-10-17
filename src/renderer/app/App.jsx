// The editor window: layout, start-up, keyboard handling and the floating layers.
import { useEffect, useRef, useState, useLayoutEffect } from 'preact/hooks'
import { effect } from '@preact/signals'
import {
  doc, native, settings, appInfo, fonts, backstage, view, pane, showNotes, slide, slideIdx, selection, selected, editing, editCell,
  tool, cropMode, painter, dialog, toasts, busy, focusArea, slideSel, select, goSlide, updateEls, editorReq, showing, grayscale
} from '../core/store.js'
import { textOf } from '../core/html.js'
import * as A from '../core/actions.js'
import { TitleBar, StatusBar, Notes, Splitter } from '../ui/Chrome.jsx'
import { Ribbon } from '../ui/Ribbon.jsx'
import { Thumbs, SlideThumb } from '../ui/Thumbs.jsx'
import { RightPane } from '../ui/Panes.jsx'
import { Dialogs } from '../ui/dialogs.jsx'
import { Backstage } from '../ui/Backstage.jsx'
import { PopLayer, TipLayer, contextMenu } from '../ui/popover.jsx'
import { Icon } from '../ui/Icon.jsx'
import { Stage } from '../editor/Stage.jsx'
import { Show } from '../show/Show.jsx'
import { PrintPages } from '../print/PrintPages.jsx'
import { printJob } from '../print/printing.js'
import { previewReq } from '../ui/ribbon/design.jsx'
import { CMDS, runCmd, buildKeymap, commandForKey, applyUiTheme } from './commands.js'
import * as F from './files.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('pz.' + k); return v === null ? d : JSON.parse(v) } catch { return d } },
  set: (k, v) => { try { localStorage.setItem('pz.' + k, JSON.stringify(v)) } catch {} }
}

// ---------------- start-up ----------------
let started = false
async function startUp () {
  if (started) return
  started = true
  buildKeymap()
  if (!native) { F.newDocIn(); return }
  let info = {}
  try { info = await native.init() } catch (e) { console.error(e) }
  settings.value = { ...settings.value, ...(info.settings || {}) }
  appInfo.value = { ...appInfo.value, platform: info.platform || native.platform, version: info.version || '1.0.0', recent: info.recent || [], hasLibreOffice: !!info.hasLibreOffice, userName: info.userName || '', documents: info.documents || '' }
  applyUiTheme()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (settings.value.theme === 'system') applyUiTheme() }) // Windows switched light/dark
  F.wireWindow()
  F.startAutosave()
  native.onSettings(s => { settings.value = { ...settings.value, ...s }; applyUiTheme(); F.startAutosave() }) // changed in another window
  F.loadRecovery()
  native.fonts(false).then(list => { fonts.value = list || [] }).catch(() => {})
  const p = info.openPath
  if (p && p === ':tour') { (await import('./tour.js')).loadTour(); return }
  if (p && p.startsWith(':new:')) { const [, , id, v] = p.split(':'); F.newDocIn(id, +v || 0); return }
  F.newDocIn()
  if (p) { await F.openPath(p, { here: true, fromShell: !!info.fromShell }); return }
  native.setIdle(true) // an untouched new window: a file opened from Explorer comes here instead of a new window
  if (settings.value.showStart !== false) backstage.value = 'home'
}

// ---------------- keyboard ----------------
const NUDGE = 3
function canvasKey (e) {
  const k = e.key
  const d = doc.value
  if (!d) return false
  const sel = selection.value
  const inThumbs = focusArea.value === 'thumbs'
  if (k === 'Escape') {
    if (tool.value) tool.value = null
    else if (cropMode.value) cropMode.value = null
    else if (painter.value) painter.value = null
    else if (sel.length) select([])
    else return false
    return true
  }
  if (k === 'Delete' || k === 'Backspace') {
    if (inThumbs) A.deleteSlides(slideSel.value.length ? slideSel.value : [slide.value.id])
    else if (sel.length) A.deleteSelected()
    else return false
    return true
  }
  if (k === 'Home' || k === 'End') { goSlide(k === 'Home' ? 0 : d.slides.length - 1); return true }
  if (k.startsWith('Arrow')) {
    const dx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0
    const dy = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0
    if (inThumbs || !sel.length) {
      if (inThumbs && (e.ctrlKey || e.metaKey) && dy) { runCmd(dy < 0 ? 'slide.moveUp' : 'slide.moveDown'); return true }
      goSlide(slideIdx.value + (dx || dy))
      return true
    }
    if (e.altKey && dx) { A.rotateSelected(dx * 15); return true }
    const step = e.ctrlKey || e.metaKey ? 0.5 : NUDGE
    if (e.shiftKey) {
      // Shift+arrows resize like PowerPoint
      updateEls(A.topSelection(), el => A.resizeEl(el, Math.max(1, el.w + dx * step), Math.max(1, el.h - dy * step)), { coalesce: 'nudge-size' })
    } else {
      const s = slide.value // a child of a turned group still moves the way the arrow points on screen
      updateEls(A.topSelection(), el => { const m = A.localMove(s, el.id, dx * step, dy * step); el.x += m.x; el.y += m.y }, { coalesce: 'nudge' })
    }
    return true
  }
  if (k === 'Tab' && !inThumbs) {
    const ids = slide.value.elements.filter(el => !el.hidden).map(el => el.id)
    if (!ids.length) return false
    const cur = ids.indexOf(sel[0])
    const next = cur < 0 ? (e.shiftKey ? ids.length - 1 : 0) : (cur + (e.shiftKey ? -1 : 1) + ids.length) % ids.length
    select([ids[next]])
    return true
  }
  if (k === 'Enter' || k === 'F2') {
    if (inThumbs && k === 'Enter') { A.addSlide(); return true }
    const el = selected.value.length === 1 ? selected.value[0] : null
    if (!el) return false
    if (el.type === 'text' || el.type === 'shape') { editorReq.value = { mode: k === 'F2' ? 'end' : 'all' }; editing.value = el.id; return true }
    if (el.type === 'table') { editCell.value = { id: el.id, r: 0, c: 0 }; return true }
    if (el.type === 'group' && el.children?.length) { select([el.children[0].id]); return true }
    return false
  }
  return false
}
// F6 / Shift+F6 move the keyboard between the ribbon, the slide list, the slide, the notes and the status bar, like PowerPoint
const REGIONS = [['.ribbon', '.rtab.on'], ['.thumbs', '.thumbs'], [null, null], ['.notes', '.notes textarea'], ['.statusbar', '.statusbar button']]
function cycleFocus (dir) {
  const cur = document.activeElement
  let i = REGIONS.findIndex(([area]) => area ? !!cur?.closest?.(area) : !cur || cur === document.body)
  for (let n = 0; n < REGIONS.length; n++) {
    i = (i + dir + REGIONS.length) % REGIONS.length
    const target = REGIONS[i][1]
    if (!target) { cur?.blur?.(); focusArea.value = 'canvas'; return }
    const el = document.querySelector(target)
    if (el) { el.focus(); focusArea.value = target === '.thumbs' ? 'thumbs' : focusArea.value; return }
  }
}
function onKeyDown (e) {
  if (e.defaultPrevented || e.isComposing) return
  if (showing.value && e.key === 'Escape') return
  const dlg = dialog.value
  if (dlg && dlg.type !== 'find') return
  if (e.key === 'F6' && !backstage.value) { e.preventDefault(); cycleFocus(e.shiftKey ? -1 : 1); return }
  const t = e.target
  // a button or link that has the keyboard focus gets Tab, Enter, Space and the arrows, not the slide; Esc goes back to the slide
  if (t.closest?.('button, a[href]') && !t.closest('.outline, .sorter, .thumbs') && !e.ctrlKey && !e.metaKey && !e.altKey && !/^F\d/.test(e.key)) {
    if (e.key === 'Escape') { e.preventDefault(); t.blur() }
    return
  }
  const id = commandForKey(e)
  const cmd = id ? CMDS[id] : null
  if (backstage.value) {
    if (cmd && cmd.global && !/^edit\./.test(id)) { e.preventDefault(); runCmd(id) }
    return
  }
  const inEditor = !!t.closest?.('[data-editor]')
  const inField = !inEditor && !!t.closest?.('input, textarea, select, [contenteditable="true"], .combo')
  if (inEditor) {
    // typing on a slide: formatting shortcuts and window commands, the editor handles the rest
    if (cmd && (cmd.global || /^(fmt|para)\./.test(id))) { e.preventDefault(); runCmd(id) }
    return
  }
  if (inField) {
    if (cmd && cmd.global && !/^edit\.(undo|redo)$/.test(id)) { e.preventDefault(); runCmd(id) }
    return
  }
  if (cmd) { e.preventDefault(); runCmd(id); return }
  if (!e.ctrlKey && !e.metaKey && canvasKey(e)) e.preventDefault()
  else if ((e.ctrlKey || e.metaKey) && e.key.startsWith('Arrow') && canvasKey(e)) e.preventDefault()
}

// ---------------- layout ----------------
export function App () {
  const d = doc.value
  const [thumbW, setThumbW] = useState(() => store.get('thumbW', 196))
  const [notesH, setNotesH] = useState(() => store.get('notesH', 110))
  const [paneW, setPaneW] = useState(() => store.get('paneW', 330))
  const base = useRef(null)
  useEffect(() => {
    startUp()
    window.addEventListener('keydown', onKeyDown)
    const drop = e => { if (!e.target.closest?.('.stage')) e.preventDefault() }
    window.addEventListener('dragover', drop)
    window.addEventListener('drop', e => {
      if (e.target.closest?.('.stage')) return
      e.preventDefault()
      const f = [...(e.dataTransfer?.files || [])].map(x => native?.pathForFile(x)).find(p => p && F.OPEN_EXT.includes(F.extOf(p)))
      if (f) F.openPath(f)
    })
    const stop = effect(() => { document.documentElement.dataset.view = view.value })
    return () => { window.removeEventListener('keydown', onKeyDown); stop() }
  }, [])
  const drag = (get, set, key, min, max, dir = 1) => ({
    onDrag: dx => { if (base.current === null) base.current = get; set(clamp(base.current + dx * dir, min, max)) },
    onEnd: () => { base.current = null; set(v => { store.set(key, v); return v }) }
  })
  const p = pane.value
  const v = view.value
  return (
    <>
      <div class="app" data-pane={p || ''} data-gray={grayscale.value || undefined}>
        <TitleBar />
        <Ribbon />
        <div class="workspace">
          {!d ? <div class="ws-empty" /> : v === 'sorter' ? <Sorter /> : (
            <>
              <section class="panel panel-thumbs" style={{ width: thumbW + 'px' }}>
                {v === 'outline' ? <Outline /> : <Thumbs width={thumbW} />}
              </section>
              <Splitter dir="v" tip="Drag to resize" {...drag(thumbW, setThumbW, 'thumbW', 120, 420)} />
              <div class="center">
                <section class="panel panel-stage" onPointerDown={() => { focusArea.value = 'canvas' }}>
                  <Stage />
                  <PreviewOverlay />
                </section>
                {showNotes.value && <>
                  <Splitter dir="h" {...drag(notesH, setNotesH, 'notesH', 48, 420, -1)} />
                  <section class="panel panel-notes" style={{ height: notesH + 'px' }}><Notes /></section>
                </>}
              </div>
              {p && <>
                <Splitter dir="v" {...drag(paneW, setPaneW, 'paneW', 260, 520, -1)} />
                <div class="panel panel-right" style={{ width: paneW + 'px' }}><RightPane /></div>
              </>}
            </>
          )}
        </div>
        <StatusBar />
        <Backstage />
      </div>
      <Dialogs />
      <PopLayer />
      <TipLayer />
      <Toasts />
      <BusyLayer />
      {printJob.value && <div class="print-root"><PrintPages docObj={printJob.value.doc} opts={printJob.value.opts} /></div>}
    </>
  )
}

// ---------------- transition / animation preview on the canvas ----------------
function PreviewOverlay () {
  const req = previewReq.value
  const d = doc.value
  const [box, setBox] = useState(null)
  useLayoutEffect(() => {
    if (!req) { setBox(null); return }
    const f = document.querySelector('.panel-stage .slide-frame')
    const host = document.querySelector('.panel-stage')
    if (!f || !host) { previewReq.value = null; return }
    const r = f.getBoundingClientRect(), h = host.getBoundingClientRect()
    setBox({ left: r.left - h.left, top: r.top - h.top, w: r.width, h: r.height })
  }, [req])
  if (!req || !box || !d) return null
  return (
    <div class="preview-ov" style={{ left: box.left + 'px', top: box.top + 'px', width: box.w + 'px', height: box.h + 'px' }} onPointerDown={e => { e.stopPropagation(); previewReq.value = null }}>
      <Show key={JSON.stringify(req) + slideIdx.value} doc={d} start={slideIdx.value} mode="preview" previewKind={req.kind} fit={{ w: box.w, h: box.h }} master={false} toolbar={false} onEnd={() => { previewReq.value = null }} />
    </div>
  )
}

// ---------------- slide sorter ----------------
function Sorter () {
  const d = doc.value
  const [dropAt, setDropAt] = useState(null)
  const [size, setSize] = useState(() => store.get('sorterW', 230))
  const cur = slideIdx.value
  const sel = slideSel.value.length ? slideSel.value : [d.slides[cur]?.id]
  const click = (e, i, s) => {
    focusArea.value = 'thumbs'
    if (e.ctrlKey || e.metaKey) { slideSel.value = sel.includes(s.id) ? sel.filter(x => x !== s.id) : [...sel, s.id]; return }
    if (e.shiftKey) { const a = Math.min(cur, i), b = Math.max(cur, i); slideSel.value = d.slides.slice(a, b + 1).map(x => x.id); return }
    goSlide(i)
  }
  const over = (e, i) => {
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    setDropAt(e.clientX < r.left + r.width / 2 ? i : i + 1)
  }
  const dropIt = e => {
    e.preventDefault()
    if (dropAt !== null) A.moveSlides(sel, dropAt)
    setDropAt(null)
  }
  const menu = (e, i) => {
    if (!sel.includes(d.slides[i].id)) goSlide(i)
    contextMenu(e, [
      { label: 'Open in Normal view', icon: 'layout-panel-left', run: () => { goSlide(i); view.value = 'normal' } },
      { sep: true },
      { label: 'Duplicate slide', icon: 'copy-plus', run: () => A.duplicateSlides(slideSel.value) },
      { label: slideSel.value.length > 1 ? 'Delete slides' : 'Delete slide', icon: 'trash-2', danger: true, run: () => A.deleteSlides(slideSel.value) },
      { label: d.slides[i].hidden ? 'Show slide' : 'Hide slide', icon: d.slides[i].hidden ? 'eye' : 'eye-off', run: () => A.toggleHideSlides(slideSel.value) }
    ])
  }
  return (
    <section class="panel panel-sorter" onPointerDown={() => { focusArea.value = 'thumbs' }}>
      <div class="sorter-bar">
        <span class="sorter-t">{d.slides.length} slides</span>
        <span class="rtabs-fill" />
        <Icon name="image" size={13} />
        <input type="range" class="slider" aria-label="Thumbnail size" min="150" max="420" value={size} style={{ width: '140px', '--p': ((size - 150) / 270 * 100) + '%' }} onInput={e => { setSize(+e.currentTarget.value); store.set('sorterW', +e.currentTarget.value) }} />
        <Icon name="image" size={17} />
      </div>
      <div class="sorter" onDragOver={e => e.preventDefault()} onDrop={dropIt}>
        {d.slides.map((s, i) => (
          <div key={s.id} class={'so-item' + (i === cur ? ' cur' : '') + (sel.includes(s.id) ? ' sel' : '') + (s.hidden ? ' hid' : '') + (dropAt === i ? ' drop-before' : '') + (dropAt === i + 1 && i === d.slides.length - 1 ? ' drop-after' : '')}
            draggable onDragStart={e => { if (!sel.includes(s.id)) slideSel.value = [s.id]; e.dataTransfer.effectAllowed = 'move' }} onDragOver={e => over(e, i)} onDragEnd={() => setDropAt(null)}
            onClick={e => click(e, i, s)} onDblClick={() => { goSlide(i); view.value = 'normal' }} onContextMenu={e => menu(e, i)}>
            <div class="so-thumb"><SlideThumb slide={s} theme={d.theme} size={d.size} hf={d.hf} index={i} w={size} ctx="so" /></div>
            <div class="so-meta">
              <span class="so-n">{i + 1}</span>
              {s.hidden && <Icon name="eye-off" size={13} />}
              {s.transition && <Icon name="sparkle" size={13} />}
              {s.advanceAfter ? <span class="so-time">{Math.floor(s.advanceAfter / 60)}:{String(Math.round(s.advanceAfter % 60)).padStart(2, '0')}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------- outline ----------------
function Outline () {
  const d = doc.value
  const cur = slideIdx.value
  const ref = useRef(null)
  useLayoutEffect(() => { ref.current?.querySelector('.ol-item.cur')?.scrollIntoView({ block: 'nearest' }) }, [cur])
  return (
    <div class="outline" ref={ref}>
      {d.slides.map((s, i) => {
        const title = s.elements.find(e => e.ph === 'title' || e.ph === 'ctrTitle')
        const body = s.elements.filter(e => e !== title && (e.type === 'text' || e.type === 'shape') && e.html)
        const lines = body.flatMap(e => textOf(e.html).split('\n').map(x => x.trim()).filter(Boolean))
        return (
          <button key={s.id} class={'ol-item' + (i === cur ? ' cur' : '') + (s.hidden ? ' hid' : '')} onClick={() => goSlide(i)} onDblClick={() => { goSlide(i); if (title) { editorReq.value = { mode: 'end' }; select([title.id]); editing.value = title.id } }}>
            <span class="ol-n">{i + 1}</span>
            <span class="ol-body">
              <b>{title ? textOf(title.html).trim() || 'Untitled slide' : 'Untitled slide'}</b>
              {lines.slice(0, 12).map((l, j) => <span key={j}>{l}</span>)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------- toasts & busy ----------------
const TOAST_ICON = { info: 'circle-check', error: 'circle-alert', warn: 'triangle-alert' }
function Toasts () {
  const list = toasts.value
  if (!list.length) return null
  const close = id => { toasts.value = toasts.value.filter(t => t.id !== id) }
  return (
    <div class="toasts" role="status">
      {list.map(t => (
        <div key={t.id} class={'toast toast-' + t.kind}>
          <Icon name={TOAST_ICON[t.kind] || 'info'} size={17} />
          <span class="toast-t">{t.text}</span>
          {t.action && <button class="toast-a" onClick={() => { close(t.id); t.action.run() }}>{t.action.label}</button>}
          <button class="toast-x" onClick={() => close(t.id)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      ))}
    </div>
  )
}
function BusyLayer () {
  const b = busy.value
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!b) { setLate(false); return }
    const t = setTimeout(() => setLate(true), 350)
    return () => clearTimeout(t)
  }, [!!b])
  if (!b) return null
  return (
    <div class={'busy' + (late ? ' late' : '')}>
      <div class="busy-bar" />
      {late && <div class="busy-card"><span class="spin-ring" /><span>{b.label || 'Working…'}</span></div>}
    </div>
  )
}

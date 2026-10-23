// Window chrome: title bar (quick access + search), status bar, notes pane and splitters.
import { useRef, useState, useEffect } from 'preact/hooks'
import { computed } from '@preact/signals'
import {
  doc, file, dirty, slideIdx, slide, canUndo, canRedo, zoom, fitZoom, view, pane, showNotes, searchOpen, appInfo, busy, focusArea, native, settings
} from '../core/store.js'
import { Icon } from './Icon.jsx'
import { t as tr } from '../i18n.js'
import { Btn, Slider } from './controls.jsx'
import { closePop, togglePop } from './popover.jsx'
import { CMDS, runCmd, cmdEnabled, zoomBy, uiShown } from '../app/commands.js'
import * as A from '../core/actions.js'

const keep = e => e.preventDefault()

export function TitleBar () {
  const f = file.value
  const nameRef = useRef(null)
  const showFile = () => togglePop(nameRef.current, () => (
    <div class="fileinfo">
      <div class="fi-name">{f.name}</div>
      <div class="fi-path">{f.path || 'Not saved yet'}</div>
      <div class="fi-row">
        <button class="btn" onClick={() => { closePop(); runCmd('file.saveAs') }}><Icon name="save-all" size={15} />Save as…</button>
        {f.path && <button class="btn" onClick={() => { closePop(); native.showInFolder(f.path) }}><Icon name="folder-open" size={15} />Show in folder</button>}
      </div>
    </div>
  ), { placement: 'bottom-start' })
  return (
    <header class={'titlebar plat-' + (appInfo.value.platform || 'win32')}>
      <div class="tb-left">
        <img class="tb-mark" src="mark.svg" alt="" draggable={false} />
        <div class="qat">
          <Btn icon="save" tip="Save" kbd="Ctrl+S" onClick={() => runCmd('file.save')} />
          <Btn icon="undo-2" tip="Undo" kbd="Ctrl+Z" onClick={() => runCmd('edit.undo')} disabled={!canUndo.value} />
          <Btn icon="redo-2" tip="Redo" kbd="Ctrl+Y" onClick={() => runCmd('edit.redo')} disabled={!canRedo.value} />
          <Btn icon="play" tip="Start from beginning" kbd="F5" onClick={() => runCmd('show.start')} cls="qat-play" />
        </div>
      </div>
      <div class="tb-center">
        <button class="tb-doc" ref={nameRef} onClick={showFile} onMouseDown={keep}>
          <span class="tb-name">{f.name}</span>
          <span class={'tb-state' + (dirty.value ? ' unsaved' : '')}>{busy.value ? busy.value.label : dirty.value ? (f.path ? 'Edited' : 'Not saved') : (f.path ? 'Saved' : '')}</span>
          <Icon name="chevron-down" size={12} />
        </button>
      </div>
      <div class="tb-right">
        <Search />
        <Btn icon={uiShown.value === 'light' ? 'moon' : 'sun'} tip={uiShown.value === 'light' ? 'Dark interface' : 'Light interface'} onClick={() => runCmd('view.uiTheme')} cls="tb-theme" />
      </div>
      <div class="tb-wco" />
    </header>
  )
}

// "Tell me" search: finds commands by name and runs them
const searchable = computed(() => Object.values(CMDS).filter(c => c.label))
function Search () {
  const ref = useRef(null)
  const inp = useRef(null)
  const [q, setQ] = useState('')
  const [act, setAct] = useState(0)
  const results = () => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    const words = t.split(/\s+/)
    return searchable.value.filter(c => { const l = (c.label + ' ' + tr(c.label) + ' ' + (c.tags || '')).toLowerCase(); return words.every(w => l.includes(w)) }).slice(0, 9)
  }
  const list = results()
  const run = c => { setQ(''); inp.current?.blur(); searchOpen.value = false; runCmd(c.id) }
  useEffect(() => { setAct(0) }, [q])
  return (
    <div class={'tb-search' + (q ? ' has' : '')} ref={ref}>
      <Icon name="search" size={15} />
      <input ref={inp} value={q} placeholder="Search commands" spellcheck={false}
        onInput={e => setQ(e.currentTarget.value)}
        onFocus={() => { searchOpen.value = true; focusArea.value = 'search' }}
        onBlur={() => setTimeout(() => { searchOpen.value = false }, 150)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setQ(''); e.currentTarget.blur() }
          if (e.key === 'ArrowDown') { e.preventDefault(); setAct(a => Math.min(list.length - 1, a + 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAct(a => Math.max(0, a - 1)) }
          if (e.key === 'Enter' && list[act]) run(list[act])
        }} />
      <kbd>Alt+Q</kbd>
      {q && searchOpen.value && (
        <div class="search-res">
          {list.length === 0 && <div class="sr-empty">No commands match “{q}”.</div>}
          {list.map((c, i) => (
            <button key={c.id} class={'mi' + (i === act ? ' act' : '')} disabled={!cmdEnabled(c.id)} onMouseDown={keep} onClick={() => run(c)} onMouseEnter={() => setAct(i)}>
              <span class="mi-ic">{c.icon && <Icon name={c.icon} size={16} />}</span>
              <span class="mi-l">{c.label}</span>
              {c.keys && <span class="mi-k">{c.keys}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function StatusBar () {
  const d = doc.value
  if (!d) return <footer class="statusbar" />
  const n = d.slides.length
  const z = zoom.value || fitZoom.value
  const s = slide.value
  const v = view.value
  const vb = (id, icon, tip, on) => <button class={'sb-btn' + (on ? ' on' : '')} onMouseDown={keep} onClick={() => runCmd(id)} data-tip={tip}><Icon name={icon} size={15} /></button>
  return (
    <footer class="statusbar">
      <div class="sb-left">
        <span class="sb-txt">{`Slide ${slideIdx.value + 1} of ${n}`}</span>
        {s?.hidden && <span class="sb-chip"><Icon name="eye-off" size={12} />Hidden</span>}
        {d.theme?.name && <span class="sb-txt sb-dim">{d.theme.id === 'imported' ? 'Imported design' : d.theme.name}</span>}
      </div>
      <div class="sb-right">
        <button class={'sb-btn sb-lbl' + (showNotes.value ? ' on' : '')} onMouseDown={keep} onClick={() => runCmd('view.notes')} data-tip="Show or hide speaker notes"><Icon name="notebook-pen" size={14} />Notes</button>
        <button class={'sb-btn sb-lbl' + (pane.value === 'comments' ? ' on' : '')} onMouseDown={keep} onClick={() => runCmd('view.comments')} data-tip="Comments"><Icon name="messages-square" size={14} />Comments</button>
        <span class="sb-div" />
        {vb('view.normal', 'layout-panel-left', 'Normal', v === 'normal')}
        {vb('view.sorter', 'layout-grid', 'Slide sorter', v === 'sorter')}
        {vb('view.reading', 'book-open', 'Reading view', false)}
        {vb('show.current', 'presentation', 'Slide show from this slide (Shift+F5)', false)}
        <span class="sb-div" />
        <button class="sb-btn" onMouseDown={keep} onClick={() => zoomBy(-1)} data-tip="Zoom out"><Icon name="minus" size={14} /></button>
        <Slider label="Zoom" value={Math.round(Math.log2(z) * 100)} min={-332} max={200} step={1} width={110} onChange={val => { zoom.value = Math.round(2 ** (val / 100) * 100) / 100 }} />
        <button class="sb-btn" onMouseDown={keep} onClick={() => zoomBy(1)} data-tip="Zoom in"><Icon name="plus" size={14} /></button>
        <button class="sb-btn sb-zoom" onMouseDown={keep} onClick={() => runCmd('view.zoom')} data-tip="Zoom level">{Math.round(z * 100)}%</button>
        <button class={'sb-btn' + (zoom.value === 0 ? ' on' : '')} onMouseDown={keep} onClick={() => runCmd('view.fit')} data-tip="Fit slide to current window"><Icon name="scan" size={15} /></button>
      </div>
    </footer>
  )
}

export function Notes () {
  const s = slide.value
  const [val, setVal] = useState(s?.notes || '')
  const ref = useRef(null)
  const sid = s?.id
  useEffect(() => setVal(s?.notes || ''), [sid]) // another slide: show its notes even while the box has focus
  useEffect(() => { if (document.activeElement !== ref.current) setVal(s?.notes || '') }, [s?.notes])
  if (!s) return null
  return (
    <div class="notes">
      <textarea ref={ref} value={val} placeholder="Click to add notes" spellcheck={settings.value.spellcheck !== false}
        onFocus={() => { focusArea.value = 'notes' }}
        onInput={e => { setVal(e.currentTarget.value); A.setNotes(e.currentTarget.value) }} />
    </div>
  )
}

// Drag handle between panes. `onDrag(dx|dy)` receives the delta from the start value.
export function Splitter ({ dir = 'v', onDrag, onEnd, tip }) {
  const down = e => {
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const sx = e.clientX, sy = e.clientY
    document.body.classList.add(dir === 'v' ? 'resizing-v' : 'resizing-h')
    const move = ev => onDrag(dir === 'v' ? ev.clientX - sx : ev.clientY - sy, true)
    const up = () => {
      document.body.classList.remove('resizing-v', 'resizing-h')
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up)
      onEnd && onEnd()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  return <div class={'splitter splitter-' + dir} onPointerDown={down} data-tip={tip} />
}

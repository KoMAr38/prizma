// Slide thumbnails (left pane): select, multi-select, drag to reorder, context menu, lazy rendering.
import { memo } from 'preact/compat'
import { useRef, useState, useEffect, useLayoutEffect } from 'preact/hooks'
import { doc, slideIdx, slideSel, goSlide, focusArea, select, finishEditing } from '../core/store.js'
import { PX } from '../core/model.js'
import { SlideView } from '../render/SlideView.jsx'
import { LAYOUTS } from '../core/themes.js'
import * as A from '../core/actions.js'
import { contextMenu } from './popover.jsx'
import { Icon } from './Icon.jsx'
import { runCmd } from '../app/commands.js'

// Renders a slide scaled into a box of width `w` (px). Memoised on the slide object.
export const SlideThumb = memo(function SlideThumb ({ slide, theme, size, hf, index, w, ctx = 'th', mode = 'thumb' }) {
  const scale = w / (size.w * PX)
  const docObj = { size, theme, hf }
  return (
    <div class="thumb-box" style={{ width: w + 'px', height: size.h * PX * scale + 'px' }}>
      <div class="thumb-scale" style={{ transform: `scale(${scale})` }}>
        <SlideView slide={slide} docObj={docObj} mode={mode} ctx={ctx + slide.id} index={index} />
      </div>
    </div>
  )
}, (a, b) => a.slide === b.slide && a.theme === b.theme && a.size === b.size && a.hf === b.hf && a.index === b.index && a.w === b.w)

// Only render thumbnails near the viewport
function Lazy ({ h, children, root }) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    if (vis) return
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { setVis(true); io.disconnect() } }, { root: root?.current || null, rootMargin: '600px 0px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [vis])
  return <div ref={ref} style={{ minHeight: vis ? undefined : h + 'px' }}>{vis ? children : null}</div>
}

export function Thumbs ({ width }) {
  const d = doc.value
  const listRef = useRef(null)
  const [dragI, setDragI] = useState(null) // drop insertion index while dragging
  const dragRef = useRef(null)
  const cur = slideIdx.value
  useLayoutEffect(() => {
    // keep the current slide visible
    const el = listRef.current?.querySelector(`.th[data-i="${cur}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [cur, d?.slides.length])
  if (!d) return null
  const tw = Math.max(80, width - 54)
  const th = d.size.h / d.size.w * tw
  const sel = slideSel.value.length ? slideSel.value : [d.slides[cur]?.id]
  const onDown = (e, i, s) => {
    focusArea.value = 'thumbs'
    if (e.button === 2) { if (!sel.includes(s.id)) { goSlide(i); slideSel.value = [s.id] } return }
    if (e.ctrlKey || e.metaKey) {
      slideSel.value = sel.includes(s.id) ? sel.filter(x => x !== s.id) : [...sel, s.id]
      if (!slideSel.value.length) slideSel.value = [s.id]
      return
    }
    if (e.shiftKey) {
      const a = Math.min(cur, i), b = Math.max(cur, i)
      slideSel.value = d.slides.slice(a, b + 1).map(x => x.id)
      return
    }
    if (!sel.includes(s.id) || sel.length === 1) { goSlide(i); slideSel.value = [s.id] } else { finishEditing(); slideIdx.value = i; select([]) }
    dragRef.current = { i, y: e.clientY, active: false, ids: sel.includes(s.id) ? sel : [s.id] }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = e => {
    const g = dragRef.current
    if (!g) return
    if (!g.active && Math.abs(e.clientY - g.y) < 6) return
    g.active = true
    const items = [...listRef.current.querySelectorAll('.th')]
    let at = items.length
    for (const [j, it] of items.entries()) { const r = it.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { at = j; break } }
    setDragI(at)
    const lr = listRef.current.getBoundingClientRect()
    if (e.clientY < lr.top + 30) listRef.current.scrollTop -= 12
    if (e.clientY > lr.bottom - 30) listRef.current.scrollTop += 12
  }
  const onUp = () => {
    const g = dragRef.current
    dragRef.current = null
    if (g && g.active && dragI !== null) A.moveSlides(g.ids, dragI)
    setDragI(null)
  }
  const menu = (e, i) => {
    contextMenu(e, [
      { label: 'Cut', icon: 'scissors', kbd: 'Ctrl+X', run: () => { focusArea.value = 'thumbs'; runCmd('edit.cut') } },
      { label: 'Copy', icon: 'copy', kbd: 'Ctrl+C', run: () => { focusArea.value = 'thumbs'; runCmd('edit.copy') } },
      { label: 'Paste', icon: 'clipboard-paste', kbd: 'Ctrl+V', run: () => runCmd('edit.paste') },
      { sep: true },
      { label: 'New slide', icon: 'square-plus', kbd: 'Ctrl+M', run: () => A.addSlide() },
      { label: 'Duplicate slide', icon: 'copy-plus', run: () => A.duplicateSlides(slideSel.value) },
      { label: slideSel.value.length > 1 ? 'Delete slides' : 'Delete slide', icon: 'trash-2', danger: true, run: () => A.deleteSlides(slideSel.value) },
      { sep: true },
      { label: 'Layout', icon: 'layout-template', sub: LAYOUTS.map(l => ({ label: l.name, checked: d.slides[i]?.layout === l.id, run: () => A.setLayout(l.id, slideSel.value) })) },
      { label: 'Reset slide', icon: 'rotate-ccw', run: () => A.resetSlide() },
      { label: 'Format background…', icon: 'paint-bucket', run: () => runCmd('design.bg') },
      { sep: true },
      { label: d.slides[i]?.hidden ? 'Show slide' : 'Hide slide', icon: d.slides[i]?.hidden ? 'eye' : 'eye-off', run: () => A.toggleHideSlides(slideSel.value) }
    ])
  }
  const emptyMenu = e => {
    if (e.target.closest('.th')) return
    contextMenu(e, [{ label: 'New slide', icon: 'square-plus', kbd: 'Ctrl+M', run: () => A.addSlide() }, { label: 'Paste', icon: 'clipboard-paste', kbd: 'Ctrl+V', run: () => runCmd('edit.paste') }])
  }
  return (
    <div class="thumbs" ref={listRef} tabIndex={-1} onPointerDown={() => { focusArea.value = 'thumbs' }} onContextMenu={emptyMenu}>
      {d.slides.map((s, i) => (
        <div key={s.id} class={'th' + (i === cur ? ' cur' : '') + (sel.includes(s.id) ? ' sel' : '') + (s.hidden ? ' hid' : '')} data-i={i}
          onPointerDown={e => onDown(e, i, s)} onPointerMove={onMove} onPointerUp={onUp} onContextMenu={e => menu(e, i)}>
          {dragI === i && <div class="th-drop" />}
          <div class="th-side">
            <span class="th-n">{i + 1}</span>
            {s.transition && <Icon name="sparkle" size={11} class="th-fx" title="Has a transition" />}
            {s.animations?.length > 0 && <Icon name="star" size={11} class="th-fx" title="Has animations" />}
            {s.comments?.length > 0 && <Icon name="message-square" size={11} class="th-fx" />}
          </div>
          <Lazy h={th} root={listRef}>
            <SlideThumb slide={s} theme={d.theme} size={d.size} hf={d.hf} index={i} w={tw} />
          </Lazy>
        </div>
      ))}
      {dragI === d.slides.length && <div class="th-drop th-drop-end" />}
      <div class="th-add" onClick={() => A.addSlide()} data-tip="New slide" data-kbd="Ctrl+M"><Icon name="plus" size={16} /></div>
    </div>
  )
}

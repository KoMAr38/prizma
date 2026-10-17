// Floating layers: popovers (dropdowns, galleries, colour pickers), context menus and tooltips.
import { signal } from '@preact/signals'
import { useLayoutEffect, useRef, useEffect, useState } from 'preact/hooks'
import { Icon } from './Icon.jsx'

export const pop = signal(null) // { anchor: DOMRect | {x,y}, render, placement, cls, owner }
let popSeq = 0

export function openPop (anchor, render, opts = {}) {
  const rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor
  pop.value = { id: ++popSeq, anchor: rect, owner: anchor && anchor.getBoundingClientRect ? anchor : null, render, placement: opts.placement || 'bottom-start', cls: opts.cls || '', onClose: opts.onClose, width: opts.width }
}
export function closePop () {
  const p = pop.value
  if (!p) return
  pop.value = null
  p.onClose?.()
}
export const togglePop = (anchor, render, opts) => {
  const p = pop.value
  if (p && p.owner && anchor && p.owner === anchor) { closePop(); return }
  openPop(anchor, render, opts)
}
export const contextMenu = (e, items) => {
  e.preventDefault()
  openPop({ x: e.clientX, y: e.clientY, width: 0, height: 0, left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY }, () => <Menu items={items} />, { placement: 'point', cls: 'pop-menu' })
}

export function PopLayer () {
  const p = pop.value
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    setPos(null)
  }, [p && p.id])
  useLayoutEffect(() => {
    if (!p || !ref.current || pos) return
    const el = ref.current
    const r = p.anchor
    const w = el.offsetWidth, h = el.offsetHeight
    const vw = window.innerWidth, vh = window.innerHeight
    let x, y
    if (p.placement === 'point') { x = r.left; y = r.top }
    else if (p.placement === 'right-start') { x = r.right + 2; y = r.top }
    else if (p.placement === 'bottom-end') { x = r.right - w; y = r.bottom + 4 }
    else if (p.placement === 'top-start') { x = r.left; y = r.top - h - 4 }
    else { x = r.left; y = r.bottom + 4 }
    if (y + h > vh - 6) {
      if (p.placement === 'point') y = Math.max(6, vh - h - 6)
      else if (r.top - h - 4 > 6) y = r.top - h - 4
      else y = Math.max(6, vh - h - 6)
    }
    if (x + w > vw - 6) x = Math.max(6, (p.placement === 'right-start' ? r.left - w - 2 : vw - w - 6))
    setPos({ x: Math.max(6, x), y: Math.max(6, y) })
  })
  useEffect(() => {
    if (!p) return
    const down = e => {
      if (ref.current && ref.current.contains(e.target)) return
      if (p.owner && p.owner.contains && p.owner.contains(e.target)) return
      closePop()
    }
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); closePop() } }
    const blur = () => closePop()
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', blur)
    window.addEventListener('resize', blur)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', blur)
      window.removeEventListener('resize', blur)
    }
  }, [p && p.id])
  if (!p) return null
  return (
    <div ref={ref} class={'pop ' + p.cls} style={{ left: (pos ? pos.x : -9999) + 'px', top: (pos ? pos.y : -9999) + 'px', minWidth: p.width ? p.width + 'px' : undefined }} onContextMenu={e => e.preventDefault()}>
      {p.render()}
    </div>
  )
}

// ---------- menus ----------
// item: { label, icon, kbd, run, checked, disabled, sep, sub: [items] | () => node, danger, hint }
export function Menu ({ items, onDone, cls = '' }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(-1)
  const list = (typeof items === 'function' ? items() : items).filter(Boolean)
  useLayoutEffect(() => {
    // focus the first item so the keyboard works immediately
    const b = ref.current && ref.current.querySelector(':scope > .mi:not([disabled])')
    if (b && !ref.current.closest('.pop-sub')) b.focus({ preventScroll: true })
  }, [])
  const onKey = e => {
    const btns = [...ref.current.querySelectorAll(':scope > .mi:not([disabled])')]
    const i = btns.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus() }
    else if (e.key === 'ArrowRight') { const idx = +document.activeElement?.dataset?.idx; if (list[idx]?.sub) { e.preventDefault(); setOpen(idx) } }
    else if (e.key === 'ArrowLeft' && ref.current.closest('.pop-sub')) { e.preventDefault(); e.stopPropagation(); ref.current.closest('.mi-wrap')?.querySelector(':scope > .mi')?.focus() }
  }
  const done = () => { if (onDone) onDone(); else closePop() }
  return (
    <div class={'menu ' + cls} ref={ref} onKeyDown={onKey} role="menu">
      {list.map((it, i) => {
        if (it.sep) return <div class="msep" key={'s' + i} />
        if (it.header) return <div class="mhead" key={'h' + i}>{it.header}</div>
        if (it.node) return <div class="mnode" key={'n' + i}>{it.node}</div>
        const btn = (
          <button key={'b' + i} class={'mi' + (it.danger ? ' danger' : '') + (open === i ? ' open' : '')} data-idx={i} disabled={it.disabled}
            onMouseDown={e => e.preventDefault()}
            onMouseEnter={() => setOpen(it.sub ? i : -1)}
            onClick={() => { if (it.sub) { setOpen(i); return } done(); it.run && it.run() }} role="menuitem">
            <span class="mi-ic">{it.checked ? <Icon name="check" size={15} /> : it.icon ? (typeof it.icon === 'string' ? <Icon name={it.icon} size={16} /> : it.icon) : null}</span>
            <span class="mi-l">{it.label}{it.hint && <small>{it.hint}</small>}</span>
            {it.kbd && <span class="mi-k">{it.kbd}</span>}
            {it.sub && <Icon name="chevron-right" size={14} class="mi-sub" />}
          </button>
        )
        if (!it.sub) return btn
        return (
          <div class="mi-wrap" key={'w' + i}>
            {btn}
            {open === i && <SubMenu content={it.sub} onDone={done} />}
          </div>
        )
      })}
    </div>
  )
}
function SubMenu ({ content, onDone }) {
  const ref = useRef(null)
  const [flip, setFlip] = useState(false)
  useLayoutEffect(() => {
    const r = ref.current.getBoundingClientRect()
    if (r.right > window.innerWidth - 6) setFlip(true)
    if (r.bottom > window.innerHeight - 6) ref.current.style.top = Math.min(0, window.innerHeight - 6 - r.bottom) + 'px'
  }, [])
  return (
    <div class={'pop pop-sub' + (flip ? ' flip' : '')} ref={ref}>
      {Array.isArray(content) ? <Menu items={content} onDone={onDone} /> : content()}
    </div>
  )
}

// ---------- tooltips ----------
const tip = signal(null)
let tipTimer = 0
export function TipLayer () {
  useEffect(() => {
    const over = e => {
      const t = e.target.closest?.('[data-tip]')
      clearTimeout(tipTimer)
      if (!t) { if (tip.value) tip.value = null; return }
      if (tip.value && tip.value.el === t) return
      tipTimer = setTimeout(() => {
        if (!t.isConnected || pop.value) return
        const r = t.getBoundingClientRect()
        tip.value = { el: t, text: t.dataset.tip, kbd: t.dataset.kbd, desc: t.dataset.desc, x: r.left, y: r.bottom + 6, top: r.top }
      }, tip.value ? 120 : 650)
    }
    const hide = () => { clearTimeout(tipTimer); tip.value = null }
    document.addEventListener('mouseover', over)
    document.addEventListener('mousedown', hide, true)
    document.addEventListener('wheel', hide, true)
    window.addEventListener('blur', hide)
    return () => { document.removeEventListener('mouseover', over); document.removeEventListener('mousedown', hide, true); document.removeEventListener('wheel', hide, true); window.removeEventListener('blur', hide) }
  }, [])
  const t = tip.value
  const ref = useRef(null)
  const [p, setP] = useState(null)
  useLayoutEffect(() => {
    if (!t || !ref.current) { setP(null); return }
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight
    let x = Math.min(t.x, window.innerWidth - w - 8), y = t.y
    if (y + h > window.innerHeight - 8) y = t.top - h - 6
    setP({ x: Math.max(8, x), y })
  }, [t])
  if (!t || !t.text) return null
  return (
    <div class="tip" ref={ref} style={{ left: (p ? p.x : -999) + 'px', top: (p ? p.y : -999) + 'px' }}>
      <b>{t.text}</b>{t.kbd && <span class="tip-k">{t.kbd}</span>}
      {t.desc && <div class="tip-d">{t.desc}</div>}
    </div>
  )
}

// Shared controls: ribbon buttons, split buttons, galleries, colour picker, combo boxes, number fields.
import { useRef, useState, useEffect } from 'preact/hooks'
import { Icon } from './Icon.jsx'
import { openPop, togglePop, closePop, Menu } from './popover.jsx'
import { SLOTS, SLOT_LABEL, STANDARD_COLORS, hexColor, luminance, cssColor } from '../core/model.js'
import { theme as themeSig, recentColors, fonts, settings } from '../core/store.js'

const keep = e => e.preventDefault() // keep focus (and the text selection) in the editor

export function Btn ({ icon, label, size = 'sm', onClick, active, disabled, tip, kbd, desc, cls = '', iconSize, caret, children, style, iconStyle }) {
  return (
    <button type="button" class={`b b-${size}${active ? ' on' : ''}${cls ? ' ' + cls : ''}`} disabled={disabled} onMouseDown={keep} onClick={onClick}
      data-tip={tip || label} data-kbd={kbd} data-desc={desc} style={style} aria-pressed={active ? 'true' : undefined}>
      {icon && (typeof icon === 'string' ? <Icon name={icon} size={iconSize || (size === 'lg' ? 26 : 16)} stroke={size === 'lg' ? 1.5 : 1.75} style={iconStyle} /> : icon)}
      {label && <span class="lbl">{label}{caret && size === 'lg' && <Icon name="chevron-down" size={11} class="caret" />}</span>}
      {caret && size !== 'lg' && <Icon name="chevron-down" size={11} class="caret" />}
      {children}
    </button>
  )
}
// Button that opens a popover (menu items array or render function)
export function Drop ({ menu, render, placement, popCls, width, ...p }) {
  const ref = useRef(null)
  const open = e => {
    const anchor = ref.current
    togglePop(anchor, render || (() => <Menu items={menu} />), { placement, cls: popCls || (render ? '' : 'pop-menu'), width })
  }
  return <span class="drop" ref={ref}><Btn {...p} caret onClick={open} /></span>
}
// Split button: main action + arrow for options
export function Split ({ onClick, menu, render, placement, popCls, size = 'sm', icon, label, tip, kbd, disabled, active, iconSize, desc, children }) {
  const ref = useRef(null)
  const open = () => togglePop(ref.current, render || (() => <Menu items={menu} />), { placement, cls: popCls || (render ? '' : 'pop-menu') })
  return (
    <span class={`split split-${size}${active ? ' on' : ''}`} ref={ref}>
      <Btn size={size} icon={icon} label={size === 'lg' ? undefined : label} onClick={onClick} disabled={disabled} tip={tip || label} kbd={kbd} desc={desc} iconSize={iconSize} cls="split-main">{children}</Btn>
      <button type="button" class={`b split-arrow split-arrow-${size}`} onMouseDown={keep} onClick={open} disabled={disabled} data-tip={(tip || label) + ' options'}>
        {size === 'lg' && label && <span class="lbl">{label}</span>}
        <Icon name="chevron-down" size={11} />
      </button>
    </span>
  )
}
export function Group ({ label, children, cls = '', launcher }) {
  return (
    <div class={'rg ' + cls}>
      <div class="rg-body">{children}</div>
      <div class="rg-label">
        <span>{label}</span>
        {launcher && <button class="rg-launch" onMouseDown={keep} onClick={launcher} data-tip={label + ' settings'}><Icon name="arrow-down-right" size={11} /></button>}
      </div>
    </div>
  )
}
export const Col = ({ children, cls = '' }) => <div class={'rc ' + cls}>{children}</div>
export const Row = ({ children, cls = '' }) => <div class={'rr ' + cls}>{children}</div>

// ---------- colours ----------
const TINTS = hex => {
  const L = luminance(hex)
  if (L < 0.02) return [50, 35, 25, 15, 5]
  if (L > 0.92) return [-5, -15, -25, -35, -50]
  return [80, 60, 40, -25, -50]
}
const tintLabel = v => v > 0 ? `Lighter ${v}%` : `Darker ${-v}%`
export function addRecentColor (c) {
  if (!c || !c.startsWith('#')) return
  recentColors.value = [c, ...recentColors.value.filter(x => x !== c)].slice(0, 10)
}
export function ColorPicker ({ value, onPick, none, noneLabel = 'No color', auto, autoLabel = 'Automatic', more = true, eyedropper = true }) {
  const t = themeSig.value
  const pick = c => { closePop(); onPick(c) }
  const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']
  const sw = (c, label, extra = '') => {
    const hex = hexColor(c, t)
    return <button key={c} class={'sw ' + extra + (value === c ? ' cur' : '')} style={{ background: hex }} onMouseDown={keep} onClick={() => pick(c)} data-tip={label} />
  }
  const moreColors = async () => {
    const input = document.createElement('input')
    input.type = 'color'
    input.value = value && value.startsWith('#') ? value : hexColor(value || 'accent1', t) || '#3DEBB0'
    input.addEventListener('change', () => { addRecentColor(input.value.toUpperCase()); onPick(input.value.toUpperCase()) })
    closePop()
    input.click()
  }
  const drop = async () => {
    closePop()
    try { const r = await new window.EyeDropper().open(); if (r?.sRGBHex) { const c = r.sRGBHex.toUpperCase(); addRecentColor(c); onPick(c) } } catch {}
  }
  return (
    <div class="cpick" onMouseDown={keep}>
      {auto && <button class="cp-wide" onClick={() => pick(null)}><span class="sw sw-auto" />{autoLabel}</button>}
      <div class="cp-h">Theme colors</div>
      <div class="cp-grid">
        {order.map(s => sw(s, `${SLOT_LABEL[s]} (${t?.colors?.[s] || ''})`, 'sw-top'))}
      </div>
      <div class="cp-tints">
        {[0, 1, 2, 3, 4].map(row => (
          <div class="cp-grid cp-row" key={row}>
            {order.map(s => { const v = TINTS(t?.colors?.[s] || '#888888')[row]; return sw(`${s}:${v}`, `${SLOT_LABEL[s]}, ${tintLabel(v)}`) })}
          </div>
        ))}
      </div>
      <div class="cp-h">Standard colors</div>
      <div class="cp-grid">{STANDARD_COLORS.map(c => sw(c, c))}</div>
      {recentColors.value.length > 0 && <><div class="cp-h">Recent colors</div><div class="cp-grid">{recentColors.value.map(c => sw(c, c))}</div></>}
      <div class="cp-actions">
        {none && <button class="cp-wide" onClick={() => pick('none')}><Icon name="ban" size={15} />{noneLabel}</button>}
        {more && <button class="cp-wide" onClick={moreColors}><Icon name="palette" size={15} />More colors…</button>}
        {eyedropper && window.EyeDropper && <button class="cp-wide" onClick={drop}><Icon name="pipette" size={15} />Eyedropper</button>}
      </div>
    </div>
  )
}
// Icon button with a colour bar (font colour, fill, outline, highlight)
export function ColorBtn ({ icon, value, onApply, onPick, tip, kbd, none, noneLabel, auto, size = 'sm', label, disabled }) {
  const ref = useRef(null)
  const t = themeSig.value
  const bar = !value || value === 'none' ? 'transparent' : (hexColor(value, t) || cssColor(value))
  const open = () => togglePop(ref.current, () => <ColorPicker value={value} onPick={onPick} none={none} noneLabel={noneLabel} auto={auto} />, { cls: 'pop-color' })
  return (
    <span class={'split split-' + size + ' cbtn'} ref={ref}>
      <button type="button" class="b b-sm split-main" onMouseDown={keep} onClick={() => onApply(value)} disabled={disabled} data-tip={tip} data-kbd={kbd}>
        <span class="cb-ic"><Icon name={icon} size={16} /><i style={{ background: bar, boxShadow: !value || value === 'none' ? 'inset 0 0 0 1px var(--line-strong)' : undefined }} /></span>
        {label && <span class="lbl">{label}</span>}
      </button>
      <button type="button" class="b split-arrow split-arrow-sm" onMouseDown={keep} onClick={open} disabled={disabled} data-tip={tip + ' options'}><Icon name="chevron-down" size={11} /></button>
    </span>
  )
}
export function Swatch ({ value, onPick, none, auto, tip }) {
  const ref = useRef(null)
  const t = themeSig.value
  const bg = !value || value === 'none' ? 'transparent' : hexColor(value, t)
  return (
    <button ref={ref} class="swatch-btn" data-tip={tip} onMouseDown={keep} onClick={() => togglePop(ref.current, () => <ColorPicker value={value} onPick={onPick} none={none} auto={auto} />, { cls: 'pop-color' })}>
      <span style={{ background: bg }} class={!value || value === 'none' ? 'empty' : ''} /><Icon name="chevron-down" size={12} />
    </button>
  )
}

// ---------- text inputs ----------
// Editable combo box (font name / font size)
export function Combo ({ value, placeholder, options, onChange, width = 120, renderOption, tip, filter = true, listWidth, cls = '' }) {
  const ref = useRef(null)
  const inp = useRef(null)
  const [text, setText] = useState(value ?? '')
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setText(value ?? '') }, [value, focus])
  const commit = v => { onChange(v); inp.current?.blur() }
  const list = () => {
    const opts = typeof options === 'function' ? options() : options
    return (
      <div class="combo-list" style={{ width: (listWidth || Math.max(width, 160)) + 'px' }} onMouseDown={keep}>
        {opts.map((o, i) => o.header
          ? <div class="mhead" key={'h' + i}>{o.header}</div>
          : <button key={i} class={'mi' + (String(o.value) === String(value) ? ' cur' : '')} onClick={() => { closePop(); onChange(o.value) }}>{renderOption ? renderOption(o) : <span class="mi-l">{o.label ?? o.value}</span>}</button>)}
      </div>
    )
  }
  return (
    <span class={'combo ' + cls} ref={ref} style={{ width: width + 'px' }} data-tip={tip}>
      <input ref={inp} value={focus ? text : (value ?? '')} placeholder={placeholder} spellcheck={false} aria-label={tip || placeholder}
        onFocus={e => { setFocus(true); setText(value ?? ''); e.currentTarget.select() }}
        onBlur={() => setFocus(false)}
        onInput={e => setText(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(text) } else if (e.key === 'Escape') { setText(value ?? ''); inp.current.blur() } }} />
      <button type="button" class="combo-btn" aria-label={`${tip || placeholder || ''} list`.trim()} onMouseDown={keep} onClick={() => togglePop(ref.current, list, { cls: 'pop-menu pop-combo' })}><Icon name="chevron-down" size={12} /></button>
    </span>
  )
}

const UNIT = { cm: [2.54 / 72, 'cm', 2], in: [1 / 72, '"', 2], pt: [1, ' pt', 1] }
export const unitFmt = (pt, u = settings.value.units || 'cm') => { const [k, suf, d] = UNIT[u] || UNIT.cm; return (Math.round(pt * k * 10 ** d) / 10 ** d) + suf }
export function unitParse (str, u = settings.value.units || 'cm') {
  const m = String(str).trim().replace(',', '.').match(/^(-?[\d.]+)\s*(cm|mm|in|"|pt|px)?$/i)
  if (!m) return null
  const v = parseFloat(m[1])
  const unit = (m[2] || '').toLowerCase() || (u === 'in' ? 'in' : u)
  return unit === 'cm' ? v / 2.54 * 72 : unit === 'mm' ? v / 25.4 * 72 : unit === 'in' || unit === '"' ? v * 72 : unit === 'px' ? v * 0.75 : v
}
// Numeric field with spin buttons. `fmt`/`parse` convert between model values and display text.
export function NumField ({ value, onChange, step = 1, min = -Infinity, max = Infinity, fmt = v => String(v), parse = s => parseFloat(String(s).replace(',', '.')), width = 76, tip, label, icon, disabled }) {
  const [text, setText] = useState(null)
  const shown = text !== null ? text : (value === null || value === undefined || Number.isNaN(value) ? '' : fmt(value))
  const set = v => { if (v === null || Number.isNaN(v)) return; onChange(Math.max(min, Math.min(max, v))) }
  const bump = d => set((value || 0) + d * step)
  return (
    <span class={'num' + (disabled ? ' dis' : '')} style={{ width: width + 'px' }} data-tip={tip}>
      {icon && <Icon name={icon} size={14} class="num-ic" />}
      {label && <span class="num-l">{label}</span>}
      <input value={shown} disabled={disabled} spellcheck={false} aria-label={label || tip}
        onFocus={e => { setText(shown); e.currentTarget.select() }}
        onInput={e => setText(e.currentTarget.value)}
        onBlur={() => { if (text !== null) { const v = parse(text); if (v !== null && !Number.isNaN(v)) set(v) } setText(null) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { const v = parse(e.currentTarget.value); if (v !== null && !Number.isNaN(v)) set(v); setText(null); e.currentTarget.blur() }
          if (e.key === 'ArrowUp') { e.preventDefault(); bump(1); setText(null) }
          if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1); setText(null) }
          if (e.key === 'Escape') { setText(null); e.currentTarget.blur() }
        }} />
      <span class="spin">
        <button type="button" tabIndex={-1} aria-label="Increase" onMouseDown={keep} onClick={() => bump(1)} disabled={disabled}><Icon name="chevron-up" size={10} /></button>
        <button type="button" tabIndex={-1} aria-label="Decrease" onMouseDown={keep} onClick={() => bump(-1)} disabled={disabled}><Icon name="chevron-down" size={10} /></button>
      </span>
    </span>
  )
}
export function Check ({ checked, onChange, label, disabled, tip }) {
  return (
    <label class={'chk' + (disabled ? ' dis' : '')} data-tip={tip} onMouseDown={keep}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={e => onChange(e.currentTarget.checked)} />
      <span class="chk-box"><Icon name="check" size={12} stroke={3} /></span>
      <span>{label}</span>
    </label>
  )
}
export function Radio ({ checked, onChange, label, name, disabled }) {
  return (
    <label class={'chk rad' + (disabled ? ' dis' : '')}>
      <input type="radio" name={name} checked={!!checked} disabled={disabled} onChange={() => onChange(true)} />
      <span class="chk-box" />
      <span>{label}</span>
    </label>
  )
}
export function Select ({ value, options, onChange, width, disabled, tip }) {
  return (
    <span class="dropsel" style={width ? { width: width + 'px' } : undefined} data-tip={tip}>
      <select value={value} disabled={disabled} aria-label={tip} onChange={e => onChange(e.currentTarget.value)}>
        {options.map(o => <option value={o.value ?? o} key={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
      <Icon name="chevron-down" size={12} />
    </span>
  )
}
export function Slider ({ value, min = 0, max = 100, step = 1, onChange, onInput, width = 120, label }) {
  return <input type="range" class="slider" aria-label={label} style={{ width: width + 'px', '--p': ((value - min) / (max - min) * 100) + '%' }} min={min} max={max} step={step} value={value} onInput={e => (onInput || onChange)(+e.currentTarget.value)} onChange={e => onChange(+e.currentTarget.value)} />
}
export function Field ({ label, children, cls = '' }) {
  return <label class={'fld ' + cls}><span class="fld-l">{label}</span>{children}</label>
}
export function TextInput ({ value, onChange, placeholder, width, onEnter, autoFocus, multiline, rows = 3 }) {
  const ref = useRef(null)
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 30) }, [])
  if (multiline) return <textarea ref={ref} class="tin" rows={rows} value={value} placeholder={placeholder} style={width ? { width: width + 'px' } : undefined} onInput={e => onChange(e.currentTarget.value)} />
  return <input ref={ref} class="tin" value={value} placeholder={placeholder} style={width ? { width: width + 'px' } : undefined} onInput={e => onChange(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }} />
}

// ---------- galleries ----------
// In-ribbon gallery: a strip of items with scroll and an expand button showing everything.
export function Gallery ({ items, render, onPick, isCurrent, itemW = 64, itemH = 52, rows = 1, visible = 6, expandCols = 6, title, footer, cls = '' }) {
  const ref = useRef(null)
  const [start, setStart] = useState(0)
  const per = visible * rows
  const flat = items.filter(it => !it.header) // section headers only show in the expanded grid
  const shown = flat.slice(start, start + per)
  const all = () => (
    <div class={'gal-pop ' + cls} onMouseDown={keep}>
      {title && <div class="cp-h">{title}</div>}
      <div class="gal-grid" style={{ gridTemplateColumns: `repeat(${expandCols}, ${itemW}px)` }}>
        {items.map((it, i) => it.header
          ? <div class="gal-head" key={'h' + i} style={{ gridColumn: '1 / -1' }}>{it.header}</div>
          : <button key={i} class={'gi' + (isCurrent && isCurrent(it) ? ' cur' : '')} style={{ width: itemW + 'px', height: itemH + 'px' }} onClick={() => { closePop(); onPick(it) }} data-tip={it.label}>{render(it)}</button>)}
      </div>
      {footer && <div class="gal-foot">{footer()}</div>}
    </div>
  )
  return (
    <div class={'gal ' + cls} ref={ref}>
      <div class="gal-items" style={{ gridTemplateColumns: `repeat(${visible}, ${itemW}px)`, gridTemplateRows: `repeat(${rows}, ${itemH}px)` }}>
        {shown.map((it, i) => (
          <button key={start + i} class={'gi' + (isCurrent && isCurrent(it) ? ' cur' : '')} onMouseDown={keep} onClick={() => onPick(it)} data-tip={it.label}>{render(it)}</button>
        ))}
      </div>
      <div class="gal-nav">
        <button onMouseDown={keep} disabled={start === 0} onClick={() => setStart(Math.max(0, start - per))} data-tip="Previous row"><Icon name="chevron-up" size={11} /></button>
        <button onMouseDown={keep} disabled={start + per >= flat.length} data-tip="Next row" onClick={() => setStart(Math.min(flat.length - 1, start + per))}><Icon name="chevron-down" size={11} /></button>
        <button onMouseDown={keep} onClick={() => togglePop(ref.current, all, { cls: 'pop-gal' })} data-tip="More"><Icon name="chevrons-down" size={11} /></button>
      </div>
    </div>
  )
}
// Grid used inside dropdowns (shape picker, layouts …)
export function PickGrid ({ items, render, onPick, cols = 8, itemW = 30, itemH = 30, isCurrent }) {
  return (
    <div class="gal-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${itemW}px)` }} onMouseDown={keep}>
      {items.map((it, i) => it.header
        ? <div class="gal-head" key={'h' + i} style={{ gridColumn: '1 / -1' }}>{it.header}</div>
        : <button key={i} class={'gi' + (isCurrent && isCurrent(it) ? ' cur' : '')} style={{ width: itemW + 'px', height: itemH + 'px' }} onClick={() => { closePop(); onPick(it) }} data-tip={it.label}>{render(it)}</button>)}
    </div>
  )
}
export { openPop, closePop, Menu }

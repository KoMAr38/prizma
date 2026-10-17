// Task panes on the right: Format (shape/picture/text/background), Animation, Comments, Selection.
import { useState, useRef } from 'preact/hooks'
import {
  doc, slide, selection, selected, pane, formatTab, select, updateEl, updateSlide, settings, appInfo, addMedia, theme as themeSig, editing
} from '../core/store.js'
import { solid, hexColor, DASHES, ARROWS, ELEMENT_LABEL, walk, findEl, onSlide, recrop } from '../core/model.js'
import { slideBackground } from '../core/themes.js'
import * as A from '../core/actions.js'
import { Icon } from './Icon.jsx'
import { Btn, Swatch, NumField, Slider, Radio, Check, Select, unitFmt, unitParse, TextInput, Field } from './controls.jsx'
import { contextMenu } from './popover.jsx'
import { animById, ANIM_KIND, DIR_LABEL } from '../show/effects.js'
import { unitStep } from './ribbon/common.jsx'
import { previewReq } from './ribbon/design.jsx'
import { textRun, refitSoon } from '../app/commands.js'

function PaneHead ({ title, children }) {
  return (
    <div class="pane-head">
      <h3>{title}</h3>
      {children}
      <button class="pane-x" onClick={() => { pane.value = null }} data-tip="Close"><Icon name="x" size={16} /></button>
    </div>
  )
}
function Section ({ title, children, open: o = true }) {
  const [open, setOpen] = useState(o)
  return (
    <div class={'psec' + (open ? ' open' : '')}>
      <button class="psec-h" onClick={() => setOpen(!open)}><Icon name="chevron-right" size={14} />{title}</button>
      {open && <div class="psec-b">{children}</div>}
    </div>
  )
}
const pct = v => Math.round(v) + '%'

// ---------- fill editor (shapes, backgrounds, cells) ----------
const GRAD_PRESETS = [
  { label: 'Accent 1, linear', stops: [{ color: 'accent1:40', pos: 0 }, { color: 'accent1:-25', pos: 100 }], angle: 90 },
  { label: 'Accent 1 to Accent 2', stops: [{ color: 'accent1', pos: 0 }, { color: 'accent2', pos: 100 }], angle: 45 },
  { label: 'Light to background', stops: [{ color: 'lt2', pos: 0 }, { color: 'lt1', pos: 100 }], angle: 90 },
  { label: 'Dark vignette', stops: [{ color: 'lt2', pos: 0 }, { color: 'lt1:-40', pos: 100 }], kind: 'radial' },
  { label: 'Sunset', stops: [{ color: 'accent2', pos: 0 }, { color: 'accent4', pos: 55 }, { color: 'accent5', pos: 100 }], angle: 135 },
  { label: 'Accent 3 glow', stops: [{ color: 'accent3:30', pos: 0 }, { color: 'accent3:-40', pos: 100 }], kind: 'radial' }
]
const PATTERNS = [['smGrid', 'Small grid'], ['lgGrid', 'Large grid'], ['dkDnDiag', 'Diagonal'], ['ltHorz', 'Horizontal'], ['ltVert', 'Vertical'], ['pct20', 'Dotted 20%']]
export function FillEditor ({ fill, onChange, picture = true, pattern = true, none = true, label = 'Fill' }) {
  const t = themeSig.value
  const type = !fill || fill.type === 'none' ? 'none' : fill.type
  const [stopI, setStopI] = useState(0)
  const setType = ty => {
    if (ty === 'none') onChange(null)
    else if (ty === 'solid') onChange(solid(fill?.color || fill?.stops?.[0]?.color || 'accent1'))
    else if (ty === 'gradient') onChange({ type: 'gradient', kind: 'linear', angle: 90, stops: [{ color: fill?.color || 'accent1', pos: 0 }, { color: (fill?.color || 'accent1').split(':')[0] + ':-35', pos: 100 }] })
    else if (ty === 'image') pickImage()
    else if (ty === 'pattern') onChange({ type: 'pattern', preset: 'smGrid', fg: 'dk1', bg: 'lt1' })
  }
  const pickImage = async () => {
    const p = await window.prizmaNative.openDialog({ title: 'Insert picture', filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }] })
    if (!p?.[0]) return
    const bytes = await window.prizmaNative.readFile(p[0])
    const ext = p[0].split('.').pop().toLowerCase()
    const src = addMedia(bytes, ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg')
    onChange({ type: 'image', src, mode: 'cover' })
  }
  const stops = fill?.stops || []
  const si = Math.min(stopI, stops.length - 1)
  const setStop = patch => onChange({ ...fill, stops: stops.map((s, i) => i === si ? { ...s, ...patch } : s) })
  const barBg = type === 'gradient' ? `linear-gradient(90deg, ${stops.map(s => hexColor(s.color, t) + ' ' + s.pos + '%').join(', ')})` : ''
  const barRef = useRef(null)
  const dragStop = (e, i) => {
    e.preventDefault(); e.stopPropagation()
    setStopI(i)
    const bar = barRef.current
    const move = ev => { const r = bar.getBoundingClientRect(); const pos = Math.round(Math.max(0, Math.min(100, (ev.clientX - r.left) / r.width * 100))); onChange({ ...fill, stops: fill.stops.map((s, j) => j === i ? { ...s, pos } : s) }) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return (
    <div class="fill-ed">
      {none && <Radio name={label} label={`No ${label.toLowerCase()}`} checked={type === 'none'} onChange={() => setType('none')} />}
      <Radio name={label} label="Solid fill" checked={type === 'solid'} onChange={() => setType('solid')} />
      <Radio name={label} label="Gradient fill" checked={type === 'gradient'} onChange={() => setType('gradient')} />
      {picture && <Radio name={label} label="Picture fill" checked={type === 'image'} onChange={() => setType('image')} />}
      {pattern && <Radio name={label} label="Pattern fill" checked={type === 'pattern'} onChange={() => setType('pattern')} />}
      {type === 'solid' && (
        <div class="fe-body">
          <Field label="Color"><Swatch value={fill.color} onPick={c => onChange({ ...fill, color: c })} /></Field>
          <Field label="Transparency"><Slider value={Math.round((1 - (fill.alpha ?? 1)) * 100)} min={0} max={100} onChange={v => onChange({ ...fill, alpha: v ? 1 - v / 100 : undefined })} /><span class="fe-val">{pct((1 - (fill.alpha ?? 1)) * 100)}</span></Field>
        </div>
      )}
      {type === 'gradient' && (
        <div class="fe-body">
          <Field label="Preset">
            <div class="grad-presets">{GRAD_PRESETS.map((g, i) => <button key={i} data-tip={g.label} style={{ background: g.kind === 'radial' ? `radial-gradient(circle, ${g.stops.map(s => hexColor(s.color, t) + ' ' + s.pos + '%').join(', ')})` : `linear-gradient(${(g.angle ?? 90) + 90}deg, ${g.stops.map(s => hexColor(s.color, t) + ' ' + s.pos + '%').join(', ')})` }} onClick={() => onChange({ type: 'gradient', kind: g.kind || 'linear', angle: g.angle ?? 90, stops: g.stops.map(s => ({ ...s })) })} />)}</div>
          </Field>
          <Field label="Type"><Select value={fill.kind || 'linear'} options={[{ value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }]} onChange={v => onChange({ ...fill, kind: v })} /></Field>
          {(fill.kind || 'linear') === 'linear' && <Field label="Angle"><NumField value={fill.angle ?? 90} step={15} min={0} max={359} fmt={v => v + '°'} onChange={v => onChange({ ...fill, angle: ((v % 360) + 360) % 360 })} /></Field>}
          <div class="stops">
            <div class="stops-bar" ref={barRef} style={{ background: barBg }} onDblClick={e => { const r = e.currentTarget.getBoundingClientRect(); const pos = Math.round((e.clientX - r.left) / r.width * 100); onChange({ ...fill, stops: [...stops, { color: stops[si]?.color || 'accent1', pos }].sort((a, b) => a.pos - b.pos) }) }} data-tip="Double-click to add a stop">
              {stops.map((s, i) => <span key={i} class={'stop' + (i === si ? ' cur' : '')} style={{ left: s.pos + '%', background: hexColor(s.color, t) }} onPointerDown={e => dragStop(e, i)} />)}
            </div>
            <div class="stops-tools">
              <button class="btn btn-ic" data-tip="Add gradient stop" onClick={() => onChange({ ...fill, stops: [...stops, { color: stops[si]?.color || 'accent1', pos: Math.min(100, (stops[si]?.pos || 0) + 10) }].sort((a, b) => a.pos - b.pos) })}><Icon name="plus" size={14} /></button>
              <button class="btn btn-ic" data-tip="Remove gradient stop" disabled={stops.length <= 2} onClick={() => { onChange({ ...fill, stops: stops.filter((_, i) => i !== si) }); setStopI(0) }}><Icon name="minus" size={14} /></button>
            </div>
          </div>
          {stops[si] && <>
            <Field label="Stop color"><Swatch value={stops[si].color} onPick={c => setStop({ color: c })} /></Field>
            <Field label="Position"><NumField value={stops[si].pos} min={0} max={100} fmt={v => v + '%'} onChange={v => setStop({ pos: Math.round(v) })} /></Field>
            <Field label="Transparency"><Slider value={Math.round((1 - (stops[si].alpha ?? 1)) * 100)} onChange={v => setStop({ alpha: v ? 1 - v / 100 : undefined })} /></Field>
          </>}
        </div>
      )}
      {type === 'image' && (
        <div class="fe-body">
          <button class="btn" onClick={pickImage}><Icon name="image-up" size={15} />Insert picture…</button>
          <Field label="Fit"><Select value={fill.mode || 'cover'} options={[{ value: 'cover', label: 'Fill (crop)' }, { value: 'stretch', label: 'Stretch' }, { value: 'tile', label: 'Tile' }]} onChange={v => onChange({ ...fill, mode: v })} /></Field>
        </div>
      )}
      {type === 'pattern' && (
        <div class="fe-body">
          <Field label="Pattern"><Select value={fill.preset} options={PATTERNS.map(([v, l]) => ({ value: v, label: l }))} onChange={v => onChange({ ...fill, preset: v })} /></Field>
          <Field label="Foreground"><Swatch value={fill.fg} onPick={c => onChange({ ...fill, fg: c })} /></Field>
          <Field label="Background"><Swatch value={fill.bg} onPick={c => onChange({ ...fill, bg: c })} /></Field>
        </div>
      )}
    </div>
  )
}

function LineEditor ({ line, onChange }) {
  const has = !!(line && line.color && line.width !== 0)
  const dashLabel = { solid: 'Solid', dash: 'Dash', dot: 'Round dot', dashDot: 'Dash dot', longDash: 'Long dash', longDashDot: 'Long dash dot', sysDash: 'Square dot', sysDot: 'Dot' }
  return (
    <div class="fill-ed">
      <Radio name="line" label="No line" checked={!has} onChange={() => onChange(null)} />
      <Radio name="line" label="Solid line" checked={has} onChange={() => onChange({ color: line?.color || 'dk1', width: line?.width || 1, dash: line?.dash || 'solid' })} />
      {has && (
        <div class="fe-body">
          <Field label="Color"><Swatch value={line.color} onPick={c => onChange({ color: c })} /></Field>
          <Field label="Transparency"><Slider value={Math.round((1 - (line.alpha ?? 1)) * 100)} onChange={v => onChange({ alpha: v ? 1 - v / 100 : undefined })} /></Field>
          <Field label="Width"><NumField value={line.width ?? 1} step={0.25} min={0} max={200} fmt={v => v + ' pt'} onChange={v => onChange({ width: v })} /></Field>
          <Field label="Dash type"><Select value={line.dash || 'solid'} options={Object.keys(DASHES).map(k => ({ value: k, label: dashLabel[k] || k }))} onChange={v => onChange({ dash: v })} /></Field>
          <Field label="Cap"><Select value={line.cap || 'flat'} options={[{ value: 'butt', label: 'Flat' }, { value: 'round', label: 'Round' }, { value: 'square', label: 'Square' }]} onChange={v => onChange({ cap: v })} /></Field>
          <Field label="Join"><Select value={line.join || 'round'} options={[{ value: 'round', label: 'Round' }, { value: 'bevel', label: 'Bevel' }, { value: 'miter', label: 'Miter' }]} onChange={v => onChange({ join: v })} /></Field>
          <Field label="Begin arrow"><Select value={line.head || 'none'} options={ARROWS.map(a => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))} onChange={v => onChange({ head: v })} /></Field>
          <Field label="End arrow"><Select value={line.tail || 'none'} options={ARROWS.map(a => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))} onChange={v => onChange({ tail: v })} /></Field>
        </div>
      )}
    </div>
  )
}

function EffectsEditor ({ el }) {
  const sh = el.shadow
  const gl = el.glow
  return (
    <>
      <Section title="Shadow">
        <Check label="Shadow" checked={!!sh} onChange={v => A.setProps({ shadow: v ? { dx: 3, dy: 3, blur: 4, alpha: 0.4 } : undefined })} />
        {sh && <>
          <Field label="Color"><Swatch value={sh.color || '#000000'} onPick={c => A.setProps({ shadow: { ...sh, color: c } })} /></Field>
          <Field label="Transparency"><Slider value={Math.round((1 - (sh.alpha ?? 0.35)) * 100)} onChange={v => A.setProps({ shadow: { ...sh, alpha: 1 - v / 100 } })} /></Field>
          <Field label="Blur"><NumField value={sh.blur ?? 4} min={0} max={100} fmt={v => v + ' pt'} onChange={v => A.setProps({ shadow: { ...sh, blur: v } })} /></Field>
          <Field label="Offset X"><NumField value={sh.dx ?? 3} min={-200} max={200} fmt={v => v + ' pt'} onChange={v => A.setProps({ shadow: { ...sh, dx: v } })} /></Field>
          <Field label="Offset Y"><NumField value={sh.dy ?? 3} min={-200} max={200} fmt={v => v + ' pt'} onChange={v => A.setProps({ shadow: { ...sh, dy: v } })} /></Field>
        </>}
      </Section>
      <Section title="Glow">
        <Check label="Glow" checked={!!gl} onChange={v => A.setProps({ glow: v ? { size: 8, color: 'accent1', alpha: 0.6 } : undefined })} />
        {gl && <>
          <Field label="Color"><Swatch value={gl.color} onPick={c => A.setProps({ glow: { ...gl, color: c } })} /></Field>
          <Field label="Size"><NumField value={gl.size ?? 8} min={0} max={150} fmt={v => v + ' pt'} onChange={v => A.setProps({ glow: { ...gl, size: v } })} /></Field>
          <Field label="Transparency"><Slider value={Math.round((1 - (gl.alpha ?? 0.6)) * 100)} onChange={v => A.setProps({ glow: { ...gl, alpha: 1 - v / 100 } })} /></Field>
        </>}
      </Section>
      <Section title="Transparency">
        <Field label="Object"><Slider value={Math.round((1 - (el.opacity ?? 1)) * 100)} onChange={v => A.setProps({ opacity: v ? 1 - v / 100 : undefined })} /><span class="fe-val">{pct((1 - (el.opacity ?? 1)) * 100)}</span></Field>
      </Section>
    </>
  )
}

function SizeEditor ({ el }) {
  const fmt = v => unitFmt(v)
  const set = patch => A.setGeometry(el.id, patch)
  const lock = !!el.lockAspect || el.type === 'image'
  const isText = el.type === 'text' || el.type === 'shape'
  const ins = el.inset || { l: 7.2, t: 3.6, r: 7.2, b: 3.6 }
  const at = onSlide(slide.value, el) // a group's child is placed through its group
  return (
    <>
      <Section title="Size">
        <Field label="Height"><NumField value={el.h} step={unitStep()} fmt={fmt} parse={unitParse} min={1} width={110} onChange={v => set(lock ? { h: v, w: el.w * v / el.h } : { h: v })} /></Field>
        <Field label="Width"><NumField value={el.w} step={unitStep()} fmt={fmt} parse={unitParse} min={1} width={110} onChange={v => set(lock ? { w: v, h: el.h * v / el.w } : { w: v })} /></Field>
        <Field label="Rotation"><NumField value={el.rot || 0} step={1} min={-360} max={720} width={110} fmt={v => Math.round(v * 10) / 10 + '°'} onChange={v => set({ rot: ((v % 360) + 360) % 360 })} /></Field>
        <Check label="Lock aspect ratio" checked={lock} disabled={el.type === 'image'} onChange={v => A.setProps({ lockAspect: v || undefined }, [el.id])} />
      </Section>
      <Section title="Position">
        <Field label="Horizontal"><NumField value={at.x} step={unitStep()} fmt={fmt} parse={unitParse} width={110} onChange={v => A.setPosition(el.id, { x: v })} /></Field>
        <Field label="Vertical"><NumField value={at.y} step={unitStep()} fmt={fmt} parse={unitParse} width={110} onChange={v => A.setPosition(el.id, { y: v })} /></Field>
        <div class="fe-note">Measured from the top-left corner of the slide.</div>
      </Section>
      {isText && <TextBoxEditor el={el} ins={ins} />}
      <Section title="Alt text" open={false}>
        <TextInput multiline rows={3} value={el.alt || ''} placeholder="Describe this object for screen readers" onChange={v => A.setProps({ alt: v || undefined }, [el.id])} />
      </Section>
    </>
  )
}
function TextBoxEditor ({ el, ins }) {
  const setIns = (k, v) => { A.setProps({ inset: { ...ins, [k]: v } }); refitSoon() }
  return (
    <Section title="Text box">
      <Field label="Vertical alignment"><Select value={el.vAlign || 'top'} options={[{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }]} onChange={v => A.setProps({ vAlign: v })} /></Field>
      <Field label="Text direction"><Select value={el.vertical || 'horz'} options={[{ value: 'horz', label: 'Horizontal' }, { value: 'vert', label: 'Rotate all text 90°' }, { value: 'vert270', label: 'Rotate all text 270°' }, { value: 'stacked', label: 'Stacked' }]} onChange={v => A.setProps({ vertical: v === 'horz' ? undefined : v })} /></Field>
      <Radio name="autofit" label="Do not autofit" checked={!el.autofit} onChange={() => A.setProps({ autofit: undefined, fontScale: undefined })} />
      <Radio name="autofit" label="Shrink text on overflow" checked={el.autofit === 'shrink'} onChange={() => { A.setProps({ autofit: 'shrink' }); refitSoon() }} />
      <Radio name="autofit" label="Resize shape to fit text" checked={el.autofit === 'shape'} onChange={() => { A.setProps({ autofit: 'shape', fontScale: undefined }); refitSoon() }} />
      <div class="fe-grid">
        <Field label="Left margin"><NumField value={ins.l} step={unitStep()} min={0} fmt={v => unitFmt(v)} parse={unitParse} width={96} onChange={v => setIns('l', v)} /></Field>
        <Field label="Right margin"><NumField value={ins.r} step={unitStep()} min={0} fmt={v => unitFmt(v)} parse={unitParse} width={96} onChange={v => setIns('r', v)} /></Field>
        <Field label="Top margin"><NumField value={ins.t} step={unitStep()} min={0} fmt={v => unitFmt(v)} parse={unitParse} width={96} onChange={v => setIns('t', v)} /></Field>
        <Field label="Bottom margin"><NumField value={ins.b} step={unitStep()} min={0} fmt={v => unitFmt(v)} parse={unitParse} width={96} onChange={v => setIns('b', v)} /></Field>
      </div>
      <Check label="Wrap text in shape" checked={el.wrap !== false} onChange={v => { A.setProps({ wrap: v }); refitSoon() }} />
    </Section>
  )
}
function PictureEditor ({ el }) {
  const a = el.adjust || {}
  const set = patch => A.setProps({ adjust: { ...a, ...patch } }, [el.id])
  const c = el.crop || { l: 0, t: 0, r: 0, b: 0 }
  return (
    <>
      <Section title="Picture corrections">
        <Field label="Brightness"><Slider min={-100} max={100} value={a.brightness || 0} onChange={v => set({ brightness: v || undefined })} /><span class="fe-val">{(a.brightness || 0) + '%'}</span></Field>
        <Field label="Contrast"><Slider min={-100} max={100} value={a.contrast || 0} onChange={v => set({ contrast: v || undefined })} /><span class="fe-val">{(a.contrast || 0) + '%'}</span></Field>
      </Section>
      <Section title="Picture color">
        <Field label="Saturation"><Slider min={0} max={400} value={a.saturate ?? 100} onChange={v => set({ saturate: v === 100 ? undefined : v })} /><span class="fe-val">{(a.saturate ?? 100) + '%'}</span></Field>
        <Check label="Grayscale" checked={!!a.grayscale} onChange={v => set({ grayscale: v || undefined })} />
        <Check label="Sepia" checked={!!a.sepia} onChange={v => set({ sepia: v || undefined })} />
      </Section>
      <Section title="Picture transparency">
        <Field label="Transparency"><Slider value={a.transparency || 0} onChange={v => set({ transparency: v || undefined })} /><span class="fe-val">{(a.transparency || 0) + '%'}</span></Field>
        <Field label="Blur"><Slider min={0} max={20} value={a.blur || 0} onChange={v => set({ blur: v || undefined })} /><span class="fe-val">{(a.blur || 0) + ' pt'}</span></Field>
      </Section>
      <Section title="Crop">
        <div class="fe-grid">
          {[['l', 'Left'], ['r', 'Right'], ['t', 'Top'], ['b', 'Bottom']].map(([k, l]) => (
            <Field key={k} label={l}><NumField value={Math.round((c[k] || 0) * 1000) / 10} min={0} max={95} step={1} width={96} fmt={v => v + '%'} onChange={v => {
              // the two sides together leave at least 5% of the picture
              const nc = { l: 0, t: 0, r: 0, b: 0, ...c, [k]: Math.max(0, Math.min(v / 100, 0.95 - (c[{ l: 'r', r: 'l', t: 'b', b: 't' }[k]] || 0))) }
              updateEl(el.id, x => Object.assign(x, recrop(x, nc)))
            }} /></Field>
          ))}
        </div>
        <button class="btn" onClick={() => updateEl(el.id, x => Object.assign(x, recrop(x, null)))}><Icon name="rotate-ccw" size={14} />Reset crop</button>
      </Section>
    </>
  )
}
function TextFillEditor ({ el }) {
  const fx = el.textFx || {}
  const setFx = patch => { const n = { ...fx, ...patch }; for (const k of Object.keys(n)) if (n[k] === undefined) delete n[k]; A.setProps({ textFx: Object.keys(n).length ? n : undefined }) }
  return (
    <>
      <Section title="Text fill">
        <Field label="Color"><Swatch value={el.ts?.color || 'dk1'} onPick={c => { textRun('color', c); A.setTs({ color: c }) }} /></Field>
        <Check label="Gradient fill" checked={!!fx.gradient} onChange={v => setFx({ gradient: v ? ['accent1', 'accent2'] : undefined })} />
        {fx.gradient && <>
          <Field label="From"><Swatch value={fx.gradient[0]} onPick={c => setFx({ gradient: [c, fx.gradient[1]] })} /></Field>
          <Field label="To"><Swatch value={fx.gradient[1]} onPick={c => setFx({ gradient: [fx.gradient[0], c] })} /></Field>
        </>}
      </Section>
      <Section title="Text outline">
        <Check label="Outline" checked={!!fx.outline} onChange={v => setFx({ outline: v ? { color: 'dk1', width: 1 } : undefined })} />
        {fx.outline && <>
          <Field label="Color"><Swatch value={fx.outline.color} onPick={c => setFx({ outline: { ...fx.outline, color: c } })} /></Field>
          <Field label="Width"><NumField value={fx.outline.width} step={0.25} min={0.25} max={20} fmt={v => v + ' pt'} onChange={v => setFx({ outline: { ...fx.outline, width: v } })} /></Field>
        </>}
      </Section>
      <Section title="Text effects">
        <Check label="Shadow" checked={!!fx.shadow} onChange={v => setFx({ shadow: v ? true : undefined })} />
        <Check label="Glow" checked={!!fx.glow} onChange={v => setFx({ glow: v ? { color: 'accent1', size: 8 } : undefined })} />
        {fx.glow && <Field label="Glow color"><Swatch value={fx.glow.color} onPick={c => setFx({ glow: { ...fx.glow, color: c } })} /></Field>}
      </Section>
    </>
  )
}

export function FormatPane () {
  const els = selected.value
  const el = els[0]
  let tab = formatTab.value
  const s = slide.value
  if (!el || tab === 'background') return <BackgroundPane />
  const isPic = el.type === 'image'
  const textual = el.type === 'text' || el.type === 'shape'
  const title = isPic ? 'Format Picture' : el.type === 'chart' ? 'Format Chart Area' : el.type === 'table' ? 'Format Table' : 'Format Shape'
  const tabs = [['fill', 'paint-bucket', 'Fill & line'], ['effects', 'sparkles', 'Effects'], ['size', 'scaling', 'Size & properties']]
  if (isPic) tabs.push(['picture', 'image', 'Picture'])
  if (textual) tabs.push(['text', 'type', 'Text options'])
  if (!tabs.some(t => t[0] === tab)) tab = tab === 'textbox' && textual ? 'size' : 'fill'
  return (
    <aside class="pane">
      <PaneHead title={title} />
      <div class="pane-tabs">{tabs.map(([id, ic, l]) => <button key={id} class={tab === id ? 'on' : ''} onClick={() => { formatTab.value = id }} data-tip={l}><Icon name={ic} size={17} /><span>{l}</span></button>)}</div>
      <div class="pane-body">
        {tab === 'fill' && <>
          {el.type !== 'line' && el.type !== 'image' && el.type !== 'chart' && <Section title="Fill"><FillEditor fill={el.fill} onChange={f => A.setFill(f)} /></Section>}
          <Section title={isPic ? 'Border' : 'Line'}><LineEditor line={el.line} onChange={p => A.setLine(p)} /></Section>
        </>}
        {tab === 'effects' && <EffectsEditor el={el} />}
        {tab === 'size' && <SizeEditor el={el} />}
        {tab === 'picture' && isPic && <PictureEditor el={el} />}
        {tab === 'text' && textual && <TextFillEditor el={el} />}
      </div>
    </aside>
  )
}
function BackgroundPane () {
  const s = slide.value
  const d = doc.value
  if (!s) return null
  const fill = s.bg || slideBackground(s, d.theme)
  return (
    <aside class="pane">
      <PaneHead title="Format Background" />
      <div class="pane-body">
        <Section title="Fill"><FillEditor fill={fill} none={false} onChange={f => A.setBackground(f)} label="Background" /></Section>
        <Check label="Hide background graphics" checked={!!s.hideMaster} onChange={v => A.setHideMaster(v)} />
        <div class="pane-actions">
          <button class="btn" onClick={() => A.setBackground(s.bg || fill, true)}>Apply to all</button>
          <button class="btn" onClick={() => A.setBackground(null)}>Reset background</button>
        </div>
      </div>
    </aside>
  )
}

// ---------- animation pane ----------
export function AnimPane () {
  const s = slide.value
  const anims = s?.animations || []
  const sel = selection.value
  const name = id => { const e = s && findEl(s, id)?.el; return e ? (e.name || ELEMENT_LABEL[e.type]) + (e.html ? ': ' + e.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24) : '') : 'Missing object' }
  let click = 0
  const rows = anims.map((a, i) => {
    if (a.start === 'click' || (i === 0 && a.start !== 'click')) click += a.start === 'click' ? 1 : 0
    return { a, n: a.start === 'click' ? click : null }
  })
  const menu = (e, a) => contextMenu(e, [
    { label: 'Start on click', checked: a.start === 'click', run: () => A.updateAnimation(a.id, { start: 'click' }) },
    { label: 'Start with previous', checked: a.start === 'with', run: () => A.updateAnimation(a.id, { start: 'with' }) },
    { label: 'Start after previous', checked: a.start === 'after', run: () => A.updateAnimation(a.id, { start: 'after' }) },
    { sep: true },
    ...(animById(a.effect)?.dirs ? [{ label: 'Direction', sub: animById(a.effect).dirs.map(dd => ({ label: DIR_LABEL[dd], checked: a.dir === dd, run: () => A.updateAnimation(a.id, { dir: dd }) })) }] : []),
    { label: 'Move earlier', icon: 'arrow-up', run: () => A.moveAnimation(a.id, -1) },
    { label: 'Move later', icon: 'arrow-down', run: () => A.moveAnimation(a.id, 1) },
    { sep: true },
    { label: 'Remove', icon: 'trash-2', danger: true, run: () => A.removeAnimation(a.id) }
  ])
  return (
    <aside class="pane">
      <PaneHead title="Animation pane">
        <button class="btn btn-sm" disabled={!anims.length} onClick={() => { previewReq.value = { kind: 'animations' } }}><Icon name="play" size={13} />Play all</button>
      </PaneHead>
      <div class="pane-body anim-list">
        {!anims.length && <div class="pane-empty"><Icon name="star" size={22} />Select an object on the slide, then pick an effect on the Animations tab.</div>}
        {rows.map(({ a, n }) => {
          const def = animById(a.effect)
          return (
            <div key={a.id} class={'anim-row' + (sel.includes(a.el) ? ' cur' : '')} onClick={() => select([a.el])} onContextMenu={e => menu(e, a)}>
              <span class="ar-n">{n ?? ''}</span>
              <span class={'ar-ic an-' + (def?.kind || a.kind)}><Icon name={a.start === 'after' ? 'clock-3' : a.start === 'with' ? 'link-2' : 'mouse-pointer-click'} size={12} /></span>
              <span class="ar-name">{name(a.el)}<small>{ANIM_KIND[def?.kind || a.kind]}: {def?.label || a.effect}</small></span>
              <span class="ar-bar"><i style={{ marginLeft: Math.min(60, (a.delay || 0) * 12) + 'px', width: Math.max(6, Math.min(80, (a.dur || 0.5) * 24)) + 'px' }} class={'an-' + (def?.kind || a.kind)} /></span>
              <button class="ar-more" onClick={e => { e.stopPropagation(); menu(e, a) }}><Icon name="chevron-down" size={13} /></button>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

// ---------- comments ----------
const ago = t => {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'Just now'
  if (s < 3600) return Math.round(s / 60) + ' min ago'
  if (s < 86400) return Math.round(s / 3600) + ' h ago'
  return new Date(t).toLocaleDateString()
}
export function CommentsPane () {
  const s = slide.value
  const [text, setText] = useState('')
  const list = s?.comments || []
  const post = () => { if (!text.trim()) return; A.addComment(text.trim()); setText('') }
  const me = settings.value.author || appInfo.value.userName || 'Me'
  return (
    <aside class="pane">
      <PaneHead title="Comments" />
      <div class="pane-body">
        <div class="cm-new">
          <span class="avatar">{me.slice(0, 1).toUpperCase()}</span>
          <div class="cm-box">
            <textarea value={text} placeholder="Add a comment…" rows={3} onInput={e => setText(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) post() }} />
            <div class="cm-actions"><span class="fe-note">Ctrl+Enter to post</span><button class="btn btn-primary btn-sm" disabled={!text.trim()} onClick={post}>Post</button></div>
          </div>
        </div>
        {!list.length && <div class="pane-empty"><Icon name="messages-square" size={22} />No comments on this slide yet.</div>}
        {[...list].reverse().map(c => (
          <div key={c.id} class={'cm' + (c.el && selection.value.includes(c.el) ? ' cur' : '')} onClick={() => c.el && s && findEl(s, c.el) && select([c.el])}>
            <span class="avatar">{(c.author || '?').slice(0, 1).toUpperCase()}</span>
            <div class="cm-main">
              <div class="cm-head"><b>{c.author}</b><span>{ago(c.time)}</span><button class="cm-del" onClick={e => { e.stopPropagation(); A.deleteComment(c.id) }} data-tip="Delete comment"><Icon name="trash-2" size={13} /></button></div>
              <div class="cm-text">{c.text}</div>
              {c.el && <div class="cm-on"><Icon name="corner-down-right" size={12} />On {(() => { const e = s && findEl(s, c.el)?.el; return e ? (e.name || ELEMENT_LABEL[e.type]) : 'a deleted object' })()}</div>}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

// ---------- selection pane ----------
export function SelectionPane () {
  const s = slide.value
  const [renaming, setRenaming] = useState(null)
  if (!s) return null
  const sel = selection.value
  const setAllHidden = hidden => updateSlide(sl => { walk(sl.elements, e => { if (hidden) e.hidden = true; else delete e.hidden }) })
  const rows = []
  const visit = (list, depth) => {
    for (const e of [...list].reverse()) {
      rows.push({ e, depth })
      if (e.type === 'group') visit(e.children, depth + 1)
    }
  }
  visit(s.elements, 0)
  return (
    <aside class="pane">
      <PaneHead title="Selection" />
      <div class="sp-tools">
        <button class="btn btn-sm" onClick={() => setAllHidden(false)}>Show all</button>
        <button class="btn btn-sm" onClick={() => setAllHidden(true)}>Hide all</button>
        <span class="rtabs-fill" />
        <button class="btn btn-ic" data-tip="Bring forward" disabled={!sel.length} onClick={() => A.arrange('forward')}><Icon name="chevron-up" size={15} /></button>
        <button class="btn btn-ic" data-tip="Send backward" disabled={!sel.length} onClick={() => A.arrange('backward')}><Icon name="chevron-down" size={15} /></button>
      </div>
      <div class="pane-body sp-list">
        {!rows.length && <div class="pane-empty"><Icon name="layers" size={22} />This slide has no objects.</div>}
        {rows.map(({ e, depth }) => (
          <div key={e.id} class={'sp-row' + (sel.includes(e.id) ? ' cur' : '') + (e.hidden ? ' hid' : '')} style={{ paddingLeft: 10 + depth * 16 + 'px' }}
            onClick={ev => { const id = e.id; select(ev.ctrlKey || ev.shiftKey ? (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]) : [id]) }}
            onDblClick={() => setRenaming(e.id)}>
            <Icon name={{ text: 'type', shape: 'shapes', line: 'minus', image: 'image', table: 'table', chart: 'chart-column', group: 'group', icon: 'smile', ink: 'pen-tool', video: 'film', audio: 'volume-2' }[e.type] || 'square'} size={14} />
            {renaming === e.id
              ? <input class="tin sp-in" value={e.name || ''} autoFocus onBlur={ev => { A.setProps({ name: ev.currentTarget.value || undefined }, [e.id]); setRenaming(null) }} onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); if (ev.key === 'Escape') setRenaming(null) }} onClick={ev => ev.stopPropagation()} />
              : <span class="sp-name">{e.name || ELEMENT_LABEL[e.type]}</span>}
            <button class="sp-eye" onClick={ev => { ev.stopPropagation(); updateEl(e.id, x => { if (x.hidden) delete x.hidden; else x.hidden = true }) }} data-tip={e.hidden ? 'Show' : 'Hide'}><Icon name={e.hidden ? 'eye-off' : 'eye'} size={14} /></button>
          </div>
        ))}
      </div>
    </aside>
  )
}

export function RightPane () {
  const p = pane.value
  if (p === 'format') return <FormatPane />
  if (p === 'anim') return <AnimPane />
  if (p === 'comments') return <CommentsPane />
  if (p === 'selection') return <SelectionPane />
  return null
}

// Building blocks shared by several ribbon tabs.
import { memo } from 'preact/compat'
import { doc, slide, selection, selected, tool, pane, formatTab, theme as themeSig, lastColors, settings, oneStep } from '../../core/store.js'
import { SHAPES, SHAPE_CATS, LINE_KINDS, shapeParts } from '../../core/shapes.js'
import { LAYOUTS, newSlide, slideDecor } from '../../core/themes.js'
import { hexColor, solid, DASHES, DASH_LABEL, unionBounds } from '../../core/model.js'
import * as A from '../../core/actions.js'
import { Btn, Drop, Split, ColorBtn, ColorPicker, Gallery, PickGrid, NumField, unitFmt, unitParse, addRecentColor } from '../controls.jsx'
import { Menu, closePop } from '../popover.jsx'
import { Icon } from '../Icon.jsx'
import { SlideThumb } from '../Thumbs.jsx'
import { runCmd, cmdEnabled } from '../../app/commands.js'

// ---------- shapes ----------
export const ShapeIcon = memo(function ShapeIcon ({ shape, size = 20 }) {
  if (shape.startsWith('line:')) {
    const k = shape.slice(5)
    const d = k.startsWith('elbow') ? 'M3 4 H10 V16 H17' : k.startsWith('curve') ? 'M3 16 C 8 16, 12 4, 17 4' : 'M3 17 L17 3'
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" class="shape-ic">
        <path d={d} style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }} />
        {/arrow|Arrow/i.test(k) && <path d={k.startsWith('elbow') ? 'M14 13 L17 16 L14 19' : k.startsWith('curve') ? 'M14 2 L17 4 L14.5 7' : 'M12 3 L17 3 L17 8'} style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }} />}
        {k === 'doubleArrow' && <path d="M3 12 L3 17 L8 17" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }} />}
      </svg>
    )
  }
  const def = SHAPES[shape]
  const w = 18, h = def?.label?.match(/wide|banner|ribbon/i) ? 12 : 18
  let parts = []
  try { parts = shapeParts({ shape, w, h, adj: {}, type: 'shape' }) } catch {}
  return (
    <svg width={size} height={size} viewBox={`-1 ${-1 - (18 - h) / 2} 20 20`} class="shape-ic">
      {parts.map((p, i) => <path key={i} d={p.d} style={{ fill: def?.strokeOnly || p.fill === 'none' ? 'none' : 'color-mix(in srgb, currentColor 14%, transparent)', stroke: 'currentColor', strokeWidth: 1.1, fillRule: p.evenodd ? 'evenodd' : 'nonzero', vectorEffect: 'non-scaling-stroke' }} />)}
    </svg>
  )
})
export const RECENT_SHAPES = ['rect', 'ellipse', 'roundRect', 'triangle', 'rightArrow', 'line:straight', 'line:arrow', 'star5', 'hexagon', 'chevron', 'wedgeRectCallout', 'heart']
export function shapeItems () {
  const items = [{ header: 'Lines' }, ...LINE_KINDS.map(l => ({ key: 'line:' + l.kind, label: l.label, line: l.kind }))]
  for (const cat of SHAPE_CATS) {
    items.push({ header: cat })
    for (const [id, def] of Object.entries(SHAPES)) if (def.cat === cat) items.push({ key: id, label: def.label, shape: id })
  }
  return items
}
export const pickShape = it => {
  if (it.line) tool.value = { kind: 'line', line: it.line }
  else tool.value = { kind: 'shape', shape: it.shape }
}
export function ShapePicker ({ onPick = pickShape }) {
  return (
    <div class="shape-picker">
      <PickGrid items={shapeItems()} cols={12} itemW={28} itemH={28} onPick={onPick} render={it => <ShapeIcon shape={it.key} />} />
    </div>
  )
}
export function ShapesDrop ({ size = 'lg', label = 'Shapes' }) {
  return <Drop size={size} icon="shapes" label={label} tip="Insert shapes" desc="Draw a ready-made shape: click the slide, or drag to set its size. Hold Shift for a perfect square or circle." render={() => <ShapePicker />} />
}

// ---------- layouts ----------
export function layoutPreview (layoutId) {
  const d = doc.value
  const s = newSlide(layoutId, d.size, d.theme)
  const cur = slide.value
  if (d.theme.id === 'imported' && cur) { const twin = d.slides.find(x => x.layout === layoutId && x.master) || cur; s.master = twin.master; s.bg = twin.bg }
  return s
}
export function LayoutPicker ({ onPick, current }) {
  const d = doc.value
  return (
    <div class="layout-picker">
      <div class="cp-h">{d.theme.id === 'imported' ? 'Layouts' : d.theme.name}</div>
      <div class="lp-grid">
        {LAYOUTS.map(l => (
          <button key={l.id} class={'lp-item' + (current === l.id ? ' cur' : '')} onMouseDown={e => e.preventDefault()} onClick={() => { closePop(); onPick(l.id) }}>
            <SlideThumb slide={layoutPreview(l.id)} theme={d.theme} size={d.size} hf={null} index={0} w={112} ctx={'lp' + l.id} mode="layout" />
            <span>{l.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
export function NewSlideBtn ({ size = 'lg' }) {
  return (
    <Split size={size} icon="square-plus" label="New slide" kbd="Ctrl+M" tip="New slide" desc="Add a slide after the current one, using the same layout." onClick={() => runCmd('slide.new')}
      render={() => (
        <div>
          <LayoutPicker onPick={id => A.addSlide(id)} />
          <Menu items={[{ sep: true }, { label: 'Duplicate selected slides', icon: 'copy-plus', run: () => runCmd('slide.duplicate') }, { label: 'Slides from another presentation…', icon: 'file-input', run: () => import('../../app/reuse.jsx').then(m => m.reuseSlides()) }]} />
        </div>
      )} />
  )
}

// ---------- quick styles ----------
const STYLE_SLOTS = ['dk1', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']
export function shapeStyles () {
  const out = []
  const kinds = [
    ['Colored outline', c => ({ fill: solid('lt1'), line: { color: c, width: 1 }, text: c === 'dk1' ? 'dk1' : c + ':-25' })],
    ['Colored fill', c => ({ fill: solid(c), line: { color: c + ':-25', width: 1 }, text: c === 'dk1' ? 'lt1' : 'lt1' })],
    ['Light outline, colored fill', c => ({ fill: solid(c), line: { color: 'lt1', width: 1.5 }, text: 'lt1' })],
    ['Subtle effect', c => ({ fill: solid(c + ':80'), line: { color: c, width: 1 }, text: c === 'dk1' ? 'dk1' : c + ':-50' })],
    ['Moderate effect', c => ({ fill: { type: 'gradient', kind: 'linear', angle: 90, stops: [{ color: c + ':30', pos: 0 }, { color: c, pos: 50 }, { color: c + ':-15', pos: 100 }] }, line: null, text: 'lt1', shadow: { dx: 0, dy: 2, blur: 4, alpha: 0.25 } })],
    ['Intense effect', c => ({ fill: { type: 'gradient', kind: 'linear', angle: 90, stops: [{ color: c + ':20', pos: 0 }, { color: c + ':-25', pos: 100 }] }, line: null, text: 'lt1', shadow: { dx: 0, dy: 4, blur: 9, alpha: 0.4 } })]
  ]
  for (const [name, fn] of kinds) for (const c of STYLE_SLOTS) out.push({ label: `${name}: ${c === 'dk1' ? 'Dark' : c.replace('accent', 'Accent ')}`, ...fn(c) })
  return out
}
export function applyShapeStyle (st) {
  const ids = selection.value
  oneStep(() => {
    A.setFill(st.fill, ids)
    A.setLine(st.line === null ? null : st.line, ids)
    A.setProps({ shadow: st.shadow || undefined }, ids)
    A.textRunAll('color', null)
    A.setTs({ color: st.text })
  })
}
export function StyleSwatch ({ st }) {
  const t = themeSig.value
  const bg = st.fill?.type === 'gradient' ? `linear-gradient(180deg, ${st.fill.stops.map(s => hexColor(s.color, t) + ' ' + s.pos + '%').join(', ')})` : hexColor(st.fill?.color, t)
  return <span class="style-sw" style={{ background: bg, border: st.line ? `1.5px solid ${hexColor(st.line.color, t)}` : 'none', color: hexColor(st.text, t), boxShadow: st.shadow ? '0 2px 4px rgba(0,0,0,.35)' : 'none' }}>Abc</span>
}
export function QuickStylesGallery ({ visible = 7 }) {
  return <Gallery items={shapeStyles()} visible={visible} rows={1} itemW={46} itemH={40} expandCols={7} render={st => <StyleSwatch st={st} />} onPick={applyShapeStyle} title="Theme styles" cls="gal-styles" />
}

// ---------- fill / outline / effects ----------
const firstLine = () => selected.value.find(e => e.line)?.line
export function FillBtn () {
  const v = lastColors.value.fill
  const apply = c => {
    lastColors.value = { ...lastColors.value, fill: c === 'none' ? lastColors.value.fill : c }
    if (c && c.startsWith('#')) addRecentColor(c)
    if (selected.value.some(e => e.type === 'icon')) A.setProps({ color: c === 'none' ? undefined : c }, selected.value.filter(e => e.type === 'icon').map(e => e.id))
    A.setFill(c === 'none' ? null : solid(c))
  }
  return <ColorBtn icon="paint-bucket" tip="Shape fill" value={v} onApply={apply} onPick={apply} none noneLabel="No fill" disabled={!selection.value.length} />
}
export function OutlineBtn () {
  const v = lastColors.value.line
  const apply = c => { lastColors.value = { ...lastColors.value, line: c === 'none' ? lastColors.value.line : c }; if (c && c.startsWith('#')) addRecentColor(c); A.setLine(c === 'none' ? null : { color: c }) }
  return (
    <span class="obtn">
      <ColorBtn icon="pen-line" tip="Shape outline" value={v} onApply={apply} onPick={apply} none noneLabel="No outline" disabled={!selection.value.length} />
      <Drop size="sm" icon="align-justify" tip="Outline weight and dashes" disabled={!selection.value.length} menu={outlineMenu} />
    </span>
  )
}
export const outlineMenu = () => [
  { header: 'Weight' },
  ...[0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map(w => ({ label: `${w} pt`, icon: <span class="wt-sample" style={{ height: Math.max(1, w * 1.1) + 'px' }} />, checked: firstLine()?.width === w, run: () => A.setLine({ width: w }) })),
  { header: 'Dashes' },
  ...Object.keys(DASHES).map(k => ({ label: DASH_LABEL[k] || k, icon: <svg width="34" height="6"><line x1="0" y1="3" x2="34" y2="3" style={{ stroke: 'currentColor', strokeWidth: 2, strokeDasharray: DASHES[k] ? DASHES[k].map(v => v * 2).join(' ') : undefined }} /></svg>, checked: (firstLine()?.dash || 'solid') === k, run: () => A.setLine({ dash: k }) })),
  { header: 'Arrows' },
  ...[['none', 'none', 'No arrows'], ['none', 'triangle', 'Arrow at end'], ['triangle', 'none', 'Arrow at start'], ['triangle', 'triangle', 'Arrows at both ends'], ['none', 'stealth', 'Stealth arrow'], ['oval', 'oval', 'Round ends'], ['diamond', 'diamond', 'Diamond ends']].map(([h, t, l]) => ({ label: l, run: () => A.setLine({ head: h, tail: t }) }))
]
export const effectsMenu = () => [
  { label: 'Shadow', icon: 'square-dashed', sub: [
    { label: 'No shadow', run: () => A.setProps({ shadow: undefined }) },
    { label: 'Offset bottom right', run: () => A.setProps({ shadow: { dx: 3, dy: 3, blur: 4, alpha: 0.4 } }) },
    { label: 'Offset bottom', run: () => A.setProps({ shadow: { dx: 0, dy: 4, blur: 6, alpha: 0.35 } }) },
    { label: 'Soft drop', run: () => A.setProps({ shadow: { dx: 0, dy: 8, blur: 18, alpha: 0.35 } }) },
    { label: 'Perspective', run: () => A.setProps({ shadow: { dx: 8, dy: 10, blur: 10, alpha: 0.3 } }) },
    { label: 'Inner glow', run: () => A.setProps({ shadow: { dx: 0, dy: 0, blur: 6, alpha: 0.5 } }) }
  ] },
  { label: 'Glow', icon: 'sun', sub: [
    { label: 'No glow', run: () => A.setProps({ glow: undefined }) },
    ...['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].flatMap((c, i) => i < 6 ? [{ label: `${c.replace('accent', 'Accent ')}, 8 pt`, icon: <span class="glow-sample" style={{ boxShadow: `0 0 6px 2px ${hexColor(c, themeSig.value)}` }} />, run: () => A.setProps({ glow: { size: 8, color: c, alpha: 0.6 } }) }] : [])
  ] },
  { label: 'Transparency', icon: 'blend', sub: [0, 15, 30, 50, 70].map(v => ({ label: v ? v + '%' : 'Opaque', run: () => A.setProps({ opacity: v ? 1 - v / 100 : undefined }) })) },
  { label: 'Rounded corners', icon: 'square-round-corner', sub: [0, 6, 12, 24].map(v => ({ label: v ? v + ' pt' : 'Square', run: () => A.setProps({ radius: v || undefined }) })) }
]
export function EffectsBtn ({ size = 'sm' }) {
  return <Drop size={size} icon="sparkles" label={size === 'lg' ? 'Effects' : undefined} tip="Shape effects" disabled={!selection.value.length} menu={effectsMenu} />
}

// ---------- arrange ----------
export const arrangeMenu = () => [
  { header: 'Order objects' },
  { label: 'Bring to front', icon: 'bring-to-front', kbd: 'Ctrl+Shift+]', run: () => runCmd('obj.front') },
  { label: 'Send to back', icon: 'send-to-back', kbd: 'Ctrl+Shift+[', run: () => runCmd('obj.back') },
  { label: 'Bring forward', icon: 'arrow-up-from-line', run: () => runCmd('obj.forward') },
  { label: 'Send backward', icon: 'arrow-down-to-line', run: () => runCmd('obj.backward') },
  { header: 'Group objects' },
  { label: 'Group', icon: 'group', kbd: 'Ctrl+G', disabled: !cmdEnabled('obj.group'), run: () => runCmd('obj.group') },
  { label: 'Ungroup', icon: 'ungroup', kbd: 'Ctrl+Shift+G', disabled: !cmdEnabled('obj.ungroup'), run: () => runCmd('obj.ungroup') },
  { header: 'Position objects' },
  { label: 'Align', icon: 'align-center-vertical', sub: alignMenu() },
  { label: 'Rotate', icon: 'rotate-cw', sub: rotateMenu() },
  { sep: true },
  { label: 'Selection pane…', icon: 'layers', kbd: 'Alt+F10', run: () => runCmd('view.selectionPane') }
]
export const alignMenu = () => [
  { label: 'Align left', icon: 'align-start-vertical', run: () => runCmd('align.left') },
  { label: 'Align center', icon: 'align-center-vertical', run: () => runCmd('align.center') },
  { label: 'Align right', icon: 'align-end-vertical', run: () => runCmd('align.right') },
  { sep: true },
  { label: 'Align top', icon: 'align-start-horizontal', run: () => runCmd('align.top') },
  { label: 'Align middle', icon: 'align-center-horizontal', run: () => runCmd('align.middle') },
  { label: 'Align bottom', icon: 'align-end-horizontal', run: () => runCmd('align.bottom') },
  { sep: true },
  { label: 'Distribute horizontally', icon: 'align-horizontal-distribute-center', disabled: selection.value.length < 3, run: () => runCmd('align.distH') },
  { label: 'Distribute vertically', icon: 'align-vertical-distribute-center', disabled: selection.value.length < 3, run: () => runCmd('align.distV') },
  { hint: selection.value.length < 2 ? 'One object aligns to the slide' : '', label: selection.value.length < 2 ? 'Aligning to slide' : 'Aligning selected objects', disabled: true }
]
export const rotateMenu = () => [
  { label: 'Rotate right 90°', icon: 'rotate-cw', run: () => runCmd('obj.rotR') },
  { label: 'Rotate left 90°', icon: 'rotate-ccw', run: () => runCmd('obj.rotL') },
  { label: 'Flip vertical', icon: 'flip-vertical-2', run: () => runCmd('obj.flipV') },
  { label: 'Flip horizontal', icon: 'flip-horizontal-2', run: () => runCmd('obj.flipH') },
  { sep: true },
  { label: 'More rotation options…', icon: 'settings-2', run: () => runCmd('obj.format', 'size') }
]
export function ArrangeGroup ({ compact }) {
  const dis = !selection.value.length
  return (
    <>
      <Split size="sm" icon="bring-to-front" label={compact ? undefined : 'Bring forward'} tip="Bring forward" disabled={dis} onClick={() => runCmd('obj.forward')} menu={[{ label: 'Bring forward', icon: 'arrow-up-from-line', run: () => runCmd('obj.forward') }, { label: 'Bring to front', icon: 'bring-to-front', run: () => runCmd('obj.front') }]} />
      <Split size="sm" icon="send-to-back" label={compact ? undefined : 'Send backward'} tip="Send backward" disabled={dis} onClick={() => runCmd('obj.backward')} menu={[{ label: 'Send backward', icon: 'arrow-down-to-line', run: () => runCmd('obj.backward') }, { label: 'Send to back', icon: 'send-to-back', run: () => runCmd('obj.back') }]} />
    </>
  )
}
// Height / width fields for the selection (Size groups)
export function SizeFields () {
  const els = selected.value
  const b = els.length ? (els.length === 1 ? els[0] : unionBounds(els)) : null
  const set = (k, v) => A.setSize(els.map(e => e.id), k, v)
  return (
    <>
      <NumField icon="move-vertical" tip="Shape height" value={b ? b.h : null} disabled={!b} step={unitStep()} fmt={v => unitFmt(v)} parse={s => unitParse(s)} min={1} width={92} onChange={v => set('h', v)} />
      <NumField icon="move-horizontal" tip="Shape width" value={b ? b.w : null} disabled={!b} step={unitStep()} fmt={v => unitFmt(v)} parse={s => unitParse(s)} min={1} width={92} onChange={v => set('w', v)} />
    </>
  )
}
export const unitStep = () => (settings.value.units || 'cm') === 'in' ? 7.2 : (settings.value.units || 'cm') === 'pt' ? 1 : 72 / 2.54 * 0.1
export function openFormat (tab) { pane.value = 'format'; if (tab) formatTab.value = tab }
export { Btn, Drop, Split, ColorBtn, Icon, closePop, runCmd, cmdEnabled, A }

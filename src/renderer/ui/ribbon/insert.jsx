// Insert and Draw tabs.
import { signal } from '@preact/signals'
import { useState } from 'preact/hooks'
import { doc, tool, selection, openDialog, theme as themeSig, editing, slide, select, oneStep } from '../../core/store.js'
import { hexColor, textBox } from '../../core/model.js'
import { Group, Col } from '../controls.jsx'
import { Btn, Drop, Icon, runCmd, A, NewSlideBtn, ShapesDrop, closePop } from './common.jsx'

function TablePicker () {
  const [hov, setHov] = useState({ r: 0, c: 0 })
  return (
    <div class="tbl-pick" onMouseDown={e => e.preventDefault()}>
      <div class="cp-h">{hov.r && hov.c ? `${hov.c} × ${hov.r} table` : 'Insert table'}</div>
      <div class="tp-grid" onMouseLeave={() => setHov({ r: 0, c: 0 })}>
        {Array.from({ length: 8 }, (_, r) => Array.from({ length: 10 }, (_, c) => (
          <button key={r + ':' + c} class={'tp-cell' + (r < hov.r && c < hov.c ? ' on' : '')} onMouseEnter={() => setHov({ r: r + 1, c: c + 1 })} onClick={() => { closePop(); A.insertTable(r + 1, c + 1) }} />
        )))}
      </div>
      <button class="mi" onClick={() => { closePop(); openDialog('table') }}><span class="mi-ic"><Icon name="table" size={15} /></span><span class="mi-l">Insert table…</span></button>
    </div>
  )
}

// WordArt presets: text effects rendered with CSS, exported as text outline/glow/shadow
export const WORDART = [
  { label: 'Fill: Text 1; Shadow', color: 'dk1', fx: { shadow: true } },
  { label: 'Fill: Accent 1; Shadow', color: 'accent1', fx: { shadow: true } },
  { label: 'Fill: Accent 2; Outline: Background', color: 'accent2', fx: { outline: { color: 'lt1', width: 1.5 } } },
  { label: 'Fill: Background; Outline: Accent 1', color: 'lt1', fx: { outline: { color: 'accent1', width: 2 } } },
  { label: 'Gradient fill: Accent 1 to Accent 2', color: 'accent1', fx: { gradient: ['accent1', 'accent2'] } },
  { label: 'Fill: Accent 1; Glow', color: 'lt1', fx: { glow: { color: 'accent1', size: 8 } } },
  { label: 'Outline only: Text 1', color: 'lt1', fx: { outline: { color: 'dk1', width: 1.5 }, hollow: true } },
  { label: 'Fill: Accent 4; Soft shadow', color: 'accent4', fx: { shadow: { dx: 0, dy: 4, blur: 10, alpha: 0.5 } } },
  { label: 'Gradient fill: Accent 3 to Accent 5', color: 'accent3', fx: { gradient: ['accent3', 'accent5'] } }
]
export function wordArtCss (fx, theme) {
  if (!fx) return {}
  const s = {}
  const shadows = []
  if (fx.shadow) { const sh = fx.shadow === true ? { dx: 2, dy: 2, blur: 3, alpha: 0.45 } : fx.shadow; shadows.push(`${sh.dx}pt ${sh.dy}pt ${sh.blur}pt rgba(0,0,0,${sh.alpha})`) }
  if (fx.glow) shadows.push(`0 0 ${fx.glow.size || 8}pt ${theme ? hexColor(fx.glow.color, theme) : `var(--c-${fx.glow.color})`}`)
  if (shadows.length) s.textShadow = shadows.join(', ')
  if (fx.outline) { s.WebkitTextStroke = `${fx.outline.width || 1}pt ${theme ? hexColor(fx.outline.color, theme) : `var(--c-${fx.outline.color})`}`; s.paintOrder = 'stroke fill' }
  if (fx.hollow) s.color = 'transparent'
  if (fx.gradient) { s.backgroundImage = `linear-gradient(90deg, ${fx.gradient.map(c => theme ? hexColor(c, theme) : `var(--c-${c})`).join(', ')})`; s.WebkitBackgroundClip = 'text'; s.backgroundClip = 'text'; s.color = 'transparent' }
  return s
}
export function applyWordArt (w) {
  if (selection.value.length && !editing.value) {
    oneStep(() => { A.setProps({ textFx: w.fx }); A.textRunAll('color', null); A.setTs({ color: w.color, bold: true }) })
    return
  }
  const z = doc.value.size
  const el = textBox({ x: z.w * 0.15, y: z.h * 0.38, w: z.w * 0.7, h: 70 }, '<p>Your text here</p>', { ts: { font: '+major', size: 54, color: w.color, bold: true, align: 'center' }, textFx: w.fx, name: 'WordArt' })
  A.insertElement(el)
}
function WordArtPicker () {
  const t = themeSig.value
  return (
    <div class="pop-pad">
      <div class="cp-h">WordArt styles</div>
      <div class="wa-grid">
        {WORDART.map((w, i) => (
          <button key={i} class="gi wa-item" data-tip={w.label} onMouseDown={e => e.preventDefault()} onClick={() => { closePop(); applyWordArt(w) }}>
            <span style={{ color: hexColor(w.color, t), fontWeight: 800, fontSize: '26px', ...wordArtCss(w.fx, t), background: w.color === 'lt1' && !w.fx.gradient ? hexColor('dk2', t) + '00' : undefined }}>A</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function InsertTab () {
  return (
    <>
      <Group label="Slides"><NewSlideBtn /></Group>
      <Group label="Tables"><Drop size="lg" icon="table" label="Table" tip="Insert table" render={() => <TablePicker />} /></Group>
      <Group label="Images">
        <Btn size="lg" icon="image" label="Pictures" tip="Insert pictures from this PC" onClick={() => runCmd('ins.picture')} />
      </Group>
      <Group label="Illustrations">
        <ShapesDrop />
        <Btn size="lg" icon="shapes" label="Icons" tip="Insert icons" desc="Choose from more than a thousand line icons; they recolor like shapes." onClick={() => runCmd('ins.icons')} />
        <Btn size="lg" icon="chart-column-big" label="Chart" tip="Insert chart" onClick={() => runCmd('ins.chart')} />
      </Group>
      <Group label="Links">
        <Btn size="lg" icon="link" label="Link" kbd="Ctrl+K" tip="Insert link" onClick={() => runCmd('obj.link')} />
      </Group>
      <Group label="Comments">
        <Btn size="lg" icon="message-square-plus" label="Comment" tip="New comment" onClick={() => runCmd('ins.comment')} />
      </Group>
      <Group label="Text">
        <Btn size="lg" icon="type" label="Text box" tip="Draw a text box" desc="Click to type anywhere, or drag to set the width." active={tool.value?.kind === 'text'} onClick={() => { tool.value = tool.value?.kind === 'text' ? null : { kind: 'text' } }} />
        <Drop size="lg" icon="pilcrow" label="WordArt" tip="WordArt" render={() => <WordArtPicker />} />
        <Col>
          <Btn icon="panel-bottom" label="Header & footer" onClick={() => runCmd('ins.hf')} />
          <Btn icon="calendar" label="Date & time" onClick={() => runCmd('ins.date')} />
          <Btn icon="hash" label="Slide number" onClick={() => runCmd('ins.slideNumber')} />
        </Col>
      </Group>
      <Group label="Symbols">
        <Btn size="lg" icon="omega" label="Symbol" tip="Insert symbol" onClick={() => runCmd('ins.symbol')} />
      </Group>
      <Group label="Media">
        <Btn size="lg" icon="film" label="Video" tip="Insert video from this PC" onClick={() => runCmd('ins.video')} />
        <Btn size="lg" icon="audio-lines" label="Audio" tip="Insert audio from this PC" onClick={() => runCmd('ins.audio')} />
      </Group>
    </>
  )
}

// ---------- Draw ----------
export const penCfg = signal({ color: 'dk1', width: 2.25, hl: '#FFE500', hlWidth: 12 })
const PEN_COLORS = ['dk1', 'lt1', '#E5484D', '#F5A524', '#FFE500', '#2FBF71', '#2D9CDB', '#7C5CFC', '#E54FB0', 'accent1']
const HL_COLORS = ['#FFE500', '#7CF29A', '#5BE0FF', '#FF8AD8', '#FFB45C']
export function setPen (kind, patch = {}) {
  penCfg.value = { ...penCfg.value, ...patch }
  const c = penCfg.value
  const t = themeSig.value
  if (kind === 'pen') tool.value = { kind: 'pen', color: c.color, colorCss: hexColor(c.color, t), width: c.width }
  else if (kind === 'highlighter') tool.value = { kind: 'highlighter', color: c.hl, colorCss: c.hl, width: c.hlWidth }
  else if (kind === 'eraser') tool.value = { kind: 'eraser' }
  else tool.value = null
}
export function DrawTab () {
  const t = tool.value
  const c = penCfg.value
  const th = themeSig.value
  const k = t?.kind
  return (
    <>
      <Group label="Drawing tools">
        <Btn size="lg" icon="mouse-pointer-2" label="Select" tip="Select objects" active={!k || !['pen', 'highlighter', 'eraser'].includes(k)} onClick={() => setPen(null)} />
        <Btn size="lg" icon="pen-tool" label="Pen" tip="Draw with a pen" active={k === 'pen'} onClick={() => setPen('pen')} />
        <Btn size="lg" icon="highlighter" label="Highlighter" tip="Highlight with translucent ink" active={k === 'highlighter'} onClick={() => setPen('highlighter')} />
        <Btn size="lg" icon="eraser" label="Eraser" tip="Erase ink strokes" active={k === 'eraser'} onClick={() => setPen('eraser')} />
      </Group>
      <Group label="Pen color">
        <div class="pen-colors">
          {PEN_COLORS.map(col => (
            <button key={col} class={'pen-sw' + (c.color === col && k === 'pen' ? ' cur' : '')} style={{ background: hexColor(col, th) }} data-tip={col.startsWith('#') ? col : col === 'dk1' ? 'Text color' : col === 'lt1' ? 'Background color' : 'Accent 1'} onMouseDown={e => e.preventDefault()} onClick={() => setPen('pen', { color: col })} />
          ))}
        </div>
      </Group>
      <Group label="Highlighter">
        <div class="pen-colors pen-colors-hl">
          {HL_COLORS.map(col => <button key={col} class={'pen-sw' + (c.hl === col && k === 'highlighter' ? ' cur' : '')} style={{ background: col }} onMouseDown={e => e.preventDefault()} onClick={() => setPen('highlighter', { hl: col })} data-tip={col} />)}
        </div>
      </Group>
      <Group label="Thickness">
        <Col>
          <Drop icon="minus" label={`Pen ${c.width} pt`} menu={() => [0.75, 1.5, 2.25, 3.5, 5, 8].map(w => ({ label: w + ' pt', icon: <span class="wt-sample" style={{ height: Math.max(1, w) + 'px' }} />, checked: c.width === w, run: () => setPen('pen', { width: w }) }))} />
          <Drop icon="minus" label={`Highlighter ${c.hlWidth} pt`} menu={() => [6, 9, 12, 18, 24].map(w => ({ label: w + ' pt', checked: c.hlWidth === w, run: () => setPen('highlighter', { hlWidth: w }) }))} />
        </Col>
      </Group>
      <Group label="Ink">
        <Btn size="lg" icon="brush-cleaning" label="Erase all ink" tip="Delete every ink stroke on this slide" onClick={() => { select(slide.value.elements.filter(e => e.type === 'ink').map(e => e.id)); A.deleteSelected() }} />
      </Group>
    </>
  )
}

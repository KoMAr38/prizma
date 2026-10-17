// Renders a slide and its elements. Used by the editor canvas, thumbnails, slide show and printing.
import { memo } from 'preact/compat'
import { themeVars, fillCss, cssColor, fontStack, fontWeightOf, DASHES } from '../core/model.js'
import { shapeParts, textRect, linePath } from '../core/shapes.js'
import { slideBackground, slideDecor, PROMPTS, layoutKind } from '../core/themes.js'
import { isEmptyHtml, numberStarts } from '../core/html.js'
import { mediaUrl, smallUrl, mediaInfo, mediaPlaying } from '../core/store.js'
import { ChartView } from './chart.jsx'
import { ThemeCtx } from './themeCtx.js'
import { Icon, iconNode } from '../ui/Icon.jsx'
import { h as hh } from 'preact'
import { tableCellLook } from './tableStyles.js'

const ptv = v => (Math.round(v * 1000) / 1000) + 'pt'
export function tsStyle (ts) {
  if (!ts) return {}
  const s = {}
  if (ts.font) s.fontFamily = fontStack(ts.font)
  if (ts.size) s.fontSize = ts.size + 'pt'
  if (ts.color) s.color = cssColor(ts.color)
  if (ts.bold) s.fontWeight = 'bold'
  else if (ts.font === '+major' || ts.font === '+minor') s.fontWeight = `var(--fw-${ts.font.slice(1)})`
  else if (ts.font && fontWeightOf(ts.font)) s.fontWeight = fontWeightOf(ts.font)
  if (ts.italic) s.fontStyle = 'italic'
  if (ts.align) s.textAlign = ts.align
  if (ts.lineH) s.lineHeight = ts.lineH
  if (ts.caps) s.textTransform = 'uppercase'
  if (ts.spacing) s.letterSpacing = ts.spacing + 'pt'
  return s
}
export function bgStyle (fill, url = mediaUrl) {
  if (!fill) return { background: '#FFFFFF' }
  if (fill.type === 'pattern') {
    const fg = cssColor(fill.fg || 'dk1'), bg = cssColor(fill.bg || 'lt1')
    const p = fill.preset || ''
    if (/grid|cross|Grid/i.test(p)) {
      const step = /lg/i.test(p) ? 36 : 12
      return { backgroundColor: bg, backgroundImage: `linear-gradient(${fg} 0.75pt, transparent 0.75pt), linear-gradient(90deg, ${fg} 0.75pt, transparent 0.75pt)`, backgroundSize: `${step}pt ${step}pt` }
    }
    if (/diag|Diag/i.test(p)) return { backgroundColor: bg, backgroundImage: `repeating-linear-gradient(45deg, ${fg} 0 1pt, transparent 1pt 6pt)` }
    if (/horz|Horz/i.test(p)) return { backgroundColor: bg, backgroundImage: `repeating-linear-gradient(0deg, ${fg} 0 1pt, transparent 1pt 6pt)` }
    if (/vert|Vert/i.test(p)) return { backgroundColor: bg, backgroundImage: `repeating-linear-gradient(90deg, ${fg} 0 1pt, transparent 1pt 6pt)` }
    return { background: `color-mix(in srgb, ${fg} 30%, ${bg})` }
  }
  return { background: fillCss(fill, url) }
}
const shadowFilter = sh => sh ? `drop-shadow(${sh.dx ?? 3}pt ${sh.dy ?? 3}pt ${sh.blur ?? 4}pt ${cssColor(sh.color || '#000000', sh.alpha ?? 0.35)})` : ''

function wrapStyle (el, ov) {
  const g = ov ? { ...el, ...ov } : el
  const s = { left: ptv(g.x), top: ptv(g.y), width: ptv(Math.max(g.w, 0.1)), height: ptv(Math.max(g.h, 0.1)) }
  const tf = []
  if (g.rot) tf.push(`rotate(${g.rot}deg)`)
  if (tf.length) s.transform = tf.join(' ')
  if (el.opacity !== undefined && el.opacity < 1) s.opacity = el.opacity
  const f = [shadowFilter(el.shadow), el.glow ? `drop-shadow(0 0 ${el.glow.size || 6}pt ${cssColor(el.glow.color || 'accent1', el.glow.alpha ?? 0.6)})` : '', el.softEdge ? `blur(${Math.round(el.softEdge * 0.6 * 100) / 100}pt)` : ''].filter(Boolean).join(' ')
  if (f) s.filter = f
  return { s, g }
}

// ---------- SVG paint helpers ----------
function gradientDef (id, fill, units = 'objectBoundingBox') {
  const stops = (fill.stops || []).map((s, i) => <stop key={i} offset={s.pos + '%'} style={{ stopColor: cssColor(s.color), stopOpacity: String(s.alpha ?? 1) }} />)
  if (fill.kind === 'radial') return <radialGradient id={id} cx={(fill.cx ?? 50) / 100} cy={(fill.cy ?? 50) / 100} r="0.75" gradientUnits={units}>{stops}</radialGradient>
  return <linearGradient id={id} x1="0" y1="0" x2="1" y2="0" gradientTransform={`rotate(${fill.angle ?? 90} .5 .5)`}>{stops}</linearGradient>
}
function paint (fill, id, w, h, defs) {
  if (!fill || fill.type === 'none') return 'none'
  if (fill.type === 'solid') return cssColor(fill.color, fill.alpha ?? 1)
  if (fill.type === 'gradient') { defs.push(gradientDef(id, fill)); return `url(#${id})` }
  if (fill.type === 'image') {
    defs.push(<pattern id={id} patternUnits="userSpaceOnUse" width={w} height={h}><image href={mediaUrl(fill.src)} width={w} height={h} preserveAspectRatio={fill.mode === 'stretch' ? 'none' : 'xMidYMid slice'} /></pattern>)
    return `url(#${id})`
  }
  if (fill.type === 'pattern') return `color-mix(in srgb, ${cssColor(fill.fg || 'dk1')} 35%, ${cssColor(fill.bg || 'lt1')})`
  return 'none'
}
function strokeProps (line) {
  if (!line || line.width === 0 || !line.color) return { stroke: 'none' }
  const w = line.width ?? 1
  const d = DASHES[line.dash || 'solid']
  return { stroke: cssColor(line.color, line.alpha ?? 1), strokeWidth: w, strokeDasharray: d ? d.map(v => v * w).join(' ') : undefined, strokeLinejoin: line.join || 'round', strokeLinecap: line.cap || (line.dash === 'dot' || line.dash === 'sysDot' ? 'round' : 'butt') }
}
function marker (id, type, color, size, start) {
  if (!type || type === 'none') return null
  const shapes = {
    triangle: <path d="M0 0 L10 5 L0 10 Z" style={{ fill: color }} />,
    arrow: <path d="M1 1 L9 5 L1 9" style={{ fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round' }} />,
    stealth: <path d="M0 0 L10 5 L0 10 L3 5 Z" style={{ fill: color }} />,
    diamond: <path d="M0 5 L5 0 L10 5 L5 10 Z" style={{ fill: color }} />,
    oval: <circle cx="5" cy="5" r="4.5" style={{ fill: color }} />
  }
  const refX = type === 'diamond' || type === 'oval' ? 5 : 8.5
  return <marker id={id} viewBox="0 0 10 10" refX={refX} refY="5" markerWidth={size} markerHeight={size} markerUnits="userSpaceOnUse" orient={start ? 'auto-start-reverse' : 'auto'}>{shapes[type] || shapes.triangle}</marker>
}

// ---------- text body ----------
// WordArt-style text effects (shadow, glow, outline, gradient fill)
export function textFxCss (fx) {
  const s = {}
  const shadows = []
  if (fx.shadow) { const sh = fx.shadow === true ? { dx: 2, dy: 2, blur: 3, alpha: 0.45 } : fx.shadow; shadows.push(`${sh.dx}pt ${sh.dy}pt ${sh.blur}pt rgba(0,0,0,${sh.alpha})`) }
  if (fx.glow) shadows.push(`0 0 ${fx.glow.size || 8}pt ${cssColor(fx.glow.color || 'accent1')}`)
  if (shadows.length) s.textShadow = shadows.join(', ')
  if (fx.outline) { s.WebkitTextStroke = `${fx.outline.width || 1}pt ${cssColor(fx.outline.color || 'dk1')}`; s.paintOrder = 'stroke fill' }
  if (fx.hollow) s.WebkitTextFillColor = 'transparent'
  if (fx.gradient) { s.backgroundImage = `linear-gradient(90deg, ${fx.gradient.map(c => cssColor(c)).join(', ')})`; s.WebkitBackgroundClip = 'text'; s.backgroundClip = 'text'; s.WebkitTextFillColor = 'transparent' }
  return s
}
function TextBody ({ el, box, editor, mode, ctx }) {
  const ins = el.inset || { l: 7.2, t: 3.6, r: 7.2, b: 3.6 }
  const tr = el.type === 'shape' ? textRect({ ...el, ...box }) : { l: 0, t: 0, r: 0, b: 0 }
  const justify = el.vAlign === 'middle' ? 'center' : el.vAlign === 'bottom' ? 'flex-end' : 'flex-start'
  const empty = isEmptyHtml(el.html)
  const prompt = mode === 'edit' && el.ph && empty && !editor
  const st = {
    left: ptv(tr.l), top: ptv(tr.t), right: ptv(tr.r), bottom: ptv(tr.b),
    padding: `${ptv(ins.t)} ${ptv(ins.r)} ${ptv(ins.b)} ${ptv(ins.l)}`, justifyContent: justify
  }
  const rtStyle = tsStyle(el.ts)
  if (el.wrap === false) rtStyle.whiteSpace = 'pre'
  if (el.vertical) {
    rtStyle.writingMode = 'vertical-rl'
    if (el.vertical === 'stacked') rtStyle.textOrientation = 'upright'
    if (el.vertical === 'vert270') st.transform = 'rotate(180deg)'
  }
  if (el.textFx) Object.assign(rtStyle, textFxCss(el.textFx))
  if (el.fontScale && el.fontScale < 1 && el.autofit === 'shrink') rtStyle.zoom = el.fontScale
  if (el.flipText) st.transform = 'rotate(180deg)'
  if (!editor && empty && !prompt) return null
  return (
    <div class="pz-tbody" style={st}>
      {editor ? (typeof editor === 'function' ? editor(rtStyle) : editor) : (prompt
        ? <div class="pz-rt pz-prompt" style={rtStyle}><p>{PROMPTS[el.ph] || PROMPTS.body}</p></div>
        : <div class="pz-rt" style={rtStyle} dangerouslySetInnerHTML={{ __html: markEmpty(el.html) }} />)}
    </div>
  )
}
// Empty bulleted lines show no bullet (and take no number) outside the text editor, as in PowerPoint
const markEmpty = html => /data-(bu|num)/.test(html || '') ? numberStarts(html).replace(/<p([^>]*)>((?:<span[^>]*>)*<br\s*\/?>(?:<\/span>)*)<\/p>/g, '<p$1 data-empty="">$2</p>') : html

// ---------- element renderers ----------
const SKEL_LINES = { title: [62], ctrTitle: [70], subTitle: [56, 40], body: [84, 72, 78, 58], obj: [84, 72, 78, 58] }
function PlaceholderSkeleton ({ el, style }) {
  const ink = 'color-mix(in srgb, var(--c-dk1) 38%, transparent)'
  const box = { ...style, border: `9pt dashed color-mix(in srgb, var(--c-dk1) 30%, transparent)`, borderRadius: '8pt', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: el.ph === 'title' || el.ph === 'ctrTitle' ? 'center' : 'flex-start', alignItems: el.ph === 'ctrTitle' || el.ph === 'subTitle' ? 'center' : 'flex-start', gap: '22pt', padding: '26pt 30pt' }
  if (el.ph === 'pic') return <div class="pz-el" style={{ ...box, alignItems: 'center', justifyContent: 'center', color: ink }}><Icon name="image" size={Math.min(el.w, el.h) * 0.42} stroke={1.2} /></div>
  const big = el.ph === 'title' || el.ph === 'ctrTitle'
  const lines = SKEL_LINES[el.ph] || (el.h > 140 ? SKEL_LINES.body : [60])
  return (
    <div class="pz-el" style={box}>
      {lines.map((w, i) => <i key={i} style={{ display: 'block', flex: 'none', width: w + '%', height: big ? Math.min(46, el.h * 0.34) + 'pt' : '18pt', borderRadius: '9pt', background: ink }} />)}
    </div>
  )
}
function ShapeSvg ({ el, g, uidp }) {
  const defs = []
  const w = Math.max(g.w, 0.01), h = Math.max(g.h, 0.01)
  const parts = shapeParts({ ...el, w, h })
  const base = paint(el.fill, uidp + 'f', w, h, defs)
  const sp = strokeProps(el.line)
  const flip = (el.flipH || el.flipV) ? `translate(${el.flipH ? w : 0} ${el.flipV ? h : 0}) scale(${el.flipH ? -1 : 1} ${el.flipV ? -1 : 1})` : undefined
  const lc = el.line && el.line.color ? cssColor(el.line.color) : null
  const ms = Math.max(6, (el.line?.width || 1) * 3.5)
  const mStart = el.line?.head && el.line.head !== 'none' ? marker(uidp + 'ms', el.line.head, lc, ms, true) : null
  const mEnd = el.line?.tail && el.line.tail !== 'none' ? marker(uidp + 'me', el.line.tail, lc, ms, false) : null
  if (mStart) defs.push(mStart)
  if (mEnd) defs.push(mEnd)
  return (
    <svg class="pz-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {defs.length > 0 && <defs>{defs}</defs>}
      <g transform={flip}>
        {parts.map((p, i) => {
          const fillv = p.fill === 'none' ? 'none' : base
          return [
            <path key={i} d={p.d} style={{ fill: fillv, fillRule: p.nonzero ? 'nonzero' : (p.evenodd ? 'evenodd' : 'nonzero'), ...sp }} marker-start={mStart && i === 0 ? `url(#${uidp}ms)` : undefined} marker-end={mEnd && i === parts.length - 1 ? `url(#${uidp}me)` : undefined} />,
            (p.fill === 'darken' || p.fill === 'lighten') && base !== 'none' ? <path key={i + 'o'} d={p.d} style={{ fill: p.fill === 'darken' ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.28)', stroke: 'none' }} /> : null
          ]
        })}
      </g>
    </svg>
  )
}
function LineSvg ({ el, g, uidp }) {
  const w = g.w, h = g.h
  const d = linePath({ ...el, w, h })
  const sp = strokeProps(el.line)
  const lc = el.line?.color ? cssColor(el.line.color) : '#000'
  const ms = Math.max(6, (el.line?.width || 1) * 3.5)
  const defs = [marker(uidp + 'ms', el.line?.head, lc, ms, true), marker(uidp + 'me', el.line?.tail, lc, ms, false)].filter(Boolean)
  const flip = el.path && (el.flipH || el.flipV) ? `translate(${el.flipH ? w : 0} ${el.flipV ? h : 0}) scale(${el.flipH ? -1 : 1} ${el.flipV ? -1 : 1})` : undefined
  return (
    <svg class="pz-svg pz-linesvg" viewBox={`0 0 ${Math.max(w, 1)} ${Math.max(h, 1)}`} style={{ width: ptv(Math.max(w, 1)), height: ptv(Math.max(h, 1)) }}>
      {defs.length > 0 && <defs>{defs}</defs>}
      <g transform={flip}>
        <path d={d} style={{ fill: 'none', ...sp, strokeLinecap: el.line?.cap || 'round' }}
          marker-start={el.line?.head && el.line.head !== 'none' ? `url(#${uidp}ms)` : undefined} marker-end={el.line?.tail && el.line.tail !== 'none' ? `url(#${uidp}me)` : undefined} />
      </g>
    </svg>
  )
}
const CLIP = {
  ellipse: 'ellipse(50% 50% at 50% 50%)',
  roundRect: 'inset(0 round 12%)',
  triangle: 'polygon(50% 0, 100% 100%, 0 100%)',
  diamond: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
  hexagon: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)',
  pentagon: 'polygon(50% 0, 100% 38%, 81% 100%, 19% 100%, 0 38%)',
  parallelogram: 'polygon(25% 0, 100% 0, 75% 100%, 0 100%)',
  rtTriangle: 'polygon(0 0, 100% 100%, 0 100%)'
}
function ImageEl ({ el, g, uidp, small }) {
  const c = g.crop || { l: 0, t: 0, r: 0, b: 0 } // g is el with the live drag on top, so a crop drag shows its new crop
  const fw = Math.max(0.01, 1 - c.l - c.r), fh = Math.max(0.01, 1 - c.t - c.b)
  const f = el.adjust || {}
  const filter = [f.brightness !== undefined && `brightness(${1 + f.brightness / 100})`, f.contrast !== undefined && `contrast(${1 + f.contrast / 100})`, f.saturate !== undefined && `saturate(${f.saturate / 100})`, f.grayscale && 'grayscale(1)', f.sepia && 'sepia(.85)', f.blur && `blur(${f.blur}pt)`].filter(Boolean).join(' ')
  const clip = el.geom && el.geom !== 'rect' ? (CLIP[el.geom] || (el.geom === 'roundRect' ? `inset(0 round ${(el.radius ?? 12)}pt)` : undefined)) : (el.radius ? `inset(0 round ${el.radius}pt)` : undefined)
  // EMF/WMF that Windows couldn't turn into a picture show as missing rather than as a broken image
  // null: the thumbnail's small copy is still being made
  const url = /x-(emf|wmf)$/.test(mediaInfo(el.src)?.mime || '') ? '' : small ? smallUrl(el.src) : mediaUrl(el.src)
  const flip = (el.flipH || el.flipV) ? `scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})` : undefined
  return [
    <div class="pz-imgclip" style={{ clipPath: clip, transform: flip, opacity: f.transparency ? 1 - f.transparency / 100 : undefined }}>
      {url
        ? <img src={url} draggable={false} alt="" style={{ left: (-c.l / fw * 100) + '%', top: (-c.t / fh * 100) + '%', width: (100 / fw) + '%', height: (100 / fh) + '%', filter: filter || undefined }} />
        : url === null ? null : <div class="pz-missing"><Icon name="image-off" size={24} /></div>}
    </div>,
    el.line && el.line.color && el.line.width ? <ShapeSvg el={{ ...el, shape: el.geom === 'ellipse' ? 'ellipse' : el.geom || 'rect', fill: null, path: null }} g={g} uidp={uidp} /> : null
  ]
}
function TableEl ({ el, editCellNode, mode }) {
  const rows = el.rows || [], cols = el.cols || []
  const ts = tsStyle(el.ts)
  return (
    <table class="pz-table" style={ts}>
      <colgroup>{cols.map((w, i) => <col key={i} style={{ width: ptv(w) }} />)}</colgroup>
      <tbody>
        {rows.map((rh, r) => (
          <tr key={r} style={{ height: ptv(rh) }}>
            {(el.cells[r] || []).map((cell, c) => {
              if (!cell || cell.merged) return null
              const look = tableCellLook(el, r, c)
              const st = {
                background: cell.fill ? fillCss(cell.fill, mediaUrl) : look.fill ? cssColor(look.fill) : 'transparent',
                color: cell.color ? cssColor(cell.color) : look.color ? cssColor(look.color) : undefined,
                fontWeight: cell.bold || look.bold ? 'bold' : undefined,
                verticalAlign: cell.vAlign === 'middle' ? 'middle' : cell.vAlign === 'bottom' ? 'bottom' : 'top',
                padding: cell.inset ? `${ptv(cell.inset.t)} ${ptv(cell.inset.r)} ${ptv(cell.inset.b)} ${ptv(cell.inset.l)}` : '3.6pt 7.2pt'
              }
              for (const side of ['top', 'right', 'bottom', 'left']) {
                const b = (cell.borders && cell.borders[side]) || look.borders?.[side]
                if (b && b.width && b.color) st['border' + side[0].toUpperCase() + side.slice(1)] = `${ptv(b.width)} ${b.dash && b.dash !== 'solid' ? 'dashed' : 'solid'} ${cssColor(b.color)}`
              }
              const editingThis = editCellNode && editCellNode.r === r && editCellNode.c === c
              return (
                <td key={c} colSpan={cell.colspan || 1} rowSpan={cell.rowspan || 1} style={st} data-r={r} data-c={c}>
                  {editingThis ? editCellNode.node : <div class="pz-rt" dangerouslySetInnerHTML={{ __html: markEmpty(cell.html || '') }} />}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
function IconEl ({ el }) {
  const node = iconNode(el.icon)
  return (
    <svg class="pz-svg" viewBox="0 0 24 24" preserveAspectRatio="none" style={{ stroke: cssColor(el.color || 'accent1'), fill: el.fillIcon ? cssColor(el.fillIcon) : 'none' }} stroke-width={el.stroke || 2} stroke-linecap="round" stroke-linejoin="round">
      {node && node.map(([tag, attrs], i) => hh(tag, { key: i, ...attrs, 'vector-effect': el.keepStroke ? 'non-scaling-stroke' : undefined }))}
    </svg>
  )
}
function InkEl ({ el }) {
  const vb = el.vb || { w: el.w, h: el.h }
  return (
    <svg class="pz-svg" viewBox={`0 0 ${Math.max(vb.w, 0.01)} ${Math.max(vb.h, 0.01)}`} preserveAspectRatio="none">
      {(el.paths || []).map((p, i) => <path key={i} d={p.d} style={{ fill: 'none', stroke: cssColor(p.color || 'dk1', p.alpha ?? 1), strokeWidth: p.width || 2, strokeLinecap: 'round', strokeLinejoin: 'round', mixBlendMode: p.hl ? 'multiply' : undefined }} />)}
    </svg>
  )
}
function MediaEl ({ el, mode }) {
  if (mode === 'edit' && mediaPlaying.value === el.id) {
    return el.type === 'audio'
      ? <div class="pz-audio"><audio src={mediaUrl(el.src)} autoPlay controls style={{ position: 'absolute', left: 0, top: '100%', width: '240pt' }} onEnded={() => { mediaPlaying.value = null }} /></div>
      : <video src={mediaUrl(el.src)} autoPlay controls style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} onEnded={() => { mediaPlaying.value = null }} />
  }
  // show playback options: rewind after playing (load() brings the poster back), and a full-screen video leaves full screen at its end
  const ended = e => { const m = e.currentTarget; if (document.fullscreenElement === m) document.exitFullscreen().catch(() => {}); if (el.rewind) { if (el.poster) m.load(); else m.currentTime = 0 } }
  if (el.type === 'audio') {
    return <div class="pz-audio">{!(mode === 'show' && el.hideIdle) && <Icon name="volume-2" size={Math.min(el.w, el.h) * 0.6} stroke={1.5} />}{mode === 'show' && <audio class="pz-media-node" src={mediaUrl(el.src)} preload="auto" loop={!!el.loop} data-autoplay={el.autoplay ? '1' : ''} onEnded={ended} />}</div>
  }
  if (mode === 'show') {
    return <video class="pz-media-node" src={mediaUrl(el.src)} poster={el.poster ? mediaUrl(el.poster) : undefined} preload="auto" playsInline loop={!!el.loop} muted={!!el.muted} data-autoplay={el.autoplay ? '1' : ''} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', visibility: el.hideIdle ? 'hidden' : undefined }}
      onPlay={e => { if (el.hideIdle) e.currentTarget.style.visibility = ''; if (el.fullscreen) e.currentTarget.requestFullscreen().catch(() => {}) }}
      onPause={el.hideIdle ? e => { e.currentTarget.style.visibility = 'hidden' } : undefined} onEnded={ended} />
  }
  return (
    <div class="pz-video">
      {el.poster ? <img src={mediaUrl(el.poster)} alt="" draggable={false} /> : <video src={mediaUrl(el.src) + '#t=0.5'} preload="metadata" muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
      <span class="pz-play"><Icon name="play" size={22} /></span>
    </div>
  )
}

const containsId = (el, id) => !!id && (el.id === id || (el.children || []).some(c => containsId(c, id)))
const liveIn = (el, map) => !!map && (el.children || []).some(c => map[c.id] || liveIn(c, map))

export const ElementView = memo(function ElementView ({ el, ov, mode, ctx, editId, editorFn, editCellNode, liveMap, hidden, ghost }) {
  if (el.hidden) return null
  const { s, g } = wrapStyle(el, ov)
  const uidp = `${ctx || 'x'}-${el.id}-`
  const editor = editId && editId === el.id ? editorFn : undefined
  if (hidden) s.visibility = 'hidden'
  let cls = 'pz-el pz-' + el.type
  if (ghost) cls += ' pz-ghost'
  if (mode === 'edit' && el.ph && isEmptyHtml(el.html) && el.type === 'text' && !editor) cls += ' pz-ph-empty'
  // layout previews draw empty placeholders as wireframes, like the layout gallery in PowerPoint
  if (mode === 'layout' && el.ph && isEmptyHtml(el.html) && (el.type === 'text' || el.type === 'shape')) return <PlaceholderSkeleton el={el} style={s} />
  const link = el.link && mode === 'show' ? el.link : null
  const attrs = { class: cls, style: s, 'data-id': el.id, 'data-link': link ? (link.url || ('#slide:' + link.slide)) : undefined }
  switch (el.type) {
    case 'text': {
      const tb = <TextBody el={el} box={g} editor={editor} mode={mode} ctx={ctx} />
      const hasBox = (el.fill && el.fill.type !== 'none') || (el.line && el.line.color && el.line.width)
      if (el.ph === 'pic' && isEmptyHtml(el.html)) {
        if (mode !== 'edit') return null
        return <div {...attrs} class={cls + ' pz-picph'}><div class="pz-picph-in"><Icon name="image-plus" size={30} stroke={1.4} /><span>{PROMPTS.pic}</span></div></div>
      }
      return (
        <div {...attrs}>
          {hasBox && <ShapeSvg el={{ ...el, shape: el.geom || 'rect', path: null }} g={g} uidp={uidp} />}
          {tb}
        </div>
      )
    }
    case 'shape':
      return <div {...attrs}><ShapeSvg el={el} g={g} uidp={uidp} /><TextBody el={el} box={g} editor={editor} mode={mode} ctx={ctx} /></div>
    case 'line':
      return <div {...attrs}><LineSvg el={el} g={g} uidp={uidp} /></div>
    case 'image':
      return <div {...attrs}><ImageEl el={el} g={g} uidp={uidp} small={mode === 'thumb'} /></div>
    case 'table':
      return <div {...attrs}><TableEl el={el} editCellNode={editCellNode} mode={mode} /></div>
    case 'chart':
      return <div {...attrs}><ChartView el={{ ...el, w: g.w, h: g.h }} uidp={uidp} /></div>
    case 'icon':
      return <div {...attrs}><IconEl el={el} /></div>
    case 'ink':
      return <div {...attrs}><InkEl el={el} /></div>
    case 'video': case 'audio':
      if (mode === 'show' && el.hideIdle) s.background = 'none' // a video hidden while idle must not leave its black box behind
      return <div {...attrs}><MediaEl el={el} mode={mode} /></div>
    case 'group': {
      // while a group is being resized, scale its content until the change is committed
      const sx = ov && ov.w !== undefined && el.w ? g.w / el.w : 1, sy = ov && ov.h !== undefined && el.h ? g.h / el.h : 1
      const kids = (el.children || []).map(c => (
        <ElementView key={c.id} el={c} mode={mode} ctx={ctx}
          ov={liveMap ? liveMap[c.id] : undefined}
          editId={editId} editorFn={containsId(c, editId) ? editorFn : undefined}
          editCellNode={editCellNode && containsId(c, editCellNode.id) ? editCellNode : undefined}
          liveMap={liveIn(c, liveMap) ? liveMap : undefined} />
      ))
      return (
        <div {...attrs}>
          {sx !== 1 || sy !== 1 ? <div style={{ position: 'absolute', left: 0, top: 0, width: ptv(el.w), height: ptv(el.h), transform: `scale(${sx}, ${sy})`, transformOrigin: '0 0' }}>{kids}</div> : kids}
        </div>
      )
    }
    default:
      return null
  }
})

function HeaderFooter ({ docObj, slide, index }) {
  const hf = docObj.hf
  if (!hf || (!hf.number && !hf.footer && !hf.date)) return null
  if (hf.hideOnTitle && layoutKind(slide.layout) === 'title' && slide.layout === 'title') return null
  const W = docObj.size.w, H = docObj.size.h
  const st = { fontFamily: 'var(--f-minor)', fontSize: '10.5pt', color: 'color-mix(in srgb, var(--c-dk1) 62%, transparent)' }
  const date = hf.date ? (hf.dateText || new Date().toLocaleDateString()) : ''
  return (
    <div class="pz-hf">
      {date && <div style={{ ...st, position: 'absolute', left: ptv(W * 0.07), top: ptv(H - 34), width: ptv(W * 0.22) }}>{date}</div>}
      {hf.footer && <div style={{ ...st, position: 'absolute', left: ptv(W * 0.3), top: ptv(H - 34), width: ptv(W * 0.4), textAlign: 'center' }}>{hf.footer}</div>}
      {hf.number && <div style={{ ...st, position: 'absolute', left: ptv(W * 0.71), top: ptv(H - 34), width: ptv(W * 0.22), textAlign: 'right' }}>{index + 1}</div>}
    </div>
  )
}

// Full slide. `overlay` renders above elements (editor handles); `renderEditor(el)` swaps in a text editor.
export function SlideView ({ slide, docObj, mode = 'thumb', ctx, liveMap, editingId, editorNode, editCellNode, hiddenIds, ghostIds, index = 0, overlay, className = '', style: extraStyle, onRef, children }) {
  if (!slide || !docObj) return null
  const W = docObj.size.w, H = docObj.size.h
  const theme = docObj.theme
  const bg = slideBackground(slide, theme)
  const decor = slideDecor(slide, theme, docObj.size)
  const cx = ctx || mode
  const style = { width: ptv(W), height: ptv(H), ...themeVars(theme), ...bgStyle(bg, mode === 'thumb' && bg?.mode !== 'tile' ? id => smallUrl(id) || '' : mediaUrl), ...extraStyle }
  return (
    <ThemeCtx.Provider value={theme}>
    <div class={'pz-slide ' + className} style={style} ref={onRef} data-slide={slide.id}>
      {decor.length > 0 && <div class="pz-master">{decor.map(el => <ElementView key={el.id} el={el} mode={mode === 'edit' ? 'master' : mode} ctx={cx + 'm' + slide.id} />)}</div>}
      {slide.elements.map(el => (
        <ElementView key={el.id} el={el} mode={mode} ctx={cx + slide.id}
          ov={liveMap ? liveMap[el.id] : undefined}
          editId={editingId && containsId(el, editingId) ? editingId : undefined}
          editorFn={editingId && containsId(el, editingId) ? editorNode : undefined}
          liveMap={liveIn(el, liveMap) ? liveMap : undefined}
          editCellNode={editCellNode && containsId(el, editCellNode.id) ? editCellNode : undefined}
          hidden={hiddenIds ? hiddenIds.has(el.id) : false}
          ghost={ghostIds ? ghostIds.has(el.id) : false} />
      ))}
      <HeaderFooter docObj={docObj} slide={slide} index={index} />
      {overlay}
      {children}
    </div>
    </ThemeCtx.Provider>
  )
}

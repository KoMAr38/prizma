// Contextual tabs: Shape Format, Picture Format, Table Design, Table Layout, Chart Design, Playback.
import { slide, selection, selected, editCell, tool, theme as themeSig, openDialog, updateEl, cropMode, mediaUrl, lastColors, mediaPlaying, finishEditing, addMedia } from '../../core/store.js'
import { changePicture } from '../../editor/Stage.jsx'
import { pickPicture } from '../../app/commands.js'
import { hexColor, solid, round2, recrop, findEl } from '../../core/model.js'
import { Group, Col, Row, Gallery, PickGrid, NumField, Check, ColorBtn, unitFmt, unitParse, addRecentColor } from '../controls.jsx'
import {
  Btn, Drop, Split, Icon, runCmd, cmdEnabled, A, ShapeIcon, RECENT_SHAPES, pickShape, ShapePicker, QuickStylesGallery, FillBtn, OutlineBtn, EffectsBtn,
  ArrangeGroup, alignMenu, rotateMenu, SizeFields, openFormat, outlineMenu, closePop, unitStep
} from './common.jsx'
import { FontColorBtn } from './home.jsx'
import { WORDART, applyWordArt, wordArtCss } from './insert.jsx'
import { TABLE_STYLES, tableCellLook } from '../../render/tableStyles.js'
import { CHART_TYPES } from '../../render/chart.jsx'

const one = () => (selected.value.length === 1 ? selected.value[0] : null)

function ArrangeGroupFull () {
  const dis = !selection.value.length
  return (
    <Group label="Arrange">
      <Col><ArrangeGroup /><Btn icon="layers" label="Selection pane" onClick={() => runCmd('view.selectionPane')} /></Col>
      <Col>
        <Drop icon="align-center-vertical" label="Align" disabled={dis} menu={alignMenu} />
        <Drop icon="group" label="Group" disabled={dis} menu={() => [{ label: 'Group', icon: 'group', kbd: 'Ctrl+G', disabled: !cmdEnabled('obj.group'), run: () => runCmd('obj.group') }, { label: 'Ungroup', icon: 'ungroup', kbd: 'Ctrl+Shift+G', disabled: !cmdEnabled('obj.ungroup'), run: () => runCmd('obj.ungroup') }]} />
        <Drop icon="rotate-cw" label="Rotate" disabled={dis} menu={rotateMenu} />
      </Col>
    </Group>
  )
}
const AltGroup = () => <Group label="Accessibility"><Btn size="lg" icon="message-square-text" label="Alt text" desc="Describe the object for people who use screen readers." disabled={!one()} onClick={() => runCmd('obj.alt')} /></Group>
const SizeGroup = ({ children }) => <Group label="Size" launcher={() => openFormat('size')}>{children}<Col><SizeFields /></Col></Group>

// ---------- Shape Format ----------
export const textFxMenu = () => [
  { label: 'No effect', icon: 'ban', run: () => A.setProps({ textFx: undefined }) },
  { label: 'Shadow', icon: 'square-dashed', run: () => A.setProps({ textFx: { ...(one()?.textFx || {}), shadow: true } }) },
  { label: 'Glow', icon: 'sun', sub: ['accent1', 'accent2', 'accent3', 'accent4', 'lt1', 'dk1'].map(c => ({ label: c.replace('accent', 'Accent ').replace('lt1', 'Background').replace('dk1', 'Text'), icon: <span class="glow-sample" style={{ boxShadow: `0 0 6px 2px ${hexColor(c, themeSig.value)}` }} />, run: () => A.setProps({ textFx: { ...(one()?.textFx || {}), glow: { color: c, size: 8 } } }) })) },
  { label: 'Outline', icon: 'type-outline', sub: ['dk1', 'lt1', 'accent1', 'accent2'].map(c => ({ label: c.replace('accent', 'Accent ').replace('lt1', 'Background').replace('dk1', 'Text'), run: () => A.setProps({ textFx: { ...(one()?.textFx || {}), outline: { color: c, width: 1.25 } } }) })) },
  { label: 'Gradient fill', icon: 'blend', run: () => A.setProps({ textFx: { ...(one()?.textFx || {}), gradient: ['accent1', 'accent2'] } }) }
]
export function ShapeFormatTab () {
  const items = RECENT_SHAPES.map(k => ({ key: k, label: k, ...(k.startsWith('line:') ? { line: k.slice(5) } : { shape: k }) }))
  const th = themeSig.value
  return (
    <>
      <Group label="Insert shapes">
        <div class="shape-strip">
          <PickGrid items={items} cols={6} itemW={24} itemH={24} onPick={pickShape} render={it => <ShapeIcon shape={it.key} size={18} />} />
          <Drop icon="chevrons-down" tip="All shapes" render={() => <ShapePicker />} />
        </div>
        <Col>
          <Drop icon="pencil-ruler" label="Edit shape" disabled={!selected.value.some(e => e.type === 'shape' || e.type === 'text' || e.type === 'image')} render={() => <div class="pop-pad"><div class="cp-h">Change shape</div><ShapePicker onPick={it => it.shape && A.changeShape(it.shape)} /></div>} />
          <Btn icon="type" label="Text box" active={tool.value?.kind === 'text'} onClick={() => { tool.value = { kind: 'text' } }} />
        </Col>
      </Group>
      <Group label="Shape styles" launcher={() => openFormat('fill')}>
        <QuickStylesGallery visible={6} />
        <Col><FillBtn /><OutlineBtn /><EffectsBtn /></Col>
      </Group>
      <Group label="WordArt styles" launcher={() => openFormat('text')}>
        <Gallery items={WORDART} visible={3} itemW={40} itemH={40} expandCols={5} render={w => <span style={{ color: hexColor(w.color, th), fontWeight: 800, fontSize: '22px', ...wordArtCss(w.fx, th) }}>A</span>} onPick={applyWordArt} />
        <Col>
          <FontColorBtn />
          <Drop icon="wand-sparkles" label="Text effects" menu={textFxMenu} disabled={!selection.value.length} />
        </Col>
      </Group>
      <AltGroup />
      <ArrangeGroupFull />
      <SizeGroup />
    </>
  )
}

// ---------- Picture Format ----------
const ADJ = v => ({ ...(one()?.adjust || {}), ...v })
const setAdj = patch => { const ids = selected.value.filter(e => e.type === 'image').map(e => e.id); A.setProps({ adjust: ADJ(patch) }, ids) }
function PicPreview ({ adj, size = 64 }) {
  const e = one()
  const src = e?.type === 'image' ? mediaUrl(e.src) : ''
  const f = adj || {}
  const filter = [f.brightness !== undefined && `brightness(${1 + f.brightness / 100})`, f.contrast !== undefined && `contrast(${1 + f.contrast / 100})`, f.saturate !== undefined && `saturate(${f.saturate / 100})`, f.grayscale && 'grayscale(1)', f.sepia && 'sepia(.85)', f.blur && `blur(${f.blur / 2}px)`].filter(Boolean).join(' ')
  return <img class="pic-prev" src={src} style={{ width: size + 'px', height: size * 0.7 + 'px', filter, opacity: f.transparency ? 1 - f.transparency / 100 : 1 }} alt="" />
}
export const PIC_STYLES = [
  { label: 'Simple frame, white', line: { color: 'lt1', width: 7 }, shadow: { dx: 0, dy: 3, blur: 6, alpha: 0.35 } },
  { label: 'Simple frame, black', line: { color: 'dk1', width: 6 } },
  { label: 'Soft edge rectangle', radius: 6, shadow: { dx: 0, dy: 6, blur: 14, alpha: 0.35 } },
  { label: 'Rounded rectangle', geom: 'roundRect', radius: 18 },
  { label: 'Drop shadow rectangle', shadow: { dx: 6, dy: 6, blur: 8, alpha: 0.45 } },
  { label: 'Oval', geom: 'ellipse' },
  { label: 'Thick accent frame', line: { color: 'accent1', width: 8 } },
  { label: 'Center shadow', shadow: { dx: 0, dy: 0, blur: 16, alpha: 0.6 } },
  { label: 'Hexagon', geom: 'hexagon' },
  { label: 'Plain', reset: true }
]
const applyPicStyle = st => {
  const ids = selected.value.filter(e => e.type === 'image').map(e => e.id)
  A.setProps({ line: st.line || null, shadow: st.shadow || undefined, radius: st.radius || undefined, geom: st.geom || undefined }, ids)
}
export const CROP_SHAPES = ['rect', 'roundRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond', 'pentagon', 'hexagon', 'parallelogram']
const ASPECTS = [['Square 1:1', 1], ['Landscape 3:2', 3 / 2], ['Landscape 4:3', 4 / 3], ['Landscape 16:9', 16 / 9], ['Portrait 2:3', 2 / 3], ['Portrait 3:4', 3 / 4], ['Portrait 9:16', 9 / 16]]
export function cropToAspect (e, T) {
  const c = e.crop || { l: 0, t: 0, r: 0, b: 0 }
  const FW = e.w / (1 - c.l - c.r), FH = e.h / (1 - c.t - c.b)
  const R = FW / FH
  let crop
  if (T > R) { const f = R / T; crop = { l: 0, r: 0, t: (1 - f) / 2, b: (1 - f) / 2 } } else { const f = T / R; crop = { t: 0, b: 0, l: (1 - f) / 2, r: (1 - f) / 2 } }
  const nw = FW * (1 - crop.l - crop.r), nh = FH * (1 - crop.t - crop.b)
  const k = Math.min(e.w / nw, e.h / nh, 1.5)
  updateEl(e.id, x => { x.crop = crop; x.w = round2(nw * k); x.h = round2(nh * k); x.x += (e.w - x.w) / 2; x.y += (e.h - x.h) / 2 })
}
export function PictureFormatTab () {
  const e = one()
  const pic = e && e.type === 'image' ? e : null
  const adj = pic?.adjust || {}
  const corr = []
  for (const c of [-40, -20, 0, 20, 40]) for (const b of [-40, -20, 0, 20, 40]) corr.push({ label: `Brightness ${b > 0 ? '+' : ''}${b}%, Contrast ${c > 0 ? '+' : ''}${c}%`, brightness: b, contrast: c })
  const sat = [0, 33, 66, 100, 200, 300, 400].map(v => ({ label: `Saturation ${v}%`, saturate: v }))
  return (
    <>
      <Group label="Adjust" launcher={() => openFormat('picture')}>
        <Drop size="lg" icon="sun-medium" label="Corrections" disabled={!pic} render={() => (
          <div class="pop-pad"><div class="cp-h">Brightness and contrast</div>
            <PickGrid cols={5} itemW={72} itemH={54} items={corr} render={it => <PicPreview adj={{ ...adj, brightness: it.brightness, contrast: it.contrast }} />} onPick={it => setAdj({ brightness: it.brightness || undefined, contrast: it.contrast || undefined })} isCurrent={it => (adj.brightness || 0) === it.brightness && (adj.contrast || 0) === it.contrast} />
          </div>
        )} />
        <Drop size="lg" icon="palette" label="Color" disabled={!pic} render={() => (
          <div class="pop-pad"><div class="cp-h">Color saturation</div>
            <PickGrid cols={7} itemW={72} itemH={54} items={sat} render={it => <PicPreview adj={{ ...adj, grayscale: false, sepia: false, saturate: it.saturate }} />} onPick={it => setAdj({ saturate: it.saturate === 100 ? undefined : it.saturate, grayscale: undefined, sepia: undefined })} />
            <div class="cp-h">Recolor</div>
            <PickGrid cols={3} itemW={72} itemH={54} items={[{ label: 'No recolor' }, { label: 'Grayscale', grayscale: true }, { label: 'Sepia', sepia: true }]} render={it => <PicPreview adj={{ ...adj, grayscale: it.grayscale, sepia: it.sepia }} />} onPick={it => setAdj({ grayscale: it.grayscale || undefined, sepia: it.sepia || undefined })} />
          </div>
        )} />
        <Drop size="lg" icon="brush" label="Artistic effects" disabled={!pic} render={() => (
          <div class="pop-pad"><PickGrid cols={4} itemW={72} itemH={54} items={[{ label: 'None', blur: 0 }, { label: 'Blur 2 pt', blur: 2 }, { label: 'Blur 5 pt', blur: 5 }, { label: 'Blur 10 pt', blur: 10 }]} render={it => <PicPreview adj={{ ...adj, blur: it.blur }} />} onPick={it => setAdj({ blur: it.blur || undefined })} /></div>
        )} />
        <Drop size="lg" icon="blend" label="Transparency" disabled={!pic} render={() => (
          <div class="pop-pad"><PickGrid cols={7} itemW={64} itemH={50} items={[0, 15, 30, 50, 65, 80, 95].map(v => ({ label: `Transparency ${v}%`, transparency: v }))} render={it => <PicPreview size={56} adj={{ ...adj, transparency: it.transparency }} />} onPick={it => setAdj({ transparency: it.transparency || undefined })} /></div>
        )} />
        <Col>
          <Btn icon="image-up" label="Change picture" disabled={!pic} onClick={() => pic && changePicture(pic.id)} />
          <Btn icon="rotate-ccw" label="Reset picture" disabled={!pic} onClick={() => updateEl(pic.id, x => { Object.assign(x, recrop(x, null)); x.line = null; delete x.adjust; delete x.shadow; delete x.radius; delete x.geom })} />
        </Col>
      </Group>
      <Group label="Picture styles" launcher={() => openFormat('fill')}>
        <Gallery items={PIC_STYLES} visible={5} itemW={50} itemH={44} expandCols={5} render={st => <span class="pic-style" style={{ borderRadius: st.geom === 'ellipse' ? '50%' : (st.radius || 0) + 'px', border: st.line ? `${Math.min(4, st.line.width / 2)}px solid ${hexColor(st.line.color, themeSig.value)}` : 'none', boxShadow: st.shadow ? '0 3px 6px rgba(0,0,0,.45)' : 'none', clipPath: st.geom === 'hexagon' ? 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' : undefined }}><PicPreview size={40} adj={adj} /></span>} onPick={applyPicStyle} />
        <Col>
          <ColorBtn icon="square" tip="Picture border" value={lastColors.value.line} onApply={c => A.setLine({ color: c, width: pic?.line?.width || 3 })} onPick={c => { if (c === 'none') A.setLine(null); else { addRecentColor(c); A.setLine({ color: c, width: pic?.line?.width || 3 }) } }} none noneLabel="No border" disabled={!pic} />
          <EffectsBtn />
        </Col>
      </Group>
      <AltGroup />
      <ArrangeGroupFull />
      <Group label="Size" launcher={() => openFormat('size')}>
        <Split size="lg" icon="crop" label="Crop" active={!!cropMode.value} disabled={!pic} onClick={() => runCmd('obj.crop')} menu={() => [
          { label: 'Crop', icon: 'crop', run: () => runCmd('obj.crop') },
          { label: 'Crop to shape', icon: 'shapes', sub: () => <div class="pop-pad"><PickGrid cols={5} itemW={30} itemH={30} items={CROP_SHAPES.map(s => ({ label: s, s }))} render={it => <ShapeIcon shape={it.s} />} onPick={it => A.changeShape(it.s)} /></div> },
          { label: 'Aspect ratio', icon: 'ratio', sub: ASPECTS.map(([l, v]) => ({ label: l, run: () => pic && cropToAspect(pic, v) })) },
          { label: 'Reset crop', icon: 'rotate-ccw', run: () => pic && updateEl(pic.id, x => Object.assign(x, recrop(x, null))) }
        ]} />
        <Col><SizeFields /></Col>
      </Group>
    </>
  )
}

// ---------- tables ----------
const curTable = () => { const ec = editCell.value; const s = slide.value; if (!s) return null; const id = ec?.id || selection.value[0]; const t = s.elements.find(e => e.id === id) || selected.value.find(e => e.type === 'table'); return t && t.type === 'table' ? t : null }
const cellScope = t => { const ec = editCell.value; return ec && ec.id === t.id ? [[ec.r, ec.c]] : t.cells.flatMap((row, r) => row.map((_, c) => [r, c])) }
function TablePreview ({ st }) {
  const fake = { rows: [1, 1, 1, 1], cols: [1, 1, 1], style: st }
  return (
    <span class="tbl-prev">
      {[0, 1, 2, 3].map(r => <span key={r}>{[0, 1, 2].map(c => { const l = tableCellLook(fake, r, c); return <i key={c} style={{ background: l.fill ? hexColor(l.fill.includes('@') ? l.fill : l.fill, themeSig.value) : 'transparent', borderBottom: l.borders?.bottom ? `1px solid ${hexColor(l.borders.bottom.color, themeSig.value)}` : 'none' }} /> })}</span>)}
    </span>
  )
}
export function TableDesignTab () {
  const t = curTable()
  const st = t?.style || {}
  const set = patch => A.setTableStyle(patch)
  const items = []
  for (const s of TABLE_STYLES) {
    if (s.id === 'none' || s.id === 'grid' || s.id === 'dark') items.push({ ...s, accent: 'accent1', label: s.label })
    else for (const a of ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']) items.push({ ...s, accent: a, label: `${s.label}, ${a.replace('accent', 'Accent ')}` })
  }
  return (
    <>
      <Group label="Table style options">
        <Col>
          <Check label="Header row" checked={st.header !== false} onChange={v => set({ header: v })} disabled={!t} />
          <Check label="Total row" checked={!!st.lastRow} onChange={v => set({ lastRow: v })} disabled={!t} />
          <Check label="Banded rows" checked={st.banded !== false} onChange={v => set({ banded: v })} disabled={!t} />
        </Col>
        <Col>
          <Check label="First column" checked={!!st.firstCol} onChange={v => set({ firstCol: v })} disabled={!t} />
          <Check label="Last column" checked={!!st.lastCol} onChange={v => set({ lastCol: v })} disabled={!t} />
          <Check label="Banded columns" checked={!!st.bandCol} onChange={v => set({ bandCol: v })} disabled={!t} />
        </Col>
      </Group>
      <Group label="Table styles">
        <Gallery items={items} visible={6} itemW={52} itemH={42} expandCols={6} render={it => <TablePreview st={{ ...st, id: it.id, accent: it.accent }} />} isCurrent={it => st.id === it.id && (st.accent || 'accent1') === it.accent} onPick={it => { set({ id: it.id, accent: it.accent }); if (t) updateEl(t.id, x => { for (const row of x.cells) for (const c of row) { delete c.fill; delete c.color; delete c.borders } }) }} />
        <Col>
          <ColorBtn icon="paint-bucket" tip="Shading" value={lastColors.value.fill} disabled={!t} onApply={c => shade(t, c)} onPick={c => shade(t, c)} none noneLabel="No fill" />
          <Drop icon="grid-2x2" label="Borders" disabled={!t} menu={() => [
            ['All borders', ['top', 'right', 'bottom', 'left'], 'grid-2x2'], ['Outside borders', 'outside', 'square'], ['Inside borders', 'inside', 'plus'], ['No border', [], 'square-dashed'],
            ['Top border', ['top'], 'panel-top'], ['Bottom border', ['bottom'], 'panel-bottom'], ['Left border', ['left'], 'panel-left'], ['Right border', ['right'], 'panel-right']
          ].map(([l, sides, ic]) => ({ label: l, icon: ic, run: () => borders(t, sides) }))} />
        </Col>
      </Group>
    </>
  )
}
function shade (t, c) {
  if (!t) return
  const scope = cellScope(t)
  updateEl(t.id, x => { for (const [r, cc] of scope) if (x.cells[r]?.[cc]) { if (c === 'none' || !c) x.cells[r][cc].fill = { type: 'none' }; else x.cells[r][cc].fill = solid(c) } })
}
function borders (t, sides) {
  const scope = cellScope(t)
  const rows = t.rows.length, cols = t.cols.length
  const color = lastColors.value.line || 'dk1'
  updateEl(t.id, x => {
    for (const [r, c] of scope) {
      const cell = x.cells[r]?.[c]
      if (!cell) continue
      let use = sides
      if (sides === 'outside') use = [r === 0 && 'top', r === rows - 1 && 'bottom', c === 0 && 'left', c === cols - 1 && 'right'].filter(Boolean)
      if (sides === 'inside') use = [r > 0 && 'top', r < rows - 1 && 'bottom', c > 0 && 'left', c < cols - 1 && 'right'].filter(Boolean)
      if (Array.isArray(sides) && !sides.length) { cell.borders = { top: { width: 0 }, bottom: { width: 0 }, left: { width: 0 }, right: { width: 0 } }; continue }
      cell.borders = { ...(cell.borders || {}) }
      for (const sd of use) cell.borders[sd] = { color, width: 1 }
    }
  })
}
export function TableLayoutTab () {
  const t = curTable()
  const ec = editCell.value
  const r = ec?.r ?? 0, c = ec?.c ?? 0
  const cell = t?.cells[r]?.[c]
  // Merge right/down: the cell grows by the next column or row, then by every merge that reaches into it, until it is
  // a rectangle no merge crosses, as in PowerPoint. The text of every cell taken in goes into the first one.
  const mergeTo = dir => {
    const ec = editCell.value
    finishEditing() // takes in what was just typed; the cell is edited again below so its editor shows the result
    const x0 = findEl(slide.value, t.id)?.el
    if (!x0?.cells[r]?.[c]) return
    const spans = []
    x0.cells.forEach((row, rr) => row.forEach((cl, cc) => { if (cl && !cl.merged) spans.push([rr, cc, rr + (cl.rowspan || 1), cc + (cl.colspan || 1)]) }))
    const a = x0.cells[r][c]
    let R0 = r, C0 = c, R1 = r + (a.rowspan || 1) + (dir === 'down' ? 1 : 0), C1 = c + (a.colspan || 1) + (dir === 'right' ? 1 : 0)
    if (R1 > x0.rows.length || C1 > x0.cols.length) return
    for (let grew = true; grew;) {
      grew = false
      for (const [p0, q0, p1, q1] of spans) {
        if (p0 >= R1 || p1 <= R0 || q0 >= C1 || q1 <= C0 || (p0 >= R0 && p1 <= R1 && q0 >= C0 && q1 <= C1)) continue
        R0 = Math.min(R0, p0); R1 = Math.max(R1, p1); C0 = Math.min(C0, q0); C1 = Math.max(C1, q1); grew = true
      }
    }
    const hasText = h => !!h && !!h.replace(/<[^>]+>/g, '').replace(/&nbsp;|\u00a0/g, '').trim()
    updateEl(t.id, x => {
      const first = x.cells[R0][C0]
      for (let rr = R0; rr < R1; rr++) {
        for (let cc = C0; cc < C1; cc++) {
          if (rr === R0 && cc === C0) continue
          const o = x.cells[rr][cc]
          if (!o.merged && hasText(o.html)) first.html = hasText(first.html) ? first.html + o.html : o.html
          o.merged = true; o.html = '<p><br></p>'; delete o.colspan; delete o.rowspan
        }
      }
      if (C1 - C0 > 1) first.colspan = C1 - C0; else delete first.colspan
      if (R1 - R0 > 1) first.rowspan = R1 - R0; else delete first.rowspan
    })
    if (ec) setTimeout(() => { editCell.value = { id: t.id, r: R0, c: C0 } })
  }
  const mergeRight = () => mergeTo('right')
  const mergeDown = () => mergeTo('down')
  const split = () => updateEl(t.id, x => {
    const cl = x.cells[r][c]
    for (let rr = r; rr < r + (cl.rowspan || 1); rr++) for (let cc = c; cc < c + (cl.colspan || 1); cc++) if (rr !== r || cc !== c) x.cells[rr][cc].merged = false
    delete cl.colspan; delete cl.rowspan
  })
  const cellSet = patch => t && updateEl(t.id, x => { for (const [rr, cc] of cellScope(t)) if (x.cells[rr]?.[cc]) Object.assign(x.cells[rr][cc], patch) })
  const cellAlign = a => t && updateEl(t.id, x => { for (const [rr, cc] of cellScope(t)) { const cl = x.cells[rr]?.[cc]; if (cl) cl.html = (cl.html || '<p><br></p>').replace(/<p(\s[^>]*)?>/g, (m, attrs = '') => { const s2 = /style="([^"]*)"/.exec(attrs); const rest = attrs.replace(/\s?style="[^"]*"/, ''); const style = ((s2 ? s2[1] : '').replace(/text-align:[^;]*;?/g, '') + `text-align: ${a};`).trim(); return `<p${rest} style="${style}">` }) } })
  return (
    <>
      <Group label="Rows & columns">
        <Drop size="lg" icon="trash-2" label="Delete" disabled={!t} menu={() => [{ label: 'Delete columns', run: () => A.tableOp('delCol') }, { label: 'Delete rows', run: () => A.tableOp('delRow') }, { label: 'Delete table', danger: true, run: () => A.tableOp('delTable') }]} />
        <Btn size="lg" icon="between-horizontal-end" label="Insert above" disabled={!t} onClick={() => A.tableOp('rowAbove')} />
        <Btn size="lg" icon="between-horizontal-start" label="Insert below" disabled={!t} onClick={() => A.tableOp('rowBelow')} />
        <Col>
          <Btn icon="between-vertical-end" label="Insert left" disabled={!t} onClick={() => A.tableOp('colLeft')} />
          <Btn icon="between-vertical-start" label="Insert right" disabled={!t} onClick={() => A.tableOp('colRight')} />
        </Col>
      </Group>
      <Group label="Merge">
        <Col>
          <Btn icon="merge" label="Merge right" disabled={!t || c + (cell?.colspan || 1) >= (t?.cols.length || 0)} onClick={mergeRight} />
          <Btn icon="arrow-down-to-line" label="Merge down" disabled={!t || r + (cell?.rowspan || 1) >= (t?.rows.length || 0)} onClick={mergeDown} />
          <Btn icon="split" label="Split cell" disabled={!t || !(cell?.colspan > 1 || cell?.rowspan > 1)} onClick={split} />
        </Col>
      </Group>
      <Group label="Cell size">
        <Col>
          <NumField icon="move-vertical" tip="Row height" value={t ? t.rows[r] : null} disabled={!t} step={unitStep()} fmt={v => unitFmt(v)} parse={unitParse} min={8} width={100} onChange={v => updateEl(t.id, x => { x.rows[r] = v; x.h = x.rows.reduce((a, b) => a + b, 0) })} />
          <NumField icon="move-horizontal" tip="Column width" value={t ? t.cols[c] : null} disabled={!t} step={unitStep()} fmt={v => unitFmt(v)} parse={unitParse} min={8} width={100} onChange={v => updateEl(t.id, x => { x.cols[c] = v; x.w = x.cols.reduce((a, b) => a + b, 0) })} />
        </Col>
        <Col>
          <Btn icon="rows-3" label="Distribute rows" disabled={!t} onClick={() => A.tableOp('distRows')} />
          <Btn icon="columns-3" label="Distribute columns" disabled={!t} onClick={() => A.tableOp('distCols')} />
        </Col>
      </Group>
      <Group label="Alignment">
        <Col>
          <Row>
            <Btn icon="align-left" tip="Align left" disabled={!t} onClick={() => cellAlign('left')} />
            <Btn icon="align-center" tip="Center" disabled={!t} onClick={() => cellAlign('center')} />
            <Btn icon="align-right" tip="Align right" disabled={!t} onClick={() => cellAlign('right')} />
          </Row>
          <Row>
            <Btn icon="align-vertical-justify-start" tip="Align top" active={cell?.vAlign === 'top' || !cell?.vAlign} disabled={!t} onClick={() => cellSet({ vAlign: 'top' })} />
            <Btn icon="align-vertical-justify-center" tip="Center vertically" active={cell?.vAlign === 'middle'} disabled={!t} onClick={() => cellSet({ vAlign: 'middle' })} />
            <Btn icon="align-vertical-justify-end" tip="Align bottom" active={cell?.vAlign === 'bottom'} disabled={!t} onClick={() => cellSet({ vAlign: 'bottom' })} />
          </Row>
        </Col>
        <Drop size="lg" icon="square-dashed-bottom" label="Cell margins" disabled={!t} menu={() => [['Normal', { l: 7.2, t: 3.6, r: 7.2, b: 3.6 }], ['None', { l: 0, t: 0, r: 0, b: 0 }], ['Narrow', { l: 3.6, t: 3.6, r: 3.6, b: 3.6 }], ['Wide', { l: 14.4, t: 7.2, r: 14.4, b: 7.2 }]].map(([l, ins]) => ({ label: l, run: () => cellSet({ inset: ins }) }))} />
      </Group>
      <SizeGroup />
    </>
  )
}

// ---------- charts ----------
const curChart = () => selected.value.find(e => e.type === 'chart')
const setChart = fn => { const c = curChart(); if (c) updateEl(c.id, fn) }
const PALETTES = [
  { label: 'Colorful', colors: null },
  { label: 'Colorful, warm', colors: ['accent2', 'accent4', 'accent6', 'accent1', 'accent3', 'accent5'] },
  ...['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(a => ({ label: `Monochromatic, ${a.replace('accent', 'Accent ')}`, colors: [a + ':-50', a + ':-25', a, a + ':25', a + ':50', a + ':70'] }))
]
export function ChartDesignTab () {
  const ch = curChart()
  const o = ch?.opts || {}
  const th = themeSig.value
  const opt = patch => setChart(x => { x.opts = { ...(x.opts || {}), ...patch } })
  return (
    <>
      <Group label="Chart layouts">
        <Drop size="lg" icon="chart-no-axes-combined" label="Add chart element" disabled={!ch} menu={() => [
          { label: 'Chart title', icon: 'heading', checked: !!o.title, run: () => opt({ title: o.title ? '' : 'Chart Title' }) },
          { label: 'Legend', icon: 'list', sub: ['none', 'right', 'top', 'left', 'bottom'].map(p => ({ label: p === 'none' ? 'None' : p[0].toUpperCase() + p.slice(1), checked: (o.legend || 'none') === p, run: () => opt({ legend: p }) })) },
          { label: 'Data labels', icon: 'tag', checked: !!o.labels, run: () => opt({ labels: !o.labels }) },
          { label: 'Gridlines', icon: 'grid-3x3', checked: o.gridlines !== false, run: () => opt({ gridlines: o.gridlines === false }) }
        ]} />
        <Drop size="lg" icon="layout-dashboard" label="Quick layout" disabled={!ch} menu={() => [
          { label: 'Title and legend at the bottom', run: () => opt({ title: o.title || 'Chart Title', legend: 'bottom', labels: false, gridlines: true }) },
          { label: 'Legend on the right', run: () => opt({ legend: 'right', labels: false }) },
          { label: 'Data labels, no legend', run: () => opt({ legend: 'none', labels: true }) },
          { label: 'Minimal', run: () => opt({ title: '', legend: 'none', labels: false, gridlines: false }) }
        ]} />
      </Group>
      <Group label="Chart styles">
        <Drop size="lg" icon="palette" label="Change colors" disabled={!ch} render={() => (
          <div class="pop-pad pal-list">
            {PALETTES.map((p, i) => (
              <button key={i} class="mi pal-item" onClick={() => { closePop(); setChart(x => { x.colors = p.colors ? [...p.colors] : undefined; x.series = x.series.map(s => { const n = { ...s }; delete n.color; return n }); delete x.pointColors }) }}>
                <span class="palette">{(p.colors || ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']).map((c, j) => <i key={j} style={{ background: hexColor(c, th) }} />)}</span>
                <span class="mi-l">{p.label}</span>
              </button>
            ))}
          </div>
        )} />
      </Group>
      <Group label="Data">
        <Btn size="lg" icon="arrow-left-right" label="Switch row/column" disabled={!ch || ch.chartType === 'pie' || ch.chartType === 'doughnut'} onClick={() => setChart(x => {
          const cats = x.series.map(s => s.name)
          const series = x.categories.map((cat, i) => ({ name: cat, values: x.series.map(s => s.values[i] ?? 0) }))
          x.categories = cats; x.series = series
        })} />
        <Btn size="lg" icon="sheet" label="Edit data" disabled={!ch} onClick={() => openDialog('chartData', { id: ch.id })} />
      </Group>
      <Group label="Type">
        <Drop size="lg" icon="chart-pie" label="Change chart type" disabled={!ch} menu={() => [
          ...CHART_TYPES.map(c => ({ label: c.label, icon: c.icon, checked: ch?.chartType === c.id && (ch?.grouping || 'clustered') === 'clustered', run: () => setChart(x => { x.chartType = c.id; x.grouping = 'clustered' }) })),
          { sep: true },
          ...['column', 'bar', 'area'].flatMap(t => [
            { label: `Stacked ${t}`, checked: ch?.chartType === t && ch?.grouping === 'stacked', run: () => setChart(x => { x.chartType = t; x.grouping = 'stacked' }) },
            { label: `100% stacked ${t}`, checked: ch?.chartType === t && ch?.grouping === 'percent', run: () => setChart(x => { x.chartType = t; x.grouping = 'percent' }) }
          ])
        ]} />
      </Group>
      <ArrangeGroupFull />
      <SizeGroup />
    </>
  )
}

// ---------- video / audio ----------
export function PlaybackTab () {
  const m = selected.value.find(e => e.type === 'video' || e.type === 'audio')
  const set = patch => m && A.setProps(patch, [m.id])
  return (
    <>
      <Group label="Preview">
        <Btn size="lg" icon={mediaPlaying.value === m?.id ? 'pause' : 'play'} label={mediaPlaying.value === m?.id ? 'Stop' : 'Play'} disabled={!m} onClick={() => { mediaPlaying.value = mediaPlaying.value === m.id ? null : m.id }} />
      </Group>
      <Group label={m?.type === 'audio' ? 'Audio options' : 'Video options'}>
        <Col>
          <Row><span class="rl">Start</span>
            <Btn label="Automatically" active={!!m?.autoplay} disabled={!m} onClick={() => set({ autoplay: true })} />
            <Btn label="On click" active={m && !m.autoplay} disabled={!m} onClick={() => set({ autoplay: false })} />
          </Row>
          <Check label="Loop until stopped" checked={!!m?.loop} disabled={!m} onChange={v => set({ loop: v })} />
          <Check label="Mute" checked={!!m?.muted} disabled={!m} onChange={v => set({ muted: v })} />
        </Col>
        <Col>
          <Check label="Hide while not playing" checked={!!m?.hideIdle} disabled={!m} onChange={v => set({ hideIdle: v })} />
          <Check label="Play full screen" checked={!!m?.fullscreen} disabled={!m || m.type === 'audio'} onChange={v => set({ fullscreen: v })} />
          <Check label="Rewind after playing" checked={!!m?.rewind} disabled={!m} onChange={v => set({ rewind: v })} />
        </Col>
      </Group>
      {m?.type === 'video' && (
        <Group label="Poster frame">
          <Btn size="lg" icon="image" label="Poster image" desc="Show a picture of your choice before the video plays." onClick={async () => {
            const pic = await pickPicture('Poster image')
            if (pic) set({ poster: addMedia(pic.bytes, pic.mime) })
          }} />
          <Btn size="lg" icon="image-off" label="Reset poster" disabled={!m.poster} onClick={() => set({ poster: null })} />
        </Group>
      )}
      <ArrangeGroupFull />
      <SizeGroup />
    </>
  )
}

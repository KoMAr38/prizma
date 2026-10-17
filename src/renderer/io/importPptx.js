// PowerPoint (.pptx/.ppsx/.potx/.pptm) import: pptxtojson for geometry/styling + our own pass over the
// XML for inherited bullets, placeholder roles, theme fonts/colours and hidden slides.
import JSZip from 'jszip'
import { parse as pptxParse } from 'pptxtojson'
import { uid, DEFAULT_INSET } from '../core/model.js'
import { normalize, sanitize, syncBullet, BULLET_CHARS, NUM_FORMATS, htmlFromText } from '../core/html.js'
import { addMedia, mediaInfo, native } from '../core/store.js'
import { walk, pinSlideLinks } from '../core/model.js'
import { THEMES, LAYOUTS } from '../core/themes.js'
import { readTransition, readTiming } from './pptx/anim.js'
import { seal, TWIN_NS, adjFromAvLst } from './pptx/xml.js'
import { SHAPES } from '../core/shapes.js'
import { checkZipSize, checkDoc } from './nativeFormat.js'

const EMU_PT = 1 / 12700
const xmlDoc = s => new DOMParser().parseFromString(s, 'application/xml')
// a string pptxtojson read keeps the file's XML entities (R&amp;D)
const unent = s => typeof s === 'string' && s.includes('&') ? new DOMParser().parseFromString(s, 'text/html').documentElement.textContent : s
const kids = (n, name) => n ? [...n.children].filter(c => c.localName === name) : []
const kid = (n, name) => n ? [...n.children].find(c => c.localName === name) || null : null
const path = (n, ...names) => { for (const nm of names) { n = kid(n, nm); if (!n) return null } return n }
const resolveRel = (base, target) => {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/'); parts.pop()
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg) }
  return parts.join('/')
}
async function readXml (zip, p) { const f = zip.file(p); return f ? xmlDoc(await f.async('string')) : null }
async function rels (zip, p) {
  const parts = p.split('/'); const name = parts.pop()
  const r = await readXml(zip, [...parts, '_rels', name + '.rels'].join('/'))
  const map = {}
  if (r) {
    for (const rel of r.documentElement.children) {
      const ext = rel.getAttribute('TargetMode') === 'External'
      map[rel.getAttribute('Id')] = { target: ext ? rel.getAttribute('Target') : resolveRel(p, rel.getAttribute('Target')), type: rel.getAttribute('Type') || '', ext }
    }
  }
  return map
}
const relOfType = (map, t) => Object.values(map).find(r => r.type.endsWith('/' + t))
// xsd:boolean: PowerPoint writes 1/0, Apache POI and docx4j write true/false
const on = v => v === '1' || v === 'true', off = v => v === '0' || v === 'false'

const WINGDINGS = { l: '●', n: '■', q: '❑', u: '◆', v: '❖', Ø: '➢', ü: '✓', '§': '▪', à: '➔', è: '➜', Ü: '✔', ð: '⇨', o: '○', p: '◻', w: '⬥', '': '•', s: '◆', t: '◆', F: '☞', '¨': '◦', ª: '◦' }
function bulletGlyph (ch, font) {
  if (!ch) return '•'
  let c = ch
  const code = c.charCodeAt(0)
  if (code >= 0xF000 && code <= 0xF0FF) c = String.fromCharCode(code - 0xF000)
  if (/wingdings|webdings/i.test(font || '') || code >= 0xF000) return WINGDINGS[c] || '•'
  if (/symbol/i.test(font || '') && (c === '·' || c === '·')) return '•'
  return c
}
const toLin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const fromLin = c => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
function rgbHsl (r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}
function hslRgb (h, s, l) {
  if (!s) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)]
}
// Applies DrawingML colour transforms (tint/shade in linear light, lum/sat in HSL)
function applyMods (hex, node) {
  if (!hex) return hex
  let r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255
  for (const m of node.children) {
    const v = +m.getAttribute('val') / 100000
    if (m.localName === 'tint') [r, g, b] = [r, g, b].map(c => fromLin(toLin(c) * v + (1 - v)))
    else if (m.localName === 'shade') [r, g, b] = [r, g, b].map(c => fromLin(toLin(c) * v))
    else if (m.localName === 'lumMod' || m.localName === 'lumOff' || m.localName === 'satMod') {
      const [hh, ss, ll] = rgbHsl(r, g, b)
      const nl = m.localName === 'lumMod' ? ll * v : m.localName === 'lumOff' ? ll + v : ll
      const ns = m.localName === 'satMod' ? ss * v : ss
      ;[r, g, b] = hslRgb(hh, Math.min(1, Math.max(0, ns)), Math.min(1, Math.max(0, nl)))
    }
  }
  return '#' + [r, g, b].map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}
const SCHEME_NAMES = new Set(['tx1', 'bg1', 'tx2', 'bg2', 'dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'])
const PRST = { black: '#000000', white: '#FFFFFF', red: '#FF0000', blue: '#0000FF', green: '#008000', yellow: '#FFFF00', gray: '#808080' }
// scheme = { colours by schemeClr name; only bg1/tx1/bg2/tx2 go through the colour map }
function colorOf (n, scheme, phClr) {
  return n ? clrOf(kid(n, 'srgbClr') || kid(n, 'schemeClr') || kid(n, 'sysClr') || kid(n, 'prstClr') || kid(n, 'scrgbClr'), scheme, phClr) : null
}
// One colour element (srgbClr, schemeClr…) with its modifiers
function clrOf (c, scheme, phClr) {
  if (!c) return null
  let hex = null
  if (c.localName === 'srgbClr') hex = '#' + c.getAttribute('val').toUpperCase()
  else if (c.localName === 'sysClr') hex = '#' + (c.getAttribute('lastClr') || '000000').toUpperCase()
  else if (c.localName === 'prstClr') hex = PRST[c.getAttribute('val')] || '#000000'
  else if (c.localName === 'scrgbClr') hex = '#' + ['r', 'g', 'b'].map(k => Math.round(fromLin(+c.getAttribute(k) / 100000) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
  else if (c.localName === 'schemeClr') {
    const v = c.getAttribute('val')
    if (v === 'phClr') hex = phClr || null
    else hex = SCHEME_NAMES.has(v) ? (scheme?.[v] || null) : null
  }
  return hex ? applyMods(hex, c) : null
}

// Collects the property chain for a paragraph level and returns resolved bullet settings.
function resolveBullet (chain, scheme) {
  const out = { type: null, char: null, font: null, num: null, start: 1, color: null, size: null, marL: null, indent: null }
  for (const p of chain) {
    if (!p) continue
    if (out.marL === null && p.hasAttribute('marL')) out.marL = +p.getAttribute('marL') * EMU_PT
    if (out.indent === null && p.hasAttribute('indent')) out.indent = +p.getAttribute('indent') * EMU_PT
    if (!out.type) {
      if (kid(p, 'buNone')) out.type = 'none'
      else if (kid(p, 'buAutoNum')) { out.type = 'num'; out.num = kid(p, 'buAutoNum').getAttribute('type') || 'arabicPeriod'; out.start = +(kid(p, 'buAutoNum').getAttribute('startAt') || 1) }
      else if (kid(p, 'buChar')) { out.type = 'char'; out.char = kid(p, 'buChar').getAttribute('char') }
      else if (kid(p, 'buBlip')) { out.type = 'char'; out.char = '•' }
    }
    if (!out.font && kid(p, 'buFont')) out.font = kid(p, 'buFont').getAttribute('typeface')
    if (!out.color && kid(p, 'buClr')) out.color = colorOf(kid(p, 'buClr'), scheme)
    if (!out.size && kid(p, 'buSzPct')) out.size = +kid(p, 'buSzPct').getAttribute('val') / 100000
  }
  return out
}
const phInfo = sp => {
  const ph = path(sp, 'nvSpPr', 'nvPr', 'ph') || path(sp, 'nvPicPr', 'nvPr', 'ph') || path(sp, 'nvGraphicFramePr', 'nvPr', 'ph')
  if (!ph) return null
  return { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') }
}
function findPh (spTree, info) {
  if (!spTree || !info) return null
  const all = []
  const walkTree = n => { for (const c of n.children) { if (c.localName === 'sp') all.push(c); if (c.localName === 'grpSp') walkTree(c) } }
  walkTree(spTree)
  const typeOf = s => phInfo(s)?.type
  const norm = t => (t === 'obj' ? 'body' : t)
  return (info.idx && all.find(s => phInfo(s)?.idx === info.idx)) || all.find(s => norm(typeOf(s)) === norm(info.type)) || (info.type === 'ctrTitle' && all.find(s => typeOf(s) === 'title')) || (info.type === 'subTitle' && all.find(s => typeOf(s) === 'body')) || null
}
const lvlP = (lst, lvl) => lst ? kid(lst, `lvl${lvl + 1}pPr`) : null

async function loadTheme (zip, mas) {
  const thRel = relOfType(mas.rels, 'theme')
  const th = thRel ? await readXml(zip, thRel.target) : null
  const out = { scheme: {}, fonts: { major: 'Calibri', minor: 'Calibri' }, lnWidths: [], colors: null }
  if (!th) return out
  const elements = path(th.documentElement, 'themeElements')
  const cs = path(elements, 'clrScheme')
  const raw = {}
  if (cs) for (const c of cs.children) raw[c.localName] = colorOf(c, null)
  const fsch = path(elements, 'fontScheme')
  out.fonts = { major: path(fsch, 'majorFont', 'latin')?.getAttribute('typeface') || 'Calibri', minor: path(fsch, 'minorFont', 'latin')?.getAttribute('typeface') || 'Calibri' }
  out.lnWidths = kids(path(elements, 'fmtScheme', 'lnStyleLst'), 'ln').map(l => +(l.getAttribute('w') || 9525) * EMU_PT)
  out.bgFills = [...(path(elements, 'fmtScheme', 'bgFillStyleLst')?.children || [])]
  // honour the master's colour map so lt1/dk1 always mean background/text
  const cm = path(mas.xml.documentElement, 'clrMap')
  const map = k => raw[cm?.getAttribute(k) || ({ bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' })[k]]
  out.colors = { lt1: map('bg1'), dk1: map('tx1'), lt2: map('bg2'), dk2: map('tx2'), accent1: raw.accent1, accent2: raw.accent2, accent3: raw.accent3, accent4: raw.accent4, accent5: raw.accent5, accent6: raw.accent6, hlink: raw.hlink, folHlink: raw.folHlink }
  out.raw = raw
  // schemeClr lookups: dk1/lt1/accents are the theme's own colours, the map only applies to bg1/tx1/bg2/tx2
  out.scheme = { ...raw, bg1: map('bg1'), tx1: map('tx1'), bg2: map('bg2'), tx2: map('tx2') }
  return out
}
// A slide or layout can remap background/text colours (dark section layouts swap them); first override wins
function schemeFor (th, ...parts) {
  const ovr = parts.map(p => path(p, 'clrMapOvr', 'overrideClrMapping')).find(Boolean)
  if (!ovr || !th.raw) return th.scheme
  const map = (k, d) => th.raw[ovr.getAttribute(k) || d]
  return { ...th.scheme, bg1: map('bg1', 'lt1'), tx1: map('tx1', 'dk1'), bg2: map('bg2', 'lt2'), tx2: map('tx2', 'dk2') }
}
// Run-property resolution through the inheritance chain (explicit run → list styles → master text styles)
function runDefaults (chain) {
  const d = {}
  for (const lvl of chain) {
    if (!lvl) continue
    const r = kid(lvl, 'defRPr')
    if (!r) continue
    for (const a of ['sz', 'b', 'i', 'cap', 'spc', 'u']) if (d[a] === undefined && r.hasAttribute(a)) d[a] = r.getAttribute(a)
    if (d.fill === undefined) { const f = kid(r, 'solidFill'); if (f) d.fill = f; else if (kid(r, 'noFill')) d.fill = null }
    if (d.latin === undefined && kid(r, 'latin')) d.latin = kid(r, 'latin').getAttribute('typeface')
  }
  return d
}
function fontFromTypeface (tf, th, isTitle) {
  if (!tf) return null
  if (tf.startsWith('+mj')) return th.fonts.major
  if (tf.startsWith('+mn')) return th.fonts.minor
  return tf
}

// A chart's cached range (c:cat, c:val, c:xVal…) as cell texts by point index, so a blank cell keeps its place; category
// levels join outer level first ("2023 Q1"), an outer label holding until the next one
function chartCells (n, max) {
  const c = n && [...n.children].map(r => /Lit$/.test(r.localName) ? r : [...r.children].find(x => /Cache$/.test(x.localName))).find(Boolean)
  if (!c) return null
  const lv = kids(c, 'lvl'), levels = (lv.length ? lv : [c]).map(l => new Map(kids(l, 'pt').map(p => [+p.getAttribute('idx'), kid(p, 'v')?.textContent ?? ''])))
  let len = +kid(c, 'ptCount')?.getAttribute('val') || 0
  for (const l of levels) for (const i of l.keys()) if (i >= len) len = i + 1
  const last = levels.map(() => '')
  return { fmt: kid(c, 'formatCode')?.textContent, cells: Array.from({ length: Math.min(len, max) }, (_, i) => levels.map((l, k) => (last[k] = l.get(i) ?? (k ? last[k] : ''))).reverse().filter(Boolean).join(' ')) }
}
// A category cell as PowerPoint shows it: a date format turns the Excel serial back into a date
// shortcut: other number formats (%, decimals) show the plain value and 1904-based workbooks are 4 years off, read them if decks need it
function catText (v, fmt) {
  if (!v || !fmt || isNaN(+v)) return v
  const f = fmt.replace(/\[[^\]]*\]|"[^"]*"|[\\_*]./g, '')
  if (!/[dmy]/i.test(f) || /[hs]/i.test(f)) return v
  return new Date(Math.round((+v - 25569) * 864e5)).toLocaleDateString(undefined, { timeZone: 'UTC', year: /yyyy/i.test(f) ? 'numeric' : /yy/i.test(f) ? '2-digit' : undefined, month: /mmmm/i.test(f) ? 'long' : /mmm/i.test(f) ? 'short' : /m/i.test(f) ? 'numeric' : undefined, day: /d/i.test(f) ? 'numeric' : undefined })
}
// Chart data and extras, read from the chart part: pptxtojson drops blank cells (later values slide into the wrong
// categories), multi-level and date categories, and every chart group but the last
async function chartInfo (zip, partPath, scheme) {
  const x = await readXml(zip, partPath)
  if (!x) return null
  const cs = x.documentElement
  const chart = kid(cs, 'chart')
  const plot = kid(chart, 'plotArea')
  const types = plot ? [...plot.children].filter(n => /Chart$/.test(n.localName) && kid(n, 'ser')) : []
  const typeNode = types[0] || null
  // a combo chart (columns and a line) keeps every series, drawn as its first chart type
  const sers = types.flatMap(t => kids(t, 'ser'))
  const textOf = n => n ? [...n.getElementsByTagNameNS('*', 't')].map(t => t.textContent).join('') : ''
  // a series name is a cached cell value (c:v) or rich text (a:t)
  const serName = ser => { const tx = kid(ser, 'tx'); return tx ? [...tx.getElementsByTagNameNS('*', 'v')].map(v => v.textContent).join('') || textOf(tx) : '' }
  // a chart switch (c:CT_Boolean) is on when present, unless its val says otherwise
  const yes = n => !!n && !off(n.getAttribute('val'))
  const titleNode = kid(chart, 'title')
  const autoDeleted = yes(kid(chart, 'autoTitleDeleted'))
  let title = titleNode ? textOf(kid(titleNode, 'tx')) : ''
  if (titleNode && !title) title = sers.length === 1 ? serName(sers[0]) : 'Chart Title'
  if (!titleNode && !autoDeleted && sers.length === 1) title = serName(sers[0])
  const xy = /scatter|bubble/i.test(typeNode?.localName || '')
  // shortcut: a chart keeps at most a million cells (a corrupt ptCount can't allocate gigabytes), raise it if real decks need more
  const max = 1e6 / (sers.length || 1)
  const cat = chartCells(kid(sers[0], xy ? 'xVal' : 'cat'), max), vals = sers.map(sr => chartCells(kid(sr, xy ? 'yVal' : 'val'), max)?.cells || [])
  // every point gets a category, so a save writes all the values
  const len = Math.max(cat?.cells.length || 0, ...vals.map(v => v.length))
  const categories = Array.from({ length: len }, (_, i) => cat ? catText(cat.cells[i] ?? '', cat.fmt) : String(i + 1))
  const series = sers.map((sr, i) => ({ name: serName(sr) || 'Series ' + (i + 1), values: Array.from({ length: len }, (_, j) => +vals[i][j] || 0) }))
  const legend = kid(chart, 'legend')
  const legendPos = legend ? (kid(legend, 'legendPos')?.getAttribute('val') || 'r') : null
  const dl = typeNode ? kid(typeNode, 'dLbls') : null
  const anyLabel = n => n && (yes(kid(n, 'showVal')) || yes(kid(n, 'showPercent')))
  const labels = !!(anyLabel(dl) || sers.some(sr => anyLabel(kid(sr, 'dLbls'))))
  const szNode = kid(kid(kid(cs, 'txPr'), 'p') || null, 'pPr')
  const sz = szNode ? kid(szNode, 'defRPr')?.getAttribute('sz') : null
  // a line series has its colour on the line
  const seriesColors = sers.map(sr => colorOf(kid(kid(sr, 'spPr'), 'solidFill') || kid(kid(kid(sr, 'spPr'), 'ln'), 'solidFill'), scheme))
  const firstSer = sers[0]
  const pointColors = firstSer ? kids(firstSer, 'dPt').map(d => ({ idx: +(kid(d, 'idx')?.getAttribute('val') || 0), color: colorOf(kid(kid(d, 'spPr'), 'solidFill'), scheme) })) : []
  const catAx = plot ? kid(plot, 'catAx') : null
  const reversed = catAx ? kid(kid(catAx, 'scaling'), 'orientation')?.getAttribute('val') === 'maxMin' : false
  const is3d = !!typeNode && /3D/.test(typeNode.localName)
  // value-axis gridlines, as the chart has them (pie charts have no axes and keep the default)
  const valAxes = plot ? kids(plot, 'valAx') : []
  const gridlines = valAxes.length ? valAxes.some(ax => !!kid(ax, 'majorGridlines')) : null
  const attr = name => kid(typeNode, name)?.getAttribute('val')
  return { chartType: typeNode?.localName, barDir: attr('barDir'), grouping: attr('grouping'), holeSize: attr('holeSize'), categories, series, title: title || '', legend: legendPos, labels, fontSize: sz ? +sz / 100 : null, seriesColors, pointColors, reversed, is3d, gridlines }
}
// Table style definitions from ppt/tableStyles.xml
function parseTableStyles (xml, scheme) {
  const out = {}
  if (!xml) return out
  const part = (n) => {
    if (!n) return null
    const r = {}
    const tx = kid(n, 'tcTxStyle')
    if (tx) {
      r.bold = tx.getAttribute('b') === 'on'
      const c = colorOf(tx, scheme) || colorOf(kid(tx, 'fontRef'), scheme)
      if (c) r.color = c
    }
    const st = kid(n, 'tcStyle')
    const fill = kid(kid(st, 'fill'), 'solidFill')
    if (fill) r.fill = colorOf(fill, scheme)
    if (kid(kid(st, 'fill'), 'noFill')) r.fill = 'none'
    const bdr = kid(st, 'tcBdr')
    if (bdr) {
      r.borders = {}
      for (const side of ['left', 'right', 'top', 'bottom', 'insideH', 'insideV']) {
        const ln = kid(kid(bdr, side), 'ln')
        if (!ln) continue
        if (kid(ln, 'noFill')) { r.borders[side] = null; continue }
        const col = colorOf(kid(ln, 'solidFill'), scheme)
        if (col) r.borders[side] = { color: col, width: +(ln.getAttribute('w') || 12700) * EMU_PT }
      }
    }
    return r
  }
  for (const ts of kids(xml.documentElement, 'tblStyle')) {
    const d = {}
    for (const k of ['wholeTbl', 'band1H', 'band2H', 'band1V', 'band2V', 'firstRow', 'lastRow', 'firstCol', 'lastCol', 'nwCell', 'neCell', 'swCell', 'seCell']) d[k] = part(kid(ts, k))
    out[ts.getAttribute('styleId')] = d
  }
  return out
}
// Resolves one cell's look from a table style definition (PowerPoint's layering order)
function styleCell (def, fl, r, c, rows, cols) {
  const look = { fill: null, color: null, bold: false, borders: {} }
  const apply = (p, edges) => {
    if (!p) return
    if (p.fill !== undefined) look.fill = p.fill
    if (p.color) look.color = p.color
    if (p.bold) look.bold = true
    if (p.borders) {
      const b = p.borders
      const set = (side, v) => { if (v !== undefined) look.borders[side] = v }
      set('left', c === 0 ? b.left : b.insideV)
      set('right', c === cols - 1 ? b.right : b.insideV)
      set('top', r === 0 ? b.top : b.insideH)
      set('bottom', r === rows - 1 ? b.bottom : b.insideH)
      if (edges) { set('left', b.left); set('right', b.right); set('top', b.top); set('bottom', b.bottom) }
    }
  }
  apply(def.wholeTbl)
  const bodyR = fl.firstRow ? r - 1 : r
  const isFirstRow = fl.firstRow && r === 0, isLastRow = fl.lastRow && r === rows - 1
  if (fl.bandRow && !isFirstRow && !isLastRow) apply(bodyR % 2 === 0 ? def.band1H : def.band2H, true)
  if (fl.firstCol && c === 0) apply(def.firstCol, true)
  if (fl.lastCol && c === cols - 1) apply(def.lastCol, true)
  if (isFirstRow) apply(def.firstRow, true)
  if (isLastRow) apply(def.lastRow, true)
  return look
}

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const VERTICAL = new Map([['vert', true], ['eaVert', true], ['vert270', 'vert270'], ['wordArtVert', 'stacked']])
const DRAWN = new Set(['sp', 'cxnSp', 'pic', 'graphicFrame', 'grpSp', 'AlternateContent', 'contentPart'])
const FILLS = new Set(['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'])
// Click actions on shapes: a jump to another slide, or a web/mail link
function linkOf (nv, relsMap, slidePaths) {
  const h = kid(kid(nv, 'cNvPr'), 'hlinkClick')
  if (!h) return null
  const rid = h.getAttribute('r:id') || h.getAttributeNS(R_NS, 'id')
  const rel = rid ? relsMap[rid] : null
  if (/hlinksldjump/.test(h.getAttribute('action') || '')) { const i = slidePaths.indexOf(rel?.target); return i >= 0 ? { slide: i } : null }
  return rel && rel.ext && /\/hyperlink$/.test(rel.type) ? { url: rel.target } : null
}
// Comment authors: classic (commentAuthors.xml) and modern (authors.xml) comments
async function readAuthors (zip) {
  const legacy = {}, modern = {}
  const a = await readXml(zip, 'ppt/commentAuthors.xml')
  if (a) for (const x of kids(a.documentElement, 'cmAuthor')) legacy[x.getAttribute('id')] = x.getAttribute('name')
  const m = await readXml(zip, 'ppt/authors.xml')
  if (m) for (const x of kids(m.documentElement, 'author')) modern[x.getAttribute('id')] = x.getAttribute('name')
  return { legacy, modern }
}
const bodyText = n => kids(n, 'p').map(p => [...p.children].map(r => r.localName === 'br' ? '\n' : kid(r, 't')?.textContent || '').join('')).join('\n').trim()
async function readComments (zip, relsMap, authors) {
  const out = []
  const add = (author, text, time) => { if (text) out.push({ id: uid('c'), author: author || 'Author', text, time: Date.parse(time || '') || Date.now(), el: null }) }
  for (const r of Object.values(relsMap)) {
    if (r.ext || !/\/comments$/.test(r.type)) continue
    const x = await readXml(zip, r.target)
    if (!x) continue
    for (const cm of kids(x.documentElement, 'cm')) {
      const body = kid(cm, 'txBody')
      if (body) {
        add(authors.modern[cm.getAttribute('authorId')], bodyText(body), cm.getAttribute('created'))
        for (const rp of kids(kid(cm, 'replyLst'), 'reply')) add(authors.modern[rp.getAttribute('authorId')], bodyText(kid(rp, 'txBody')), rp.getAttribute('created'))
      } else add(authors.legacy[cm.getAttribute('authorId')], kid(cm, 'text')?.textContent?.trim(), cm.getAttribute('dt'))
    }
  }
  return out
}
// Speaker notes come from the notes page itself: pptxtojson drops their line breaks and fields
async function readNotes (zip, relsMap) {
  const x = await readXml(zip, relOfType(relsMap, 'notesSlide')?.target || '')
  const body = x && [...x.getElementsByTagNameNS('*', 'sp')].find(s => phInfo(s)?.type === 'body')
  return body ? bodyText(kid(body, 'txBody')) : ''
}
// Prizma writes its theme into a short document property, and its footers and show settings are in its copy of the
// deck, which PowerPoint keeps even when it changes the slides (files from 1.0.2 and earlier carry them in the property)
async function readMarker (zip) {
  const x = await readXml(zip, 'docProps/custom.xml')
  const prop = x && kids(x.documentElement, 'property').find(p => p.getAttribute('name') === 'PrizmaDocument')
  let m
  try { m = prop ? JSON.parse(prop.textContent) : null } catch { return null }
  if (!m) return null
  for (const r of Object.values(await rels(zip, 'ppt/presentation.xml'))) {
    if (!/\/customXml$/.test(r.type)) continue
    const root = (await readXml(zip, r.target))?.documentElement
    if (root?.namespaceURI !== TWIN_NS) continue
    try { const d = JSON.parse(root.textContent).doc; m = { ...m, hf: d.hf ?? m.hf, show: d.show ?? m.show } } catch {}
  }
  return m
}
// Embedded objects (Excel tables, old charts, other slides…) can't run here; PowerPoint keeps a preview picture of
// each, either in the frame (PowerPoint 2010 and later: in the object's fallback copy) or, in files converted from
// PowerPoint 2003, in the VML drawing of the slide, layout or master.
const PIC_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/x-emf', wmf: 'image/x-wmf', svg: 'image/svg+xml' }
// video and audio by extension, in the MIME names exportPptx turns back into the same extension
const AV_MIME = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', wma: 'audio/x-ms-wma', aac: 'audio/aac', ogg: 'audio/ogg' }
async function olePreview (zip, frame, partRels) {
  const blip = frame.getElementsByTagNameNS('*', 'blip')[0]
  const rid = blip && (blip.getAttributeNS(R_NS, 'embed') || blip.getAttribute('r:embed'))
  let target = rid ? partRels[rid]?.target : null
  const spid = [...frame.getElementsByTagNameNS('*', 'oleObj')].map(o => o.getAttribute('spid')).find(Boolean)
  const vml = !target && spid ? Object.values(partRels).find(r => /\/vmlDrawing$/.test(r.type)) : null
  if (vml) {
    const text = await zip.file(vml.target)?.async('string') || ''
    // no regex may scan past a '<' and the closing tag is one indexOf: a crafted drawing can't make them backtrack for minutes
    const idRe = new RegExp(`\\b(id|o:spid)="${spid.replace(/[^\w]/g, '\\$&')}"`)
    const open = [...text.matchAll(/<v:shape\b[^<>]*>/g)].find(m => idRe.test(m[0]))
    const end = open ? text.indexOf('</v:shape>', open.index) : -1
    const relid = end > 0 && /<v:imagedata\b[^<>]*\bo:relid="([^"]+)"/.exec(text.slice(open.index + open[0].length, end))
    if (relid) target = (await rels(zip, vml.target))[relid[1]]?.target
  }
  // the picture loads with the others, once however many slides show the layout's object
  return target && zip.file(target) ? { ref: target } : null
}
// EMF/WMF pictures: Chromium can't draw them, so Windows renders each to PNG at twice the size it is shown
async function rasterizeMetafiles (slides) {
  if (!native?.rasterize) return
  const box = new Map()
  const see = (id, e) => { if (id && /x-(emf|wmf)$/.test(mediaInfo(id)?.mime || '')) { const b = box.get(id) || { w: 0, h: 0 }; box.set(id, { w: Math.max(b.w, e.w), h: Math.max(b.h, e.h) }) } }
  for (const s of slides) for (const list of [s.elements, s.master || []]) walk(list, e => { if (e.type === 'image') see(e.src, e); if (e.fill?.type === 'image') see(e.fill.src, e) })
  const ids = [...box.keys()]
  if (!ids.length) return
  const px = v => Math.max(16, Math.round(v * 8 / 3))
  const items = ids.map(id => {
    const b = box.get(id), k = Math.min(1, 2400 / Math.max(px(b.w), px(b.h)))
    return { data: mediaInfo(id).bytes, ext: /wmf$/.test(mediaInfo(id).mime) ? 'wmf' : 'emf', w: Math.round(px(b.w) * k), h: Math.round(px(b.h) * k) }
  })
  const pngs = await native.rasterize(items).catch(() => [])
  ids.forEach((id, i) => { if (pngs[i]) addMedia(pngs[i], 'image/png', id) })
}
// A deck Prizma saved that no other program has rewritten since: the exact document travels inside the file
async function readTwin (zip) {
  const presRels = await rels(zip, 'ppt/presentation.xml')
  for (const r of Object.values(presRels)) {
    if (!/\/customXml$/.test(r.type)) continue
    const root = (await readXml(zip, r.target))?.documentElement
    if (root?.namespaceURI !== TWIN_NS) continue
    const pres = await zip.file('ppt/presentation.xml').async('string')
    const slides = kids(kid(xmlDoc(pres).documentElement, 'sldIdLst'), 'sldId').map(n => zip.file(presRels[n.getAttributeNS(R_NS, 'id')]?.target || ''))
    if (slides.some(f => !f)) return null
    if (seal([pres, ...await Promise.all(slides.map(f => f.async('string')))]) !== root.getAttribute('seal')) return null
    try {
      const data = JSON.parse(root.textContent)
      checkDoc(data?.doc)
      for (const [id, m] of Object.entries(data.media || {})) {
        const f = zip.file(m.part)
        if (f) addMedia(await f.async('uint8array'), m.mime, id)
      }
      return data.doc
    } catch (e) { console.warn('Prizma copy unreadable, importing the slides instead', e); return null }
  }
  return null
}

async function analyse (zip) {
  const pres = await readXml(zip, 'ppt/presentation.xml')
  const presRels = await rels(zip, 'ppt/presentation.xml')
  const sldIds = kids(kid(pres.documentElement, 'sldIdLst'), 'sldId')
  const slidePaths = sldIds.map(s => presRels[s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')]?.target).filter(Boolean)
  const defaultTextStyle = kid(pres.documentElement, 'defaultTextStyle')
  const cache = {}
  const loadPart = async p => { if (!cache[p]) cache[p] = { xml: await readXml(zip, p), rels: await rels(zip, p) }; return cache[p] }
  const themes = {}
  const result = { slides: [], theme: null, slidePaths }
  const tableStyleDefs = new Map()
  const tsx = await readXml(zip, 'ppt/tableStyles.xml')
  const tableStyleDefault = tsx?.documentElement.getAttribute('def') || null
  const authors = await readAuthors(zip)
  const shapeKeys = tree => {
    const keys = new Set()
    const rec = n => { for (const c of n?.children || []) { const nv = c.firstElementChild; const pr = nv && kid(nv, 'cNvPr'); if (pr) keys.add(pr.getAttribute('id') + '|' + pr.getAttribute('name')); if (c.localName === 'grpSp') rec(c) } }
    rec(tree)
    return keys
  }
  for (const sp of slidePaths) {
    const sl = await loadPart(sp)
    const layoutRel = relOfType(sl.rels, 'slideLayout')
    const lay = layoutRel ? await loadPart(layoutRel.target) : null
    const masterRel = lay ? relOfType(lay.rels, 'slideMaster') : null
    const mas = masterRel ? await loadPart(masterRel.target) : null
    if (mas && !themes[masterRel.target]) themes[masterRel.target] = await loadTheme(zip, mas)
    const th = (mas && themes[masterRel.target]) || { scheme: {}, fonts: { major: 'Calibri', minor: 'Calibri' }, lnWidths: [] }
    if (!result.theme && th.colors) result.theme = th
    const scheme = schemeFor(th, sl.xml.documentElement, lay?.xml.documentElement)
    const sldEl = sl.xml.documentElement
    const layEl = lay?.xml.documentElement
    const masTree = mas ? path(mas.xml.documentElement, 'cSld', 'spTree') : null
    const info = {
      hidden: off(sldEl.getAttribute('show')),
      layoutType: layEl?.getAttribute('type') || null,
      hideAllMaster: off(sldEl.getAttribute('showMasterSp')),
      hideMasterOnly: off(layEl?.getAttribute('showMasterSp')),
      masterKeys: masTree ? shapeKeys(masTree) : new Set(),
      layoutKeys: lay ? shapeKeys(path(layEl, 'cSld', 'spTree')) : new Set(),
      shapes: {}, tables: {}, charts: {}, meta: {}, oles: [], masterOles: [], fonts: th.fonts, tableStyles: null,
      layoutName: path(layEl, 'cSld')?.getAttribute('name') || '',
      ownBg: !!path(sldEl, 'cSld', 'bg'),
      duotone: duotoneOf([sldEl, layEl, mas?.xml.documentElement].map(r => path(r, 'cSld', 'bg')).find(Boolean), th, scheme),
      trans: readTransition(sldEl),
      sld: sldEl,
      comments: await readComments(zip, sl.rels, authors),
      notes: await readNotes(zip, sl.rels)
    }
    // table style colours follow the theme and colour map: one copy per scheme (masters share it unless a slide remaps)
    if (!tableStyleDefs.has(scheme)) tableStyleDefs.set(scheme, parseTableStyles(tsx, scheme))
    info.tableStyles = tableStyleDefs.get(scheme)
    const masTx = mas ? path(mas.xml.documentElement, 'txStyles') : null
    const laySpTree = lay ? path(layEl, 'cSld', 'spTree') : null
    const visit = async (node, store = info.shapes, keyed = false, onSlide = true) => {
      for (const c of node.children) {
        const cNv = onSlide && kid(c.firstElementChild, 'cNvPr')
        if (cNv) info.meta[cNv.getAttribute('id')] = { name: cNv.getAttribute('name') || '', descr: cNv.getAttribute('descr') || '', hidden: /^(1|true)$/.test(cNv.getAttribute('hidden') || '') }
        if (c.localName === 'grpSp') { await visit(c, store, keyed, onSlide); continue }
        if (c.localName === 'graphicFrame') {
          const id = path(c, 'nvGraphicFramePr', 'cNvPr')?.getAttribute('id')
          const tbl = c.getElementsByTagNameNS('*', 'tbl')[0]
          if (id && tbl) {
            const pr = kid(tbl, 'tblPr')
            // explicit[r][c]: the cell has its own fill, which beats the table style
            info.tables[id] = { styleId: kid(pr, 'tableStyleId')?.textContent || tableStyleDefault, firstRow: on(pr?.getAttribute('firstRow')), bandRow: on(pr?.getAttribute('bandRow')), firstCol: on(pr?.getAttribute('firstCol')), lastCol: on(pr?.getAttribute('lastCol')), lastRow: on(pr?.getAttribute('lastRow')), explicit: kids(tbl, 'tr').map(tr => kids(tr, 'tc').map(tc => !!kid(kid(tc, 'tcPr'), 'solidFill'))) }
          }
          const chartRef = c.getElementsByTagNameNS('*', 'chart')[0]
          const rid = chartRef && (chartRef.getAttribute('r:id') || chartRef.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'))
          if (id && rid && onSlide && sl.rels[rid]) { try { info.charts[id] = await chartInfo(zip, sl.rels[rid].target, scheme) } catch (e) { console.warn('chart info', e) } }
          continue
        }
        if (c.localName === 'pic' && onSlide) {
          const pid = path(c, 'nvPicPr', 'cNvPr')?.getAttribute('id')
          // pptxtojson leaves out a picture's transparency (alphaModFix, 100000 = opaque) and greyscale
          const blip = path(c, 'blipFill', 'blip'), amt = kid(blip, 'alphaModFix')?.getAttribute('amt')
          if (pid) store[pid] = { ph: null, paras: null, link: linkOf(c.firstElementChild, sl.rels, slidePaths), transparency: amt ? Math.round(100 - Math.max(0, +amt) / 1000) : 0, gray: !!kid(blip, 'grayscl') }
          continue
        }
        if (c.localName !== 'sp' && c.localName !== 'cxnSp') continue
        const nv = c.firstElementChild
        const id = kid(nv, 'cNvPr')?.getAttribute('id')
        if (!id) continue
        if (!onSlide && phInfo(c)) continue
        const key = keyed ? id + '|' + kid(nv, 'cNvPr').getAttribute('name') : id
        if (keyed && store[key]) continue
        const rec = { ph: phInfo(c)?.type || null, paras: null, link: onSlide ? linkOf(nv, sl.rels, slidePaths) : null, bgFill: on(c.getAttribute('useBgFill')) }
        // style references (shapes drawn in PowerPoint carry their colours here)
        const style = kid(c, 'style')
        const spPr = kid(c, 'spPr')
        if (kid(spPr, 'custGeom')) rec.geom = custGeomPath(spPr)
        // no fill of its own and none (or fill style 0) from the theme: see-through, whatever pptxtojson guesses
        const fillRef = kid(style, 'fillRef')
        if (!rec.ph && ![...(spPr?.children || [])].some(n => FILLS.has(n.localName)) && (!fillRef || fillRef.getAttribute('idx') === '0')) rec.noFill = true
        if (style) {
          const lnRef = kid(style, 'lnRef'), fontRef = kid(style, 'fontRef')
          const ln = kid(spPr, 'ln')
          const lnHasColor = ln && (kid(ln, 'solidFill') || kid(ln, 'noFill') || kid(ln, 'gradFill'))
          if (lnRef && +lnRef.getAttribute('idx') > 0 && !lnHasColor) rec.lineColor = colorOf(lnRef, scheme)
          if (lnRef && +lnRef.getAttribute('idx') > 0 && !(ln && ln.hasAttribute('w'))) rec.lineWidth = th.lnWidths[+lnRef.getAttribute('idx') - 1] || null
          if (fontRef) rec.fontRefColor = colorOf(fontRef, scheme)
        }
        const lnG = kid(kid(spPr, 'ln'), 'gradFill')
        if (lnG) { const gs = kids(path(lnG, 'gsLst'), 'gs'); if (gs.length) rec.lineColor = colorOf(gs[gs.length - 1], scheme) }
        // an outline with its own colour and no width, which pptxtojson drops: the style's width, or 0.75 pt
        const lnS = kid(kid(spPr, 'ln'), 'solidFill')
        if (lnS && !kid(spPr, 'ln').hasAttribute('w')) rec.lineColor = colorOf(lnS, scheme)
        const body = kid(c, 'txBody')
        if (body) {
          const ph = phInfo(c)
          rec.ph = ph?.type || null
          // pptxtojson knows only East Asian vertical text
          rec.vertical = VERTICAL.get(kid(body, 'bodyPr')?.getAttribute('vert'))
          // a slide number placeholder that shows the number: Prizma's own slide number replaces it
          rec.num = rec.ph === 'sldNum' && [...body.getElementsByTagNameNS('*', 'fld')].some(f => f.getAttribute('type') === 'slidenum')
          const lst = kid(body, 'lstStyle')
          const layPh = ph ? findPh(laySpTree, ph) : null
          const masPh = ph ? findPh(masTree, ph) : null
          const layLst = layPh ? path(layPh, 'txBody', 'lstStyle') : null
          const masLst = masPh ? path(masPh, 'txBody', 'lstStyle') : null
          const isTitle = ph && (ph.type === 'title' || ph.type === 'ctrTitle')
          const styleKind = !ph ? 'other' : isTitle ? 'title' : ['body', 'obj', 'subTitle', 'tbl', 'chart', 'dgm', 'media', 'clipArt', 'pic'].includes(ph.type) ? 'body' : 'other'
          const txSt = masTx ? kid(masTx, styleKind === 'title' ? 'titleStyle' : styleKind === 'body' ? 'bodyStyle' : 'otherStyle') : null
          rec.paras = kids(body, 'p').map(p => {
            const pPr = kid(p, 'pPr')
            const lvl = +(pPr?.getAttribute('lvl') || 0)
            const chain = [pPr, lvlP(lst, lvl), lvlP(layLst, lvl), lvlP(masLst, lvl), lvlP(txSt, lvl), ph ? null : lvlP(defaultTextStyle, lvl)]
            const b = resolveBullet(chain, scheme)
            const def = runDefaults(chain)
            // breaks are kept too: fixHtml rebuilds a paragraph with breaks or fields from these, in file order
            const runs = [...p.children].filter(r => r.localName === 'r' || r.localName === 'fld' || r.localName === 'br').map(r => {
              const rPr = kid(r, 'rPr')
              const get = a => rPr && rPr.hasAttribute(a) ? rPr.getAttribute(a) : def[a]
              const fillNode = rPr && (kid(rPr, 'solidFill') || (kid(rPr, 'noFill') ? 'none' : null))
              let color = fillNode === 'none' ? null : fillNode ? colorOf(fillNode, scheme) : undefined
              if (color === undefined) color = !ph && rec.fontRefColor ? rec.fontRefColor : def.fill ? colorOf(def.fill, scheme) : (def.fill === null ? null : undefined)
              const latin = rPr && kid(rPr, 'latin') ? kid(rPr, 'latin').getAttribute('typeface') : def.latin
              return {
                // a tab as the four spaces pptxtojson writes for it, so run and span texts line up
                text: (kid(r, 't')?.textContent || '').replace(/\t/g, '    '),
                br: r.localName === 'br',
                fld: r.localName === 'fld',
                sz: get('sz') ? +get('sz') / 100 : null,
                b: get('b') !== undefined ? get('b') === '1' || get('b') === 'true' : null,
                i: get('i') !== undefined ? get('i') === '1' || get('i') === 'true' : null,
                cap: get('cap') || null,
                color: color === undefined ? (scheme.tx1 || null) : color,
                font: fontFromTypeface(latin, th) || (isTitle ? th.fonts.major : th.fonts.minor)
              }
            })
            return { lvl, ...b, runs }
          })
        }
        store[key] = rec
      }
    }
    const tree = path(sldEl, 'cSld', 'spTree')
    if (tree) await visit(tree)
    // embedded objects on the slide, its layout and master, as their preview pictures
    const oles = async (t, partRels, list) => {
      let at = 0
      for (const c of t ? t.children : []) {
        if (!DRAWN.has(c.localName)) continue
        const ole = c.localName === 'graphicFrame' && c.getElementsByTagNameNS('*', 'oleObj')[0]
        const off = ole && path(c, 'xfrm', 'off'), ext = ole && path(c, 'xfrm', 'ext')
        const pic = off && ext && await olePreview(zip, c, partRels)
        if (pic) list.push({ at, name: path(c, 'nvGraphicFramePr', 'cNvPr')?.getAttribute('name') || 'Object', x: off.getAttribute('x') * EMU_PT, y: off.getAttribute('y') * EMU_PT, w: ext.getAttribute('cx') * EMU_PT, h: ext.getAttribute('cy') * EMU_PT, ...pic })
        at++
      }
    }
    await oles(tree, sl.rels, info.oles)
    if (!info.hideAllMaster) await oles(laySpTree, lay?.rels, info.masterOles)
    if (!info.hideAllMaster && !info.hideMasterOnly) await oles(masTree, mas?.rels, info.masterOles)
    info.masterShapes = {}
    if (laySpTree) await visit(laySpTree, info.masterShapes, true, false)
    if (masTree) await visit(masTree, info.masterShapes, true, false)
    result.slides.push(info)
  }
  return result
}

// A background picture shown in two tones of a colour (PowerPoint's duotone): [dark end, light end]
function duotoneOf (bg, th, scheme) {
  const ref = kid(bg, 'bgRef')
  let fill = path(bg, 'bgPr', 'blipFill'), ph = null
  if (!fill && ref && +ref.getAttribute('idx') > 1000) {
    const f = th.bgFills?.[+ref.getAttribute('idx') - 1001]
    if (f?.localName === 'blipFill') { fill = f; ph = colorOf(ref, scheme) }
  }
  const duo = path(fill, 'blip', 'duotone')
  const cs = duo ? [...duo.children].map(c => clrOf(c, scheme, ph)) : []
  return cs.length === 2 && cs.every(Boolean) ? cs : null
}
// Recolours a picture: black maps to the first colour, white to the second
async function duotoneMedia (src, [c0, c1]) {
  const m = mediaInfo(src)
  const bmp = await createImageBitmap(new Blob([m.bytes], { type: m.mime }))
  const cv = document.createElement('canvas')
  cv.width = bmp.width; cv.height = bmp.height
  const g = cv.getContext('2d')
  g.drawImage(bmp, 0, 0)
  const img = g.getImageData(0, 0, cv.width, cv.height), px = img.data
  const a = [1, 3, 5].map(i => parseInt(c0.slice(i, i + 2), 16)), b = [1, 3, 5].map(i => parseInt(c1.slice(i, i + 2), 16))
  for (let i = 0; i < px.length; i += 4) {
    const t = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255
    px[i] = a[0] + (b[0] - a[0]) * t; px[i + 1] = a[1] + (b[1] - a[1]) * t; px[i + 2] = a[2] + (b[2] - a[2]) * t
  }
  g.putImageData(img, 0, 0)
  const blob = await new Promise(resolve => cv.toBlob(resolve, 'image/jpeg', 0.9))
  return addMedia(new Uint8Array(await blob.arrayBuffer()), 'image/jpeg')
}

// ---------- conversion helpers ----------
const va = v => v === 'mid' ? 'middle' : v === 'down' ? 'bottom' : 'top'
const PH_ROLE = { title: 'title', ctrTitle: 'title', subTitle: 'subTitle', body: 'body', obj: 'body' }
const dashOf = (t, arr) => t === 'dashed' ? (String(arr).split(/[ ,]+/).length > 2 ? 'dashDot' : 'dash') : t === 'dotted' ? 'dot' : 'solid'
function convLine (e) {
  if (!e.borderWidth || !e.borderColor || e.borderColor === 'transparent') return null
  return { color: e.borderColor.toUpperCase(), width: e.borderWidth, dash: dashOf(e.borderType, e.borderStrokeDasharray) }
}
// Every picture the slides name, read once from the package: part name -> media id. pptxtojson's base64 copies
// of the same pictures took about 15 times the file size in memory, and a 280 MB photo deck took the window down.
async function loadPictures (slides, zip) {
  const refs = new Set()
  const walk = o => {
    if (Array.isArray(o)) { for (const x of o) walk(x); return }
    if (!o || typeof o !== 'object' || o.type === 'video' || o.type === 'audio') return
    for (const k in o) {
      if ((k === 'ref' || k === 'picRef') && typeof o[k] === 'string') { if (o[k]) refs.add(o[k]) } else walk(o[k])
    }
  }
  walk(slides)
  const ids = new Map()
  for (const ref of refs) {
    const f = zip.file(ref)
    if (f) ids.set(ref, addMedia(await f.async('uint8array'), PIC_MIME[ref.split('.').pop().toLowerCase()] || 'application/octet-stream'))
  }
  return ids
}
function convFill (f, cache) {
  if (!f || !f.type) return null
  if (f.type === 'color') return f.value ? { type: 'solid', color: f.value.toUpperCase().slice(0, 7), ...(f.value.length > 7 ? { alpha: parseInt(f.value.slice(7, 9), 16) / 255 } : {}) } : null
  if (f.type === 'gradient') {
    const v = f.value || {}
    const stops = (v.colors || []).map(c => {
      const col = c.color || '#000000'
      const a = col.length > 7 ? parseInt(col.slice(7, 9), 16) / 255 : 1
      return { pos: parseFloat(c.pos) || 0, color: col.slice(0, 7).toUpperCase(), ...(a < 0.999 ? { alpha: Math.round(a * 1000) / 1000 } : {}) }
    })
    if (!stops.length) return null
    return { type: 'gradient', kind: v.path === 'circle' || v.path === 'rect' || v.path === 'shape' ? 'radial' : 'linear', angle: (v.rot || 0), stops }
  }
  if (f.type === 'image') {
    const src = cache.get(f.value?.ref)
    return src ? { type: 'image', src, mode: 'cover', alpha: f.value?.opacity } : null
  }
  if (f.type === 'pattern') return { type: 'pattern', preset: f.value?.type || 'pct50', fg: f.value?.foregroundColor || '#000000', bg: f.value?.backgroundColor || '#FFFFFF' }
  return null
}
const arrowOf = v => { const t = typeof v === 'string' ? v : v?.type; return t && t !== 'none' ? t : 'none' }
// Line colour/width may come from the shape's style reference (lnRef) rather than spPr
function lineWithRefs (e, sinfo, extra = {}) {
  let ln = convLine(e)
  const explicitBlackDefault = ln && ln.color === '#000000' && (e.borderWidth === 0.75 || e.borderWidth === 1)
  if (sinfo?.lineColor && (!ln || explicitBlackDefault)) ln = { color: sinfo.lineColor, width: sinfo.lineWidth || e.borderWidth || 0.75, dash: ln?.dash || 'solid' }
  if (!ln && (extra.head || extra.tail)) ln = { color: sinfo?.lineColor || '#000000', width: sinfo?.lineWidth || 0.75, dash: 'solid' }
  return ln ? { ...ln, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)) } : null
}
const isLineShape = t => /^(line|straightConnector1|bentConnector[2-5]|curvedConnector[2-5]|lineInv)$/.test(t || '')

// Custom geometry as one SVG path in the shape's own box, in points. pptxtojson keeps only the first of several
// sub-paths, which breaks icons and freeform art, and writes NaN where a point is a guide (a formula).
// shortcut: only the guide operators and built-in names decks were seen to use (customGeo.pptx), add others as they turn up
const GUIDE = { val: x => x, '*/': (x, y, z) => x * y / z, '+-': (x, y, z) => x + y - z, '?:': (x, y, z) => x > 0 ? y : z, abs: Math.abs, min: Math.min, pin: (x, y, z) => y < x ? x : y > z ? z : y, cos: (x, y) => x * Math.cos(y / 60000 * Math.PI / 180) }
const BAD_PATH = /NaN|Infinity|undefined/
function custGeomPath (spPr) {
  const list = kids(path(spPr, 'custGeom', 'pathLst'), 'path')
  const ext = path(spPr, 'xfrm', 'ext')
  if (!list.length || !ext) return null
  const ew = +ext.getAttribute('cx'), eh = +ext.getAttribute('cy'), W = ew * EMU_PT, H = eh * EMU_PT
  // guides by name, in EMU, each from the ones before it; an unknown operator makes the path unusable
  const g = new Map([['w', ew], ['h', eh], ['ss', Math.min(ew, eh)]]), num = a => g.has(a) ? g.get(a) : Number(a)
  for (const gd of ['avLst', 'gdLst'].flatMap(k => kids(path(spPr, 'custGeom', k), 'gd'))) {
    const [op, ...a] = (gd.getAttribute('fmla') || '').trim().split(/\s+/)
    g.set(gd.getAttribute('name'), Object.hasOwn(GUIDE, op) ? GUIDE[op](...a.map(num)) : NaN)
  }
  const f = v => Math.round(v * 100) / 100
  let d = ''
  for (const p of list) {
    const pw = +p.getAttribute('w') || 0, ph = +p.getAttribute('h') || 0
    const sx = pw ? W / pw : EMU_PT, sy = ph ? H / ph : EMU_PT
    const P = ([x, y]) => `${f(x * sx)} ${f(y * sy)}`
    let cx = 0, cy = 0, x0 = 0, y0 = 0
    for (const c of p.children) {
      const pts = kids(c, 'pt').map(n => [num(n.getAttribute('x')), num(n.getAttribute('y'))])
      if (pts.some(q => !Number.isFinite(q[0]) || !Number.isFinite(q[1]))) return null
      const end = pts[pts.length - 1]
      switch (c.localName) {
        case 'moveTo': if (end) { d += `M${P(end)} `; [cx, cy] = [x0, y0] = end } break
        case 'lnTo': if (end) { d += `L${P(end)} `; [cx, cy] = end } break
        case 'cubicBezTo': if (pts.length === 3) { d += `C${pts.map(P).join(' ')} `; [cx, cy] = end } break
        case 'quadBezTo': if (pts.length === 2) { d += `Q${pts.map(P).join(' ')} `; [cx, cy] = end } break
        case 'close': d += 'Z '; cx = x0; cy = y0; break
        case 'arcTo': {
          // angles are visual angles on the ellipse; turn them into parametric ones and draw ≤90° cubic pieces
          const wR = num(c.getAttribute('wR')), hR = num(c.getAttribute('hR'))
          const st = num(c.getAttribute('stAng')) / 60000 * Math.PI / 180, sw = num(c.getAttribute('swAng')) / 60000 * Math.PI / 180
          if (![wR, hR, st, sw].every(Number.isFinite)) return null
          if (!wR || !hR || !sw) break
          const par = th => Math.atan2(wR * Math.sin(th), hR * Math.cos(th))
          const t1 = par(st)
          let t2 = par(st + sw)
          if (Math.abs(sw) >= 2 * Math.PI - 1e-6) t2 = t1 + Math.sign(sw) * 2 * Math.PI
          else if (sw > 0) { while (t2 <= t1) t2 += 2 * Math.PI } else { while (t2 >= t1) t2 -= 2 * Math.PI }
          const ox = cx - wR * Math.cos(t1), oy = cy - hR * Math.sin(t1)
          const n = Math.max(1, Math.ceil(Math.abs(t2 - t1) / (Math.PI / 2) - 1e-9))
          const dt = (t2 - t1) / n, k = 4 / 3 * Math.tan(dt / 4)
          for (let j = 0; j < n; j++) {
            const a = t1 + j * dt, b = a + dt
            const p0 = [ox + wR * Math.cos(a), oy + hR * Math.sin(a)], p3 = [ox + wR * Math.cos(b), oy + hR * Math.sin(b)]
            d += `C${P([p0[0] - k * wR * Math.sin(a), p0[1] + k * hR * Math.cos(a)])} ${P([p3[0] + k * wR * Math.sin(b), p3[1] - k * hR * Math.cos(b)])} ${P(p3)} `
          }
          cx = ox + wR * Math.cos(t2); cy = oy + hR * Math.sin(t2)
          break
        }
      }
    }
  }
  return d && !BAD_PATH.test(d) ? { d: d.trim(), w: W, h: H } : null
}

const fallbackFor = name => /mono|consol|courier/i.test(name) ? 'monospace' : /georgia|times|garamond|cambria|constantia|serif|book antiqua|palatino|rockwell|bodoni|sitka|baskerville/i.test(name) && !/sans/i.test(name) ? 'serif' : 'sans-serif'
const famCss = name => `"${String(name).replace(/["']/g, '')}", ${fallbackFor(name)}`
// PowerPoint numbers in more schemes than Prizma draws: each goes to the nearest one Prizma has
const numFormat = t => Object.hasOwn(NUM_FORMATS, t) ? t : /^romanLc/.test(t) ? 'romanLcPeriod' : /^roman/.test(t) ? 'romanUcPeriod' : /^alphaLc/.test(t) ? 'alphaLcPeriod' : /^alpha/.test(t) ? 'alphaUcPeriod' : 'arabicPeriod'
// Repairs pptxtojson HTML: em spacing bug, non-breaking spaces, inherited bullets and run styles.
function fixHtml (html, shapeInfo, fixHref) {
  let h = (html || '').replace(/margin-(top|bottom):\s*([\d.]+)em/g, (m, side, v) => `margin-${side}: ${(+v > 3 ? +v / 100 : +v)}em`)
  h = normalize(h)
  const t = document.createElement('template')
  t.innerHTML = h
  const ps = [...t.content.children]
  if (fixHref) for (const a of t.content.querySelectorAll('a[href]')) { const h = fixHref(a.getAttribute('href')); if (h) a.setAttribute('href', h); else a.removeAttribute('href') }
  const tw = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT)
  while (tw.nextNode()) tw.currentNode.nodeValue = tw.currentNode.nodeValue.replace(/\xa0/g, ' ')
  // generic fallbacks so missing fonts never fall back to a serif default
  for (const n of t.content.querySelectorAll('[style*="font-family"]')) {
    const f = n.style.fontFamily
    if (f && !/,/.test(f) && !/var\(/.test(f)) n.style.fontFamily = famCss(f)
  }
  const paras = shapeInfo?.paras
  if (paras && paras.length === ps.length) {
    ps.forEach((p, i) => {
      const b = paras[i]
      p.removeAttribute('data-bu'); p.removeAttribute('data-num')
      p.setAttribute('data-lvl', String(b.lvl))
      if (b.type === 'char' || b.type === 'num') {
        if (b.type === 'num') {
          p.setAttribute('data-num', numFormat(b.num))
          // kept on every paragraph of the list, as PowerPoint writes startAt
          if (b.start > 1) p.setAttribute('data-start', String(b.start))
        } else p.setAttribute('data-bu', bulletGlyph(b.char, b.font) || BULLET_CHARS[b.lvl % 5])
        if (!p.style.marginLeft && b.marL !== null) p.style.marginLeft = b.marL + 'pt'
        if (!p.style.textIndent && b.indent !== null) p.style.textIndent = b.indent + 'pt'
        if (!p.style.marginLeft) { p.style.marginLeft = (27 + b.lvl * 36) + 'pt'; p.style.textIndent = '-27pt' }
        if (b.color) p.style.setProperty('--bu-color', b.color)
        if (b.size && b.size !== 1) p.style.setProperty('--bu-scale', String(b.size))
      }
      let spans = [...p.children].filter(c => c.tagName === 'SPAN'), runs = b.runs
      if (spans.length && runs?.some(r => r.br || r.fld)) {
        // pptxtojson drops line breaks and moves fields to the end, so the line is laid out again in file order, each run
        // in a copy of the span pptxtojson put it in (its styles and link). pptxtojson's order: with breaks, file order with
        // each break one space and the first of several left out; without, the fields after the runs.
        const brs = runs.filter(r => r.br)
        const made = brs.length ? runs.filter(r => r !== brs[0] || brs.length < 2) : [...runs.filter(r => !r.fld), ...runs.filter(r => r.fld)]
        const owner = spans.flatMap(sp => Array(sp.textContent.length).fill(sp))
        let at = 0
        // an empty run or a break is one space in pptxtojson's text
        const spanOf = new Map(made.map(r => { const sp = owner[Math.min(at, owner.length - 1)] || spans[0]; at += r.text.length || 1; return [r, sp] }))
        p.replaceChildren(...runs.map(r => {
          if (r.br) return document.createElement('br')
          const sp = spanOf.get(r).cloneNode(true)
          ;(sp.querySelector('a') || sp).textContent = r.text
          return sp
        }))
        // a break that ends the paragraph needs a second <br> for its empty line to show
        if (runs[runs.length - 1].br) p.appendChild(document.createElement('br'))
        runs = runs.filter(r => !r.br)
        spans = [...p.children].filter(c => c.tagName === 'SPAN')
      }
      // re-apply run styles resolved from the XML inheritance chain
      if (runs && runs.length && spans.length) {
        const starts = []
        let acc = 0
        for (const r of runs) { starts.push(acc); acc += r.text.length }
        let off = 0
        const sameCount = runs.length === spans.length
        spans.forEach((sp, k) => {
          let ri = sameCount ? k : starts.findLastIndex(st => st <= off)
          if (ri < 0) ri = 0
          off += sp.textContent.length
          const r = runs[ri]
          if (r.sz) sp.style.fontSize = r.sz + 'pt'
          if (r.color) sp.style.color = r.color
          if (r.font) sp.style.fontFamily = famCss(r.font)
          if (r.b !== null) sp.style.fontWeight = r.b ? 'bold' : ''
          if (r.i !== null) sp.style.fontStyle = r.i ? 'italic' : ''
          if (r.cap === 'all') sp.style.textTransform = 'uppercase'
          else if (r.cap === 'small') sp.style.fontVariant = 'small-caps'
        })
      } else if (b.runs?.length === 0) {
        // an empty paragraph stays empty (pptxtojson pads it with a space): no bullet shows, its size sets the line height
        const keep = spans[0]
        p.textContent = ''
        if (keep) keep.textContent = ''
        ;(keep ? p.appendChild(keep) : p).appendChild(document.createElement('br'))
      }
      syncBullet(p)
    })
  }
  return t.innerHTML
}

// Converts one pptxtojson element and remembers which PowerPoint shape id became which element
// presets pptxtojson draws wrong (or flat where PowerPoint shades them): Prizma draws these itself, as PowerPoint does
const OWN_DRAWN = new Set(['halfFrame', 'bevel', 'can', 'cube', 'flowChartMultidocument', 'flowChartMagneticDisk', 'flowChartMagneticDrum', 'flowChartDisplay', 'wedgeEllipseCallout',
  'parallelogram', 'plus', 'rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'leftRightArrow', 'upDownArrow', 'star4', 'noSmoking', 'sun', 'cloud', 'cloudCallout'])
// An element mirrored across its group's box, as actions.js flipEl flips a group's children
function mirror (c, axis, g) {
  if (axis === 'h') c.x = g.w - c.x - c.w; else c.y = g.h - c.y - c.h
  if (c.rot) c.rot = 360 - c.rot
  if (c.type !== 'group') { if (axis === 'h') c.flipH = !c.flipH; else c.flipV = !c.flipV; return }
  for (const k of c.children) mirror(k, axis, c)
}
function convert (e, ctx) {
  let el
  try { el = convertEl(e, ctx) } catch (err) { console.warn('left out an object Prizma could not read', e?.type, err); return null } // one odd object must not stop the file from opening
  if (!el) return null
  if (ctx.ids && e.id !== undefined && e.id !== null) ctx.ids.set(String(e.id), el.id)
  return el
}
function convertEl (e, ctx) {
  const sinfo = e.id ? (ctx.keyed ? ctx.info.shapes[e.id + '|' + e.name] : ctx.info.shapes[e.id]) : null
  const meta = e.id ? ctx.info.meta?.[e.id] : null
  // objects paired for Morph ("!!" names) share one id across slides, as they do in Prizma
  let id = uid(), name = meta?.name || e.name
  if (ctx.morph && /^!!/.test(name || '')) {
    id = ctx.morph.get(name) || id
    ctx.morph.set(name, id)
    name = name.replace(/^!!/, '').replace(/ [0-9a-z]{1,4}$/, '')
  }
  const base = { id, x: e.left || 0, y: e.top || 0, w: e.width || 0, h: e.height || 0, rot: e.rotate || 0, ...(e.isFlipH ? { flipH: true } : {}), ...(e.isFlipV ? { flipV: true } : {}), name, ...(meta?.descr ? { alt: meta.descr } : {}), ...(meta?.hidden ? { hidden: true } : {}) }
  const shadow = e.shadow ? { dx: e.shadow.h || 0, dy: e.shadow.v || 0, blur: e.shadow.blur || 0, color: (e.shadow.color || '#000000').slice(0, 7), alpha: e.shadow.color && e.shadow.color.length > 7 ? parseInt(e.shadow.color.slice(7, 9), 16) / 255 : 0.4 } : undefined
  const link = sinfo?.link || (e.link ? { url: e.link } : undefined)
  const fixLinks = ctx.fixHref
  switch (e.type) {
    case 'text': {
      const el = {
        ...base, type: 'text', html: fixHtml(e.content, sinfo, fixLinks), fill: sinfo?.noFill ? null : convFill(e.fill, ctx.media), line: lineWithRefs(e, sinfo),
        inset: e.textInset ? { l: e.textInset.l, t: e.textInset.t, r: e.textInset.r, b: e.textInset.b } : { ...DEFAULT_INSET },
        vAlign: va(e.vAlign), wrap: e.wrap !== false, autofit: e.autoFit?.type === 'shape' ? 'shape' : e.autoFit?.type === 'text' ? 'shrink' : 'none',
        // pptxtojson gives the shrink as a percentage (62.5), Prizma keeps a fraction
        ...(e.autoFit?.fontScale > 0 && e.autoFit.fontScale < 100 ? { fontScale: e.autoFit.fontScale / 100 } : {}),
        ...(sinfo?.vertical || e.isVertical ? { vertical: sinfo?.vertical || true } : {}), ...(shadow ? { shadow } : {}), ...(link ? { link } : {}), ts: {}
      }
      if (sinfo?.ph && PH_ROLE[sinfo.ph]) el.ph = PH_ROLE[sinfo.ph]
      return el
    }
    case 'shape': {
      if (isLineShape(e.shapType)) {
        const straight = e.shapType === 'line' || e.shapType === 'straightConnector1' || e.shapType === 'lineInv'
        return {
          ...base, type: 'line', kind: straight ? 'straight' : e.shapType.startsWith('bent') ? 'elbow' : 'curve',
          // elbows keep their bend points; curved connectors are drawn by Prizma (pptxtojson flattens them)
          ...(e.shapType.startsWith('bent') ? { path: e.path, pathVB: e.pathViewBox ? { w: e.pathViewBox.width, h: e.pathViewBox.height } : null } : {}),
          line: lineWithRefs(e, sinfo, { head: arrowOf(e.headEnd), tail: arrowOf(e.tailEnd), headSize: e.headEnd?.width, tailSize: e.tailEnd?.width })
        }
      }
      const g = sinfo?.geom
      const own = !g && OWN_DRAWN.has(e.shapType)
      // the file's adjustments, where Prizma's own drawing of that preset has the same handle
      const adj = Object.fromEntries(Object.entries(adjFromAvLst(e.shapType, e.keypoints)).filter(([k, v]) => SHAPES[e.shapType]?.adj?.[k] !== undefined && Number.isFinite(v)))
      const el = {
        ...base, type: 'shape', shape: e.shapType || 'rect', adj, path: g ? g.d : own || BAD_PATH.test(e.path) ? null : e.path || null,
        pathVB: g ? { w: g.w, h: g.h } : own ? null : e.pathViewBox ? { w: e.pathViewBox.width, h: e.pathViewBox.height } : null,
        fill: e.strokeOnly || sinfo?.bgFill || sinfo?.noFill ? null : convFill(e.fill, ctx.media), line: lineWithRefs(e, sinfo), html: fixHtml(e.content, sinfo, fixLinks),
        inset: e.textInset ? { l: e.textInset.l, t: e.textInset.t, r: e.textInset.r, b: e.textInset.b } : { ...DEFAULT_INSET },
        vAlign: va(e.vAlign), wrap: e.wrap !== false, ...(sinfo?.vertical ? { vertical: sinfo.vertical } : {}), ...(shadow ? { shadow } : {}), ...(link ? { link } : {}), ts: {}
      }
      // "filled with the slide background": see-through here, the background shows anyway
      if (sinfo?.bgFill) el.bgFill = true
      if (arrowOf(e.headEnd) !== 'none' && el.line) el.line.head = arrowOf(e.headEnd)
      if (arrowOf(e.tailEnd) !== 'none' && el.line) el.line.tail = arrowOf(e.tailEnd)
      if (e.strokeOnly) el.strokeOnly = true
      if (sinfo?.ph && PH_ROLE[sinfo.ph]) el.ph = PH_ROLE[sinfo.ph]
      return el
    }
    case 'image': case 'math': {
      const src = ctx.media.get(e.ref || e.picRef)
      if (!src) return null
      const r = e.rect
      const crop = r ? { l: (r.l || 0) / 100, t: (r.t || 0) / 100, r: (r.r || 0) / 100, b: (r.b || 0) / 100 } : null
      const el = { ...base, type: 'image', src, crop: crop && (crop.l || crop.t || crop.r || crop.b) ? crop : null, line: convLine(e), geom: e.geom && e.geom !== 'rect' ? e.geom : undefined, ...(link ? { link } : {}), ...(shadow ? { shadow } : {}) }
      // pptxtojson's corrections are fractions (0.4), Prizma's are percentages (saturation 100 = unchanged)
      const f = e.filters || {}, adj = {}
      if (f.brightness !== undefined) adj.brightness = Math.round(f.brightness * 100)
      if (f.contrast !== undefined) adj.contrast = Math.round(f.contrast * 100)
      if (f.saturation !== undefined && f.saturation !== 1) adj.saturate = Math.round(f.saturation * 100)
      if (sinfo?.gray) adj.grayscale = true
      if (sinfo?.transparency > 0) adj.transparency = sinfo.transparency
      if (Object.keys(adj).length) el.adjust = adj
      return el
    }
    case 'table': {
      const rowsN = e.data?.length || 0
      const colsN = e.colWidths?.length || (e.data?.[0]?.length || 0)
      const tinfo = e.id ? ctx.info.tables[e.id] : null
      const sdef = tinfo?.styleId ? ctx.info.tableStyles?.[tinfo.styleId] : null
      const anyFill = (e.data || []).some(r => r.some(c => c && c.fillColor))
      const cells = []
      for (let r = 0; r < rowsN; r++) {
        cells.push([])
        for (let c = 0; c < colsN; c++) {
          const d = e.data[r]?.[c]
          if (!d) { cells[r].push({ html: '<p><br></p>', merged: true }); continue }
          const cell = { html: fixHtml(d.text || '', null, fixLinks), vAlign: va(d.vAlign) }
          if (sdef) {
            const look = styleCell(sdef, tinfo, r, c, rowsN, colsN)
            if (look.fill && look.fill !== 'none') cell.fill = { type: 'solid', color: look.fill }
            if (look.color) cell.color = look.color
            if (look.bold) cell.bold = true
            const lb = {}
            for (const [side, v] of Object.entries(look.borders)) if (v) lb[side] = { color: v.color, width: v.width }
            if (Object.keys(lb).length) cell.borders = lb
          }
          // pptxtojson's colours are its own guess at the style (bands come out swapped without a header row): with a
          // style definition, styleCell decides and only the cell's own fill wins
          if (d.fillColor && (!sdef || tinfo.explicit[r]?.[c])) cell.fill = { type: 'solid', color: d.fillColor.slice(0, 7).toUpperCase() }
          if (d.fontColor && !sdef) cell.color = d.fontColor.slice(0, 7).toUpperCase()
          if (d.fontBold && !sdef) cell.html = cell.html.replace(/<p/g, '<p style="font-weight: bold"').replace(/style="font-weight: bold" style="/g, 'style="font-weight: bold; ')
          if (d.colSpan > 1) cell.colspan = d.colSpan
          if (d.rowSpan > 1) cell.rowspan = d.rowSpan
          if (d.hMerge || d.vMerge) cell.merged = true
          const bd = d.borders || {}
          const borders = {}
          for (const side of ['top', 'right', 'bottom', 'left']) {
            const b = bd[side]
            if (b && b.borderWidth) borders[side] = { color: (b.borderColor || '#000000').slice(0, 7), width: b.borderWidth, dash: dashOf(b.borderType) }
          }
          if (Object.keys(borders).length) cell.borders = { ...(cell.borders || {}), ...borders }
          cells[r].push(cell)
        }
      }
      return {
        ...base, type: 'table', cols: e.colWidths || Array(colsN).fill(base.w / Math.max(1, colsN)), rows: e.rowHeights || Array(rowsN).fill(base.h / Math.max(1, rowsN)), cells,
        style: sdef || anyFill || !tinfo?.styleId ? { id: 'none', header: !!tinfo?.firstRow, banded: !!tinfo?.bandRow } : { id: 'medium', accent: 'accent1', header: tinfo.firstRow, banded: tinfo.bandRow, firstCol: tinfo.firstCol, lastRow: tinfo.lastRow },
        ts: { size: 14 }
      }
    }
    case 'chart': {
      const cx = e.id ? ctx.info.charts?.[e.id] : null
      // the data chartInfo read from the chart part; pptxtojson's stays for the charts it does not read (layouts, masters)
      const g = cx?.chartType ? cx : e
      const data = Array.isArray(e.data) ? e.data : []
      const first = data[0]
      // scatter and bubble charts arrive as plain lists: [x values, y values of series 1, of series 2, …]
      const xy = Array.isArray(first)
      const cats = g.categories || (xy ? first.map(String) : first?.xlabels ? Object.keys(first.xlabels).sort((a, b) => +a - +b).map(k => unent(first.xlabels[k])) : (first?.values || []).map(v => String(v.x)))
      const T = g.chartType || ''
      const type = /bar/i.test(T) ? (g.barDir === 'bar' ? 'bar' : 'column') : /line/i.test(T) ? 'line' : /area/i.test(T) ? 'area' : /doughnut/i.test(T) ? 'doughnut' : /pie/i.test(T) ? 'pie' : /scatter|bubble/i.test(T) ? 'scatter' : /radar/i.test(T) ? 'radar' : 'column'
      const series = g.series || (xy
        ? data.slice(1).map((ys, i) => ({ name: 'Series ' + (i + 1), values: ys.map(v => +v || 0) }))
        : data.map(s => ({ name: unent(s.key) ?? 'Series', values: (s.values || []).map(v => +v.y || 0) })))
      let colors = (e.colors || []).filter(Boolean)
      if (cx?.seriesColors?.some(Boolean)) colors = cx.seriesColors.map((c, i) => c || colors[i]).filter(Boolean)
      return {
        ...base, type: 'chart', chartType: type, look: cx?.is3d ? '3d' : 'flat', grouping: /percent/i.test(g.grouping || '') ? 'percent' : /stacked/i.test(g.grouping || '') ? 'stacked' : 'clustered',
        categories: cats, series: series.map((s, i) => colors[i] && type !== 'pie' && type !== 'doughnut' ? { ...s, color: colors[i].slice(0, 7) } : s),
        ...(type === 'pie' || type === 'doughnut' ? (cx?.pointColors?.length ? { pointColors: cats.map((_, i) => cx.pointColors.find(p => p.idx === i)?.color || null) } : {}) : {}),
        ...(cx?.reversed ? { reversed: true } : {}),
        opts: { legend: cx ? ({ r: 'right', l: 'right', t: 'top', b: 'bottom', tr: 'right' })[cx.legend] || 'none' : 'bottom', labels: !!cx?.labels, title: cx?.title || '', gridlines: cx?.gridlines ?? true, holeSize: g.holeSize || 55 },
        ts: { font: '+minor', size: cx?.fontSize || 13, color: 'dk1' }
      }
    }
    case 'video': case 'audio': {
      const el = { ...base, type: e.type, src: null, poster: null, autoplay: false, loop: false }
      // read from the package here (pptxtojson keeps only mp4/webm/ogg/mp3/wav); linked media has no part: the frame stays
      const f = e.ref && ctx.zip.file(e.ref)
      if (f) ctx.pending.push(f.async('uint8array').then(bytes => { el.src = addMedia(bytes, AV_MIME[e.ref.split('.').pop().toLowerCase()] || (e.type === 'video' ? 'video/mp4' : 'audio/mpeg')) }, err => console.warn('media import failed', err)))
      return el
    }
    case 'group': case 'diagram': {
      const children = (e.elements || []).map(c => convert(c, ctx)).filter(Boolean)
      if (!children.length) return null
      // Prizma's groups carry no flip: a flipped group's children are mirrored instead and the group keeps its turn
      const { flipH, flipV, ...g } = base
      for (const c of children) { if (flipH) mirror(c, 'h', g); if (flipV) mirror(c, 'v', g) }
      return { ...g, type: 'group', children }
    }
    default:
      return null
  }
}
const LAYOUT_TYPES = { title: 'title', obj: 'titleContent', tx: 'titleContent', secHead: 'section', twoObj: 'twoContent', twoTxTwoObj: 'comparison', titleOnly: 'titleOnly', blank: 'blank', objTx: 'contentCaption', picTx: 'pictureCaption' }
// Layouts named like Prizma's ("Title and Content", "Title and Content 2") map back to that layout
const layoutOf = sinfo => {
  const byName = LAYOUTS.find(l => l.name === String(sinfo.layoutName || '').replace(/ \d+$/, ''))
  return byName ? byName.id : LAYOUT_TYPES[sinfo.layoutType] || (sinfo.layoutType ? 'titleContent' : 'blank')
}
const HF_PH = new Set(['dt', 'ftr', 'sldNum'])
async function readProps (zip) {
  const x = await readXml(zip, 'docProps/core.xml')
  const get = name => x ? [...x.documentElement.children].find(n => n.localName === name)?.textContent || '' : ''
  return { title: get('title'), author: get('creator'), created: Date.parse(get('created')) || Date.now(), modified: Date.now() }
}
async function readShowProps (zip, nSlides) {
  const show = { loop: false, presenter: true, useTimings: true, display: 'auto' }
  const x = await readXml(zip, 'ppt/presProps.xml')
  const sp = x && kid(x.documentElement, 'showPr')
  if (!sp) return show
  if (on(sp.getAttribute('loop'))) show.loop = true
  if (off(sp.getAttribute('useTimings'))) show.useTimings = false
  if (off(sp.getAttribute('showAnimation'))) show.noAnim = true
  const rg = kid(sp, 'sldRg')
  if (rg) { show.from = Math.max(1, +rg.getAttribute('st') || 1); show.to = Math.min(nSlides, +rg.getAttribute('end') || nSlides) }
  const pen = kid(kid(sp, 'penClr'), 'srgbClr')
  if (pen) show.pen = '#' + pen.getAttribute('val').toUpperCase()
  return show
}

export async function importPptx (buffer, onProgress) {
  onProgress?.('Reading file')
  const zip = await JSZip.loadAsync(buffer)
  checkZipSize(zip)
  const twin = await readTwin(zip)
  if (twin) return pinSlideLinks(twin, sanitize)
  const info = await analyse(zip)
  if (window.__pzDebug) window.__pzAnalysis = info
  onProgress?.('Converting slides')
  // no media from pptxtojson: it throws on linked files and drops m4a/mov/wmv; convertEl reads them from the package
  const json = await pptxParse(buffer, { imageMode: 'none', videoMode: 'none', audioMode: 'none', singleLineSpacingFactor: 1.2 })
  // names are matched with the ones read from the XML, which have their entities decoded
  const names = l => { for (const e of l || []) { e.name = unent(e.name); names(e.elements) } }
  for (const s of json.slides) { names(s.elements); names(s.layoutElements) }
  // pptxtojson takes slides by part name ([Content_Types].xml, sorted by number); the deck's order is sldIdLst's
  const parsed = kids((await readXml(zip, '[Content_Types].xml'))?.documentElement, 'Override')
    .filter(o => o.getAttribute('ContentType') === 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml')
    .map(o => o.getAttribute('PartName').slice(1)).sort((a, b) => /(\d+)\.xml/.exec(a)[1] - /(\d+)\.xml/.exec(b)[1])
  const media = await loadPictures([json.slides, info.slides.map(s => [s.oles, s.masterOles])], zip)
  const pending = []
  const accents = json.themeColors || []
  const tc = info.theme?.colors || {}
  const colors = {
    lt1: tc.lt1 || '#FFFFFF', dk1: tc.dk1 || '#000000', lt2: tc.lt2 || '#E7E6E6', dk2: tc.dk2 || '#44546A',
    accent1: tc.accent1 || accents[0] || '#4472C4', accent2: tc.accent2 || accents[1] || '#ED7D31', accent3: tc.accent3 || accents[2] || '#A5A5A5',
    accent4: tc.accent4 || accents[3] || '#FFC000', accent5: tc.accent5 || accents[4] || '#5B9BD5', accent6: tc.accent6 || accents[5] || '#70AD47',
    hlink: tc.hlink || '#0563C1', folHlink: tc.folHlink || '#954F72'
  }
  const fontsOf = { major: info.theme?.fonts?.major || 'Calibri', minor: info.theme?.fonts?.minor || 'Calibri' }
  // a deck saved by Prizma: its theme comes back as the live theme (art and backgrounds drawn by Prizma again)
  const marker = await readMarker(zip)
  const spec = marker?.theme?.id ? THEMES.find(t => t.id === marker.theme.id) : null
  const slideNames = info.slidePaths.map(p => p.split('/').pop())
  const fixHref = href => {
    if (!href) return null
    const m = /(?:^|\/)(slide\d+\.xml)$/.exec(href)
    if (m) { const k = slideNames.indexOf(m[1]); return k >= 0 ? '#slide:' + k : null }
    return /^(https?:|mailto:|ftp:|file:|#)/i.test(href) ? href : null
  }
  const morph = new Map(), tinted = new Map()
  let slideNumbers = false
  // a slide part left out of sldIdLst is not a slide; one pptxtojson could not read comes out empty
  const slides = info.slides.map((sinfo, i) => {
    const s = json.slides[parsed.indexOf(info.slidePaths[i])] || {}
    const ids = new Map()
    const ctx = { info: sinfo, media, pending, ids, morph, fixHref, zip }
    const byOrder = arr => [...(arr || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    let elements = byOrder(s.elements).map(e => convert(e, ctx)).filter(Boolean)
    const has = (set, e) => e.name !== undefined ? set.has(e.id + '|' + e.name) : [...set].some(k => k.startsWith(e.id + '|'))
    const keep = e => {
      if (sinfo.hideAllMaster) return false
      if (!sinfo.hideMasterOnly) return true
      return has(sinfo.layoutKeys, e) || !has(sinfo.masterKeys, e)
    }
    const mctx = { info: { shapes: sinfo.masterShapes || {}, tables: {} }, keyed: true, media, pending, fixHref, zip }
    let master = byOrder(s.layoutElements).filter(keep).map(e => convert(e, mctx)).filter(Boolean)
    const ole = (list, o) => list.splice(Math.min(o.at, list.length), 0, { id: uid(), type: 'image', name: o.name, x: o.x, y: o.y, w: o.w, h: o.h, rot: 0, src: media.get(o.ref), crop: null, line: null })
    for (const o of sinfo.oles || []) ole(elements, o)
    for (const o of sinfo.masterOles || []) ole(master, o)
    const timing = sinfo.sld ? readTiming(sinfo.sld, spid => ids.get(String(spid)) || null) : { animations: [], autoplay: [], loop: [] }
    for (const id of timing.autoplay) { const el = elements.find(e => e.id === id); if (el) el.autoplay = true }
    for (const id of timing.loop) { const el = elements.find(e => e.id === id); if (el) el.loop = true }
    const layout = layoutOf(sinfo)
    let bg = convFill(s.fill, media)
    if (sinfo.duotone && bg?.type === 'image') {
      const key = bg.src + sinfo.duotone.join()
      if (!tinted.has(key)) tinted.set(key, duotoneMedia(bg.src, sinfo.duotone).catch(() => bg.src))
      const fill = bg = { ...bg }
      pending.push(tinted.get(key).then(src => { fill.src = src }))
    }
    // a slide number placeholder showing the number becomes the deck's slide number, as in decks Prizma wrote
    const nums = new Set(Object.entries(sinfo.shapes).filter(([, r]) => r.num).map(([sid]) => ids.get(sid)).filter(Boolean))
    if (nums.size) { elements = elements.filter(e => !nums.has(e.id)); slideNumbers = true }
    if (spec) {
      // footers come back as settings; untouched Prizma layouts redraw their own art and background
      const hfIds = new Set(Object.entries(sinfo.shapes).filter(([, r]) => HF_PH.has(r.ph)).map(([sid]) => ids.get(sid)).filter(Boolean))
      elements = elements.filter(e => !hfIds.has(e.id))
      if (LAYOUTS.some(l => l.name === sinfo.layoutName)) { master = null; if (!sinfo.ownBg) bg = null }
    }
    const tr = sinfo.trans || {}
    return {
      id: uid('s'), layout, bg, master: sinfo.hideAllMaster ? null : master, ...(sinfo.hideAllMaster ? { hideMaster: true } : {}),
      elements, notes: sinfo.notes, hidden: !!sinfo.hidden, transition: tr.transition || null,
      ...(tr.advanceClick === false ? { advanceClick: false } : {}), ...(tr.advanceAfter != null ? { advanceAfter: tr.advanceAfter } : {}),
      animations: timing.animations, comments: sinfo.comments || []
    }
  })
  await Promise.all(pending)
  await rasterizeMetafiles(slides)
  const size = { w: Math.round(json.size.width * 100) / 100, h: Math.round(json.size.height * 100) / 100 }
  const theme = spec
    ? { id: spec.id, name: marker.theme.name || spec.name, variant: marker.theme.variant || 0, colors, fonts: fontsOf }
    : { id: 'imported', name: 'Imported theme', variant: 0, colors, fonts: fontsOf }
  return pinSlideLinks({
    v: 1, id: uid('d'), size, theme,
    slides: slides.length ? slides : [{ id: uid('s'), layout: 'blank', bg: null, master: [], elements: [], notes: '', hidden: false, transition: null, animations: [], comments: [] }],
    props: await readProps(zip),
    show: spec && marker.show ? marker.show : await readShowProps(zip, slides.length),
    hf: spec && marker.hf ? marker.hf : { number: slideNumbers, footer: '', date: false, dateText: '', hideOnTitle: true },
    imported: !spec
  })
}
export { htmlFromText }

// Document model: ids, units, colours, fills, element factories and geometry helpers.
// Units: everything on a slide is in points (pt). 1pt = 4/3 CSS px at 100 % zoom.

export const PX = 4 / 3
export const uid = (p = 'e') => p + Math.random().toString(36).slice(2, 8) + (Date.now() % 1e6).toString(36)

export const SLIDE_SIZES = [
  { id: 'wide', label: 'Widescreen (16:9)', w: 960, h: 540 },
  { id: 'standard', label: 'Standard (4:3)', w: 720, h: 540 },
  { id: 'wide1610', label: 'Widescreen (16:10)', w: 720, h: 450 },
  { id: 'a4', label: 'A4 paper', w: 780, h: 540 },
  { id: 'square', label: 'Square (1:1)', w: 540, h: 540 },
  { id: 'portrait', label: 'Portrait (9:16)', w: 540, h: 960 }
]

// ---------- colours ----------
export const SLOTS = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']
export const SLOT_LABEL = { lt1: 'Background 1', dk1: 'Text 1', lt2: 'Background 2', dk2: 'Text 2', accent1: 'Accent 1', accent2: 'Accent 2', accent3: 'Accent 3', accent4: 'Accent 4', accent5: 'Accent 5', accent6: 'Accent 6', hlink: 'Hyperlink' }
export const STANDARD_COLORS = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0']

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export function hexToRgb (hex) {
  let h = String(hex || '').replace('#', '').trim()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
export const rgbToHex = ({ r, g, b }) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase()
export function mix (hex, other, t) {
  const a = hexToRgb(hex), b = hexToRgb(other)
  return rgbToHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t })
}
export function luminance (hex) {
  const { r, g, b } = hexToRgb(hex)
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

// A colour value is '#RRGGBB', a theme slot ('accent1') or a slot with a lightness modifier ('accent1:40' tint, 'accent1:-25' shade).
// 'accent1@20' = 20 % of accent1 over the slide background (lt1) — used for table banding.
export function parseColor (c) {
  if (!c || typeof c !== 'string') return null
  if (c[0] === '#' || c.startsWith('rgb')) return { hex: c }
  if (c.includes('@')) { const [slot, pct] = c.split('@'); return { slot, over: Number(pct) } }
  const [slot, mod] = c.split(':')
  return { slot, mod: mod ? Number(mod) : 0 }
}
export function hexColor (c, theme) {
  const p = parseColor(c)
  if (!p) return null
  if (p.hex) return p.hex.startsWith('rgb') ? rgbStringToHex(p.hex) : p.hex.toUpperCase()
  const base = theme?.colors?.[p.slot] || '#000000'
  if (p.over !== undefined) return mix(theme?.colors?.lt1 || '#FFFFFF', base, p.over / 100)
  if (!p.mod) return base
  return p.mod > 0 ? mix(base, '#FFFFFF', p.mod / 100) : mix(base, '#000000', -p.mod / 100)
}
function rgbStringToHex (s) {
  const m = s.match(/[\d.]+/g) || []
  return rgbToHex({ r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0 })
}
export function cssColor (c, alpha = 1) {
  const p = parseColor(c)
  if (!p) return 'transparent'
  let v = p.hex || `var(--c-${p.slot})`
  if (p.over !== undefined) v = `color-mix(in srgb, var(--c-${p.slot}) ${p.over}%, var(--c-lt1))`
  else if (p.slot && p.mod) v =p.mod > 0 ? `color-mix(in srgb, var(--c-${p.slot}), #fff ${p.mod}%)` : `color-mix(in srgb, var(--c-${p.slot}), #000 ${-p.mod}%)`
  if (alpha < 1) v = `color-mix(in srgb, ${v} ${Math.round(alpha * 100)}%, transparent)`
  return v
}
export const themeVars = theme => {
  const v = {}
  for (const [k, c] of Object.entries(theme.colors)) v['--c-' + k] = c
  v['--f-major'] = fontStack(theme.fonts.major)
  v['--f-minor'] = fontStack(theme.fonts.minor)
  v['--fw-major'] = fontWeightOf(theme.fonts.major) || 400
  v['--fw-minor'] = fontWeightOf(theme.fonts.minor) || 400
  return v
}
// Families named after a weight ("Segoe UI Semibold", "Bahnschrift Light") also list the base family,
// and fontWeightOf gives the weight to ask for, so the right face is used either way.
const WEIGHT_RX = /^(.*?)\s+(Thin|Hairline|ExtraLight|UltraLight|Light|SemiLight|Semilight|Book|Medium|SemiBold|Semibold|DemiBold|Demibold|Bold|ExtraBold|UltraBold|Black|Heavy)$/i
const WEIGHTS = { thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, semilight: 350, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900 }
export function fontWeightOf (name) {
  const m = WEIGHT_RX.exec(name || '')
  return m ? WEIGHTS[m[2].toLowerCase()] : null
}
export function fontStack (name) {
  if (!name) return 'inherit'
  if (name === '+major') return 'var(--f-major)'
  if (name === '+minor') return 'var(--f-minor)'
  const fb = /mono|consol|courier/i.test(name) ? 'monospace' : /georgia|times|garamond|cambria|constantia|serif|book|playfair|sitka/i.test(name) ? 'serif' : 'sans-serif'
  const clean = name.replace(/"/g, '')
  const m = WEIGHT_RX.exec(clean)
  return m ? `"${clean}", "${m[1]}", ${fb}` : `"${clean}", ${fb}`
}

// ---------- fills & lines ----------
export const solid = (color, alpha) => ({ type: 'solid', color, ...(alpha !== undefined && alpha < 1 ? { alpha } : {}) })
export function fillCss (fill, mediaUrl) {
  if (!fill || fill.type === 'none') return 'transparent'
  if (fill.type === 'solid') return cssColor(fill.color, fill.alpha ?? 1)
  if (fill.type === 'gradient') {
    const stops = (fill.stops || []).map(s => `${cssColor(s.color, s.alpha ?? 1)} ${s.pos}%`).join(', ')
    return fill.kind === 'radial' ? `radial-gradient(circle at ${fill.cx ?? 50}% ${fill.cy ?? 50}%, ${stops})` : `linear-gradient(${(fill.angle ?? 90) + 90}deg, ${stops})`
  }
  if (fill.type === 'image') {
    const u = mediaUrl ? mediaUrl(fill.src) : ''
    if (fill.mode === 'tile') return `url("${u}") repeat`
    if (fill.mode === 'stretch') return `url("${u}") center / 100% 100% no-repeat`
    return `url("${u}") center / cover no-repeat`
  }
  if (fill.type === 'pattern') return cssColor(fill.fg || fill.color, 1)
  return 'transparent'
}
export const DASHES = {
  solid: null, dash: [4, 3], dot: [1, 1], dashDot: [4, 3, 1, 3], longDash: [8, 3], longDashDot: [8, 3, 1, 3], sysDash: [3, 1], sysDot: [1, 1]
}
export const DASH_LABEL = { solid: 'Solid', dash: 'Dash', dot: 'Round dot', dashDot: 'Dash dot', longDash: 'Long dash', longDashDot: 'Long dash dot', sysDash: 'Square dot', sysDot: 'Dot' }
export const ARROWS = ['none', 'triangle', 'arrow', 'stealth', 'diamond', 'oval']

// ---------- element factories ----------
export const DEFAULT_INSET = { l: 7.2, t: 3.6, r: 7.2, b: 3.6 }
const baseEl = (type, b, extra) => ({ id: uid(), type, x: b.x, y: b.y, w: b.w, h: b.h, rot: 0, ...extra })

export function textBox (b, html = '<p><br></p>', extra = {}) {
  return baseEl('text', b, {
    name: 'Text Box', html, fill: null, line: null, inset: { ...DEFAULT_INSET }, vAlign: 'top', wrap: true, autofit: 'shape',
    ts: { font: '+minor', size: 18, color: 'dk1' }, ...extra
  })
}
export function shapeEl (shape, b, extra = {}) {
  return baseEl('shape', b, {
    name: shape, shape, adj: {}, html: '', fill: solid('accent1'), line: { color: 'accent1:-25', width: 1 },
    inset: { ...DEFAULT_INSET }, vAlign: 'middle', wrap: true, ts: { font: '+minor', size: 18, color: 'lt1', align: 'center' }, ...extra
  })
}
export function lineEl (kind, p1, p2, extra = {}) {
  const b = boxFromPoints(p1, p2)
  return {
    id: uid(), type: 'line', name: 'Line', kind: kind || 'straight', ...b, rot: 0,
    line: { color: 'accent1', width: 1.5, dash: 'solid', head: kind === 'doubleArrow' ? 'triangle' : 'none', tail: kind === 'arrow' || kind === 'doubleArrow' || kind === 'elbowArrow' ? 'triangle' : 'none' },
    ...extra
  }
}
export function boxFromPoints (p1, p2) {
  return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y), flipH: p2.x < p1.x, flipV: p2.y < p1.y }
}
export function lineEnds (el) {
  const x1 = el.flipH ? el.x + el.w : el.x, x2 = el.flipH ? el.x : el.x + el.w
  const y1 = el.flipV ? el.y + el.h : el.y, y2 = el.flipV ? el.y : el.y + el.h
  if (!el.rot) return [{ x: x1, y: y1 }, { x: x2, y: y2 }]
  const c = { x: el.x + el.w / 2, y: el.y + el.h / 2 }
  return [rotatePt({ x: x1, y: y1 }, c, el.rot), rotatePt({ x: x2, y: y2 }, c, el.rot)]
}
export function imageEl (src, b, extra = {}) {
  return baseEl('image', b, { name: 'Picture', src, crop: null, line: null, ...extra })
}
export function tableEl (rows, cols, b) {
  const cw = b.w / cols, rh = Math.max(24, b.h / rows)
  return baseEl('table', { ...b, h: rh * rows }, {
    name: 'Table', cols: Array(cols).fill(cw), rows: Array(rows).fill(rh),
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ html: '' }))),
    style: { id: 'medium', accent: 'accent1', header: true, banded: true, firstCol: false, lastRow: false },
    ts: { font: '+minor', size: 14, color: 'dk1' }
  })
}
export function chartEl (chartType, b) {
  const pie = chartType === 'pie' || chartType === 'doughnut'
  return baseEl('chart', b, {
    name: 'Chart', chartType, look: '3d', grouping: 'clustered',
    categories: pie ? ['Category A', 'Category B', 'Category C', 'Category D'] : chartType === 'scatter' ? ['0.7', '1.8', '2.6', '3.2'] : ['Q1', 'Q2', 'Q3', 'Q4'],
    series: pie ? [{ name: 'Share', values: [38, 26, 21, 15] }] : [{ name: 'Series 1', values: [4.3, 2.5, 3.5, 4.5] }, { name: 'Series 2', values: [2.4, 4.4, 1.8, 2.8] }, { name: 'Series 3', values: [2, 2, 3, 5] }],
    opts: { legend: chartType === 'doughnut' ? 'none' : 'bottom', labels: pie, labelPos: chartType === 'doughnut' ? 'outside' : 'inside', title: '', gridlines: true, holeSize: 58 },
    ts: { font: '+minor', size: 12, color: 'dk1' }
  })
}
export function iconEl (icon, b, extra = {}) {
  return baseEl('icon', b, { name: 'Icon', icon, color: 'accent1', stroke: 2, ...extra })
}
export function mediaEl (kind, src, b, extra = {}) {
  return baseEl(kind, b, { name: kind === 'video' ? 'Video' : 'Audio', src, poster: null, autoplay: false, loop: false, ...extra })
}

// ---------- geometry ----------
export const rad = d => d * Math.PI / 180
export function rotatePt (p, c, deg) {
  if (!deg) return { ...p }
  const a = rad(deg), cos = Math.cos(a), sin = Math.sin(a), dx = p.x - c.x, dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}
// Axis-aligned bounds of a (possibly rotated) element
export function bounds (el) {
  if (!el.rot) return { x: el.x, y: el.y, w: el.w, h: el.h }
  const c = { x: el.x + el.w / 2, y: el.y + el.h / 2 }
  const pts = [[el.x, el.y], [el.x + el.w, el.y], [el.x + el.w, el.y + el.h], [el.x, el.y + el.h]].map(([x, y]) => rotatePt({ x, y }, c, el.rot))
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
export function unionBounds (els) {
  if (!els.length) return null
  const bs = els.map(bounds)
  const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y))
  return { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y }
}
export const round2 = v => Math.round(v * 100) / 100

// Walks elements (including group children). cb(el, parent, list, index)
export function walk (list, cb, parent = null) {
  if (!list) return
  list.forEach((el, i) => {
    if (cb(el, parent, list, i) === false) return
    if (el.type === 'group') walk(el.children, cb, el)
  })
}
export function findEl (slide, id) {
  let hit = null
  walk(slide?.elements, (el, parent, list, i) => { if (el.id === id) { hit = { el, parent, list, index: i }; return false } })
  return hit
}
// The groups an element sits in, innermost first
export function parentGroups (slide, id) {
  const chain = []
  const rec = list => (list || []).some(el => el.id === id || (el.type === 'group' && rec(el.children) && chain.push(el)))
  rec(slide?.elements)
  return chain
}
// A picture's crop with its sides as seen on screen: a flipped picture's left side is its right one. Turning it
// twice gives the crop back, so the same function converts both ways.
export function screenCrop (c, el) {
  c = c || { l: 0, t: 0, r: 0, b: 0 }
  return { l: el.flipH ? c.r : c.l, r: el.flipH ? c.l : c.r, t: el.flipV ? c.b : c.t, b: el.flipV ? c.t : c.b }
}
// The frame for a new crop, with the whole picture staying where it is on the slide (a cut left side moves the left
// edge, also when the picture is turned or flipped)
export function recrop (el, crop) {
  const a = screenCrop(el.crop, el), b = screenCrop(crop, el)
  const FW = el.w / Math.max(0.01, 1 - a.l - a.r), FH = el.h / Math.max(0.01, 1 - a.t - a.b)
  const w = FW * (1 - b.l - b.r), h = FH * (1 - b.t - b.b)
  const c = rotatePt({ x: el.x - a.l * FW + b.l * FW + w / 2, y: el.y - a.t * FH + b.t * FH + h / 2 }, { x: el.x + el.w / 2, y: el.y + el.h / 2 }, el.rot || 0)
  return { x: c.x - w / 2, y: c.y - h / 2, w, h, crop }
}
// A group's children are stored in the group's own frame: each group around an element adds its offset and turns
// it around the group's centre. toSlide and fromSlide carry a point between that frame and the slide; rot is the turn
// the groups add. Handles, drags and typed positions work on the slide and go back through fromSlide.
export function parentFrame (slide, id) {
  const gs = parentGroups(slide, id) // innermost first
  const turn = (p, g, dir) => rotatePt(p, { x: g.x + g.w / 2, y: g.y + g.h / 2 }, dir * (g.rot || 0))
  return {
    rot: gs.reduce((a, g) => a + (g.rot || 0), 0),
    toSlide: p => gs.reduce((q, g) => turn({ x: q.x + g.x, y: q.y + g.y }, g, 1), p),
    fromSlide: p => gs.reduceRight((q, g) => { const r = turn(q, g, -1); return { x: r.x - g.x, y: r.y - g.y } }, p)
  }
}
// An element as it shows on the slide: a group's child with its groups' offsets and turns taken along
export function onSlide (slide, el) {
  const f = parentFrame(slide, el.id)
  const c = f.toSlide({ x: el.x + el.w / 2, y: el.y + el.h / 2 })
  return { ...el, x: c.x - el.w / 2, y: c.y - el.h / 2, rot: (((el.rot || 0) + f.rot) % 360 + 360) % 360 }
}
// After a child moved or changed size, the group's box closes around its children again without anything moving on
// screen: a rotated group turns around its centre, so the new centre goes where the old rotation puts it.
export function refitGroup (g) {
  const b = unionBounds(g.children || [])
  if (!b || (Math.abs(b.x) < 0.01 && Math.abs(b.y) < 0.01 && Math.abs(b.w - g.w) < 0.01 && Math.abs(b.h - g.h) < 0.01)) return
  const d = rotatePt({ x: b.x + b.w / 2 - g.w / 2, y: b.y + b.h / 2 - g.h / 2 }, { x: 0, y: 0 }, g.rot || 0)
  for (const c of g.children) { c.x -= b.x; c.y -= b.y }
  g.x += g.w / 2 + d.x - b.w / 2; g.y += g.h / 2 + d.y - b.h / 2; g.w = b.w; g.h = b.h
}
// Removes elements from a slide, at any depth, with the groups they leave empty and their animations; a group that
// lost a child closes around the rest
export function removeEls (s, ids) {
  const kill = list => list.filter(e => {
    if (ids.includes(e.id)) return false
    if (!e.children) return true
    const kept = kill(e.children)
    if (kept.length < e.children.length) e.children = kept
    return kept.length > 0
  })
  s.elements = kill(s.elements)
  const refit = list => list.forEach(e => { if (e.type === 'group') { refit(e.children); refitGroup(e) } })
  refit(s.elements)
  const all = new Set(); walk(s.elements, e => { all.add(e.id) })
  s.animations = (s.animations || []).filter(a => all.has(a.el))
}
// Links to a slide name the slide (its id), so they follow it when slides move.
// mapSlideLinks sends every slide link (on objects and inside text) through `to`; no answer drops an object's link.
// `clean` runs over every piece of text html on the way (file readers pass sanitize).
export function mapSlideLinks (slides, to, clean = h => h) {
  const re = h => clean(h).replace(/href="#slide:([^"]+)"/g, (m, t) => { const v = to(t); return v ? `href="#slide:${v}"` : m })
  for (const s of slides) {
    walk([...s.elements, ...(s.master || [])], e => {
      if (e.link?.slide !== undefined) { const v = to(e.link.slide); if (v) e.link = { slide: v }; else delete e.link }
      if (e.html) e.html = re(e.html)
      if (e.type === 'table') for (const row of e.cells) for (const c of row) if (c?.html) c.html = re(c.html)
    })
  }
}
// Files keep the slide's position; reading a file turns positions into ids
export function pinSlideLinks (d, clean) {
  const ids = d.slides.map(s => s.id)
  mapSlideLinks(d.slides, t => /^\d+$/.test(t) ? ids[+t] : t, clean)
  return d
}
// Deep clone of an element with fresh ids (children too)
export function cloneEl (el, keepId = false) {
  const c = JSON.parse(JSON.stringify(el))
  const fresh = e => { if (!keepId) e.id = uid(); if (e.children) e.children.forEach(fresh) }
  fresh(c)
  return c
}
export const ELEMENT_LABEL = { text: 'Text box', shape: 'Shape', line: 'Line', image: 'Picture', table: 'Table', chart: 'Chart', group: 'Group', icon: 'Icon', ink: 'Ink', video: 'Video', audio: 'Audio' }

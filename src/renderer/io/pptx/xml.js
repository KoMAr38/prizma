// DrawingML building blocks for the PowerPoint writer: units, colours, fills, outlines, effects and geometry.
import { parseColor, hexColor } from '../../core/model.js'

export const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
  p159: 'http://schemas.microsoft.com/office/powerpoint/2015/09/main',
  a14: 'http://schemas.microsoft.com/office/drawing/2010/main',
  asvg: 'http://schemas.microsoft.com/office/drawing/2016/SVG/main'
}
export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
export const NS_APR = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`

export const EMU_PER_PT = 12700
export const emu = pt => Math.round((Number(pt) || 0) * EMU_PER_PT)
export const emuPos = pt => Math.max(0, emu(pt))
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
// angle in 60000ths of a degree, normalised to 0..360
export const ang = deg => Math.round(((((Number(deg) || 0) % 360) + 360) % 360) * 60000) % 21600000
export const pct1 = v => Math.round(clamp(Number(v) || 0, 0, 1) * 100000)

// Prizma's own copy of a document travels inside the .pptx under this namespace (see exportPptx/importPptx)
export const TWIN_NS = 'urn:prizma:document'
// 64-bit fingerprint of some texts: tells whether another program has rewritten the slides since Prizma saved them
export function seal (texts) {
  let a = 0x9E3779B9, b = 0x85EBCA6B
  for (const s of texts) {
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677) }
    a = Math.imul(a ^ 0x1F, 2654435761)
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909)
  return (b >>> 0).toString(16).padStart(8, '0') + (a >>> 0).toString(16).padStart(8, '0')
}

// XML text/attribute escaping; strips characters XML 1.0 does not allow and lone surrogates (invalid UTF-8), keeps tabs and line breaks in attributes
export const esc = s => String(s ?? '').toWellFormed()
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\t\n\r]/g, ch => `&#${ch.charCodeAt(0)};`)

// ---------- colours ----------
// Our slots are PowerPoint's scheme slots; slide content refers to the mapped names bg1/tx1/bg2/tx2.
const SCHEME = { lt1: 'bg1', dk1: 'tx1', lt2: 'bg2', dk2: 'tx2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' }
export function colorXml (c, alpha = 1, theme) {
  const p = parseColor(c)
  const hex = !p ? '#000000' : p.hex || p.over !== undefined || !SCHEME[p.slot] ? hexColor(c, theme) || '#000000' : null
  if (hex) {
    // '#RGB' is spelled out; '#RRGGBBAA' (imported colours) carries its own transparency
    let h = hex.slice(1)
    if (h.length === 3 || h.length === 4) h = [...h].map(x => x + x).join('')
    if (h.length === 8) { alpha *= parseInt(h.slice(6), 16) / 255; h = h.slice(0, 6) }
    if (!/^[0-9a-f]{6}$/i.test(h)) h = '000000'
    return `<a:srgbClr val="${h.toUpperCase()}">${alpha < 0.999 ? `<a:alpha val="${pct1(alpha)}"/>` : ''}</a:srgbClr>`
  }
  const a = alpha < 0.999 ? `<a:alpha val="${pct1(alpha)}"/>` : ''
  // "Lighter 40 %" / "Darker 25 %" use the same luminance modifiers as PowerPoint's colour picker
  let mods = ''
  if (p.mod > 0) mods = `<a:lumMod val="${Math.round((100 - p.mod) * 1000)}"/><a:lumOff val="${Math.round(p.mod * 1000)}"/>`
  else if (p.mod < 0) mods = `<a:lumMod val="${Math.round((100 + p.mod) * 1000)}"/>`
  return `<a:schemeClr val="${SCHEME[p.slot]}">${mods}${a}</a:schemeClr>`
}
export const solidXml = (c, alpha = 1, theme) => `<a:solidFill>${colorXml(c, alpha, theme)}</a:solidFill>`

// ---------- fills ----------
// ctx.blip(mediaId) returns a relationship id for an image used as a fill
export function fillXml (fill, ctx, opacity = 1, box) {
  if (!fill || fill.type === 'none') return '<a:noFill/>'
  if (fill.type === 'solid') return solidXml(fill.color, (fill.alpha ?? 1) * opacity, ctx?.theme)
  if (fill.type === 'gradient') {
    let stops = [...(fill.stops || [])].sort((x, y) => (x.pos ?? 0) - (y.pos ?? 0))
    if (!stops.length) return '<a:noFill/>'
    if (stops.length === 1) stops = [stops[0], { ...stops[0], pos: 100 }]
    const gs = stops.map(s => `<a:gs pos="${Math.round(clamp(s.pos ?? 0, 0, 100) * 1000)}">${colorXml(s.color, (s.alpha ?? 1) * opacity, ctx?.theme)}</a:gs>`).join('')
    if (fill.kind === 'radial') {
      const cx = clamp(fill.cx ?? 50, 0, 100), cy = clamp(fill.cy ?? 50, 0, 100)
      return `<a:gradFill flip="none" rotWithShape="1"><a:gsLst>${gs}</a:gsLst><a:path path="circle"><a:fillToRect l="${Math.round(cx * 1000)}" t="${Math.round(cy * 1000)}" r="${Math.round((100 - cx) * 1000)}" b="${Math.round((100 - cy) * 1000)}"/></a:path><a:tileRect/></a:gradFill>`
    }
    return `<a:gradFill flip="none" rotWithShape="1"><a:gsLst>${gs}</a:gsLst><a:lin ang="${ang(fill.angle ?? 90)}" scaled="0"/><a:tileRect/></a:gradFill>`
  }
  if (fill.type === 'image') {
    const rid = ctx?.blip ? ctx.blip(fill.src) : null
    if (!rid) return '<a:noFill/>'
    const a = (fill.alpha ?? 1) * opacity
    const alpha = a < 1 ? `<a:alphaModFix amt="${pct1(a)}"/>` : ''
    if (fill.mode === 'tile') return `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rid}">${alpha}</a:blip><a:srcRect/><a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/></a:blipFill>`
    // "cover" crops the picture to the box like CSS background-size: cover
    let src = '<a:srcRect/>'
    const nat = ctx?.mediaSize ? ctx.mediaSize(fill.src) : null
    if (fill.mode !== 'stretch' && nat && box && box.w > 0 && box.h > 0) {
      const ia = nat.w / nat.h, ba = box.w / box.h
      if (ia > ba) { const cut = (1 - ba / ia) / 2; src = `<a:srcRect l="${Math.round(cut * 100000)}" r="${Math.round(cut * 100000)}"/>` } else if (ia < ba) { const cut = (1 - ia / ba) / 2; src = `<a:srcRect t="${Math.round(cut * 100000)}" b="${Math.round(cut * 100000)}"/>` }
    }
    return `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rid}">${alpha}</a:blip>${src}<a:stretch><a:fillRect/></a:stretch></a:blipFill>`
  }
  if (fill.type === 'pattern') return `<a:pattFill prst="${esc(fill.preset || 'pct50')}"><a:fgClr>${colorXml(fill.fg || fill.color || 'dk1', opacity, ctx?.theme)}</a:fgClr><a:bgClr>${colorXml(fill.bg || 'lt1', opacity, ctx?.theme)}</a:bgClr></a:pattFill>`
  return '<a:noFill/>'
}

// ---------- outlines ----------
const DASH = { solid: 'solid', dash: 'dash', dot: 'sysDot', dashDot: 'dashDot', longDash: 'lgDash', longDashDot: 'lgDashDot', sysDash: 'sysDash', sysDot: 'sysDot' }
const ENDS = new Set(['triangle', 'stealth', 'diamond', 'oval', 'arrow'])
const endSize = s => s ? (s <= 0.6 ? 'sm' : s >= 1.6 ? 'lg' : 'med') : 'med'
// defCap: the end cap our renderer uses when the line doesn't set one (lines and ink are round)
export function lineXml (line, ctx, opacity = 1, defCap) {
  if (!line || !line.color || !(line.width > 0)) return '<a:ln><a:noFill/></a:ln>'
  const c = line.cap || defCap
  const cap = c === 'round' ? ' cap="rnd"' : c === 'square' ? ' cap="sq"' : ''
  const head = line.head && ENDS.has(line.head) ? `<a:headEnd type="${line.head}" w="${endSize(line.headSize)}" len="${endSize(line.headSize)}"/>` : ''
  const tail = line.tail && ENDS.has(line.tail) ? `<a:tailEnd type="${line.tail}" w="${endSize(line.tailSize)}" len="${endSize(line.tailSize)}"/>` : ''
  return `<a:ln w="${emuPos(line.width)}"${cap}>${solidXml(line.color, (line.alpha ?? 1) * opacity, ctx?.theme)}<a:prstDash val="${DASH[line.dash] || 'solid'}"/><a:round/>${head}${tail}</a:ln>`
}

// ---------- effects ----------
export function effectsXml (el, ctx) {
  const parts = []
  if (el.glow) parts.push(`<a:glow rad="${emuPos(el.glow.size || 6)}">${colorXml(el.glow.color || 'accent1', el.glow.alpha ?? 0.6, ctx?.theme)}</a:glow>`)
  if (el.shadow) {
    const sh = el.shadow === true ? {} : el.shadow
    const dx = sh.dx ?? 3, dy = sh.dy ?? 3
    const dist = Math.hypot(dx, dy), dir = Math.atan2(dy, dx) * 180 / Math.PI
    parts.push(`<a:outerShdw blurRad="${emuPos(sh.blur ?? 4)}" dist="${emuPos(dist)}" dir="${ang(dir)}" algn="ctr" rotWithShape="0">${colorXml(sh.color || '#000000', sh.alpha ?? 0.35, ctx?.theme)}</a:outerShdw>`)
  }
  if (el.softEdge) parts.push(`<a:softEdge rad="${emuPos(el.softEdge)}"/>`)
  return parts.length ? `<a:effectLst>${parts.join('')}</a:effectLst>` : ''
}

// ---------- transform ----------
// box in slide points; off = offset added to x/y (group children are stored relative to their group)
export function xfrmXml (box, { tag = 'a:xfrm', off = { x: 0, y: 0 }, child } = {}) {
  const rot = box.rot ? ` rot="${ang(box.rot)}"` : ''
  const fl = (box.flipH ? ' flipH="1"' : '') + (box.flipV ? ' flipV="1"' : '')
  const x = emu(box.x + off.x), y = emu(box.y + off.y), cx = emuPos(box.w), cy = emuPos(box.h)
  const ch = child ? `<a:chOff x="${x}" y="${y}"/><a:chExt cx="${cx}" cy="${cy}"/>` : ''
  return `<${tag}${rot}${fl}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/>${ch}</${tag}>`
}

// ---------- geometry ----------
// Every preset shape name PowerPoint understands (ST_ShapeType)
export const PRESETS = new Set(('line lineInv triangle rtTriangle rect diamond parallelogram trapezoid nonIsoscelesTrapezoid pentagon hexagon heptagon octagon decagon dodecagon star4 star5 star6 star7 star8 star10 star12 star16 star24 star32 roundRect round1Rect round2SameRect round2DiagRect snipRoundRect snip1Rect snip2SameRect snip2DiagRect plaque ellipse teardrop homePlate chevron pieWedge pie blockArc donut noSmoking rightArrow leftArrow upArrow downArrow stripedRightArrow notchedRightArrow bentUpArrow leftRightArrow upDownArrow leftUpArrow leftRightUpArrow quadArrow leftArrowCallout rightArrowCallout upArrowCallout downArrowCallout leftRightArrowCallout upDownArrowCallout quadArrowCallout bentArrow uturnArrow circularArrow leftCircularArrow leftRightCircularArrow curvedRightArrow curvedLeftArrow curvedUpArrow curvedDownArrow swooshArrow cube can lightningBolt heart sun moon smileyFace irregularSeal1 irregularSeal2 foldedCorner bevel frame halfFrame corner diagStripe chord arc leftBracket rightBracket leftBrace rightBrace bracketPair bracePair straightConnector1 bentConnector2 bentConnector3 bentConnector4 bentConnector5 curvedConnector2 curvedConnector3 curvedConnector4 curvedConnector5 callout1 callout2 callout3 accentCallout1 accentCallout2 accentCallout3 borderCallout1 borderCallout2 borderCallout3 accentBorderCallout1 accentBorderCallout2 accentBorderCallout3 wedgeRectCallout wedgeRoundRectCallout wedgeEllipseCallout cloudCallout cloud ribbon ribbon2 ellipseRibbon ellipseRibbon2 leftRightRibbon verticalScroll horizontalScroll wave doubleWave plus flowChartProcess flowChartDecision flowChartInputOutput flowChartPredefinedProcess flowChartInternalStorage flowChartDocument flowChartMultidocument flowChartTerminator flowChartPreparation flowChartManualInput flowChartManualOperation flowChartConnector flowChartPunchedCard flowChartPunchedTape flowChartSummingJunction flowChartOr flowChartCollate flowChartSort flowChartExtract flowChartMerge flowChartOfflineStorage flowChartOnlineStorage flowChartMagneticTape flowChartMagneticDisk flowChartMagneticDrum flowChartDisplay flowChartDelay flowChartAlternateProcess flowChartOffpageConnector actionButtonBlank actionButtonHome actionButtonHelp actionButtonInformation actionButtonForwardNext actionButtonBackPrevious actionButtonEnd actionButtonBeginning actionButtonReturn actionButtonDocument actionButtonSound actionButtonMovie gear6 gear9 funnel mathPlus mathMinus mathMultiply mathDivide mathEqual mathNotEqual cornerTabs squareTabs plaqueTabs chartX chartStar chartPlus').split(' '))

// Adjustment values: our model keeps fractions/degrees, PowerPoint wants named guides in its own units.
const ADJ_ONE = new Set(['roundRect', 'snip1Rect', 'round1Rect', 'triangle', 'parallelogram', 'trapezoid', 'hexagon', 'octagon', 'diagStripe', 'plus', 'plaque', 'donut', 'foldedCorner', 'moon', 'homePlate', 'chevron', 'noSmoking', 'can', 'cube', 'bevel'])
const ADJ_STAR = new Set(['star4', 'star5', 'star6', 'star7', 'star8', 'star10', 'star12', 'star16', 'star24', 'star32'])
export function avLstXml (shape, adj) {
  if (!adj || !Object.keys(adj).length) return '<a:avLst/>'
  const gd = (n, v) => `<a:gd name="${n}" fmla="val ${Math.round(v)}"/>`
  const f = v => (Number(v) || 0) * 100000
  const out = []
  if (ADJ_ONE.has(shape) && adj.adj !== undefined) out.push(gd('adj', f(adj.adj)))
  else if (ADJ_STAR.has(shape) && adj.adj !== undefined) out.push(gd('adj', (Number(adj.adj) || 0) * 50000))
  else if ((shape === 'snip2SameRect' || shape === 'round2SameRect' || shape === 'round2DiagRect' || shape === 'frame') && adj.adj !== undefined) out.push(gd('adj1', f(adj.adj)))
  else if (shape === 'snip2DiagRect' && adj.adj !== undefined) out.push(gd('adj1', 0), gd('adj2', f(adj.adj)))
  else if ((shape === 'halfFrame' || shape === 'corner') && adj.adj !== undefined) out.push(gd('adj1', f(adj.adj)), gd('adj2', f(adj.adj)))
  else if ((shape === 'pie' || shape === 'chord' || shape === 'arc') && (adj.a1 !== undefined || adj.a2 !== undefined)) out.push(gd('adj1', ang(adj.a1 ?? 0)), gd('adj2', ang(adj.a2 ?? 270)))
  else if (/Arrow$/.test(shape) && (adj.a1 !== undefined || adj.a2 !== undefined)) out.push(gd('adj1', f(adj.a1 ?? 0.5)), gd('adj2', f(adj.a2 ?? 0.5)))
  else if (/Callout$/.test(shape) && (adj.x !== undefined || adj.y !== undefined)) out.push(gd('adj1', f(adj.x ?? -0.2083)), gd('adj2', f(adj.y ?? 0.625)))
  return out.length ? `<a:avLst>${out.join('')}</a:avLst>` : '<a:avLst/>'
}
export const prstXml = (shape, adj) => `<a:prstGeom prst="${shape}">${avLstXml(shape, adj)}</a:prstGeom>`
// The reverse, for files: guide values arrive as val / 50000 (pptxtojson's keypoints)
export function adjFromAvLst (shape, kp) {
  if (!kp) return {}
  const f = v => v / 2
  if (ADJ_ONE.has(shape) && kp.adj !== undefined) return { adj: f(kp.adj) }
  if (ADJ_STAR.has(shape) && kp.adj !== undefined) return { adj: kp.adj }
  if ((shape === 'snip2SameRect' || shape === 'round2SameRect' || shape === 'round2DiagRect' || shape === 'frame' || shape === 'halfFrame' || shape === 'corner') && kp.adj1 !== undefined) return { adj: f(kp.adj1) }
  if (shape === 'snip2DiagRect' && kp.adj2 !== undefined) return { adj: f(kp.adj2) }
  if (/Arrow$/.test(shape) && kp.adj1 !== undefined) return { a1: f(kp.adj1), a2: f(kp.adj2 ?? 1) }
  if (/Callout$/.test(shape) && kp.adj1 !== undefined) return { x: f(kp.adj1), y: f(kp.adj2 ?? 1.25) }
  return {}
}

// SVG path → DrawingML path commands. Coordinates are scaled by (sx, sy) into integer path units.
function arcToCubics (x1, y1, rx, ry, phi, large, sweep, x2, y2) {
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]]
  rx = Math.abs(rx); ry = Math.abs(ry)
  const r = phi * Math.PI / 180, cosr = Math.cos(r), sinr = Math.sin(r)
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
  const xp = cosr * dx + sinr * dy, yp = -sinr * dx + cosr * dy
  const lam = xp * xp / (rx * rx) + yp * yp / (ry * ry)
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam) }
  const sign = large === sweep ? -1 : 1
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, den = rx * rx * yp * yp + ry * ry * xp * xp
  const co = sign * Math.sqrt(Math.max(0, num / (den || 1)))
  const cxp = co * rx * yp / ry, cyp = -co * ry * xp / rx
  const cx = cosr * cxp - sinr * cyp + (x1 + x2) / 2, cy = sinr * cxp + cosr * cyp + (y1 + y2) / 2
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const t1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
  let dt = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  if (sweep && dt < 0) dt += 2 * Math.PI
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9))
  const step = dt / segs, k = 4 / 3 * Math.tan(step / 4)
  const rotv = v => [cosr * v[0] - sinr * v[1], sinr * v[0] + cosr * v[1]]
  const pt = a => { const v = rotv([rx * Math.cos(a), ry * Math.sin(a)]); return [cx + v[0], cy + v[1]] }
  const out = []
  for (let s = 0; s < segs; s++) {
    const a1 = t1 + s * step, a2 = a1 + step
    // control points: P1 + k·E'(a1) and P2 − k·E'(a2)
    const p1 = pt(a1), p2 = pt(a2)
    const d1 = rotv([-rx * Math.sin(a1), ry * Math.cos(a1)]), d2 = rotv([-rx * Math.sin(a2), ry * Math.cos(a2)])
    out.push([p1[0] + k * d1[0], p1[1] + k * d1[1], p2[0] - k * d2[0], p2[1] - k * d2[1], p2[0], p2[1]])
  }
  return out
}
const PARAMS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }
// Returns a list of sub-path command strings (one <a:path> may hold several sub-paths)
export function svgPathToDml (d, sx, sy) {
  const toks = String(d || '').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || []
  let i = 0, cmd = '', cx = 0, cy = 0, sx0 = 0, sy0 = 0, lastC = null, lastQ = null
  const P = (x, y) => `<a:pt x="${Math.round(x * sx)}" y="${Math.round(y * sy)}"/>`
  let out = '', n = 0
  const num = () => parseFloat(toks[i++])
  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) { cmd = toks[i++] } else if (!cmd) { i++; continue }
    const C = cmd.toUpperCase(), rel = cmd !== C
    if (C === 'Z') { out += '<a:close/>'; cx = sx0; cy = sy0; lastC = lastQ = null; if (i < toks.length && !/^[a-zA-Z]$/.test(toks[i])) i++; continue }
    if (i + PARAMS[C] > toks.length) break
    if (C === 'M') {
      let x = num(), y = num(); if (rel) { x += cx; y += cy }
      out += `<a:moveTo>${P(x, y)}</a:moveTo>`; n++
      cx = sx0 = x; cy = sy0 = y; cmd = rel ? 'l' : 'L'; lastC = lastQ = null; continue
    }
    if (C === 'L' || C === 'H' || C === 'V') {
      let x = cx, y = cy
      if (C === 'L') { x = num(); y = num(); if (rel) { x += cx; y += cy } } else if (C === 'H') { x = num(); if (rel) x += cx } else { y = num(); if (rel) y += cy }
      out += `<a:lnTo>${P(x, y)}</a:lnTo>`; n++
      cx = x; cy = y; lastC = lastQ = null; continue
    }
    if (C === 'C' || C === 'S') {
      let x1, y1
      if (C === 'C') { x1 = num(); y1 = num(); if (rel) { x1 += cx; y1 += cy } } else { x1 = lastC ? 2 * cx - lastC[0] : cx; y1 = lastC ? 2 * cy - lastC[1] : cy }
      let x2 = num(), y2 = num(), x = num(), y = num()
      if (rel) { x2 += cx; y2 += cy; x += cx; y += cy }
      out += `<a:cubicBezTo>${P(x1, y1)}${P(x2, y2)}${P(x, y)}</a:cubicBezTo>`; n++
      lastC = [x2, y2]; lastQ = null; cx = x; cy = y; continue
    }
    if (C === 'Q' || C === 'T') {
      let x1, y1
      if (C === 'Q') { x1 = num(); y1 = num(); if (rel) { x1 += cx; y1 += cy } } else { x1 = lastQ ? 2 * cx - lastQ[0] : cx; y1 = lastQ ? 2 * cy - lastQ[1] : cy }
      let x = num(), y = num(); if (rel) { x += cx; y += cy }
      out += `<a:quadBezTo>${P(x1, y1)}${P(x, y)}</a:quadBezTo>`; n++
      lastQ = [x1, y1]; lastC = null; cx = x; cy = y; continue
    }
    if (C === 'A') {
      const rx = num(), ry = num(), phi = num(), large = num(), sweep = num()
      let x = num(), y = num(); if (rel) { x += cx; y += cy }
      for (const sgm of arcToCubics(cx, cy, rx, ry, phi, large ? 1 : 0, sweep ? 1 : 0, x, y)) { out += `<a:cubicBezTo>${P(sgm[0], sgm[1])}${P(sgm[2], sgm[3])}${P(sgm[4], sgm[5])}</a:cubicBezTo>`; n++ }
      cx = x; cy = y; lastC = lastQ = null; continue
    }
    i++
  }
  return n ? out : ''
}
// Custom geometry from one or more SVG paths drawn in a w×h box. parts: [{ d, fill: 'none' | 'darken' | 'lighten' }]
// unit scales the box into whole path units (EMU for slide points; icons use their own 24-unit grid)
export function custGeomXml (parts, w, h, unit = EMU_PER_PT) {
  const W = Math.max(1, Math.round(Math.max(0, w) * unit)), H = Math.max(1, Math.round(Math.max(0, h) * unit))
  const sx = W / Math.max(w, 0.01), sy = H / Math.max(h, 0.01)
  const paths = parts.map(p => {
    const cmds = svgPathToDml(p.d, sx, sy)
    if (!cmds) return ''
    const attrs = (p.fill === 'none' ? ' fill="none"' : p.fill === 'darken' ? ' fill="darken"' : p.fill === 'lighten' ? ' fill="lighten"' : '') + (p.stroke === false ? ' stroke="0"' : '')
    return `<a:path w="${W}" h="${H}"${attrs}>${cmds}</a:path>`
  }).filter(Boolean)
  if (!paths.length) return null
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst>${paths.join('')}</a:pathLst></a:custGeom>`
}

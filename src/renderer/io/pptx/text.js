// Text bodies for the PowerPoint writer: paragraphs, runs, bullets and text effects from our rich-text HTML.
import { parseRich, deriveStyle, colorFromCss } from '../../core/html.js'
import { esc, emu, emuPos, colorXml, solidXml, ang } from './xml.js'
import { DEFAULT_INSET } from '../../core/model.js'

const ALIGN = { left: 'l', start: 'l', center: 'ctr', right: 'r', end: 'r', justify: 'just' }
const ANCHOR = { top: 't', middle: 'ctr', bottom: 'b' }

export function fontXml (font) {
  if (!font) return ''
  if (font === '+major') return '<a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/>'
  if (font === '+minor') return '<a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/>'
  const f = esc(String(font).replace(/^["']|["']$/g, ''))
  return `<a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface="${f}"/>`
}

// WordArt-style text effects stored on the element (outline, gradient, hollow, glow, shadow)
function fxFill (r, fx, ctx) {
  let x = ''
  if (fx?.outline) x += `<a:ln w="${emuPos(fx.outline.width || 1)}">${solidXml(fx.outline.color || 'dk1', 1, ctx.theme)}</a:ln>`
  if (fx?.hollow) x += '<a:noFill/>'
  else if (fx?.gradient && fx.gradient.length) {
    const cs = fx.gradient.length === 1 ? [fx.gradient[0], fx.gradient[0]] : fx.gradient
    x += `<a:gradFill><a:gsLst>${cs.map((c, i) => `<a:gs pos="${Math.round(i / (cs.length - 1) * 100000)}">${colorXml(c, ctx.alpha ?? 1, ctx.theme)}</a:gs>`).join('')}</a:gsLst><a:lin ang="0" scaled="0"/></a:gradFill>`
  } else if (r.color) x += solidXml(r.color, ctx.alpha ?? 1, ctx.theme)
  const ef = []
  if (fx?.glow) ef.push(`<a:glow rad="${emuPos(fx.glow.size || 8)}">${colorXml(fx.glow.color || 'accent1', fx.glow.alpha ?? 0.6, ctx.theme)}</a:glow>`)
  if (fx?.shadow) {
    const sh = fx.shadow === true ? { dx: 2, dy: 2, blur: 3, alpha: 0.45 } : fx.shadow
    const dx = sh.dx ?? 2, dy = sh.dy ?? 2
    ef.push(`<a:outerShdw blurRad="${emuPos(sh.blur ?? 3)}" dist="${emuPos(Math.hypot(dx, dy))}" dir="${ang(Math.atan2(dy, dx) * 180 / Math.PI)}" algn="ctr" rotWithShape="0">${colorXml(sh.color || '#000000', sh.alpha ?? 0.45, ctx.theme)}</a:outerShdw>`)
  }
  if (ef.length) x += `<a:effectLst>${ef.join('')}</a:effectLst>`
  return x
}

export function rPrXml (r, ctx, { tag = 'a:rPr', fx, extra } = {}) {
  const at = [`lang="${ctx.lang}"`]
  if (r.size) at.push(`sz="${Math.round(Math.max(1, Math.min(4000, r.size)) * 100)}"`)
  // bold both ways, or a placeholder run inherits the layout's (a heading's b="1")
  at.push(`b="${r.bold ? 1 : 0}"`)
  if (r.italic) at.push('i="1"')
  if (r.underline) at.push('u="sng"')
  if (r.strike) at.push('strike="sngStrike"')
  if (r.baseline === 'sup') at.push('baseline="30000"')
  else if (r.baseline === 'sub') at.push('baseline="-25000"')
  const caps = r.caps ?? extra?.caps
  if (caps === 'all' || caps === true) at.push('cap="all"')
  const spc = r.spacing ?? extra?.spacing
  if (spc) at.push(`spc="${Math.round(spc * 100)}"`)
  at.push('dirty="0"')
  let kids = fxFill(r, fx, ctx)
  if (r.highlight) kids += `<a:highlight>${colorXml(r.highlight, 1, ctx.theme)}</a:highlight>`
  kids += fontXml(r.font)
  if (tag === 'a:rPr' && r.link && ctx.link) kids += ctx.link(r.link) || ''
  return `<${tag} ${at.join(' ')}>${kids}</${tag}>`
}

const cssVar = (p, name) => p?.style?.getPropertyValue?.(name)?.trim() || ''
function pPrXml (para, raw, ctx, base) {
  // margins always, or a placeholder paragraph takes the layout's bullet hang
  const at = [`marL="${emu(Math.max(0, para.marginLeft || 0))}"`, `indent="${emu(para.indent)}"`, `algn="${ALIGN[para.align] || 'l'}"`]
  if (para.lvl) at.push(`lvl="${Math.min(8, para.lvl)}"`)
  let kids = ''
  const lh = raw?.style?.lineHeight || (base?.lineH ? String(base.lineH) : '')
  if (lh) {
    if (/pt$/.test(lh)) kids += `<a:lnSpc><a:spcPts val="${Math.round(parseFloat(lh) * 100)}"/></a:lnSpc>`
    else if (/px$/.test(lh)) kids += `<a:lnSpc><a:spcPts val="${Math.round(parseFloat(lh) * 75)}"/></a:lnSpc>`
    else { const v = parseFloat(lh); if (v > 0) kids += `<a:lnSpc><a:spcPct val="${Math.round(v / 1.2 * 100000)}"/></a:lnSpc>` }
  }
  kids += `<a:spcBef><a:spcPts val="${Math.round(Math.max(0, para.before || 0) * 100)}"/></a:spcBef>`
  kids += `<a:spcAft><a:spcPts val="${Math.round(Math.max(0, para.after || 0) * 100)}"/></a:spcAft>`
  if (para.bu || para.num) {
    const bc = cssVar(raw, '--bu-color')
    const buColor = bc ? (colorFromCss(bc) || null) : null
    if (buColor) kids += `<a:buClr>${colorXml(buColor, 1, ctx.theme)}</a:buClr>`
    const sc = parseFloat(cssVar(raw, '--bu-scale'))
    if (sc && Math.abs(sc - 1) > 0.01) kids += `<a:buSzPct val="${Math.round(Math.max(0.25, Math.min(4, sc)) * 100000)}"/>`
    if (para.num) {
      const start = +(raw?.getAttribute?.('data-start') || 0)
      kids += `<a:buFont typeface="+mj-lt"/><a:buAutoNum type="${esc(para.num)}"${start > 1 ? ` startAt="${start}"` : ''}/>`
    } else kids += `<a:buFont typeface="Arial"/><a:buChar char="${esc(para.bu)}"/>`
  } else kids += '<a:buNone/>'
  return `<a:pPr ${at.join(' ')}>${kids}</a:pPr>`
}

function frag (html) { const t = document.createElement('template'); t.innerHTML = html || ''; return t.content }
const baseStyleOf = ts => ({ bold: !!ts?.bold, italic: !!ts?.italic, underline: !!ts?.underline, strike: false, size: ts?.size || 18, font: ts?.font || '+minor', color: ts?.color || 'dk1' })

// Paragraph list (<a:p>…) for some HTML; ts = element text defaults, overrides = extra defaults (table cell look)
export function parasXml (html, ts, ctx, { fx, overrides } = {}) {
  const src = html && html.trim() ? html : '<p><br></p>'
  const raws = [...frag(src).childNodes].filter(n => n.nodeType === 1)
  const base = { ...(ts || {}), ...(overrides || {}) }
  const paras = parseRich(src, base)
  const extra = { caps: ts?.caps, spacing: ts?.spacing }
  const baseStyle = baseStyleOf(base)
  return paras.map((para, i) => {
    const raw = raws[i]
    const pStyle = raw && raw.style ? deriveStyle(raw, baseStyle) : baseStyle
    let runs = ''
    for (const r of para.runs) {
      const st = r
      if (r.br) { runs += `<a:br>${rPrXml(st, ctx, { fx, extra })}</a:br>`; continue }
      if (!r.text) continue
      runs += `<a:r>${rPrXml(st, ctx, { fx, extra })}<a:t>${esc(r.text)}</a:t></a:r>`
    }
    const last = para.runs.filter(r => r.text).pop() || para.end || pStyle
    return `<a:p>${pPrXml(para, raw, ctx, base)}${runs}${rPrXml({ ...last, link: null }, ctx, { tag: 'a:endParaRPr', fx, extra })}</a:p>`
  }).join('')
}

export function bodyPrXml (el, { forceInset } = {}) {
  const ins = forceInset || el.inset || DEFAULT_INSET
  const anchor = ANCHOR[el.vAlign] || (el.type === 'shape' ? 'ctr' : 't')
  const wrap = el.wrap === false ? 'none' : 'square'
  const vert = el.vertical === true ? ' vert="vert"' : el.vertical === 'vert270' ? ' vert="vert270"' : el.vertical === 'stacked' ? ' vert="wordArtVert"' : el.vertical ? ' vert="vert"' : ''
  // PowerPoint turns the text of a vertically flipped shape upside down; Prizma keeps it upright unless flipText
  const rot = !el.flipText !== !el.flipV ? ' rot="10800000"' : ''
  const fit = el.autofit === 'shape' ? '<a:spAutoFit/>' : el.autofit === 'shrink' ? `<a:normAutofit${el.fontScale && el.fontScale < 1 ? ` fontScale="${Math.round(el.fontScale * 100000)}"` : ''}/>` : '<a:noAutofit/>'
  return `<a:bodyPr${rot} wrap="${wrap}" lIns="${emuPos(ins.l)}" tIns="${emuPos(ins.t)}" rIns="${emuPos(ins.r)}" bIns="${emuPos(ins.b)}" anchor="${anchor}" rtlCol="0"${vert}>${fit}</a:bodyPr>`
}

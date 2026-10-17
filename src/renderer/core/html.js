// Rich-text helpers. Text content is stored as a flat list of <p> paragraphs with inline <span> styling.
// Bullets/numbering are paragraph attributes: data-bu="•" | data-num="arabicPeriod", data-lvl="0..4".
import DOMPurify from 'dompurify'

const ALLOWED_TAGS = ['p', 'span', 'br', 'b', 'i', 'u', 's', 'strike', 'strong', 'em', 'sub', 'sup', 'a', 'div', 'ul', 'ol', 'li', 'font']
const ALLOWED_ATTR = ['style', 'href', 'data-bu', 'data-lvl', 'data-num', 'data-start', 'color', 'face', 'size', 'target']
const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'])
export const BULLET_CHARS = ['•', '–', '▪', '›', '»']
export const NUM_FORMATS = {
  arabicPeriod: ['decimal', '.'], arabicParenR: ['decimal', ')'], arabicPlain: ['decimal', ''], alphaLcPeriod: ['lower-alpha', '.'], alphaUcPeriod: ['upper-alpha', '.'],
  alphaLcParenR: ['lower-alpha', ')'], alphaUcParenR: ['upper-alpha', ')'], romanUcPeriod: ['upper-roman', '.'], romanLcPeriod: ['lower-roman', '.']
}

const frag = html => { const t = document.createElement('template'); t.innerHTML = html || ''; return t.content }
const serialize = f => { const d = document.createElement('div'); d.appendChild(f); return d.innerHTML }

// DOMPurify's own rule for link addresses, with files too (file:, C:\…); javascript:, data: and vbscript: stay out
const ALLOWED_URI_REGEXP = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|file):|[a-z]:[\\/]|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

export function sanitize (html) {
  return DOMPurify.sanitize(html || '', { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false, ALLOWED_URI_REGEXP })
}

// Flattens lists/divs into top-level <p> elements and guarantees at least one paragraph.
export function normalize (html) {
  const f = frag(sanitize(plainNumbers((html || '').replace(/\u200B/g, ''))))
  const out = document.createDocumentFragment()
  let cur = null
  const flushInline = node => {
    if (!cur) { cur = document.createElement('p'); out.appendChild(cur) }
    cur.appendChild(node)
  }
  const visit = (node, lvl, listType, depth) => {
    for (const n of [...node.childNodes]) {
      if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) { cur = null; visit(n, depth, n.tagName, depth + 1); cur = null; continue }
      if (n.nodeType === 1 && BLOCK.has(n.tagName)) {
        cur = null
        const hasBlockKids = [...n.childNodes].some(c => c.nodeType === 1 && BLOCK.has(c.tagName))
        if (hasBlockKids && n.tagName !== 'P') {
          // e.g. <li><p>..</p></li>: push list info down
          const inner = [...n.childNodes]
          for (const c of inner) {
            if (c.nodeType === 1 && c.tagName === 'P' && n.tagName === 'LI') markList(c, listType, lvl, n)
          }
          visit(n, lvl, listType, depth)
          cur = null
          continue
        }
        const p = document.createElement('p')
        for (const a of n.attributes) p.setAttribute(a.name, a.value)
        if (n.tagName === 'LI') markList(p, listType, lvl, n)
        while (n.firstChild) p.appendChild(n.firstChild)
        out.appendChild(p)
        continue
      }
      if (n.nodeType === 3 && !n.nodeValue.trim() && !cur) continue
      flushInline(n)
    }
  }
  visit(f, 0, null, 0)
  if (!out.childNodes.length) { const p = document.createElement('p'); p.appendChild(document.createElement('br')); out.appendChild(p) }
  for (const p of out.querySelectorAll('p')) {
    for (const font of p.querySelectorAll('font')) {
      const s = document.createElement('span')
      if (font.getAttribute('color')) s.style.color = font.getAttribute('color')
      if (font.getAttribute('face')) s.style.fontFamily = font.getAttribute('face')
      while (font.firstChild) s.appendChild(font.firstChild)
      font.replaceWith(s)
    }
    // drop empty styling spans left behind by editing
    for (const sp of [...p.querySelectorAll('span')]) if (!sp.childNodes.length) sp.remove()
    if (!p.textContent && !p.querySelector('br')) p.appendChild(document.createElement('br'))
    syncBullet(p)
  }
  return serialize(out)
}
function markList (p, listType, lvl, li) {
  if (p.hasAttribute('data-bu') || p.hasAttribute('data-num')) return
  if (listType === 'OL') p.setAttribute('data-num', 'arabicPeriod')
  else p.setAttribute('data-bu', BULLET_CHARS[lvl % BULLET_CHARS.length])
  p.setAttribute('data-lvl', String(lvl))
  if (!p.style.marginLeft) { p.style.marginLeft = (27 + lvl * 36) + 'pt'; p.style.textIndent = '-27pt' }
}
// Bullet glyph size follows the first run's font size (set as a CSS variable for ::before).
export function syncBullet (p) {
  if (!p.hasAttribute('data-bu') && !p.hasAttribute('data-num')) { p.style.removeProperty('--bu-sz'); p.style.removeProperty('--hang'); return }
  const first = [...p.querySelectorAll('[style]')].find(e => e.style.fontSize)
  if (first) p.style.setProperty('--bu-sz', first.style.fontSize)
  const ti = parseFloat(p.style.textIndent)
  if (ti < 0) p.style.setProperty('--hang', (-ti) + (p.style.textIndent.match(/[a-z%]+$/)?.[0] || 'pt'))
  else p.style.setProperty('--hang', '1.2em')
}

export function textOf (html) {
  const f = frag(html)
  const ps = [...f.childNodes].filter(n => n.nodeType === 1 && n.tagName === 'P')
  if (!ps.length) return (f.textContent || '').replace(/ /g, ' ')
  return ps.map(p => p.textContent.replace(/ /g, ' ')).join('\n')
}
export const isEmptyHtml = html => !textOf(html).trim()
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function htmlFromText (text, paraAttrs = '') {
  return String(text ?? '').split(/\r?\n/).map(l => `<p${paraAttrs}>${l ? esc(l) : '<br>'}</p>`).join('')
}

// ---------- style parsing ----------
// Converts CSS colour strings used in content back to model colour values.
export function colorFromCss (v) {
  if (!v) return null
  v = v.trim()
  let m = v.match(/^var\(--c-(\w+)\)$/)
  if (m) return m[1]
  m = v.match(/^color-mix\(in srgb,\s*var\(--c-(\w+)\),\s*(#fff|#000|white|black|rgb\(255, 255, 255\)|rgb\(0, 0, 0\))\s*(\d+)%\)$/i)
  if (m) return m[1] + ':' + (/fff|white|255/i.test(m[2]) ? '' : '-') + m[3]
  if (v[0] === '#') return v.length === 4 ? '#' + v.slice(1).split('').map(c => c + c).join('').toUpperCase() : v.slice(0, 7).toUpperCase()
  m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (m) return '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase()
  if (v === 'transparent') return null
  return null
}
function sizePt (v, parentPt) {
  if (!v) return null
  const n = parseFloat(v)
  if (Number.isNaN(n)) return null
  if (v.endsWith('pt')) return n
  if (v.endsWith('px')) return n * 0.75
  if (v.endsWith('em') || v.endsWith('%')) return (v.endsWith('%') ? n / 100 : n) * (parentPt || 18)
  return n
}
function fontFromCss (v) {
  if (!v) return null
  if (v.includes('--f-major')) return '+major'
  if (v.includes('--f-minor')) return '+minor'
  return v.split(',')[0].trim().replace(/^["']|["']$/g, '') || null
}
// Effective run style for an element node, given its parent's style.
export function deriveStyle (node, parent) {
  const s = { ...parent }
  const tag = node.tagName
  if (tag === 'B' || tag === 'STRONG') s.bold = true
  if (tag === 'I' || tag === 'EM') s.italic = true
  if (tag === 'U') s.underline = true
  if (tag === 'S' || tag === 'STRIKE') s.strike = true
  if (tag === 'SUP') s.baseline = 'sup'
  if (tag === 'SUB') s.baseline = 'sub'
  if (tag === 'A') { s.link = node.getAttribute('href'); s.underline = true }
  const st = node.style
  if (st) {
    if (st.fontWeight) s.bold = st.fontWeight === 'bold' || st.fontWeight === 'bolder' || +st.fontWeight >= 600
    if (st.fontStyle) s.italic = st.fontStyle === 'italic' || st.fontStyle === 'oblique'
    const td = st.textDecorationLine || st.textDecoration
    if (td) { s.underline = td.includes('underline'); s.strike = td.includes('line-through') }
    if (st.fontSize) s.size = sizePt(st.fontSize, parent.size)
    if (st.fontFamily) s.font = fontFromCss(st.fontFamily) || s.font
    if (st.color) s.color = colorFromCss(st.color) || s.color
    if (st.backgroundColor) s.highlight = colorFromCss(st.backgroundColor)
    if (st.verticalAlign === 'super') s.baseline = 'sup'
    if (st.verticalAlign === 'sub') s.baseline = 'sub'
    if (st.letterSpacing) s.spacing = sizePt(st.letterSpacing, s.size)
    if (st.textTransform) s.caps = st.textTransform === 'uppercase' ? 'all' : null
  }
  return s
}
// Effective run style of a DOM node inside an editor root (walks inline styles from the root down)
export function effectiveStyle (node, root, base = {}) {
  const chain = []
  for (let n = node.nodeType === 3 ? node.parentNode : node; n && n !== root; n = n.parentNode) chain.unshift(n)
  let s = { bold: !!base.bold, italic: !!base.italic, underline: !!base.underline, strike: false, size: base.size || 18, font: base.font || '+minor', color: base.color || 'dk1', highlight: null, baseline: null }
  for (const n of chain) if (n.nodeType === 1) s = deriveStyle(n, s)
  return s
}
// Parses content into paragraphs and runs with fully resolved styles.
export function parseRich (html, base = {}) {
  const f = frag(html)
  const paras = []
  const baseStyle = { bold: !!base.bold, italic: !!base.italic, underline: !!base.underline, strike: false, size: base.size || 18, font: base.font || '+minor', color: base.color || 'dk1' }
  const ps = [...f.childNodes].filter(n => n.nodeType === 1)
  for (const p of ps.length ? ps : [f]) {
    const pst = p.style || {}
    const para = {
      align: pst.textAlign || base.align || 'left',
      lineH: pst.lineHeight ? parseFloat(pst.lineHeight) : null,
      before: pst.marginTop ? sizePt(pst.marginTop, baseStyle.size) : 0,
      after: pst.marginBottom ? sizePt(pst.marginBottom, baseStyle.size) : 0,
      marginLeft: pst.marginLeft ? sizePt(pst.marginLeft, baseStyle.size) : 0,
      indent: pst.textIndent ? sizePt(pst.textIndent, baseStyle.size) : 0,
      bu: p.getAttribute?.('data-bu') || null, num: p.getAttribute?.('data-num') || null,
      lvl: +(p.getAttribute?.('data-lvl') || 0), runs: []
    }
    const pStyle = p.nodeType === 1 ? deriveStyle(p, baseStyle) : baseStyle
    const visit = (node, style) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { if (n.nodeValue) para.runs.push({ ...style, text: n.nodeValue.replace(/ /g, ' ') }) } else if (n.nodeType === 1) {
          if (n.tagName === 'BR') { para.runs.push({ ...style, text: '', br: true }); continue }
          visit(n, deriveStyle(n, style))
        }
      }
    }
    visit(p, pStyle)
    // trailing <br> in a paragraph is only a caret placeholder (its style still sizes an empty line)
    if (para.runs.length && para.runs[para.runs.length - 1].br) para.end = para.runs.pop()
    para.size = (para.runs.find(r => r.text) || para.end || pStyle).size
    paras.push(para)
  }
  return paras
}
// Aggregated state over all text runs (null = mixed / none)
export function richState (html, base) {
  const paras = parseRich(html, base)
  const runs = paras.flatMap(p => p.runs.filter(r => r.text && r.text.trim()))
  const pick = k => { if (!runs.length) return base?.[k] ?? null; const v = runs[0][k]; return runs.every(r => r[k] === v) ? v : null }
  const pp = k => { const v = paras[0]?.[k]; return paras.every(p => p[k] === v) ? v : null }
  return {
    bold: pick('bold'), italic: pick('italic'), underline: pick('underline'), strike: pick('strike'), baseline: pick('baseline'),
    size: pick('size'), font: pick('font'), color: pick('color'), highlight: pick('highlight'),
    align: pp('align'), lineH: pp('lineH'), bullets: paras.every(p => p.bu) ? 'bu' : paras.every(p => p.num) ? 'num' : null, num: pp('num'), lvl: pp('lvl')
  }
}

export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96]
export function stepSize (size, dir) {
  size = Number(size) || 18
  if (dir > 0) return FONT_SIZES.find(s => s > size + 0.01) || Math.round(size * 1.1)
  return [...FONT_SIZES].reverse().find(s => s < size - 0.01) || Math.max(1, Math.round(size * 0.9))
}

// ---------- whole-content transforms (used when the element is selected but not being edited) ----------
const RUN_PROPS = { bold: ['font-weight', 'bold', 'normal'], italic: ['font-style', 'italic', 'normal'] }
function stripDescendants (root, props, unwrapTags) {
  for (const n of [...root.querySelectorAll('*')]) {
    if (n.style) for (const p of props) n.style.removeProperty(p)
    if (unwrapTags && unwrapTags.includes(n.tagName)) { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); continue }
    if (n.tagName === 'SPAN' && !n.getAttribute('style')) { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove() }
  }
}
export function setRunStyleAll (html, key, value) {
  const f = frag(html)
  const ps = [...f.children]
  if (key === 'bold' || key === 'italic') {
    const [prop, on, off] = RUN_PROPS[key]
    stripDescendants(f, [prop], key === 'bold' ? ['B', 'STRONG'] : ['I', 'EM'])
    ps.forEach(p => p.style.setProperty(prop, value ? on : off))
  } else if (key === 'underline' || key === 'strike') {
    const st = richState(html, {})
    const u = key === 'underline' ? value : !!st.underline, s = key === 'strike' ? value : !!st.strike
    stripDescendants(f, ['text-decoration', 'text-decoration-line'], ['U', 'S', 'STRIKE'])
    ps.forEach(p => { const v = [u && 'underline', s && 'line-through'].filter(Boolean).join(' '); if (v) p.style.textDecoration = v; else p.style.removeProperty('text-decoration') })
  } else if (key === 'size') {
    stripDescendants(f, ['font-size'])
    ps.forEach(p => { p.style.fontSize = value + 'pt'; syncBullet(p) })
  } else if (key === 'sizeBy') {
    // grow/shrink every run one step on the standard size ladder, keeping relative sizes
    const { dir, base } = value
    for (const n of f.querySelectorAll('*')) {
      if (n.style && n.style.fontSize) n.style.fontSize = stepSize(sizePt(n.style.fontSize, base), dir) + 'pt'
    }
    ps.forEach(p => { if (!p.style.fontSize) p.style.fontSize = stepSize(base || 18, dir) + 'pt'; syncBullet(p) })
  } else if (key === 'font') {
    stripDescendants(f, ['font-family'])
    ps.forEach(p => { if (value) p.style.fontFamily = value.startsWith('+') ? (value === '+major' ? 'var(--f-major)' : 'var(--f-minor)') : `"${value}"`; else p.style.removeProperty('font-family') })
  } else if (key === 'color') {
    stripDescendants(f, ['color'])
    ps.forEach(p => { if (value) p.style.color = value; else p.style.removeProperty('color') })
  } else if (key === 'highlight') {
    stripDescendants(f, ['background-color'])
    for (const p of ps) {
      if (!value) continue
      const s = document.createElement('span'); s.style.backgroundColor = value
      while (p.firstChild) s.appendChild(p.firstChild)
      p.appendChild(s)
    }
  } else if (key === 'baseline') {
    stripDescendants(f, ['vertical-align'], ['SUP', 'SUB'])
    ps.forEach(p => { if (value) p.style.verticalAlign = value === 'sup' ? 'super' : 'sub'; else p.style.removeProperty('vertical-align') })
  } else if (key === 'clear') {
    stripDescendants(f, ['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'font-size', 'font-family', 'color', 'background-color', 'vertical-align', 'letter-spacing'], ['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUP', 'SUB'])
    ps.forEach(p => ['font-weight', 'font-style', 'text-decoration', 'font-size', 'font-family', 'color', 'vertical-align'].forEach(k => p.style.removeProperty(k)))
  } else if (key === 'case') {
    const tw = document.createTreeWalker(f, NodeFilter.SHOW_TEXT)
    const nodes = []; while (tw.nextNode()) nodes.push(tw.currentNode)
    let sentenceStart = true
    for (const n of nodes) {
      let t = n.nodeValue
      if (value === 'upper') t = t.toUpperCase()
      else if (value === 'lower') t = t.toLowerCase()
      else if (value === 'title') t = t.toLowerCase().replace(/(^|[\s (“"'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
      else if (value === 'sentence') t = t.toLowerCase().replace(/(\p{L})/gu, ch => { if (sentenceStart) { sentenceStart = false; return ch.toUpperCase() } return ch }).replace(/([.!?]\s)/g, m => { sentenceStart = true; return m })
      else if (value === 'toggle') t = [...t].map(ch => ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()).join('')
      n.nodeValue = t
    }
  }
  return serialize(f)
}
export function setParaStyleAll (html, prop, value, filter) {
  const f = frag(html)
  ;[...f.children].forEach((p, i) => {
    if (filter && !filter(i)) return
    if (value === null || value === undefined || value === '') p.style.removeProperty(prop)
    else p.style.setProperty(prop, value)
    syncBullet(p)
  })
  return serialize(f)
}
export function setBulletsAll (html, kind, opts = {}) {
  const f = frag(html)
  for (const p of f.children) applyBullet(p, kind, opts)
  return serialize(f)
}
export function applyBullet (p, kind, opts = {}) {
  const lvl = +(p.getAttribute('data-lvl') || 0)
  p.removeAttribute('data-bu'); p.removeAttribute('data-num')
  if (!kind) {
    p.style.removeProperty('margin-left'); p.style.removeProperty('text-indent')
  } else {
    if (kind === 'num') p.setAttribute('data-num', opts.format || 'arabicPeriod')
    else p.setAttribute('data-bu', opts.char || BULLET_CHARS[lvl % BULLET_CHARS.length])
    p.setAttribute('data-lvl', String(lvl))
    p.style.marginLeft = (27 + lvl * 36) + 'pt'; p.style.textIndent = '-27pt'
  }
  syncBullet(p)
}
export function changeLevel (p, delta) {
  const lvl = Math.max(0, Math.min(4, +(p.getAttribute('data-lvl') || 0) + delta))
  p.setAttribute('data-lvl', String(lvl))
  if (p.hasAttribute('data-bu')) p.setAttribute('data-bu', BULLET_CHARS[lvl % BULLET_CHARS.length])
  const hang = p.hasAttribute('data-bu') || p.hasAttribute('data-num') ? 27 : 0
  p.style.marginLeft = (hang + lvl * 36) + 'pt'
  if (hang) p.style.textIndent = '-27pt'
  syncBullet(p)
}
export function changeLevelAll (html, delta) {
  const f = frag(html)
  for (const p of f.children) changeLevel(p, delta)
  return serialize(f)
}
// Replace text while keeping the first run's formatting (used by the outline view and find/replace)
// What Find looks for, as a global regex. Whole words: no letter, digit or _ right before or after, in any alphabet
// (\b only knows a-z, so it failed next to å, ø, š, č).
export function searchRe (find, opts = {}) {
  const src = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(opts.wholeWord ? `(?<![\\p{L}\\p{N}_])${src}(?![\\p{L}\\p{N}_])` : src, (opts.matchCase ? 'g' : 'gi') + 'u')
}
export function replaceText (html, find, repl, opts = {}) {
  const f = frag(html)
  const re = searchRe(find, opts)
  let count = 0
  // each paragraph's text is matched as a whole, so a word split over formatting runs is found too; the replacement
  // goes into the run where the match starts
  for (const p of f.children.length ? [...f.children] : [f]) {
    const nodes = []
    const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
    while (tw.nextNode()) nodes.push(tw.currentNode)
    const text = nodes.map(n => n.nodeValue.replace(/\u00A0/g, ' ')).join('')
    for (const m of [...text.matchAll(re)].reverse()) {
      count++
      let pos = 0
      for (const n of nodes) {
        const len = n.nodeValue.length, a = Math.max(m.index, pos), b = Math.min(m.index + m[0].length, pos + len)
        if (a < b) n.nodeValue = n.nodeValue.slice(0, a - pos) + (a === m.index ? repl : '') + n.nodeValue.slice(b - pos)
        pos += len
      }
    }
  }
  return { html: serialize(f), count }
}
// PowerPoint's "start at" (data-start, which it writes on every paragraph of the list): the first paragraph of each
// numbered run sets its level's counter there. For display only; plainNumbers takes it out before text is stored.
export function numberStarts (html) {
  if (!/data-start/.test(html || '')) return html
  const f = frag(html)
  const run = [] // per level: inside a numbered run, as the counters in numberingCss see it
  for (const p of f.children) {
    const l = +p.getAttribute('data-lvl') || 0
    p.style.removeProperty('counter-set')
    if (p.hasAttribute('data-num')) {
      if (!run[l] && +p.getAttribute('data-start') > 1) p.style.setProperty('counter-set', `pzn${l} ${+p.getAttribute('data-start')}`)
      run[l] = true
      run.fill(false, l + 1, 5)
    } else if (p.hasAttribute('data-lvl')) run.fill(false, l, 5)
  }
  return serialize(f)
}
export const plainNumbers = html => (html || '').replace(/\s?counter-set:[^;"]*;?/g, '')
// Generated CSS for numbered paragraphs (counters per level)
export function numberingCss () {
  let css = ''
  for (let l = 0; l < 5; l++) {
    const deeper = [l + 1, l + 2, l + 3, l + 4].filter(x => x < 5).map(x => 'pzn' + x).join(' ')
    css += `.pz-rt p[data-lvl="${l}"]:not([data-num]){counter-reset:pzn${l} ${deeper}}`
    css += `.pz-rt p[data-num][data-lvl="${l}"]{counter-increment:pzn${l};${deeper ? `counter-reset:${deeper};` : ''}}`
    for (const [k, [style, suf]] of Object.entries(NUM_FORMATS)) css += `.pz-rt p[data-num="${k}"][data-lvl="${l}"]::before{content:counter(pzn${l}, ${style}) "${suf}"}`
  }
  return css
}

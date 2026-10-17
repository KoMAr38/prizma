// Formatting of the live text selection inside the contenteditable text editor.
// Text is kept as top-level <p> paragraphs with inline <span style> runs (see core/html.js).
import { cssColor } from '../core/model.js'
import { applyBullet, changeLevel, syncBullet, stepSize, effectiveStyle } from '../core/html.js'

let active = null // { el: HTMLElement, base: run defaults, commit: fn }
let lastRange = null
export function setActiveEditor (ed) { active = ed; lastRange = null }
export const activeEditor = () => (active && active.el.isConnected ? active : null)

// Remember the selection so ribbon inputs (font box, size box) can restore it after taking focus
document.addEventListener('selectionchange', () => {
  const a = activeEditor()
  if (!a) return
  const sel = window.getSelection()
  if (sel.rangeCount && a.el.contains(sel.getRangeAt(0).commonAncestorContainer)) lastRange = sel.getRangeAt(0).cloneRange()
})

function currentRange () {
  const a = activeEditor()
  if (!a) return null
  const sel = window.getSelection()
  if (sel.rangeCount) {
    const r = sel.getRangeAt(0)
    if (a.el.contains(r.commonAncestorContainer)) return r
  }
  if (lastRange && a.el.contains(lastRange.commonAncestorContainer)) {
    sel.removeAllRanges(); sel.addRange(lastRange)
    a.el.focus({ preventScroll: true })
    return sel.getRangeAt(0)
  }
  return null
}

// Keep every piece of content inside top-level <p> elements
export function ensureParas (root) {
  let cur = null
  for (const n of [...root.childNodes]) {
    if (n.nodeType === 1 && n.tagName === 'P') { cur = null; continue }
    if (n.nodeType === 1 && (n.tagName === 'DIV' || /^H\d$/.test(n.tagName) || n.tagName === 'LI')) {
      const p = document.createElement('p')
      for (const a of n.attributes) p.setAttribute(a.name, a.value)
      while (n.firstChild) p.appendChild(n.firstChild)
      n.replaceWith(p); cur = null; continue
    }
    if (n.nodeType === 3 && !n.nodeValue.length) { n.remove(); continue }
    if (!cur) { cur = document.createElement('p'); root.insertBefore(cur, n) }
    cur.appendChild(n)
  }
  if (!root.firstChild) { const p = document.createElement('p'); p.appendChild(document.createElement('br')); root.appendChild(p) }
}

const WORD = /[\p{L}\p{N}_'’-]/u
// Splits the text nodes at the range boundaries; returns the text nodes fully inside
function splitRange (range) {
  const root = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer
  const nodes = []
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  if (root.nodeType === 3) nodes.push(root)
  while (tw.nextNode()) { const n = tw.currentNode; if (n.length && range.intersectsNode(n)) nodes.push(n) }
  const sc = range.startContainer, so = range.startOffset, ec = range.endContainer, eo = range.endOffset
  const out = []
  for (let n of nodes) {
    const start = n === sc ? so : 0
    const end = n === ec ? eo : n.length
    if (start >= end) continue
    if (end < n.length) n.splitText(end)
    if (start > 0) n = n.splitText(start)
    out.push(n)
  }
  return out
}
// Expands a collapsed caret to the word around it; returns null unless the caret is inside a word, as in
// Office: at either edge of a word the format is for the text typed next
function wordRange (range) {
  const n = range.startContainer
  if (n.nodeType !== 3) return null
  const t = n.nodeValue, o = range.startOffset
  if (!(WORD.test(t[o - 1] || '') && WORD.test(t[o] || ''))) return null
  let a = o, b = o
  while (a > 0 && WORD.test(t[a - 1])) a--
  while (b < t.length && WORD.test(t[b])) b++
  if (a === b) return null
  const r = document.createRange(); r.setStart(n, a); r.setEnd(n, b)
  return r
}

const paraOf = (n, root) => { while (n && n.parentNode !== root) n = n.parentNode; return n && n.tagName === 'P' ? n : null }
function wrapperOf (n) {
  const p = n.parentNode
  if (p.tagName === 'SPAN' && p.childNodes.length === 1) return p
  const s = document.createElement('span')
  p.insertBefore(s, n); s.appendChild(n)
  return s
}
// Moves a non-inherited property (decoration, highlight, baseline) from ancestors down to the text runs,
// so it can be removed from part of the text.
function pushDown (nodes, root, props) {
  for (const n of nodes) {
    for (let a = n.parentNode; a && a !== root; a = a.parentNode) {
      if (!a.style) continue
      const found = props.filter(p => a.style.getPropertyValue(p))
      if (!found.length) continue
      const vals = found.map(p => [p, a.style.getPropertyValue(p)])
      found.forEach(p => a.style.removeProperty(p))
      if (a.tagName === 'U' || a.tagName === 'S' || a.tagName === 'STRIKE' || a.tagName === 'SUP' || a.tagName === 'SUB') continue
      const tw = document.createTreeWalker(a, NodeFilter.SHOW_TEXT)
      const texts = []; while (tw.nextNode()) texts.push(tw.currentNode)
      for (const t of texts) {
        // skip runs whose own wrapper chain (below `a`) already sets the property
        let own = false
        for (let b = t.parentNode; b && b !== a; b = b.parentNode) if (b.style && found.some(p => b.style.getPropertyValue(p))) own = true
        if (own) continue
        const w = wrapperOf(t)
        for (const [p, v] of vals) if (!w.style.getPropertyValue(p)) w.style.setProperty(p, v)
      }
    }
    // legacy tags carry their own semantics; unwrap them
    for (let a = n.parentNode; a && a !== root; a = a.parentNode) {
      if (['U', 'S', 'STRIKE', 'SUP', 'SUB', 'B', 'STRONG', 'I', 'EM'].includes(a.tagName)) {
        const st = { U: 'text-decoration-line:underline', S: 'text-decoration-line:line-through', STRIKE: 'text-decoration-line:line-through', SUP: 'vertical-align:super;font-size:0.65em', SUB: 'vertical-align:sub;font-size:0.65em', B: 'font-weight:bold', STRONG: 'font-weight:bold', I: 'font-style:italic', EM: 'font-style:italic' }[a.tagName]
        const s = document.createElement('span'); s.setAttribute('style', st)
        while (a.firstChild) s.appendChild(a.firstChild)
        a.replaceWith(s); a = s
      }
    }
  }
}
// Merge neighbouring spans with identical styling and drop empty ones
function tidy (root) {
  for (const sp of [...root.querySelectorAll('span')]) {
    if (!sp.isConnected) continue
    if (!sp.childNodes.length) { sp.remove(); continue }
    if (!sp.getAttribute('style')) { while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp); sp.remove(); continue }
    const nx = sp.nextSibling
    if (nx && nx.nodeType === 1 && nx.tagName === 'SPAN' && nx.getAttribute('style') === sp.getAttribute('style')) {
      while (nx.firstChild) sp.appendChild(nx.firstChild)
      nx.remove()
    }
  }
}
function reselect (nodes) {
  if (!nodes.length) return
  const sel = window.getSelection()
  const r = document.createRange()
  r.setStart(nodes[0], 0)
  const last = nodes[nodes.length - 1]
  r.setEnd(last, last.length)
  sel.removeAllRanges(); sel.addRange(r)
}

const NON_INHERITED = ['text-decoration', 'text-decoration-line', 'background-color', 'vertical-align']
function decoSet (w, kind, on) {
  const cur = (w.style.textDecorationLine || w.style.textDecoration || '').split(/\s+/).filter(x => x === 'underline' || x === 'line-through')
  const next = new Set(cur)
  if (on) next.add(kind); else next.delete(kind)
  w.style.removeProperty('text-decoration')
  w.style.textDecorationLine = next.size ? [...next].join(' ') : 'none'
}

// Applies a run-level format to the selection. `key` mirrors setRunStyleAll in core/html.js.
export function applyRun (key, value) {
  const a = activeEditor()
  if (!a) return false
  const root = a.el
  let range = currentRange()
  if (!range) return false
  ensureParas(root)
  let nodes, caret = -1
  if (range.collapsed) {
    const w = wordRange(range)
    if (w) { caret = range.startOffset - w.startOffset; nodes = splitRange(w) }
    else {
      // empty paragraph or caret between words: style the paragraph when empty, else a typing span
      const p = paraOf(range.startContainer, root)
      if (p && !p.textContent.replace(/​/g, '')) {
        setOn(p, key, value, a.base, root, [p])
        a.commit(); return true
      }
      const z = document.createTextNode('​')
      range.insertNode(z)
      nodes = [z]
      applyToNodes(nodes, key, value, a.base, root)
      tidy(root)
      const sel = window.getSelection(); const r = document.createRange(); r.setStart(z, 1); r.collapse(true); sel.removeAllRanges(); sel.addRange(r)
      a.commit(); return true
    }
  } else nodes = splitRange(range)
  if (!nodes.length) return false
  applyToNodes(nodes, key, value, a.base, root)
  tidy(root)
  for (const p of root.children) syncBullet(p)
  const live = nodes.filter(n => n.isConnected)
  // a word widened from a caret keeps the caret where it was instead of selecting the word
  if (caret >= 0 && live.length === 1) {
    const sel = window.getSelection(), r = document.createRange()
    r.setStart(live[0], Math.min(caret, live[0].length)); r.collapse(true)
    sel.removeAllRanges(); sel.addRange(r)
  } else reselect(live)
  a.commit()
  return true
}
function setOn (p, key, value, base, root, nodes) {
  // paragraph-level default for empty paragraphs (typed text inherits it)
  const s = p.style
  switch (key) {
    case 'bold': s.fontWeight = value ? 'bold' : 'normal'; break
    case 'italic': s.fontStyle = value ? 'italic' : 'normal'; break
    case 'underline': case 'strike': {
      const cur = new Set((s.textDecorationLine || s.textDecoration || '').split(/\s+/).filter(Boolean))
      const k = key === 'underline' ? 'underline' : 'line-through'
      if (value) cur.add(k); else cur.delete(k)
      s.removeProperty('text-decoration'); if (cur.size) s.textDecorationLine = [...cur].join(' '); else s.removeProperty('text-decoration-line')
      break
    }
    case 'size': s.fontSize = value + 'pt'; break
    case 'sizeBy': s.fontSize = stepSize(effectiveStyle(p, root, base).size, value.dir) + 'pt'; break
    case 'font': s.fontFamily = fontCss(value); break
    case 'color': if (value) s.color = cssColor(value); else s.removeProperty('color'); break
    case 'spacing': if (value) s.letterSpacing = value + 'pt'; else s.removeProperty('letter-spacing'); break
    default: break
  }
  syncBullet(p)
}
const fontCss = v => !v ? '' : v === '+major' ? 'var(--f-major)' : v === '+minor' ? 'var(--f-minor)' : `"${v.replace(/"/g, '')}"`

function applyToNodes (nodes, key, value, base, root) {
  const st = nodes.map(n => effectiveStyle(n, root, base))
  if (key === 'underline' || key === 'strike' || key === 'highlight' || key === 'baseline' || key === 'clear') pushDown(nodes, root, NON_INHERITED)
  if (key === 'clear') {
    // explicit theme defaults override whatever the wrapping spans/paragraph set
    for (const n of nodes) {
      const w = wrapperOf(n)
      w.removeAttribute('style')
      w.style.fontWeight = base.bold ? 'bold' : 'normal'
      w.style.fontStyle = base.italic ? 'italic' : 'normal'
      w.style.fontSize = (base.size || 18) + 'pt'
      w.style.fontFamily = fontCss(base.font || '+minor')
      w.style.color = cssColor(base.color || 'dk1')
    }
    return
  }
  if (key === 'case') { caseNodes(nodes, value); return }
  nodes.forEach((n, i) => {
    const w = wrapperOf(n)
    const s = w.style
    switch (key) {
      case 'bold': s.fontWeight = value ? 'bold' : 'normal'; break
      case 'italic': s.fontStyle = value ? 'italic' : 'normal'; break
      case 'underline': decoSet(w, 'underline', value); break
      case 'strike': decoSet(w, 'line-through', value); break
      case 'size': s.fontSize = value + 'pt'; break
      case 'sizeBy': s.fontSize = stepSize(st[i].size, value.dir) + 'pt'; break
      case 'font': if (value) s.fontFamily = fontCss(value); else s.removeProperty('font-family'); break
      case 'color': s.color = value ? cssColor(value) : cssColor(base.color || 'dk1'); break
      case 'highlight': if (value) s.backgroundColor = cssColor(value); else s.removeProperty('background-color'); break
      case 'baseline':
        if (value) { s.verticalAlign = value === 'sup' ? 'super' : 'sub'; s.fontSize = '0.65em' } else { s.removeProperty('vertical-align'); if (s.fontSize === '0.65em') s.removeProperty('font-size') }
        break
      case 'spacing': if (value) s.letterSpacing = value + 'pt'; else s.removeProperty('letter-spacing'); break
      case 'caps': if (value) s.textTransform = 'uppercase'; else s.removeProperty('text-transform'); break
      default: break
    }
  })
}
function caseNodes (nodes, mode) {
  let sentenceStart = true
  for (const n of nodes) {
    let t = n.nodeValue
    if (mode === 'upper') t = t.toUpperCase()
    else if (mode === 'lower') t = t.toLowerCase()
    else if (mode === 'title') t = t.toLowerCase().replace(/(^|[\s (“"'-])(\p{L})/gu, (m, x, y) => x + y.toUpperCase())
    else if (mode === 'sentence') t = t.toLowerCase().replace(/\p{L}/gu, ch => { if (sentenceStart) { sentenceStart = false; return ch.toUpperCase() } return ch }).replace(/[.!?]\s/g, m => { sentenceStart = true; return m })
    else if (mode === 'toggle') t = [...t].map(ch => ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()).join('')
    n.nodeValue = t
  }
}

// Paragraph-level formatting for the paragraphs touched by the selection
export function applyPara (fn) {
  const a = activeEditor()
  if (!a) return false
  const range = currentRange()
  if (!range) return false
  ensureParas(a.el)
  const ps = [...a.el.children].filter(p => p.tagName === 'P' && range.intersectsNode(p))
  if (!ps.length) return false
  ps.forEach((p, i) => { fn(p, i); syncBullet(p) })
  a.commit()
  return true
}
export const paraOps = {
  align: v => applyPara(p => { p.style.textAlign = v }),
  lineH: v => applyPara(p => { if (v) p.style.lineHeight = String(v); else p.style.removeProperty('line-height') }),
  before: v => applyPara(p => { p.style.marginTop = v + 'pt' }),
  after: v => applyPara(p => { p.style.marginBottom = v + 'pt' }),
  bullets: (kind, opts) => applyPara(p => applyBullet(p, kind, opts)),
  level: d => applyPara(p => changeLevel(p, d))
}

// Aggregated formatting state of the live selection (null = mixed)
export function liveState () {
  const a = activeEditor()
  if (!a) return null
  const sel = window.getSelection()
  let range = sel.rangeCount && a.el.contains(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0) : lastRange
  if (!range || !a.el.contains(range.commonAncestorContainer)) return null
  const root = a.el
  let targets = []
  if (range.collapsed) targets = [range.startContainer]
  else {
    const rootN = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer
    if (range.commonAncestorContainer.nodeType === 3) targets.push(range.commonAncestorContainer)
    const tw = document.createTreeWalker(rootN, NodeFilter.SHOW_TEXT)
    while (tw.nextNode()) { const n = tw.currentNode; if (n.nodeValue.trim() && range.intersectsNode(n)) targets.push(n) }
    if (!targets.length) targets = [range.startContainer]
  }
  const styles = targets.slice(0, 400).map(n => effectiveStyle(n, root, a.base))
  const pick = k => { const v = styles[0][k]; return styles.every(s => s[k] === v) ? v : null }
  const p = paraOf(range.startContainer.nodeType === 3 ? range.startContainer : (range.startContainer.childNodes[range.startOffset] || range.startContainer), root) || root.querySelector('p')
  const ps = [...root.children].filter(x => x.tagName === 'P' && range.intersectsNode(x))
  const pp = f => { const v = ps.length ? f(ps[0]) : null; return ps.every(x => f(x) === v) ? v : null }
  return {
    bold: pick('bold'), italic: pick('italic'), underline: pick('underline'), strike: pick('strike'), baseline: pick('baseline'),
    size: pick('size'), font: pick('font'), color: pick('color'), highlight: pick('highlight'),
    align: pp(x => x.style.textAlign || a.base.align || 'left'), lineH: pp(x => x.style.lineHeight ? parseFloat(x.style.lineHeight) : null),
    bullets: ps.length && ps.every(x => x.hasAttribute('data-bu')) ? 'bu' : ps.length && ps.every(x => x.hasAttribute('data-num')) ? 'num' : null,
    num: pp(x => x.getAttribute('data-num')), lvl: pp(x => +(x.getAttribute('data-lvl') || 0)),
    para: p
  }
}

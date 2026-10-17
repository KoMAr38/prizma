// In-place rich text editor (contenteditable) for text boxes, shapes and table cells.
import { useLayoutEffect, useRef } from 'preact/hooks'
import { PX, DEFAULT_INSET, round2, findEl, rotatePt, removeEls } from '../core/model.js'
import { normalize, isEmptyHtml, sanitize, searchRe, numberStarts, plainNumbers } from '../core/html.js'
import { textRect } from '../core/shapes.js'
import {
  slide, slideIdx, editing, editCell, editorReq, fmtTick, update, updateEl, setEditHooks, select, finishEditing, settings
} from '../core/store.js'
import { setActiveEditor, activeEditor, ensureParas, paraOps } from './richEdit.js'
import { tableCellLook } from '../render/tableStyles.js'


const raf = fn => { let id = 0; return () => { if (!id) id = requestAnimationFrame(() => { id = 0; fn() }) } }

// Range of the first occurrence of `q` inside the editor (used by Find)
// The k-th match of the Find box's search in the editor (opts: matchCase, wholeWord, k)
function findRange (d, q, opts = {}) {
  const nodes = []
  const tw = document.createTreeWalker(d, NodeFilter.SHOW_TEXT)
  let text = ''
  while (tw.nextNode()) { nodes.push([tw.currentNode, text.length]); text += tw.currentNode.nodeValue.replace(/ /g, ' ') }
  const m = q ? [...text.matchAll(searchRe(q, opts))][opts.k || 0] : null
  if (!m) return null
  const i = m.index
  const at = pos => { for (let k = nodes.length - 1; k >= 0; k--) if (nodes[k][1] <= pos) return [nodes[k][0], pos - nodes[k][1]]; return null }
  const a = at(i), b = at(i + m[0].length)
  if (!a || !b) return null
  const r = document.createRange()
  r.setStart(a[0], Math.min(a[1], a[0].length)); r.setEnd(b[0], Math.min(b[1], b[0].length))
  return r
}
function placeCaret (d, req) {
  const sel = window.getSelection()
  let r = null
  if (req && req.find) r = findRange(d, req.find, req)
  if (!r && req && req.x !== undefined) {
    const cr = document.caretRangeFromPoint(req.x, req.y)
    if (cr && d.contains(cr.startContainer)) r = cr
  }
  if (!r) {
    r = document.createRange()
    if (req && req.mode === 'all') r.selectNodeContents(d)
    else {
      const ps = d.querySelectorAll('p')
      const last = ps[ps.length - 1] || d
      const br = last.lastChild && last.lastChild.nodeName === 'BR' ? last.lastChild : null
      if (br) r.setStartBefore(br)
      else { r.selectNodeContents(last); r.collapse(false) }
      r.collapse(true)
    }
  }
  sel.removeAllRanges(); sel.addRange(r)
}

// Size changes needed so the element fits its text ("resize shape to fit" / "shrink text on overflow")
// offsetWidth/offsetHeight ignore the canvas transform and the element's own CSS zoom, so: pt = px / PX * zoom
export function fitPatch (d, el) {
  const ins = el.inset || DEFAULT_INSET
  const tr = el.type === 'shape' ? textRect(el) : { l: 0, t: 0, r: 0, b: 0 }
  const out = {}
  if (el.autofit === 'shape') {
    const z0 = parseFloat(d.style.zoom) || 1
    const hpt = d.offsetHeight / PX * z0
    const availH = el.h - tr.t - tr.b - ins.t - ins.b
    const delta = hpt - availH
    if (Math.abs(delta) > 0.75 && !(delta < 0 && el.h + delta < 12)) {
      const nh = round2(el.h + delta)
      out.h = nh
      if (el.vAlign === 'middle') out.y = round2(el.y - delta / 2)
      else if (el.vAlign === 'bottom') out.y = round2(el.y - delta)
    }
    if (el.wrap === false) {
      const prev = d.style.width
      d.style.width = 'max-content'
      const wpt = d.offsetWidth / PX * z0
      d.style.width = prev
      const availW = el.w - tr.l - tr.r - ins.l - ins.r
      const dw = wpt + 1 - availW
      if (Math.abs(dw) > 0.75) {
        out.w = round2(Math.max(12, el.w + dw))
        const al = el.ts?.align
        if (al === 'center') out.x = round2(el.x - dw / 2)
        else if (al === 'right') out.x = round2(el.x - dw)
      }
    }
  } else if (el.autofit === 'shrink') {
    const avail = el.h - tr.t - tr.b - ins.t - ins.b
    const meas = s => { d.style.zoom = s; return d.offsetHeight / PX * s }
    let s = 1
    if (meas(1) > avail + 0.5) {
      let lo = 0.25, hi = 1
      for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (meas(mid) <= avail + 0.5) lo = mid; else hi = mid }
      s = Math.max(0.25, Math.floor(lo * 40) / 40)
    }
    d.style.zoom = s < 1 ? String(s) : ''
    const cur = el.fontScale || 1
    if (Math.abs(cur - s) > 0.001) out.fontScale = s < 1 ? s : 1
  }
  // a rotated box turns around its centre, so when it grows the centre goes where the rotation puts it: the edge that
  // should stay put then stays put on screen too
  if (el.rot && (out.h !== undefined || out.w !== undefined)) {
    const n = { x: out.x ?? el.x, y: out.y ?? el.y, w: out.w ?? el.w, h: out.h ?? el.h }
    const c = rotatePt({ x: n.x + n.w / 2, y: n.y + n.h / 2 }, { x: el.x + el.w / 2, y: el.y + el.h / 2 }, el.rot)
    out.x = round2(c.x - n.w / 2); out.y = round2(c.y - n.h / 2)
  }
  return Object.keys(out).length ? out : null
}

// ---------- element text editor ----------
export function TextEditor ({ el, rtStyle }) {
  const ref = useRef(null)
  const elRef = useRef(el)
  elRef.current = el
  useLayoutEffect(() => {
    const d = ref.current
    const id = el.id
    d.innerHTML = numberStarts(el.html) || '<p><br></p>'
    ensureParas(d)
    let last = plainNumbers(d.innerHTML)
    const commit = () => {
      if (!d.isConnected || editing.value !== id) return
      const cur = elRef.current
      const html = plainNumbers(d.innerHTML)
      const fit = fitPatch(d, cur)
      if (html === last && !fit) return
      // a fit alone (the box growing to its text, also right after a click with the Text box tool) joins the last step
      const typed = html !== last
      last = html
      updateEl(id, e => { e.html = html; if (fit) Object.assign(e, fit) }, typed ? { coalesce: 'edit:' + id } : { merge: true })
    }
    const commitSoon = raf(commit)
    const api = { el: d, get base () { return elRef.current.ts || {} }, commit: () => { commit(); fmtTick.value++ } }
    setActiveEditor(api)
    try { document.execCommand('defaultParagraphSeparator', false, 'p') } catch {}
    d.focus({ preventScroll: true })
    placeCaret(d, editorReq.value)
    editorReq.value = null
    const onInput = () => { ensureParasLight(d); commitSoon() }
    const onSel = raf(() => { fmtTick.value++ })
    d.addEventListener('input', onInput)
    document.addEventListener('selectionchange', onSel)
    d._pzCommit = commit
    return () => {
      d.removeEventListener('input', onInput)
      document.removeEventListener('selectionchange', onSel)
      if (activeEditor()?.el === d) setActiveEditor(null)
    }
  }, [])
  const onKeyDown = e => {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation()
      const id = el.id
      finishEditing()
      select(slide.value && findEl(slide.value, id) ? [id] : [])
      return
    }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      const sel = window.getSelection()
      const r = sel.rangeCount ? sel.getRangeAt(0) : null
      const p = r && (r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer).closest?.('p')
      const multi = r && !r.collapsed && [...ref.current.children].filter(x => r.intersectsNode(x)).length > 1
      const atStart = r && r.collapsed && p && caretAtStart(p, r)
      if (multi || atStart || (p && (p.hasAttribute('data-bu') || p.hasAttribute('data-num')) && r.collapsed && caretAtStart(p, r))) paraOps.level(e.shiftKey ? -1 : 1)
      else document.execCommand('insertText', false, '\t')
    }
  }
  const onPaste = e => handlePaste(e)
  return <div ref={ref} class="pz-rt pz-editing" contentEditable="true" spellcheck={settings.value.spellcheck !== false} style={rtStyle} onKeyDown={onKeyDown} onPaste={onPaste} data-editor="1" />
}

function caretAtStart (p, r) {
  const pre = document.createRange()
  pre.selectNodeContents(p)
  pre.setEnd(r.startContainer, r.startOffset)
  return !pre.toString().replace(/​/g, '').length
}
// Cheap fix-up during typing: Chromium may create a bare text node when everything was deleted
function ensureParasLight (d) {
  if (!d.firstChild || [...d.childNodes].some(n => n.nodeType === 3 ? n.nodeValue.length : n.tagName !== 'P')) {
    const sel = window.getSelection()
    const r = sel.rangeCount ? sel.getRangeAt(0) : null
    const anchor = r ? r.startContainer : null
    const off = r ? r.startOffset : 0
    ensureParas(d)
    if (anchor && anchor.isConnected) { const nr = document.createRange(); nr.setStart(anchor, Math.min(off, anchor.nodeType === 3 ? anchor.length : anchor.childNodes.length)); nr.collapse(true); sel.removeAllRanges(); sel.addRange(nr) }
  }
}

function cleanPastedHtml (html) {
  const n = normalize(html)
  const t = document.createElement('template')
  t.innerHTML = n
  const keep = ['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'vertical-align']
  for (const x of t.content.querySelectorAll('*')) {
    if (x.tagName === 'P') {
      const ml = /mso-list:\s*l\d+\s+level(\d)/i.exec(x.getAttribute('style') || '')
      if (ml) {
        // a list pasted from Word: its bullet or number is typed text in a span Word marks mso-list:Ignore
        const ig = [...x.querySelectorAll('span')].find(sp => /mso-list:\s*ignore/i.test(sp.getAttribute('style') || ''))
        const mark = (ig?.textContent || '').trim()
        ig?.remove()
        x.setAttribute(/^\d+[.)]$/.test(mark) ? 'data-num' : 'data-bu', /^\d+[.)]$/.test(mark) ? 'arabicPeriod' : '•')
        x.setAttribute('data-lvl', String(ml[1] - 1))
      }
      const lvl = x.getAttribute('data-lvl'); const bu = x.getAttribute('data-bu'); const num = x.getAttribute('data-num')
      x.removeAttribute('style')
      if (bu || num) { x.style.marginLeft = (27 + (+lvl || 0) * 36) + 'pt'; x.style.textIndent = '-27pt' }
      continue
    }
    if (!x.style) continue
    const saved = keep.map(k => [k, x.style.getPropertyValue(k)]).filter(([, v]) => v)
    x.removeAttribute('style')
    for (const [k, v] of saved) x.style.setProperty(k, v)
  }
  return t.innerHTML
}
async function handlePaste (e) {
  const dt = e.clipboardData
  const files = [...(dt?.files || [])].filter(f => f.type.startsWith('image/'))
  if (files.length) {
    e.preventDefault()
    const { insertImageBytes, loadPicture, cantShowPicture } = await import('../core/actions.js')
    for (const f of files) {
      const pic = await loadPicture(new Uint8Array(await f.arrayBuffer()), f.type)
      if (pic) insertImageBytes(pic.bytes, pic.mime, pic.w, pic.h)
      else cantShowPicture(f.name)
    }
    return
  }
  e.preventDefault()
  const html = dt?.getData('text/html')
  const text = dt?.getData('text/plain') || ''
  // a table (Excel, a web page) goes in as its tab-separated text, one row per line, not run-together cell text
  if (html && !/x-prizma/.test(html) && !/<t[rdh][\s>]/i.test(html)) {
    const clean = cleanPastedHtml(html)
    const t = document.createElement('template'); t.innerHTML = clean
    const ps = [...t.content.children]
    if (ps.length === 1) document.execCommand('insertHTML', false, ps[0].innerHTML)
    else document.execCommand('insertHTML', false, clean)
  } else {
    document.execCommand('insertText', false, text.replace(/\r\n/g, '\n'))
  }
}

// Moves the caret of the active editor to a screen point (clicks inside the box but outside the text)
export function caretAt (x, y) {
  const a = activeEditor()
  if (!a) return
  const cr = document.caretRangeFromPoint(x, y)
  const sel = window.getSelection()
  if (cr && a.el.contains(cr.startContainer)) { sel.removeAllRanges(); sel.addRange(cr); return }
  placeCaret(a.el, { mode: 'end' })
}

// ---------- finishing an edit ----------
// Normalises the edited html, and removes text boxes that were left empty (as PowerPoint does).
export function finishText () {
  const id = editing.value
  if (!id) return
  const a = activeEditor()
  const d = a?.el
  const s = slide.value
  const hit = s && findEl(s, id)
  if (!hit) return
  const el = hit.el
  let html = d ? d.innerHTML : el.html
  if (d && d._pzCommit) d._pzCommit()
  html = normalize(html)
  if (isEmptyHtml(html) && !el.ph && el.type === 'text' && !(el.fill && el.fill.type !== 'none') && !(el.line && el.line.width)) {
    const i = slideIdx.value
    update(dd => { removeEls(dd.slides[i], [id]) }, { merge: true })
    return
  }
  if (html !== el.html) updateEl(id, e => { e.html = html }, { merge: true })
}

// ---------- table cell editor ----------
export function CellEditor ({ table, r, c }) {
  const ref = useRef(null)
  const tRef = useRef(table)
  tRef.current = table
  useLayoutEffect(() => {
    const d = ref.current
    const id = table.id
    const cell = table.cells[r]?.[c] || { html: '' }
    d.innerHTML = cell.html && cell.html.trim() ? numberStarts(cell.html) : '<p><br></p>'
    ensureParas(d)
    let last = plainNumbers(d.innerHTML)
    const commit = () => {
      if (!d.isConnected) return
      const ec = editCell.value
      if (!ec || ec.id !== id || ec.r !== r || ec.c !== c) return
      const html = plainNumbers(d.innerHTML)
      if (html === last) return
      last = html
      updateEl(id, t => { if (t.cells[r] && t.cells[r][c]) t.cells[r][c].html = html }, { coalesce: 'cell:' + id + ':' + r + ':' + c })
      requestAnimationFrame(() => growRows(id, d))
    }
    const commitSoon = raf(commit)
    const look = tableCellLook(table, r, c)
    const api = { el: d, get base () { const t = tRef.current; const cl = t.cells[r]?.[c] || {}; return { ...(t.ts || {}), color: cl.color || look.color || t.ts?.color, bold: cl.bold || look.bold } }, commit: () => { commit(); fmtTick.value++ } }
    setActiveEditor(api)
    d.focus({ preventScroll: true })
    placeCaret(d, editorReq.value || { mode: 'end' })
    editorReq.value = null
    const onInput = () => { ensureParasLight(d); commitSoon() }
    const onSel = raf(() => { fmtTick.value++ })
    d.addEventListener('input', onInput)
    document.addEventListener('selectionchange', onSel)
    d._pzCommit = commit
    return () => {
      d.removeEventListener('input', onInput)
      document.removeEventListener('selectionchange', onSel)
      if (activeEditor()?.el === d) setActiveEditor(null)
    }
  }, [])
  const onKeyDown = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const id = table.id; finishEditing(); select([id]); return }
    if (e.key === 'Tab') {
      e.preventDefault()
      const t = tRef.current
      const cells = []
      t.cells.forEach((row, ri) => row.forEach((cl, ci) => { if (cl && !cl.merged) cells.push([ri, ci]) }))
      const i = cells.findIndex(([ri, ci]) => ri === r && ci === c)
      let j = i + (e.shiftKey ? -1 : 1)
      finishCell()
      if (j >= cells.length && !e.shiftKey) {
        // Tab in the last cell adds a row, as in PowerPoint
        const rows = t.rows.length
        updateEl(t.id, tt => { tt.cells.push(tt.cols.map(() => ({ html: '<p><br></p>' }))); tt.rows.push(tt.rows[rows - 1] || 30); tt.h += tt.rows[rows - 1] || 30 })
        editorReq.value = { mode: 'end' }
        editCell.value = { id: t.id, r: rows, c: 0 }
        return
      }
      j = Math.max(0, Math.min(cells.length - 1, j))
      editorReq.value = { mode: 'all' }
      editCell.value = { id: t.id, r: cells[j][0], c: cells[j][1] }
    }
  }
  return <div ref={ref} class="pz-rt pz-editing" contentEditable="true" spellcheck={settings.value.spellcheck !== false} onKeyDown={onKeyDown} onPaste={handlePaste} data-editor="1" />
}
function growRows (id, d) {
  const td = d.closest('td')
  const table = d.closest('table')
  if (!td || !table) return
  const s = slide.value
  const t = s && findEl(s, id)?.el
  if (!t) return
  const trs = [...table.rows]
  const hs = trs.map(tr => tr.offsetHeight / PX)
  let changed = false
  const rows = t.rows.map((h, i) => { const m = hs[i] || h; if (m > h + 0.75) { changed = true; return round2(m) } return h })
  if (changed) updateEl(id, tt => { tt.rows = rows; tt.h = round2(rows.reduce((a, b) => a + b, 0)) }, { merge: true })
}
export function finishCell () {
  const ec = editCell.value
  if (!ec) return
  const a = activeEditor()
  const d = a?.el
  if (d && d._pzCommit) d._pzCommit()
  const s = slide.value
  const t = s && findEl(s, ec.id)?.el
  if (!t || !t.cells[ec.r]?.[ec.c]) return
  const html = normalize(d ? d.innerHTML : t.cells[ec.r][ec.c].html)
  if (html !== t.cells[ec.r][ec.c].html) updateEl(ec.id, tt => { tt.cells[ec.r][ec.c].html = html }, { merge: true })
}

setEditHooks({ finish: finishText, finishCell })
export { sanitize }

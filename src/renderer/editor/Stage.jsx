// The editing canvas: renders the current slide and handles selection, moving, resizing, rotating,
// smart guides, marquee selection, drawing tools, cropping, ink, text editing and file drops.
import { useRef, useState, useEffect, useLayoutEffect } from 'preact/hooks'
import { batch } from '@preact/signals'
import {
  doc, slide, slideIdx, selection, editing, editCell, live, guides, zoom, fitZoom, stageZoom, tool, cropMode, painter, showGrid, showGuides, snapGrid,
  focusArea, editorReq, ribbonTab, select, update, updateEl, updateEls, toast, selected, finishEditing, openDialog, settings, showRuler
} from '../core/store.js'
import { Rulers } from './Rulers.jsx'
import { PX, findEl, parentFrame, parentGroups, refitGroup, onSlide, bounds, unionBounds, rotatePt, lineEnds, boxFromPoints, round2, screenCrop } from '../core/model.js'
import { SlideView } from '../render/SlideView.jsx'
import { TextEditor, CellEditor } from './TextEditor.jsx'
import * as A from '../core/actions.js'
import { contextMenu } from '../ui/popover.jsx'
import { Icon } from '../ui/Icon.jsx'
import { mimeOf, runCmd, cmdEnabled } from '../app/commands.js'
import { openPath, extOf, OPEN_EXT } from '../app/files.js'
import { LAYOUTS } from '../core/themes.js'
import { mediaUrl } from '../core/store.js'
import { caretAt } from './TextEditor.jsx'

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HPOS = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] }
const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] // by angle
const handleCursor = (h, rot) => {
  const base = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 }[h]
  const a = ((base + (rot || 0)) % 180 + 180) % 180
  return CURSORS[Math.round(a / 45) % 4]
}
export const GRID = 72 / 2.54 * 0.5 // 0.5 cm
export const guidePos = { x: null, y: null } // movable drawing guides (null = slide centre)

// a move on the slide, in the frame of the group an element sits in
const turnBack = (d, rot) => rotatePt(d, { x: 0, y: 0 }, -rot)
function idChain (target, frame) {
  const chain = []
  for (let n = target; n && n !== frame; n = n.parentNode) {
    if (n.classList && n.classList.contains('pz-master')) return []
    if (n.dataset && n.dataset.id && n.classList.contains('pz-el')) chain.unshift(n.dataset.id)
  }
  return chain
}

export function Stage () {
  const d = doc.value
  const s = slide.value
  const stageRef = useRef(null)
  const frameRef = useRef(null)
  const drag = useRef(null)
  const groupCtx = useRef(null)
  const zoomAnchor = useRef(null)
  const [size, setSize] = useState({ w: 800, h: 500 })
  const [ink, setInk] = useState(null) // live ink stroke points
  const [marq, setMarq] = useState(null)
  const [preview, setPreview] = useState(null) // creation preview { kind, box | p1/p2 }
  const [dropHint, setDropHint] = useState(false)

  useLayoutEffect(() => {
    const el = stageRef.current
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  // Esc in the middle of a drag puts things back where they were, as in PowerPoint
  useEffect(() => {
    const key = e => { if (e.key === 'Escape' && cancelDrag()) { e.preventDefault(); e.stopPropagation() } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  const W = d ? d.size.w : 960, H = d ? d.size.h : 540
  const pad = 36
  const fz = Math.max(0.05, Math.min((size.w - pad * 2) / (W * PX), (size.h - pad * 2) / (H * PX)))
  const z = zoom.value || fz
  const k = z * PX
  const cw = Math.max(size.w, W * k + pad * 2), ch = Math.max(size.h, H * k + pad * 2)
  const fx = Math.round((cw - W * k) / 2), fy = Math.round((ch - H * k) / 2)
  useLayoutEffect(() => {
    if (Math.abs(fitZoom.value - fz) > 0.0005) fitZoom.value = fz
    if (Math.abs(stageZoom.value - z) > 0.0001) stageZoom.value = z
    // keep the point under the mouse fixed while zooming with Ctrl+wheel
    const a = zoomAnchor.current
    if (!a) return
    zoomAnchor.current = null
    const st = stageRef.current
    st.scrollLeft = fx + a.px * k - a.cx
    st.scrollTop = fy + a.py * k - a.cy
  }, [z, fz])
  if (!d || !s) return <div class="stage" ref={stageRef} />

  const toPt = e => {
    const r = frameRef.current.getBoundingClientRect()
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }
  }
  const sel = selection.value
  const selEls = sel.map(id => findEl(s, id)?.el).filter(Boolean)

  // ---------- snapping ----------
  const snapLines = exclude => {
    // smart guides (Options › Editing) snap to the slide and to other objects; drawing guides always snap
    const smart = settings.value.smartGuides !== false
    const xs = smart ? [0, W / 2, W] : [], ys = smart ? [0, H / 2, H] : []
    if (showGuides.value) { xs.push(guidePos.x ?? W / 2); ys.push(guidePos.y ?? H / 2) }
    if (smart) for (const e of s.elements) {
      if (exclude.has(e.id) || e.hidden) continue
      const b = bounds(e)
      xs.push(b.x, b.x + b.w / 2, b.x + b.w)
      ys.push(b.y, b.y + b.h / 2, b.y + b.h)
    }
    return { xs, ys }
  }
  const snapBox = (b, lines, alt) => {
    if (alt) return { dx: 0, dy: 0, g: [] }
    const th = 6 / k
    let best = { dx: Infinity, x: null }, bestY = { dy: Infinity, y: null }
    for (const cx of [b.x, b.x + b.w / 2, b.x + b.w]) for (const lx of lines.xs) { const dd = lx - cx; if (Math.abs(dd) < th && Math.abs(dd) < Math.abs(best.dx)) best = { dx: dd, x: lx } }
    for (const cy of [b.y, b.y + b.h / 2, b.y + b.h]) for (const ly of lines.ys) { const dd = ly - cy; if (Math.abs(dd) < th && Math.abs(dd) < Math.abs(bestY.dy)) bestY = { dy: dd, y: ly } }
    let dx = best.x !== null ? best.dx : 0, dy = bestY.y !== null ? bestY.dy : 0
    if (snapGrid.value) {
      if (best.x === null) dx = Math.round(b.x / GRID) * GRID - b.x
      if (bestY.y === null) dy = Math.round(b.y / GRID) * GRID - b.y
    }
    const g = []
    if (best.x !== null) g.push({ x: best.x })
    if (bestY.y !== null) g.push({ y: bestY.y })
    return { dx, dy, g }
  }

  // ---------- pointer handling ----------
  const onPointerDown = e => {
    if (e.button === 1) { startPan(e); return }
    if (e.button !== 0 && e.button !== 2) return
    focusArea.value = 'canvas'
    const target = e.target
    if (target.closest('[data-editor]')) return // caret placement inside the text editor
    if (target.closest('video[controls], audio[controls]')) return // media preview controls
    const p = toPt(e)
    const t = tool.value
    stageRef.current.focus({ preventScroll: true }) // before a right click selects: a field typed in commits on blur, to its own object
    if (e.button === 2) {
      // right click selects what is under the pointer, the menu opens on contextmenu
      const chain = idChain(target, frameRef.current)
      if (chain.length && !chain.some(id => sel.includes(id))) { finishEditing(); select([chain[0]]) }
      return
    }
    // drawing tools
    if (t) {
      e.preventDefault()
      if (t.kind === 'pen' || t.kind === 'highlighter') { drag.current = { mode: 'ink', pts: [p] }; setInk([p]); capture(e); return }
      if (t.kind === 'eraser') { drag.current = { mode: 'erase' }; eraseAt(e); capture(e); return }
      finishEditing()
      drag.current = { mode: 'create', kind: t.kind, shape: t.shape, line: t.line, start: p, cur: p }
      setPreview({ kind: t.kind, shape: t.shape, line: t.line, start: p, cur: p })
      capture(e)
      return
    }
    const hEl = target.closest('[data-h]')
    if (hEl) { e.preventDefault(); startHandle(e, hEl.dataset.h, hEl.dataset.for, p); return }
    const chain = idChain(target, frameRef.current)
    if (!chain.length) {
      // empty canvas: marquee
      if (cropMode.value) { cropMode.value = null }
      finishEditing()
      if (!e.shiftKey && !e.ctrlKey) select([])
      groupCtx.current = null
      drag.current = { mode: 'marquee', start: p, add: e.shiftKey || e.ctrlKey ? [...sel] : [] }
      capture(e)
      return
    }
    e.preventDefault()
    // which element in the chain: enter groups on a second click
    let id = chain[0]
    const gi = groupCtx.current ? chain.indexOf(groupCtx.current) : -1
    if (gi >= 0 && chain[gi + 1]) id = chain[gi + 1]
    else if (sel.includes(chain[0]) && chain.length > 1 && findEl(s, chain[0])?.el.type === 'group' && sel.length === 1) { id = chain[1]; groupCtx.current = chain[0] } else if (gi < 0) groupCtx.current = null
    if (painter.value) { A.applyFormat(id); return }
    const wasSelected = sel.includes(id)
    const el = findEl(s, id)?.el
    const ids = wasSelected ? sel : e.shiftKey || e.ctrlKey ? A.addToSelection(sel, id) : [id]
    if (e.shiftKey || e.ctrlKey) {
      if (wasSelected && !e.ctrlKey) { select(sel.filter(x => x !== id)); return }
      if (!wasSelected) select(ids)
    } else if (!wasSelected) {
      finishEditing()
      select([id])
    }
    if (editing.value && editing.value !== id) finishEditing()
    const orig = {}
    for (const x of ids) { const h = findEl(s, x); if (h) orig[x] = { x: h.el.x, y: h.el.y, rot: parentFrame(s, x).rot } }
    const box = unionBounds(ids.map(x => { const h = findEl(s, x); return h ? onSlide(s, h.el) : null }).filter(Boolean))
    drag.current = { mode: 'move', ids, orig, start: p, sx: e.clientX, sy: e.clientY, box, moved: false, el, wasSelected, clickId: id, client: { x: e.clientX, y: e.clientY }, lines: snapLines(new Set(ids)) }
    capture(e)
  }
  const capture = e => { try { stageRef.current.setPointerCapture(e.pointerId) } catch {} }
  // drops the drag in progress without committing it (Esc, or the pointer taken away by the system)
  const cancelDrag = () => {
    if (!drag.current) return false
    drag.current = null
    batch(() => { live.value = null; guides.value = [] })
    setPreview(null); setMarq(null); setInk(null)
    return true
  }

  const startHandle = (e, h, forId, p) => {
    if (h.startsWith('crop')) { startCrop(e, h, p); return }
    if (h === 'p0' || h === 'p1') {
      const el = findEl(s, forId)?.el
      if (!el) return
      const ends = lineEnds(onSlide(s, el))
      drag.current = { mode: 'lineEnd', id: forId, end: h === 'p0' ? 0 : 1, ends, el, f: parentFrame(s, forId) }
      capture(e); return
    }
    const ids = selection.value
    // abs: the box as it shows on the slide; f takes the result back into the element's group
    const els = ids.map(id => { const hh = findEl(s, id); return hh ? { id, el: hh.el, abs: onSlide(s, hh.el), f: parentFrame(s, id) } : null }).filter(Boolean)
    if (!els.length) return
    finishEditing()
    if (h === 'rot') {
      const ub = els.length === 1 ? els[0].abs : unionBounds(els.map(x => x.abs))
      const c = { x: ub.x + ub.w / 2, y: ub.y + ub.h / 2 }
      drag.current = { mode: 'rotate', els, c, a0: Math.atan2(p.y - c.y, p.x - c.x) }
      capture(e); return
    }
    drag.current = { mode: 'resize', h, els, single: els.length === 1, ub: unionBounds(els.map(x => x.abs)), start: p }
    capture(e)
  }
  // Cropping works in the picture's own frame: slide coordinates turned back by the picture's rotation (its groups'
  // too) around its centre c0 on the slide, with its crop sides as seen on screen
  const startCrop = (e, h, p) => {
    const id = cropMode.value
    const el = findEl(s, id)?.el
    if (!el) return
    const { x: x0, y: y0, rot } = onSlide(s, el), c0 = { x: x0 + el.w / 2, y: y0 + el.h / 2 }
    const c = screenCrop(el.crop, el)
    const FW = el.w / Math.max(0.01, 1 - c.l - c.r), FH = el.h / Math.max(0.01, 1 - c.t - c.b)
    drag.current = { mode: 'crop', h, id, el, f: parentFrame(s, id), x0, y0, rot, c0, FW, FH, FX: x0 - c.l * FW, FY: y0 - c.t * FH, start: rotatePt(p, c0, -rot) }
    capture(e)
  }
  const startPan = e => {
    e.preventDefault()
    const st = stageRef.current
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, l: st.scrollLeft, t: st.scrollTop }
    capture(e)
  }
  const eraseAt = e => {
    const hits = document.elementsFromPoint(e.clientX, e.clientY)
    for (const n of hits) {
      const host = n.closest && n.closest('.pz-ink')
      if (host && frameRef.current.contains(host)) {
        const id = host.dataset.id
        update(dd => { const sl = dd.slides[slideIdx.value]; sl.elements = sl.elements.filter(x => x.id !== id) }, { coalesce: 'erase' })
        return
      }
    }
  }

  const onPointerMove = e => {
    const g = drag.current
    if (!g) { hover(e); return }
    const p = toPt(e)
    if (g.mode === 'pan') { const st = stageRef.current; st.scrollLeft = g.l - (e.clientX - g.sx); st.scrollTop = g.t - (e.clientY - g.sy); return }
    if (g.mode === 'ink') { g.pts.push(p); setInk([...g.pts]); return }
    if (g.mode === 'erase') { eraseAt(e); return }
    if (g.mode === 'create') { g.cur = p; setPreview({ ...preview, kind: g.kind, shape: g.shape, line: g.line, start: g.start, cur: p, shift: e.shiftKey }); return }
    if (g.mode === 'marquee') { setMarq({ x: Math.min(g.start.x, p.x), y: Math.min(g.start.y, p.y), w: Math.abs(p.x - g.start.x), h: Math.abs(p.y - g.start.y) }); return }
    if (g.mode === 'move') {
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return
      if (editing.value && g.ids.includes(editing.value) && !g.moved) {
        // dragging inside a text being edited selects text, never moves the box
        return
      }
      if (!g.moved) { g.moved = true; if (editing.value) finishEditing() }
      let dx = p.x - g.start.x, dy = p.y - g.start.y
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
      const b = { x: g.box.x + dx, y: g.box.y + dy, w: g.box.w, h: g.box.h }
      const sn = snapBox(b, g.lines, e.altKey)
      dx += sn.dx; dy += sn.dy
      const map = {}
      for (const id of g.ids) { const o = g.orig[id]; if (o) { const d = turnBack({ x: dx, y: dy }, o.rot); map[id] = { x: o.x + d.x, y: o.y + d.y } } }
      g.dx = dx; g.dy = dy; g.dup = e.ctrlKey
      batch(() => { live.value = map; guides.value = sn.g })
      return
    }
    if (g.mode === 'resize') { doResize(g, p, e); return }
    if (g.mode === 'rotate') {
      let da = (Math.atan2(p.y - g.c.y, p.x - g.c.x) - g.a0) * 180 / Math.PI
      const map = {}
      for (const x of g.els) {
        let r = (x.el.rot || 0) + da
        if (e.shiftKey) r = Math.round(r / 15) * 15
        const dr = r - (x.el.rot || 0)
        let pos = { x: x.el.x, y: x.el.y }
        if (g.els.length > 1) {
          const nc = x.f.fromSlide(rotatePt({ x: x.abs.x + x.abs.w / 2, y: x.abs.y + x.abs.h / 2 }, g.c, dr))
          pos = { x: nc.x - x.el.w / 2, y: nc.y - x.el.h / 2 }
        }
        map[x.id] = { ...pos, rot: ((r % 360) + 360) % 360 }
      }
      g.map = map
      live.value = map
      return
    }
    if (g.mode === 'lineEnd') {
      const ends = [...g.ends]
      let q = p
      const other = ends[1 - g.end]
      if (e.shiftKey) {
        const ang = Math.atan2(q.y - other.y, q.x - other.x)
        const sa = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4)
        const len = Math.hypot(q.x - other.x, q.y - other.y)
        q = { x: other.x + Math.cos(sa) * len, y: other.y + Math.sin(sa) * len }
      } else if (!e.altKey) {
        // snap the end to other objects' connection points (edges' midpoints and corners)
        const th = 8 / k
        for (const o of s.elements) {
          if (o.id === g.id) continue
          const b = bounds(o)
          for (const [px, py] of [[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h / 2], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h / 2]]) if (Math.hypot(px - q.x, py - q.y) < th) q = { x: px, y: py }
        }
      }
      ends[g.end] = q
      g.patch = { ...boxFromPoints(g.f.fromSlide(ends[0]), g.f.fromSlide(ends[1])), rot: 0 }
      live.value = { [g.id]: g.patch }
      return
    }
    if (g.mode === 'crop') { doCrop(g, p); return }
  }
  const hover = e => {
    const st = stageRef.current
    if (!st) return
    const t = tool.value
    st.style.cursor = t ? (t.kind === 'eraser' ? 'cell' : t.kind === 'pen' || t.kind === 'highlighter' ? 'crosshair' : t.kind === 'text' ? 'text' : 'crosshair') : painter.value ? 'copy' : ''
  }

  const doResize = (g, p, e) => {
    const h = g.h
    const map = {}
    if (g.single) {
      const { el, abs, f } = g.els[0]
      const rot = abs.rot || 0
      const c = { x: abs.x + abs.w / 2, y: abs.y + abs.h / 2 }
      // edges follow the pointer's movement, not its position, so grabbing a handle off-centre doesn't jump
      const lp = rotatePt(p, c, -rot), lp0 = rotatePt(g.start, c, -rot)
      const lx = lp.x - c.x + (h.includes('e') ? abs.w / 2 : h.includes('w') ? -abs.w / 2 : 0) - (lp0.x - c.x)
      const ly = lp.y - c.y + (h.includes('s') ? abs.h / 2 : h.includes('n') ? -abs.h / 2 : 0) - (lp0.y - c.y)
      let l = -abs.w / 2, r = abs.w / 2, t = -abs.h / 2, b = abs.h / 2
      const fromCenter = e.ctrlKey
      if (h.includes('e')) { r = lx; if (fromCenter) l = -lx }
      if (h.includes('w')) { l = lx; if (fromCenter) r = -lx }
      if (h.includes('s')) { b = ly; if (fromCenter) t = -ly }
      if (h.includes('n')) { t = ly; if (fromCenter) b = -ly }
      const lockAspect = e.shiftKey || (h.length === 2 && (el.type === 'image' || el.type === 'icon' || el.type === 'video' || el.lockAspect))
      if (lockAspect && abs.w > 0 && abs.h > 0) {
        const ar = abs.w / abs.h
        if (h.length === 2) {
          const nw = Math.abs(r - l), nh = Math.abs(b - t)
          if (nw / ar > nh) { const th = nw / ar; if (h.includes('s')) b = t + th * Math.sign(b - t || 1); else t = b - th * Math.sign(b - t || 1) } else { const tw = nh * ar; if (h.includes('e')) r = l + tw * Math.sign(r - l || 1); else l = r - tw * Math.sign(r - l || 1) }
          if (fromCenter) { const cxw = (r - l) / 2, cyh = (b - t) / 2; l = -cxw; r = cxw; t = -cyh; b = cyh }
        } else if (h === 'e' || h === 'w') { const th = Math.abs(r - l) / ar; t = -th / 2; b = th / 2 } else { const tw = Math.abs(b - t) * ar; l = -tw / 2; r = tw / 2 }
      }
      if (r < l) [l, r] = [r, l]
      if (b < t) [t, b] = [b, t]
      const nw = Math.max(1, r - l), nh = Math.max(1, b - t)
      let cxn = (l + r) / 2, cyn = (t + b) / 2
      // snap edges of unrotated boxes to guides
      let gl = []
      if (!rot && !e.altKey) {
        const box = { x: c.x + l, y: c.y + t, w: nw, h: nh }
        const lines = g.lines || (g.lines = snapLines(new Set([el.id])))
        const th = 6 / k
        const tryX = edge => { for (const lx2 of lines.xs) if (Math.abs(lx2 - edge) < th) return lx2 - edge; return 0 }
        const tryY = edge => { for (const ly2 of lines.ys) if (Math.abs(ly2 - edge) < th) return ly2 - edge; return 0 }
        if (h.includes('e')) { const dd = tryX(box.x + box.w); if (dd) { r += dd; gl.push({ x: box.x + box.w + dd }) } }
        if (h.includes('w')) { const dd = tryX(box.x); if (dd) { l += dd; gl.push({ x: box.x + dd }) } }
        if (h.includes('s')) { const dd = tryY(box.y + box.h); if (dd) { b += dd; gl.push({ y: box.y + box.h + dd }) } }
        if (h.includes('n')) { const dd = tryY(box.y); if (dd) { t += dd; gl.push({ y: box.y + dd }) } }
        cxn = (l + r) / 2; cyn = (t + b) / 2
      }
      const W2 = Math.max(1, r - l), H2 = Math.max(1, b - t)
      const nc = f.fromSlide(rotatePt({ x: c.x + cxn, y: c.y + cyn }, c, rot))
      map[el.id] = { x: round2(nc.x - W2 / 2), y: round2(nc.y - H2 / 2), w: round2(W2), h: round2(H2) }
      g.map = map
      batch(() => { live.value = map; guides.value = gl })
      return
    }
    // several objects: scale the union box around the opposite side
    const ub = g.ub
    let l = ub.x, r = ub.x + ub.w, t = ub.y, b = ub.y + ub.h
    const dx = p.x - g.start.x, dy = p.y - g.start.y
    if (h.includes('e')) r = Math.max(l + 1, r + dx)
    if (h.includes('w')) l = Math.min(r - 1, l + dx)
    if (h.includes('s')) b = Math.max(t + 1, b + dy)
    if (h.includes('n')) t = Math.min(b - 1, t + dy)
    if (e.shiftKey && h.length === 2) {
      const sc = Math.max((r - l) / ub.w, (b - t) / ub.h)
      if (h.includes('e')) r = l + ub.w * sc; else l = r - ub.w * sc
      if (h.includes('s')) b = t + ub.h * sc; else t = b - ub.h * sc
    }
    const sx = (r - l) / ub.w, sy = (b - t) / ub.h
    for (const x of g.els) {
      const w = x.abs.w * sx, h = x.abs.h * sy
      const nc = x.f.fromSlide({ x: l + (x.abs.x + x.abs.w / 2 - ub.x) * sx, y: t + (x.abs.y + x.abs.h / 2 - ub.y) * sy })
      map[x.id] = { x: round2(nc.x - w / 2), y: round2(nc.y - h / 2), w: round2(w), h: round2(h) }
    }
    g.map = map
    live.value = map
  }
  const doCrop = (g, sp) => {
    const { el, f, x0, y0, rot, c0, FW, FH, FX, FY } = g
    const p = rotatePt(sp, c0, -rot)
    let x1 = x0, y1 = y0, x2 = x1 + el.w, y2 = y1 + el.h
    let fx = FX, fy = FY
    if (g.h === 'crop-move') {
      // move the picture under the crop frame
      const dx = p.x - g.start.x, dy = p.y - g.start.y
      fx = Math.min(x1, Math.max(x2 - FW, FX + dx)); fy = Math.min(y1, Math.max(y2 - FH, FY + dy))
    } else {
      const h = g.h.slice(5)
      if (h.includes('e')) x2 = Math.min(FX + FW, Math.max(x1 + 4, p.x))
      if (h.includes('w')) x1 = Math.max(FX, Math.min(x2 - 4, p.x))
      if (h.includes('s')) y2 = Math.min(FY + FH, Math.max(y1 + 4, p.y))
      if (h.includes('n')) y1 = Math.max(FY, Math.min(y2 - 4, p.y))
    }
    const fc = { l: (x1 - fx) / FW, t: (y1 - fy) / FH, r: (fx + FW - x2) / FW, b: (fy + FH - y2) / FH }
    for (const kk of ['l', 't', 'r', 'b']) fc[kk] = Math.max(0, Math.round(fc[kk] * 10000) / 10000)
    // the new frame's centre turns with the picture; then back into the group's coordinates
    const w = x2 - x1, h = y2 - y1, nc = f.fromSlide(rotatePt({ x: x1 + w / 2, y: y1 + h / 2 }, c0, rot))
    g.patch = { x: round2(nc.x - w / 2), y: round2(nc.y - h / 2), w: round2(w), h: round2(h), crop: screenCrop(fc, el) }
    live.value = { [el.id]: g.patch }
    setPreview({ kind: 'crop', c0, rot, frame: { x: x1, y: y1, w, h }, full: { x: fx, y: fy, w: FW, h: FH } })
  }

  const onPointerUp = e => {
    const g = drag.current
    drag.current = null
    if (!g) return
    const p = toPt(e)
    if (g.mode === 'pan') return
    if (g.mode === 'ink') { finishInk(g.pts); setInk(null); return }
    if (g.mode === 'erase') return
    if (g.mode === 'create') { finishCreate(g, e); setPreview(null); return }
    if (g.mode === 'marquee') {
      const m = marq
      setMarq(null)
      if (m && (m.w > 2 || m.h > 2)) {
        const ids = s.elements.filter(x => !x.hidden).filter(x => { const b = bounds(x); return b.x >= m.x && b.y >= m.y && b.x + b.w <= m.x + m.w && b.y + b.h <= m.y + m.h }).map(x => x.id)
        select([...new Set([...g.add, ...ids])])
      }
      return
    }
    if (g.mode === 'move') {
      const map = live.value
      batch(() => { live.value = null; guides.value = [] })
      if (g.moved && map) {
        if (g.dup) {
          // Ctrl+drag leaves the originals and drops copies
          const copies = []
          update(dd => {
            const sl = dd.slides[slideIdx.value]
            for (const id of g.ids) {
              const h = findEl(sl, id)
              if (!h) continue
              const c = JSON.parse(JSON.stringify(h.el))
              const fresh = x => { x.id = Math.random().toString(36).slice(2, 10); (x.children || []).forEach(fresh) }
              fresh(c); c.x = map[id].x; c.y = map[id].y
              h.list.splice(h.index + 1, 0, c)
              copies.push(c.id)
            }
            for (const id of copies) for (const pg of parentGroups(sl, id)) refitGroup(pg) // a copy inside a group widens it
          })
          select(copies)
        } else updateEls(Object.keys(map), x => { x.x = round2(map[x.id].x); x.y = round2(map[x.id].y) })
        return
      }
      // click without dragging
      const el = g.el
      if (!el || e.shiftKey || e.ctrlKey) return
      if (el.type === 'text' && !el.locked && !(el.ph === 'pic' && !el.html?.replace(/<[^>]+>/g, '').trim())) { startEdit(el.id, g.client) ; return }
      if (el.ph === 'pic') { runCmd('ins.picture'); return }
      if (el.type === 'shape' && g.wasSelected) { startEdit(el.id, g.client); return }
      if (el.type === 'table') {
        const td = document.elementFromPoint(g.client.x, g.client.y)?.closest('td')
        if (td && (g.wasSelected || true)) { editorReq.value = { x: g.client.x, y: g.client.y }; editCell.value = { id: el.id, r: +td.dataset.r, c: +td.dataset.c }; return }
      }
      if (el.type === 'group' && g.wasSelected) groupCtx.current = el.id
      return
    }
    if (g.mode === 'resize' || g.mode === 'rotate') {
      const map = g.map
      batch(() => { live.value = null; guides.value = [] })
      if (map) {
        // updateEls closes a resized or turned child's group around it again
        updateEls(Object.keys(map), el => {
          const patch = map[el.id]
          if (patch.w !== undefined) A.resizeEl(el, patch.w, patch.h)
          Object.assign(el, patch)
        })
        if (g.mode === 'resize') import('../app/commands.js').then(m => m.refitSoon(Object.keys(map)))
      }
      return
    }
    if (g.mode === 'lineEnd') {
      live.value = null
      if (g.patch) updateEl(g.id, x => Object.assign(x, g.patch))
      return
    }
    if (g.mode === 'crop') {
      live.value = null
      setPreview(null)
      if (g.patch) updateEl(g.id, x => Object.assign(x, g.patch))
    }
  }
  const startEdit = (id, client) => {
    if (editing.value === id) { if (client) caretAt(client.x, client.y); return }
    finishEditing()
    batch(() => { selection.value = [id]; editorReq.value = client ? { x: client.x, y: client.y } : { mode: 'end' }; editing.value = id })
  }

  const finishCreate = (g, e) => {
    const t = tool.value
    tool.value = null
    const a = g.start
    let b = g.cur
    const tiny = Math.hypot((b.x - a.x) * k, (b.y - a.y) * k) < 4
    if (g.kind === 'line') {
      if (tiny) b = { x: a.x + 72, y: a.y }
      else if (e.shiftKey) b = snap45(a, b)
      A.insertLine(g.line || 'straight', a, b)
      return
    }
    let box
    if (tiny) box = g.kind === 'text' ? null : { x: a.x - 36, y: a.y - 36, w: 72, h: 72 }
    else {
      box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
      if (e.shiftKey) { const m = Math.max(box.w, box.h); box = { x: b.x < a.x ? a.x - m : a.x, y: b.y < a.y ? a.y - m : a.y, w: m, h: m } }
    }
    if (g.kind === 'text') {
      if (!box) {
        const el = A.insertTextBox({ x: a.x - 4, y: a.y - 14, w: 40, h: 30 })
        A.setProps({ wrap: false }, [el.id])
      } else A.insertTextBox({ ...box, h: Math.max(30, box.h) })
      editorReq.value = { mode: 'end' }
      return
    }
    if (g.kind === 'shape') A.insertShape(g.shape || 'rect', box)
  }
  const finishInk = pts => {
    const t = tool.value
    if (!t || !pts || pts.length < 2) return
    const hl = t.kind === 'highlighter'
    const w = t.width || (hl ? 12 : 2.25)
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y)
    const x0 = Math.min(...xs) - w, y0 = Math.min(...ys) - w
    const bw = Math.max(...xs) - x0 + w, bh = Math.max(...ys) - y0 + w
    const dpath = smoothPath(pts.map(q => ({ x: q.x - x0, y: q.y - y0 })))
    const el = { id: 'i' + Math.random().toString(36).slice(2, 10), type: 'ink', name: hl ? 'Highlighter' : 'Ink', x: round2(x0), y: round2(y0), w: round2(bw), h: round2(bh), rot: 0, vb: { w: round2(bw), h: round2(bh) }, paths: [{ d: dpath, color: t.color || (hl ? '#FFE500' : 'dk1'), width: w, alpha: hl ? 0.45 : 1, hl }] }
    update(dd => { dd.slides[slideIdx.value].elements.push(el) })
  }

  // ---------- context menu ----------
  const onContextMenu = e => {
    e.preventDefault()
    if (e.target.closest('[data-editor]')) return // the native menu (spelling) handles text
    const chain = idChain(e.target, frameRef.current)
    if (!chain.length) {
      contextMenu(e, [
        { label: 'Paste', icon: 'clipboard-paste', kbd: 'Ctrl+V', run: () => runCmd('edit.paste') },
        { sep: true },
        { label: 'Layout', icon: 'layout-template', sub: LAYOUTS.map(l => ({ label: l.name, checked: s.layout === l.id, run: () => A.setLayout(l.id) })) },
        { label: 'Reset slide', icon: 'rotate-ccw', run: () => runCmd('slide.reset') },
        { label: 'Format background…', icon: 'paint-bucket', run: () => runCmd('design.bg') },
        { sep: true },
        { label: 'Gridlines', icon: 'grid-3x3', checked: showGrid.value, run: () => runCmd('view.grid') },
        { label: 'Guides', icon: 'crosshair', checked: showGuides.value, run: () => runCmd('view.guides') },
        { label: 'Snap to grid', icon: 'magnet', checked: snapGrid.value, run: () => runCmd('view.snap') },
        { sep: true },
        { label: 'New comment', icon: 'message-square-plus', run: () => runCmd('ins.comment') }
      ])
      return
    }
    const one = selected.value.length === 1 ? selected.value[0] : null
    const items = [
      { label: 'Cut', icon: 'scissors', kbd: 'Ctrl+X', run: () => runCmd('edit.cut') },
      { label: 'Copy', icon: 'copy', kbd: 'Ctrl+C', run: () => runCmd('edit.copy') },
      { label: 'Paste', icon: 'clipboard-paste', kbd: 'Ctrl+V', run: () => runCmd('edit.paste') },
      { sep: true }
    ]
    if (one && (one.type === 'text' || one.type === 'shape')) items.push({ label: 'Edit text', icon: 'text-cursor-input', run: () => startEdit(one.id) })
    if (one && one.type === 'image') items.push({ label: 'Crop', icon: 'crop', run: () => { cropMode.value = one.id } }, { label: 'Change picture…', icon: 'image-up', run: () => changePicture(one.id) })
    if (one && one.type === 'chart') items.push({ label: 'Edit data…', icon: 'sheet', run: () => openDialog('chartData', { id: one.id }) })
    if (one && one.type === 'table') {
      items.push({ label: 'Insert', icon: 'between-horizontal-start', sub: [
        { label: 'Insert rows above', run: () => A.tableOp('rowAbove') }, { label: 'Insert rows below', run: () => A.tableOp('rowBelow') },
        { label: 'Insert columns left', run: () => A.tableOp('colLeft') }, { label: 'Insert columns right', run: () => A.tableOp('colRight') }] },
      { label: 'Delete', icon: 'trash', sub: [{ label: 'Delete rows', run: () => A.tableOp('delRow') }, { label: 'Delete columns', run: () => A.tableOp('delCol') }, { label: 'Delete table', run: () => A.tableOp('delTable') }] })
    }
    items.push(
      { label: 'Group', icon: 'group', sub: [
        { label: 'Group', icon: 'group', kbd: 'Ctrl+G', disabled: !cmdEnabled('obj.group'), run: () => runCmd('obj.group') },
        { label: 'Ungroup', icon: 'ungroup', kbd: 'Ctrl+Shift+G', disabled: !cmdEnabled('obj.ungroup'), run: () => runCmd('obj.ungroup') }] },
      { label: 'Bring to front', icon: 'bring-to-front', sub: [{ label: 'Bring to front', icon: 'bring-to-front', run: () => runCmd('obj.front') }, { label: 'Bring forward', icon: 'arrow-up-from-line', run: () => runCmd('obj.forward') }] },
      { label: 'Send to back', icon: 'send-to-back', sub: [{ label: 'Send to back', icon: 'send-to-back', run: () => runCmd('obj.back') }, { label: 'Send backward', icon: 'arrow-down-to-line', run: () => runCmd('obj.backward') }] },
      { sep: true },
      { label: 'Link…', icon: 'link', kbd: 'Ctrl+K', run: () => runCmd('obj.link') },
      { label: 'Save as picture…', icon: 'image-down', run: () => import('../print/printing.js').then(m => m.saveSelectionAsPicture()) },
      { label: 'Edit alt text…', icon: 'message-square-text', disabled: !one, run: () => runCmd('obj.alt') },
      { sep: true },
      { label: 'Size and position…', icon: 'scaling', run: () => runCmd('obj.format', 'size') },
      { label: one && one.type === 'image' ? 'Format picture…' : 'Format shape…', icon: 'paint-bucket', run: () => runCmd('obj.format', 'fill') },
      { label: 'New comment', icon: 'message-square-plus', run: () => runCmd('ins.comment') }
    )
    contextMenu(e, items)
  }
  const onDblClick = e => {
    if (e.target.closest('[data-editor]')) return
    const chain = idChain(e.target, frameRef.current)
    if (!chain.length) return
    const cur = selection.value.find(id => chain.includes(id))
    const el = findEl(s, cur || chain[0])?.el
    if (!el) return
    if (el.type === 'shape' || el.type === 'text') { if (editing.value !== el.id) startEdit(el.id, { x: e.clientX, y: e.clientY }) }
    else if (el.type === 'image') ribbonTab.value = 'picture'
    else if (el.type === 'chart') openDialog('chartData', { id: el.id })
    else if (el.type === 'group' && chain.length > 1) { groupCtx.current = chain[0]; select([chain[1]]) }
  }
  const onWheel = e => {
    if (!e.ctrlKey) return
    e.preventDefault()
    const st = stageRef.current
    const r = st.getBoundingClientRect()
    const p = toPt(e)
    zoomAnchor.current = { px: p.x, py: p.y, cx: e.clientX - r.left, cy: e.clientY - r.top }
    const cur = zoom.value || fitZoom.value
    zoom.value = Math.max(0.1, Math.min(4, cur * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
  }
  // ---------- drag & drop of files ----------
  const onDragOver = e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropHint(true) } }
  const onDrop = async e => {
    setDropHint(false)
    const files = [...(e.dataTransfer?.files || [])]
    if (!files.length) return
    e.preventDefault()
    const p = toPt(e)
    for (const f of files) {
      const path = window.prizmaNative?.pathForFile(f)
      const ext = extOf(f.name)
      if (OPEN_EXT.includes(ext) && path) { openPath(path); continue }
      const mime = f.type || mimeOf(f.name)
      const bytes = new Uint8Array(await f.arrayBuffer())
      if (mime.startsWith('image/')) {
        const pic = await A.loadPicture(bytes, mime)
        if (!pic) { A.cantShowPicture(f.name); continue }
        let w = pic.w * 0.75, h = pic.h * 0.75
        const kk = Math.min(1, W * 0.6 / w, H * 0.6 / h); w *= kk; h *= kk
        A.insertImageBytes(pic.bytes, pic.mime, pic.w, pic.h, { x: p.x - w / 2, y: p.y - h / 2, w, h })
      } else if (mime.startsWith('video/')) A.insertMedia('video', bytes, mime)
      else if (mime.startsWith('audio/')) A.insertMedia('audio', bytes, mime)
      else toast(`${f.name} can't be inserted on a slide.`)
    }
  }

  // ---------- rendering ----------
  const editId = editing.value
  const editEl = editId ? findEl(s, editId)?.el : null
  const editorFn = editEl ? (rtStyle => <TextEditor key={editId} el={editEl} rtStyle={rtStyle} />) : undefined
  const ec = editCell.value
  const ecTable = ec ? findEl(s, ec.id)?.el : null
  const editCellNode = ec && ecTable ? { id: ec.id, r: ec.r, c: ec.c, node: <CellEditor key={ec.id + ':' + ec.r + ':' + ec.c} table={ecTable} r={ec.r} c={ec.c} /> } : null
  const liveMap = live.value
  const ruler = showRuler.value
  const cls = 'stage' + (tool.value ? ' stage-tool' : '') + (dropHint ? ' stage-drop' : '') + (ruler ? ' with-ruler' : '')
  return (
    <>
    <div class={cls} ref={stageRef} tabIndex={-1}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
      onContextMenu={onContextMenu} onDblClick={onDblClick} onWheel={onWheel}
      onDragOver={onDragOver} onDragLeave={() => setDropHint(false)} onDrop={onDrop}>
      <div class="stage-canvas" style={{ width: cw + 'px', height: ch + 'px' }}>
        <div class="slide-frame" ref={frameRef} style={{ left: fx + 'px', top: fy + 'px', width: W * k + 'px', height: H * k + 'px' }}>
          <div class="slide-scale" style={{ transform: `scale(${z})` }}>
            <SlideView slide={s} docObj={d} mode="edit" ctx="ed" index={slideIdx.value} liveMap={liveMap}
              editingId={editId} editorNode={editorFn} editCellNode={editCellNode} />
          </div>
          {showGrid.value && <div class="grid-ov" style={{ backgroundSize: `${GRID * k}px ${GRID * k}px` }} />}
          <Overlay s={s} k={k} W={W} H={H} sel={sel} selEls={selEls} marq={marq} ink={ink} preview={preview} />
        </div>
      </div>
      {dropHint && <div class="drop-hint"><Icon name="image-plus" size={20} />Drop to insert</div>}
    </div>
    {ruler && <Rulers stageRef={stageRef} fx={fx} fy={fy} W={W} H={H} k={k} />}
    </>
  )
}

const snap45 = (a, b) => {
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const sa = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4)
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  return { x: a.x + Math.cos(sa) * len, y: a.y + Math.sin(sa) * len }
}
// Catmull-Rom style smoothing of pen strokes
function smoothPath (pts) {
  const q = [pts[0]]
  for (const p of pts.slice(1)) { const l = q[q.length - 1]; if (Math.hypot(p.x - l.x, p.y - l.y) > 0.8) q.push(p) }
  if (q.length < 3) return q.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join(' ')
  let d = `M${q[0].x.toFixed(2)} ${q[0].y.toFixed(2)}`
  for (let i = 1; i < q.length - 1; i++) {
    const mx = (q[i].x + q[i + 1].x) / 2, my = (q[i].y + q[i + 1].y) / 2
    d += ` Q${q[i].x.toFixed(2)} ${q[i].y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`
  }
  const l = q[q.length - 1]
  return d + ` L${l.x.toFixed(2)} ${l.y.toFixed(2)}`
}
export async function changePicture (id) {
  const paths = await window.prizmaNative.openDialog({ title: 'Change picture', filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'] }] })
  if (!paths?.[0]) return
  const pic = await A.loadPicture(await window.prizmaNative.readFile(paths[0]), mimeOf(paths[0]))
  if (!pic) return A.cantShowPicture(paths[0].split(/[\\/]/).pop())
  const { addMedia } = await import('../core/store.js')
  const src = addMedia(pic.bytes, pic.mime)
  updateEl(id, e => { e.src = src; e.crop = null; e.natW = pic.w; e.natH = pic.h; const ar = pic.w / pic.h; const nh = e.w / ar; e.y += (e.h - nh) / 2; e.h = nh })
}

// ---------- selection overlay ----------
function Overlay ({ s, k, W, H, sel, selEls, marq, ink, preview }) {
  const g = guides.value
  const crop = cropMode.value
  const editingId = editing.value
  const liveMap = live.value || {}
  const parts = []
  const multi = selEls.length > 1
  for (const el0 of selEls) {
    const ov = liveMap[el0.id]
    const el = ov ? { ...el0, ...ov } : el0
    // drawn where it shows on the slide: a group's child with its groups' offsets and turns
    const at = onSlide(s, el)
    const x = at.x * k, y = at.y * k, w = el.w * k, h = el.h * k
    if (el.type === 'line') {
      const ends = lineEnds(at)
      parts.push(
        <svg class="sel-line" key={el.id + 'l'} style={{ left: 0, top: 0, width: W * k + 'px', height: H * k + 'px' }}>
          <line x1={ends[0].x * k} y1={ends[0].y * k} x2={ends[1].x * k} y2={ends[1].y * k} />
        </svg>,
        ...ends.map((p, i) => <div key={el.id + 'p' + i} class="hdl hdl-pt" data-h={'p' + i} data-for={el.id} style={{ left: p.x * k + 'px', top: p.y * k + 'px' }} />)
      )
      continue
    }
    const isCrop = crop === el.id
    const editingThis = editingId === el.id
    const showHandles = !isCrop && !el.locked
    // group outline when a child is selected
    const top = s.elements.find(t => t.type === 'group' && t.id !== el.id && findEl({ elements: [t] }, el.id))
    if (top) parts.push(<div key={el.id + 'g'} class="sel-group" style={{ left: top.x * k + 'px', top: top.y * k + 'px', width: top.w * k + 'px', height: top.h * k + 'px', transform: top.rot ? `rotate(${top.rot}deg)` : undefined }} />)
    parts.push(
      <div key={el.id} class={'selbox' + (editingThis ? ' sel-edit' : '') + (multi ? ' sel-multi' : '')} style={{ left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', transform: at.rot ? `rotate(${at.rot}deg)` : undefined }}>
        {showHandles && HANDLES.map(hh => <div key={hh} class={'hdl hdl-' + hh} data-h={hh} style={{ left: HPOS[hh][0] * 100 + '%', top: HPOS[hh][1] * 100 + '%', cursor: handleCursor(hh, at.rot) }} />)}
        {showHandles && !multi && <div class="hdl-rot" data-h="rot" data-tip="Rotate (Shift snaps to 15°)"><Icon name="rotate-cw" size={13} stroke={2.2} /></div>}
      </div>
    )
    if (isCrop) {
      // the whole picture and the crop window, drawn in the picture's own frame and turned with it
      let cp = preview && preview.kind === 'crop' ? preview : null
      if (!cp) {
        const c = screenCrop(el.crop, el), frame = { x: at.x, y: at.y, w: el.w, h: el.h }
        const FW = el.w / Math.max(0.01, 1 - c.l - c.r), FH = el.h / Math.max(0.01, 1 - c.t - c.b)
        cp = { c0: { x: frame.x + el.w / 2, y: frame.y + el.h / 2 }, rot: at.rot, frame, full: { x: frame.x - c.l * FW, y: frame.y - c.t * FH, w: FW, h: FH } }
      }
      const { frame, full } = cp
      const flip = el.flipH || el.flipV ? `scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})` : undefined
      parts.push(
        <div key="crop" class="crop-rot" style={{ transform: cp.rot ? `rotate(${cp.rot}deg)` : undefined, transformOrigin: `${cp.c0.x * k}px ${cp.c0.y * k}px` }}>
          <div class="crop-full" style={{ left: full.x * k + 'px', top: full.y * k + 'px', width: full.w * k + 'px', height: full.h * k + 'px' }}>
            <img src={mediaUrl(el.src)} alt="" style={{ transform: flip }} />
          </div>
          <div class="crop-win" data-h="crop-move" style={{ left: frame.x * k + 'px', top: frame.y * k + 'px', width: frame.w * k + 'px', height: frame.h * k + 'px' }}>
            {HANDLES.map(hh => <div key={hh} class={'chdl chdl-' + hh} data-h={'crop-' + hh} style={{ left: HPOS[hh][0] * 100 + '%', top: HPOS[hh][1] * 100 + '%', cursor: handleCursor(hh, cp.rot) }} />)}
          </div>
        </div>
      )
    }
  }
  for (const gl of g) {
    if (gl.x !== undefined) parts.push(<div key={'gx' + gl.x} class="guide guide-v" style={{ left: gl.x * k + 'px' }} />)
    if (gl.y !== undefined) parts.push(<div key={'gy' + gl.y} class="guide guide-h" style={{ top: gl.y * k + 'px' }} />)
  }
  if (showGuides.value) {
    parts.push(<DrawGuide key="dgx" axis="x" k={k} W={W} H={H} />, <DrawGuide key="dgy" axis="y" k={k} W={W} H={H} />)
  }
  if (marq) parts.push(<div key="marq" class="marq" style={{ left: marq.x * k + 'px', top: marq.y * k + 'px', width: marq.w * k + 'px', height: marq.h * k + 'px' }} />)
  if (ink && ink.length > 1) {
    const t = tool.value || {}
    const hl = t.kind === 'highlighter'
    parts.push(
      <svg key="ink" class="ink-live" style={{ width: W * k + 'px', height: H * k + 'px' }}>
        <polyline points={ink.map(p => `${p.x * k},${p.y * k}`).join(' ')} style={{ fill: 'none', stroke: t.colorCss || (hl ? '#FFE500' : 'var(--c-dk1)'), strokeOpacity: hl ? '0.45' : '1', strokeWidth: (t.width || (hl ? 12 : 2.25)) * k, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
      </svg>
    )
  }
  if (preview && preview.kind !== 'crop') {
    const a = preview.start, b = preview.cur
    if (preview.kind === 'line') {
      const bb = preview.shift ? snap45(a, b) : b
      parts.push(<svg key="pv" class="ink-live" style={{ width: W * k + 'px', height: H * k + 'px' }}><line x1={a.x * k} y1={a.y * k} x2={bb.x * k} y2={bb.y * k} class="pv-line" /></svg>)
    } else {
      let bx = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
      if (preview.shift) { const m = Math.max(bx.w, bx.h); bx = { x: b.x < a.x ? a.x - m : a.x, y: b.y < a.y ? a.y - m : a.y, w: m, h: m } }
      parts.push(<div key="pv" class={'pv-box' + (preview.kind === 'text' ? ' pv-text' : '')} style={{ left: bx.x * k + 'px', top: bx.y * k + 'px', width: bx.w * k + 'px', height: bx.h * k + 'px', borderRadius: preview.shape === 'ellipse' ? '50%' : undefined }} />)
    }
  }
  return <div class="overlay">{parts}</div>
}
// Draggable drawing guides (View › Guides)
function DrawGuide ({ axis, k, W, H }) {
  const [, force] = useState(0)
  const v = axis === 'x' ? (guidePos.x ?? W / 2) : (guidePos.y ?? H / 2)
  const down = e => {
    e.stopPropagation(); e.preventDefault()
    const el = e.currentTarget
    const frame = el.closest('.slide-frame')
    el.setPointerCapture(e.pointerId)
    const move = ev => {
      const r = frame.getBoundingClientRect()
      const val = axis === 'x' ? (ev.clientX - r.left) / k : (ev.clientY - r.top) / k
      guidePos[axis] = Math.max(0, Math.min(axis === 'x' ? W : H, Math.round(val * 2) / 2))
      force(n => n + 1)
    }
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  const label = (() => { const cm = (v - (axis === 'x' ? W : H) / 2) * 2.54 / 72; return (cm >= 0 ? '' : '−') + Math.abs(cm).toFixed(2) })()
  return (
    <div class={'dguide dguide-' + axis} style={axis === 'x' ? { left: v * k + 'px' } : { top: v * k + 'px' }} onPointerDown={down} data-tip={`Guide ${label} cm from centre`}>
      <span />
    </div>
  )
}

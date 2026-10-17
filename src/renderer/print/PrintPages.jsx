// Printable pages: full slides, notes pages, outline and handouts. Used for printing, PDF export and the print preview.
import { SlideView } from '../render/SlideView.jsx'
import { textOf, numberingCss } from '../core/html.js'
import { PX } from '../core/model.js'

export const printOptsDefault = () => ({ range: 'all', custom: '', layout: 'slides', paper: 'a4', frame: false, hidden: false, gray: false, numbers: true })
const PAPER = { a4: { w: 595.28, h: 841.89 }, letter: { w: 612, h: 792 } }

export function parseRange (str, n) {
  const out = new Set()
  // "1 - 3", "1 -3" and "1–3" are ranges too
  for (const part of String(str || '').replace(/\s*[-–—]\s*/g, '-').split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const a = Math.max(1, +m[1]), b = Math.min(n, m[2] ? +m[2] : +m[1])
    for (let i = a; i <= b; i++) out.add(i - 1)
  }
  return [...out].sort((x, y) => x - y)
}
export function printSlides (d, o) {
  let idx = d.slides.map((_, i) => i)
  if (o.range === 'current') idx = [o.current ?? 0]
  else if (o.range === 'custom') idx = parseRange(o.custom, d.slides.length)
  return idx.filter(i => d.slides[i] && (o.hidden || o.range === 'current' || !d.slides[i].hidden)).map(i => ({ slide: d.slides[i], index: i }))
}
export function pageSize (d, o) {
  if (o.layout === 'slides') return { w: d.size.w, h: d.size.h }
  return PAPER[o.paper] || PAPER.a4
}
// A slide scaled to a given width (pt)
function Fit ({ d, s, i, w, frame, ctx }) {
  const k = w / d.size.w
  return (
    <div class={'pp-slide' + (frame ? ' framed' : '')} style={{ width: w + 'pt', height: d.size.h * k + 'pt' }}>
      <div style={{ transform: `scale(${k})`, transformOrigin: '0 0' }}>
        <SlideView slide={s} docObj={d} mode="print" index={i} ctx={ctx} />
      </div>
    </div>
  )
}
function chunk (arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }
// The lines a text breaks into at a width (pt), measured with the page font, so long notes and outlines can
// continue on the next page instead of being cut off. A little narrower than the page so the browser never wraps sooner.
let measure
function wrapLines (text, pt, width, weight = 400) {
  measure = measure || document.createElement('canvas').getContext('2d')
  measure.font = `${weight} ${pt}pt 'Segoe UI', Calibri, Arial, sans-serif`
  const out = []
  for (const para of String(text).split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const next = line ? line + ' ' + word : word
      if (line && measure.measureText(next).width > width * PX * 0.96) { out.push(line); line = word } else line = next
    }
    out.push(line)
  }
  return out
}
function outlineOf (s) {
  const title = s.elements.find(e => e.ph === 'title' || e.ph === 'ctrTitle')
  const rest = s.elements.filter(e => e !== title && (e.type === 'text' || e.type === 'shape') && e.html)
  return { title: title ? textOf(title.html).trim() : '', lines: rest.flatMap(e => textOf(e.html).split('\n').map(x => x.trim()).filter(Boolean)) }
}

export function PrintPages ({ docObj: d, opts: o, preview, previewWidth = 560 }) {
  if (!d) return null
  const list = printSlides(d, o)
  const P = pageSize(d, o)
  const pages = []
  const M = 48
  // the preview stays on the page while printing: its SVG ids must differ, or url(#…) fills and arrowheads point into the hidden preview
  const cx = preview ? 'v' : ''
  const num = (i, extra = {}) => o.numbers ? <div class="pp-num" style={extra}>{i + 1}</div> : null
  if (o.layout === 'slides') {
    for (const { slide: s, index: i } of list) pages.push(<Fit key={s.id} d={d} s={s} i={i} w={P.w} frame={o.frame} ctx={cx + 'pr' + i} />)
  } else if (o.layout === 'notes') {
    // notes that don't fit under the slide continue on pages of their own
    // a portrait slide gets at most half the page, as in PowerPoint
    const w = Math.min((P.w - M * 2) * 0.9, (P.h - M * 2) * 0.5 * d.size.w / d.size.h), lineH = 12 * 1.45, foot = 18 + 14
    const first = Math.max(1, Math.floor((P.h - M * 2 - w * d.size.h / d.size.w - 18 - foot) / lineH)), more = Math.floor((P.h - M * 2 - foot) / lineH)
    for (const { slide: s, index: i } of list) {
      const lines = s.notes ? wrapLines(s.notes, 12, P.w - M * 2) : []
      const parts = [lines.slice(0, first)]
      for (let k = first; k < lines.length; k += more) parts.push(lines.slice(k, k + more))
      parts.forEach((part, j) => pages.push(
        <div key={s.id + j} class="pp-col" style={{ padding: `${M}pt` }}>
          {j === 0 && <div style={{ alignSelf: 'center' }}><Fit d={d} s={s} i={i} w={w} frame ctx={cx + 'pn' + i} /></div>}
          <div class="pp-notes">{part.join('\n')}</div>
          <div class="pp-foot">{i + 1}</div>
        </div>
      ))
    }
  } else if (o.layout === 'outline') {
    // filled line by line; a slide's title stays with its first line
    const room = P.h - M * 2 - 2, tw = P.w - M * 2 - 28
    const sheets = [[]]
    let used = 0
    for (const { slide: s, index: i } of list) {
      const it = outlineOf(s)
      const th = wrapLines(it.title || 'Untitled slide', 13, tw, 700).length * 13 * 1.35
      const lh = it.lines.map(l => wrapLines(l, 10.5, tw).length * 10.5 * 1.45)
      const gap = sheets.at(-1).length ? 12 : 0
      if (gap && used + gap + th + (lh[0] || 0) > room) { sheets.push([]); used = 0 } else used += gap
      let part = { i, title: it.title || 'Untitled slide', lines: [] }
      sheets.at(-1).push(part)
      used += th
      it.lines.forEach((l, k) => {
        if (used + lh[k] > room && part.lines.length) { part = { i, lines: [] }; sheets.push([part]); used = 0 }
        part.lines.push(l)
        used += lh[k]
      })
    }
    for (const sheet of sheets) {
      if (!sheet.length) continue
      pages.push(
        <div class="pp-col pp-outline" style={{ padding: `${M}pt` }}>
          {sheet.map(p => (
            <div key={p.i + (p.title ? 't' : 'c')} class="po-item">{p.title && <div class="po-t"><span>{p.i + 1}</span>{p.title}</div>}{p.lines.map((l, j) => <div key={j} class="po-l">{l}</div>)}</div>
          ))}
        </div>
      )
    }
  } else {
    const n = +o.layout.slice(1)
    const cols = n === 1 || n === 2 || n === 3 ? 1 : n === 9 ? 3 : 2
    const rows = n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : 3
    const lines = n === 3
    for (const group of chunk(list, n)) {
      const cellW = lines ? (P.w - M * 2) * 0.48 : (P.w - M * 2 - (cols - 1) * 18) / cols
      const maxH = (P.h - M * 2 - (rows - 1) * 22) / rows - (o.numbers ? 14 : 0)
      const w = Math.min(cellW, maxH * d.size.w / d.size.h)
      pages.push(
        <div class="pp-hand" style={{ padding: `${M}pt`, gridTemplateColumns: lines ? '1fr 1fr' : `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {group.map(({ slide: s, index: i }) => [
            <div key={s.id} class="pp-cell"><Fit d={d} s={s} i={i} w={w} frame={o.frame !== false} ctx={cx + 'ph' + i} />{num(i)}</div>,
            lines ? <div key={s.id + 'l'} class="pp-lines">{Array.from({ length: 6 }, (_, j) => <i key={j} />)}</div> : null
          ])}
        </div>
      )
    }
  }
  const scale = preview ? previewWidth / (P.w * PX) : 1
  const pageStyle = { width: P.w + 'pt', height: P.h + 'pt', filter: o.gray ? 'grayscale(1)' : undefined }
  if (preview) {
    return (
      <div class="pp-preview">
        <style>{numberingCss()}</style>
        {pages.length === 0 && <div class="bs-empty">Nothing to print with these settings.</div>}
        {pages.map((pg, i) => (
          <div key={i} class="pp-pv" style={{ width: P.w * PX * scale + 'px', height: P.h * PX * scale + 'px' }}>
            <div class="pp-page" style={{ ...pageStyle, transform: `scale(${scale})` }}>{pg}</div>
            <span class="pp-pvn">{i + 1} / {pages.length}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div class="pp-root">
      <style>{`@page { size: ${P.w}pt ${P.h}pt; margin: 0 } ${numberingCss()}`}</style>
      {pages.map((pg, i) => <div key={i} class="pp-page" style={pageStyle}>{pg}</div>)}
    </div>
  )
}

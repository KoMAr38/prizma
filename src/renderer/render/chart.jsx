// SVG chart renderer for chart elements (column, bar, line, area, pie, doughnut, scatter, radar).
// The default "3d" look draws extruded pies and columns with lighting and soft floor shadows;
// "flat" draws plain 2-D charts (used for charts imported from 2-D PowerPoint charts).
import { useContext } from 'preact/hooks'
import { cssColor, fontStack, hexColor, luminance } from '../core/model.js'
import { ThemeCtx } from './themeCtx.js'

export const CHART_TYPES = [
  { id: 'column', label: 'Column', icon: 'chart-column' },
  { id: 'bar', label: 'Bar', icon: 'chart-bar' },
  { id: 'line', label: 'Line', icon: 'chart-line' },
  { id: 'area', label: 'Area', icon: 'chart-area' },
  { id: 'pie', label: 'Pie', icon: 'chart-pie' },
  { id: 'doughnut', label: 'Doughnut', icon: 'circle-dot' },
  { id: 'scatter', label: 'Scatter', icon: 'chart-scatter' },
  { id: 'radar', label: 'Radar', icon: 'radar' }
]
const ACCENTS = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']
export const seriesColor = (el, i) => el.series[i]?.color || (el.colors && el.colors[i]) || (i < 6 ? ACCENTS[i] : ACCENTS[i % 6] + ':' + (i < 12 ? -30 : 40))
const catColor = (el, i) => (el.pointColors && el.pointColors[i]) || (i < 6 ? ACCENTS[i] : ACCENTS[i % 6] + ':' + (i < 12 ? -30 : 40))
export const chartLook = el => el.look || '3d'
// X values of a scatter chart as numbers, or null when some are text (then the points sit at 1, 2, 3…, as in Excel)
export const xNumbers = cats => { const xs = cats.map(c => Number(String(c ?? '').trim().replace(',', '.'))); return cats.length && cats.every(c => String(c ?? '').trim() !== '') && xs.every(Number.isFinite) ? xs : null }

function niceScale (min, max, ticks = 5) {
  if (min === max) { max = min + 1; min = Math.min(0, min) }
  const range = max - min
  const raw = range / ticks
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => range / s <= ticks + 0.5) || mag * 10
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step
  const out = []
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e9) / 1e9)
  return out
}
export const fmtNum = v => {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (Math.abs(v) >= 1e4) return (v / 1e3).toFixed(0) + 'k'
  return String(Math.round(v * 100) / 100)
}
// lighter (k > 0) or darker (k < 0) version of a CSS colour
const shade = (c, k) => k === 0 ? c : `color-mix(in srgb, ${c} ${100 - Math.abs(k)}%, ${k > 0 ? '#ffffff' : '#000000'})`
const alpha = (c, a) => `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`
const r2 = v => Math.round(v * 100) / 100
// text drawn on top of a coloured slice or bar: dark on light colours, white on dark ones
function onColor (c, theme, fs) {
  const hex = theme ? hexColor(c, theme) : null
  const light = hex && /^#[0-9a-f]{6}$/i.test(hex) && luminance(hex) > 0.5
  return light
    ? { fill: '#14161C', paintOrder: 'stroke', stroke: 'rgba(255,255,255,.35)', strokeWidth: fs * 0.12 }
    : { fill: '#ffffff', paintOrder: 'stroke', stroke: 'rgba(0,0,0,.3)', strokeWidth: fs * 0.12 }
}

// Catmull-Rom spline through points, as cubic Béziers
function smoothPath (pts) {
  if (pts.length < 3) return 'M' + pts.map(p => p.join(' ')).join(' L')
  let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const t = 0.18
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t]
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t]
    d += ` C${r2(c1[0])} ${r2(c1[1])} ${r2(c2[0])} ${r2(c2[1])} ${r2(p2[0])} ${r2(p2[1])}`
  }
  return d
}
const linePath = pts => 'M' + pts.map(p => `${r2(p[0])} ${r2(p[1])}`).join(' L')

export function ChartView ({ el, uidp = 'c-' }) {
  const theme = useContext(ThemeCtx)
  const id = (uidp + 'ch').replace(/[^\w-]/g, '')
  const w = Math.max(el.w, 20), h = Math.max(el.h, 20)
  const look = chartLook(el)
  const deep = look === '3d'
  const ts = el.ts || {}
  const fs = ts.size || 12
  const textColor = cssColor(ts.color || 'dk1')
  const muted = alpha(textColor, 0.62)
  const grid = alpha(textColor, deep ? 0.11 : 0.16)
  const axis = alpha(textColor, 0.34)
  const font = fontStack(ts.font || '+minor')
  const o = el.opts || {}
  const cats = el.categories || []
  const series = (el.series || []).filter(s => s && Array.isArray(s.values))
  const defs = []
  const parts = []
  const blur = sd => {
    const fid = `${id}-b${String(sd).replace('.', '_')}`
    if (!defs.some(d => d.props.id === fid)) defs.push(<filter id={fid} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={sd} /></filter>)
    return `url(#${fid})`
  }
  const svg = () => (
    <svg class="pz-chart" viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" style={{ fontFamily: font, overflow: 'visible' }}>
      {defs.length > 0 && <defs>{defs}</defs>}
      {parts}
    </svg>
  )
  let top = 8, bottom = h - 6, left = 8, right = w - 8
  if (o.title) { parts.push(<text x={w / 2} y={top + fs * 1.3} text-anchor="middle" font-size={fs * 1.35} font-weight="600" fill={textColor}>{o.title}</text>); top += fs * 2.2 }
  const pie = el.chartType === 'pie' || el.chartType === 'doughnut'
  const legendItems = pie ? cats.map((c, i) => ({ label: c, color: catColor(el, i) })) : series.map((s, i) => ({ label: s.name, color: seriesColor(el, i) }))
  if (o.legend && o.legend !== 'none' && legendItems.length) {
    const dot = fs * 0.36
    if (o.legend === 'right') {
      const lw = Math.min(w * 0.3, Math.max(...legendItems.map(l => String(l.label).length)) * fs * 0.55 + dot * 2 + 16)
      right -= lw + 6
      const y0 = (top + bottom) / 2 - legendItems.length * fs * 0.75
      legendItems.forEach((l, i) => {
        const y = y0 + i * fs * 1.5
        parts.push(<circle cx={right + 12 + dot} cy={y + fs * 0.45} r={dot} style={{ fill: cssColor(l.color) }} />, <text x={right + 18 + dot * 2} y={y + fs * 0.8} font-size={fs} fill={textColor}>{l.label}</text>)
      })
    } else {
      const widths = legendItems.map(l => String(l.label).length * fs * 0.55 + dot * 2 + 18)
      const total = widths.reduce((a, b) => a + b, 0)
      let x = Math.max(4, (w - total) / 2)
      const y = o.legend === 'top' ? top + 2 : bottom - fs * 1.1
      legendItems.forEach((l, i) => {
        parts.push(<circle cx={x + dot} cy={y + fs * 0.45} r={dot} style={{ fill: cssColor(l.color) }} />, <text x={x + dot * 2 + 5} y={y + fs * 0.8} font-size={fs} fill={textColor}>{l.label}</text>)
        x += widths[i]
      })
      if (o.legend === 'top') top += fs * 1.9; else bottom -= fs * 2
    }
  }

  // ---------------- pie & doughnut ----------------
  if (pie) {
    const s = series[0] || { values: [] }
    const vals = s.values.map(v => Math.max(0, +v || 0))
    const total = vals.reduce((a, b) => a + b, 0) || 1
    const outside = o.labels && o.labelPos === 'outside'
    const padX = outside ? fs * 5.5 : 4
    const tilt = deep ? 0.56 : 1
    const depthK = deep ? 0.15 : 0
    const availW = (right - left) / 2 - padX
    const availH = bottom - top - (outside ? fs * 2.6 : 6)
    const rx = Math.max(4, Math.min(availW, availH / (2 * tilt + depthK + (deep ? 0.08 : 0))))
    const ry = rx * tilt, depth = rx * depthK
    const cx = (left + right) / 2
    const cy = top + (bottom - top - (2 * ry + depth)) / 2 + ry
    const holeK = el.chartType === 'doughnut' ? (o.holeSize ?? 55) / 100 : 0
    const hx = rx * holeK, hy = ry * holeK
    const P = (a, dy = 0, kx = rx, ky = ry) => `${r2(cx + kx * Math.cos(a))} ${r2(cy + ky * Math.sin(a) + dy)}`
    const slices = []
    let a = -Math.PI / 2
    vals.forEach((v, i) => { const da = v / total * Math.PI * 2; if (da > 0) slices.push({ i, v, a1: a, a2: a + da, color: cssColor(catColor(el, i)) }); a += da })
    if (deep) {
      // soft shadow on the floor
      const sx = cx + rx * 0.04, sy = cy + depth + ry * 0.12
      const ring = holeK ? ` M${sx - hx * 0.9} ${sy} A${hx * 0.9} ${hy * 0.86} 0 1 0 ${sx + hx * 0.9} ${sy} A${hx * 0.9} ${hy * 0.86} 0 1 0 ${sx - hx * 0.9} ${sy} Z` : ''
      parts.push(<path d={`M${sx - rx * 1.02} ${sy} A${rx * 1.02} ${ry * 0.98} 0 1 0 ${sx + rx * 1.02} ${sy} A${rx * 1.02} ${ry * 0.98} 0 1 0 ${sx - rx * 1.02} ${sy} Z${ring}`} fill-rule="evenodd" style={{ fill: 'rgba(0,0,0,.38)' }} filter={blur(r2(rx * 0.06))} />)
      // lighting shared by every slice so the surface reads as one object
      slices.forEach(sl => {
        defs.push(
          <linearGradient id={`${id}-w${sl.i}`} gradientUnits="userSpaceOnUse" x1={cx - rx} y1="0" x2={cx + rx} y2="0">
            <stop offset="0" style={{ stopColor: shade(sl.color, -34) }} /><stop offset=".38" style={{ stopColor: shade(sl.color, -14) }} /><stop offset="1" style={{ stopColor: shade(sl.color, -46) }} />
          </linearGradient>,
          <radialGradient id={`${id}-t${sl.i}`} gradientUnits="userSpaceOnUse" cx={cx - rx * 0.32} cy={cy - ry * 0.55} r={rx * 1.45}>
            <stop offset="0" style={{ stopColor: shade(sl.color, 20) }} /><stop offset=".55" style={{ stopColor: sl.color }} /><stop offset="1" style={{ stopColor: shade(sl.color, -16) }} />
          </radialGradient>
        )
      })
      // inner walls of the hole (back half) and outer walls (front half)
      const walls = (a1, a2, from, to) => {
        const out = []
        for (let k = -1; k <= 2; k++) {
          const lo = Math.max(a1, from + k * Math.PI * 2), hi = Math.min(a2, to + k * Math.PI * 2)
          if (hi > lo + 1e-4) out.push([lo, hi])
        }
        return out
      }
      if (holeK) {
        slices.forEach(sl => walls(sl.a1, sl.a2, Math.PI, Math.PI * 2).forEach(([lo, hi]) => {
          parts.push(<path d={`M${P(lo, 0, hx, hy)} A${hx} ${hy} 0 0 1 ${P(hi, 0, hx, hy)} L${P(hi, depth, hx, hy)} A${hx} ${hy} 0 0 0 ${P(lo, depth, hx, hy)} Z`} style={{ fill: shade(sl.color, -52) }} />)
        }))
      }
      slices.forEach(sl => walls(sl.a1, sl.a2, 0, Math.PI).forEach(([lo, hi]) => {
        parts.push(<path d={`M${P(lo)} A${rx} ${ry} 0 0 1 ${P(hi)} L${P(hi, depth)} A${rx} ${ry} 0 0 0 ${P(lo, depth)} Z`} style={{ fill: `url(#${id}-w${sl.i})` }} />)
      }))
    }
    slices.forEach(sl => {
      const da = sl.a2 - sl.a1, large = da > Math.PI ? 1 : 0
      const full = da >= Math.PI * 2 - 1e-6
      let d
      if (full) {
        d = `M${cx - rx} ${cy} A${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A${rx} ${ry} 0 1 1 ${cx - rx} ${cy} Z` + (holeK ? ` M${cx - hx} ${cy} A${hx} ${hy} 0 1 0 ${cx + hx} ${cy} A${hx} ${hy} 0 1 0 ${cx - hx} ${cy} Z` : '')
      } else if (holeK) {
        d = `M${P(sl.a1)} A${rx} ${ry} 0 ${large} 1 ${P(sl.a2)} L${P(sl.a2, 0, hx, hy)} A${hx} ${hy} 0 ${large} 0 ${P(sl.a1, 0, hx, hy)} Z`
      } else d = `M${cx} ${cy} L${P(sl.a1)} A${rx} ${ry} 0 ${large} 1 ${P(sl.a2)} Z`
      parts.push(<path d={d} fill-rule="evenodd" style={{ fill: deep ? `url(#${id}-t${sl.i})` : sl.color, stroke: deep ? alpha('#ffffff', 0.28) : cssColor('lt1'), strokeWidth: Math.max(0.6, rx * (deep ? 0.008 : 0.012)), strokeLinejoin: 'round' }} />)
    })
    if (deep) {
      // a thin highlight along the front rim
      parts.push(<path d={`M${P(Math.PI * 0.04)} A${rx} ${ry} 0 0 1 ${P(Math.PI * 0.96)}`} style={{ fill: 'none', stroke: 'rgba(255,255,255,.22)', strokeWidth: Math.max(0.6, rx * 0.01) }} />)
    }
    if (o.labels) {
      slices.forEach(sl => {
        const mid = (sl.a1 + sl.a2) / 2
        const pct = Math.round(sl.v / total * 100) + '%'
        if (outside) {
          const ex = cx + rx * 1.04 * Math.cos(mid), ey = cy + ry * 1.04 * Math.sin(mid) + (Math.sin(mid) > 0 ? depth : 0)
          const lx = cx + (rx + fs * 1.4) * Math.cos(mid), ly = cy + (ry + fs * 1.1) * Math.sin(mid) + (Math.sin(mid) > 0 ? depth : 0)
          const right = Math.cos(mid) >= 0
          const tx = lx + (right ? fs * 0.9 : -fs * 0.9)
          parts.push(
            <path d={`M${r2(ex)} ${r2(ey)} L${r2(lx)} ${r2(ly)} L${r2(tx)} ${r2(ly)}`} style={{ fill: 'none', stroke: muted, strokeWidth: 0.75 }} />,
            <text x={tx + (right ? 4 : -4)} y={ly + fs * 0.35} text-anchor={right ? 'start' : 'end'} font-size={fs} fill={textColor}>{cats[sl.i] != null ? `${cats[sl.i]} ` : ''}<tspan font-weight="700">{pct}</tspan></text>
          )
        } else {
          if (sl.v / total < 0.04) return
          const lr = holeK ? (1 + holeK) / 2 : 0.62
          parts.push(<text x={cx + rx * lr * Math.cos(mid)} y={cy + ry * lr * Math.sin(mid) + fs * 0.35} text-anchor="middle" font-size={fs} font-weight="700" style={onColor(catColor(el, sl.i), theme, fs)}>{pct}</text>)
        }
      })
    }
    return svg()
  }

  // ---------------- radar ----------------
  if (el.chartType === 'radar') {
    const all = series.flatMap(s => s.values.map(v => +v || 0))
    const ticks = niceScale(0, Math.max(...all, 1), 4)
    const max = ticks[ticks.length - 1] || 1
    const cx = (left + right) / 2, cy = (top + bottom) / 2 + fs * 0.3, r = Math.max(4, Math.min(right - left, bottom - top) / 2 - fs * 1.6)
    const n = Math.max(cats.length, 3)
    const pt = (i, v) => { const a = -Math.PI / 2 + i * Math.PI * 2 / n; return [cx + Math.cos(a) * r * v / max, cy + Math.sin(a) * r * v / max] }
    ticks.slice(1).forEach(t => parts.push(<polygon points={Array.from({ length: n }, (_, i) => pt(i, t).join(',')).join(' ')} fill="none" stroke={grid} stroke-width="0.75" />))
    cats.forEach((c, i) => { const [x, y] = pt(i, max * 1.12); parts.push(<line x1={cx} y1={cy} x2={pt(i, max)[0]} y2={pt(i, max)[1]} stroke={grid} stroke-width="0.75" />, <text x={x} y={y + fs * 0.35} text-anchor="middle" font-size={fs} fill={muted}>{c}</text>) })
    series.forEach((s, si) => {
      const c = cssColor(seriesColor(el, si))
      const pts = cats.map((_, i) => pt(i, +s.values[i] || 0).join(',')).join(' ')
      if (deep) parts.push(<polygon points={pts} style={{ fill: 'none', stroke: c, strokeWidth: 4, opacity: 0.55 }} filter={blur(3)} />)
      parts.push(<polygon points={pts} style={{ fill: alpha(c, deep ? 0.2 : 0.22), stroke: c, strokeWidth: 2, strokeLinejoin: 'round' }} />)
      if (deep) cats.forEach((_, i) => { const [x, y] = pt(i, +s.values[i] || 0); parts.push(<circle cx={x} cy={y} r={Math.max(2, fs * 0.24)} style={{ fill: c, stroke: cssColor('lt1'), strokeWidth: 1.2 }} />) })
    })
    return svg()
  }

  // ---------------- axis charts ----------------
  const horizontal = el.chartType === 'bar'
  const stacked = el.grouping === 'stacked' || el.grouping === 'percent'
  const percent = el.grouping === 'percent'
  const n = cats.length || Math.max(0, ...series.map(s => s.values.length))
  let vmin = 0, vmax = 0
  const totals = []
  for (let i = 0; i < n; i++) {
    let pos = 0, neg = 0
    series.forEach(s => { const v = +s.values[i] || 0; if (stacked) { if (v >= 0) pos += v; else neg += v } else { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v) } })
    totals.push(pos - neg)
    if (stacked) { vmax = Math.max(vmax, pos); vmin = Math.min(vmin, neg) }
  }
  if (percent) { vmax = 100; vmin = 0 }
  const lineLike = el.chartType === 'line' || el.chartType === 'area' || el.chartType === 'scatter'
  if (lineLike && !stacked) {
    const all = series.flatMap(s => s.values.map(v => +v || 0))
    if (all.length) { vmin = Math.min(...all); vmax = Math.max(...all) }
    // like spreadsheet charts: keep zero unless the values sit far above it
    if (vmin >= 0 && vmax > 0 && (vmax - vmin) < vmax * 0.6) vmin = vmin - (vmax - vmin) * 0.25
    else vmin = Math.min(0, vmin)
  }
  const ticks = niceScale(vmin, vmax, 5)
  const lo = ticks[0], hi = ticks[ticks.length - 1]
  const tickLabelW = Math.max(...ticks.map(t => (fmtNum(t) + (percent ? '%' : '')).length)) * fs * 0.58
  const bars = el.chartType === 'column' || el.chartType === 'bar'
  // depth of the extruded bars (oblique projection up and to the right)
  const band0 = ((horizontal ? bottom - top : right - left) - (horizontal ? 0 : tickLabelW)) / Math.max(n, 1)
  const ddx = deep && bars ? Math.min(band0 * 0.16, 16) : 0
  const ddy = -ddx * 0.6
  const pl = left + (horizontal ? Math.min((right - left) * 0.3, Math.max(...cats.map(c => String(c).length), 1) * fs * 0.56 + 8) : tickLabelW + 8)
  const pb = bottom - fs * 1.6
  const pr = right - 4 - ddx, pt2 = top + fs * 0.6 - ddy
  const scale = v => horizontal ? pl + (v - lo) / (hi - lo || 1) * (pr - pl) : pb - (v - lo) / (hi - lo || 1) * (pb - pt2)
  if (o.gridlines !== false) {
    ticks.forEach(t => {
      const p = scale(t)
      parts.push(horizontal
        ? <path d={`M${p} ${pb} L${p + ddx} ${pb + ddy} L${p + ddx} ${pt2 + ddy}`} style={{ fill: 'none', stroke: grid, strokeWidth: 0.75 }} />
        : <path d={`M${pl} ${p} L${pl + ddx} ${p + ddy} L${pr + ddx} ${p + ddy}`} style={{ fill: 'none', stroke: grid, strokeWidth: 0.75 }} />)
    })
  }
  ticks.forEach(t => {
    const p = scale(t)
    parts.push(horizontal
      ? <text x={p} y={pb + fs * 1.25} text-anchor="middle" font-size={fs} fill={muted}>{fmtNum(t)}{percent ? '%' : ''}</text>
      : <text x={pl - 6} y={p + fs * 0.35} text-anchor="end" font-size={fs} fill={muted}>{fmtNum(t)}{percent ? '%' : ''}</text>)
  })
  const band = (horizontal ? pb - pt2 : pr - pl) / Math.max(n, 1)
  const slot = i => horizontal && !el.reversed ? n - 1 - i : (!horizontal && el.reversed ? n - 1 - i : i)
  const zero = scale(Math.max(lo, Math.min(0, hi)))
  // floor (3-D) or axis line
  if (ddx) {
    parts.push(horizontal
      ? <path d={`M${zero} ${pt2} L${zero + ddx} ${pt2 + ddy} L${zero + ddx} ${pb + ddy} L${zero} ${pb} Z`} style={{ fill: alpha(textColor, 0.07), stroke: axis, strokeWidth: 0.75 }} />
      : <path d={`M${pl} ${zero} L${pl + ddx} ${zero + ddy} L${pr + ddx} ${zero + ddy} L${pr} ${zero} Z`} style={{ fill: alpha(textColor, 0.07), stroke: axis, strokeWidth: 0.75 }} />)
  } else {
    parts.push(horizontal ? <line x1={zero} y1={pt2} x2={zero} y2={pb} stroke={axis} stroke-width="1" /> : <line x1={pl} y1={zero} x2={pr} y2={zero} stroke={axis} stroke-width="1" />)
  }
  const xn = el.chartType === 'scatter' ? xNumbers(cats) : null, numericX = !!xn
  const xmin = numericX ? Math.min(...xn) : 0, xmax = numericX ? Math.max(...xn) : 1
  if (numericX) {
    niceScale(xmin, xmax, 6).filter(t => t >= xmin - 1e-9 && t <= xmax + 1e-9).forEach(t => {
      const x = pl + ((t - xmin) / ((xmax - xmin) || 1)) * (pr - pl)
      parts.push(<text x={x} y={pb + fs * 1.25} text-anchor="middle" font-size={fs} fill={muted}>{fmtNum(t)}</text>)
    })
  } else cats.forEach((c, i) => {
    const mid = (horizontal ? pt2 : pl) + band * (slot(i) + 0.5)
    const maxChars = Math.max(3, Math.floor(band / (fs * 0.55)))
    const label = horizontal || String(c).length <= maxChars ? String(c) : String(c).slice(0, maxChars - 1) + '…'
    parts.push(horizontal ? <text x={pl - 6} y={mid + fs * 0.35} text-anchor="end" font-size={fs} fill={textColor}>{label}</text> : <text x={mid} y={pb + fs * 1.25} text-anchor="middle" font-size={fs} fill={textColor}>{label}</text>)
  })

  if (bars) {
    const gap = band * (deep ? 0.34 : 0.28), inner = band - gap
    const bw = stacked ? inner : inner / Math.max(series.length, 1)
    const acc = Array(n).fill(0).map(() => ({ pos: 0, neg: 0 }))
    const shadows = [], faces = [], labels = []
    series.forEach((s, si) => {
      const color = cssColor(seriesColor(el, si))
      if (deep) {
        defs.push(horizontal
          ? <linearGradient id={`${id}-f${si}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: shade(color, 16) }} /><stop offset="1" style={{ stopColor: shade(color, -12) }} /></linearGradient>
          : <linearGradient id={`${id}-f${si}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" style={{ stopColor: shade(color, 14) }} /><stop offset=".6" style={{ stopColor: color }} /><stop offset="1" style={{ stopColor: shade(color, -10) }} /></linearGradient>)
      }
      for (let i = 0; i < n; i++) {
        let v = +s.values[i] || 0
        if (percent) v = totals[i] ? v / totals[i] * 100 : 0
        let a, b
        if (stacked) { if (v >= 0) { a = acc[i].pos; b = a + v; acc[i].pos = b } else { a = acc[i].neg; b = a + v; acc[i].neg = b } } else { a = 0; b = v }
        const s1 = scale(Math.max(lo, Math.min(hi, a))), s2 = scale(Math.max(lo, Math.min(hi, b)))
        const bwi = bw * (deep ? 1 : 0.98)
        const off = (horizontal ? pt2 : pl) + band * slot(i) + gap / 2 + (stacked ? 0 : bw * (horizontal ? series.length - 1 - si : si))
        const order = horizontal ? (n - slot(i)) * 1000 + si : i * 1000 + si
        if (horizontal) {
          const x1 = Math.min(s1, s2), x2 = Math.max(s1, s2), y = off
          if (deep) {
            if (!stacked || si === 0) shadows.push(<rect x={zero} y={y + bwi * 0.15} width={Math.max(0, x2 - zero) + ddx} height={bwi * 1.05} style={{ fill: 'rgba(0,0,0,.30)' }} filter={blur(r2(bwi * 0.18))} />)
            faces.push({ order, el: [
              <path d={`M${x1} ${y} L${x1 + ddx} ${y + ddy} L${x2 + ddx} ${y + ddy} L${x2} ${y} Z`} style={{ fill: shade(color, 26) }} />,
              <path d={`M${x2} ${y} L${x2 + ddx} ${y + ddy} L${x2 + ddx} ${y + bwi + ddy} L${x2} ${y + bwi} Z`} style={{ fill: shade(color, -30) }} />,
              <rect x={x1} y={y} width={x2 - x1} height={bwi} style={{ fill: `url(#${id}-f${si})` }} />
            ] })
          } else faces.push({ order, el: [<rect x={x1} y={y} width={x2 - x1} height={bwi} style={{ fill: color }} />] })
          if (o.labels && v) {
            labels.push(stacked
              ? <text x={(x1 + x2) / 2} y={y + bwi / 2 + fs * 0.35} text-anchor="middle" font-size={fs * 0.9} font-weight="600" style={onColor(seriesColor(el, si), theme, fs * 0.9)}>{fmtNum(+s.values[i] || 0)}</text>
              : <text x={x2 + ddx + 4} y={y + bwi / 2 + fs * 0.35 + ddy / 2} font-size={fs * 0.9} fill={textColor}>{fmtNum(+s.values[i] || 0)}</text>)
          }
        } else {
          const y1 = Math.min(s1, s2), y2 = Math.max(s1, s2), x = off
          if (deep) {
            if (!stacked || si === 0) shadows.push(<ellipse cx={x + bwi / 2 + ddx * 0.6} cy={zero + ddy * 0.3} rx={bwi * 0.72} ry={Math.max(2, bwi * 0.16)} style={{ fill: 'rgba(0,0,0,.42)' }} filter={blur(r2(Math.max(1.2, bwi * 0.12)))} />)
            faces.push({ order, el: [
              <path d={`M${x + bwi} ${y1} L${x + bwi + ddx} ${y1 + ddy} L${x + bwi + ddx} ${y2 + ddy} L${x + bwi} ${y2} Z`} style={{ fill: shade(color, -32) }} />,
              <path d={`M${x} ${y1} L${x + ddx} ${y1 + ddy} L${x + bwi + ddx} ${y1 + ddy} L${x + bwi} ${y1} Z`} style={{ fill: shade(color, 30) }} />,
              <rect x={x} y={y1} width={bwi} height={y2 - y1} style={{ fill: `url(#${id}-f${si})` }} />
            ] })
          } else faces.push({ order, el: [<rect x={x} y={y1} width={bwi} height={y2 - y1} style={{ fill: color }} />] })
          if (o.labels && v) {
            labels.push(stacked
              ? <text x={x + bwi / 2} y={(y1 + y2) / 2 + fs * 0.35} text-anchor="middle" font-size={fs * 0.9} font-weight="600" style={onColor(seriesColor(el, si), theme, fs * 0.9)}>{fmtNum(+s.values[i] || 0)}</text>
              : <text x={x + bwi / 2 + ddx / 2} y={(b >= a ? y1 : y2 + fs) + ddy - 4} text-anchor="middle" font-size={fs * 0.9} font-weight="600" fill={textColor}>{fmtNum(+s.values[i] || 0)}</text>)
          }
        }
      }
    })
    parts.push(...shadows)
    faces.sort((p, q) => p.order - q.order).forEach(f => parts.push(...f.el))
    parts.push(...labels)
    return svg()
  }

  // lines, areas, scatter
  const acc = Array(n).fill(0)
  const layers = series.map((s, si) => {
    const pts = []
    for (let i = 0; i < n; i++) {
      let v = +s.values[i] || 0
      if (percent) v = totals[i] ? v / totals[i] * 100 : 0
      if (stacked) { acc[i] += v; v = acc[i] }
      const x = numericX ? pl + ((xn[i] - xmin) / ((xmax - xmin) || 1)) * (pr - pl) : pl + band * (slot(i) + 0.5)
      pts.push([x, scale(v)])
    }
    return { s, si, pts, color: cssColor(seriesColor(el, si)) }
  })
  const smooth = el.smooth ?? (deep && el.chartType !== 'scatter')
  const pathOf = pts => (smooth ? smoothPath(pts) : linePath(pts))
  const lw = Math.max(1.6, fs * (deep ? 0.22 : 0.2))
  // areas are drawn back to front so the first series stays in front
  if (el.chartType === 'area') {
    ;[...layers].reverse().forEach(({ pts, si, color }) => {
      if (!pts.length) return
      const base = zero
      defs.push(<linearGradient id={`${id}-a${si}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: color, stopOpacity: String(deep ? 0.78 : 0.6) }} /><stop offset="1" style={{ stopColor: color, stopOpacity: String(deep ? 0.12 : 0.45) }} /></linearGradient>)
      const edge = pathOf(pts)
      parts.push(<path d={`${edge} L${r2(pts[pts.length - 1][0])} ${r2(base)} L${r2(pts[0][0])} ${r2(base)} Z`} style={{ fill: `url(#${id}-a${si})` }} />)
      if (deep) parts.push(<path d={edge} style={{ fill: 'none', stroke: color, strokeWidth: lw * 2.2, opacity: 0.45 }} filter={blur(r2(lw * 1.4))} />)
      parts.push(<path d={edge} style={{ fill: 'none', stroke: color, strokeWidth: lw, strokeLinejoin: 'round', strokeLinecap: 'round' }} />)
    })
  }
  if (el.chartType === 'line') {
    layers.forEach(({ pts, si, color }) => {
      if (!pts.length) return
      const d = pathOf(pts)
      if (deep) {
        if (layers.length === 1) {
          defs.push(<linearGradient id={`${id}-u${si}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: color, stopOpacity: String(0.28) }} /><stop offset="1" style={{ stopColor: color, stopOpacity: String(0) }} /></linearGradient>)
          parts.push(<path d={`${d} L${r2(pts[pts.length - 1][0])} ${r2(pb)} L${r2(pts[0][0])} ${r2(pb)} Z`} style={{ fill: `url(#${id}-u${si})` }} />)
        }
        parts.push(<path d={d} transform={`translate(0 ${r2(lw * 1.6)})`} style={{ fill: 'none', stroke: 'rgba(0,0,0,.45)', strokeWidth: lw * 1.2 }} filter={blur(r2(lw * 1.3))} />)
        parts.push(<path d={d} style={{ fill: 'none', stroke: color, strokeWidth: lw * 2.6, opacity: 0.5 }} filter={blur(r2(lw * 1.5))} />)
      }
      parts.push(<path d={d} style={{ fill: 'none', stroke: color, strokeWidth: lw, strokeLinejoin: 'round', strokeLinecap: 'round' }} />)
    })
  }
  layers.forEach(({ pts, si, color }) => {
    if (el.chartType === 'line') {
      pts.forEach(p => parts.push(<circle cx={p[0]} cy={p[1]} r={Math.max(2.2, fs * (deep ? 0.27 : 0.28))} style={{ fill: deep ? color : cssColor('lt1'), stroke: deep ? cssColor('lt1') : color, strokeWidth: 1.5 }} />))
    }
    if (el.chartType === 'scatter') {
      const r = Math.max(2.6, fs * 0.36)
      if (deep) defs.push(<radialGradient id={`${id}-s${si}`} cx=".36" cy=".32" r=".75"><stop offset="0" style={{ stopColor: shade(color, 55) }} /><stop offset=".45" style={{ stopColor: color }} /><stop offset="1" style={{ stopColor: shade(color, -40) }} /></radialGradient>)
      pts.forEach(p => {
        if (deep) parts.push(<ellipse cx={p[0] + r * 0.3} cy={p[1] + r * 0.9} rx={r * 0.9} ry={r * 0.4} style={{ fill: 'rgba(0,0,0,.4)' }} filter={blur(r2(r * 0.35))} />)
        parts.push(<circle cx={p[0]} cy={p[1]} r={r} style={{ fill: deep ? `url(#${id}-s${si})` : color, stroke: deep ? 'none' : color }} />)
      })
    }
    if (o.labels) pts.forEach((p, i) => parts.push(<text x={p[0]} y={p[1] - fs * 0.7} text-anchor="middle" font-size={fs * 0.9} font-weight="600" fill={textColor}>{fmtNum(+series[si].values[i] || 0)}</text>))
  })
  return svg()
}

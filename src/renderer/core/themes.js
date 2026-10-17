// Prizma themes, colour variants, slide layouts and placeholder styles.
import { uid, solid, DEFAULT_INSET } from './model.js'

const g = (angle, ...stops) => ({ type: 'gradient', kind: 'linear', angle, stops: stops.map(([color, pos, alpha]) => ({ color, pos, ...(alpha !== undefined ? { alpha } : {}) })) })
const rg = (cx, cy, ...stops) => ({ type: 'gradient', kind: 'radial', cx, cy, stops: stops.map(([color, pos, alpha]) => ({ color, pos, ...(alpha !== undefined ? { alpha } : {}) })) })
const dec = (shape, x, y, w, h, fill, extra = {}) => ({ id: uid('m'), type: 'shape', shape, name: 'Decoration', x, y, w, h, rot: 0, fill, line: null, html: '', adj: {}, inset: { ...DEFAULT_INSET }, ...extra })

// ---------- generative decoration (deterministic, so every slide and every session looks the same) ----------
const f1 = v => Math.round(v * 10) / 10
const P = p => `${f1(p[0])} ${f1(p[1])}`
function rng (seed) {
  let s = seed >>> 0
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function closedSpline (pts) {
  const n = pts.length
  let d = `M${P(pts[0])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    d += ` C${P([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${P([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${P(p2)}`
  }
  return d + ' Z '
}
function openSpline (pts, move = true) {
  let d = move ? `M${P(pts[0])}` : `L${P(pts[0])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    d += ` C${P([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${P([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${P(p2)}`
  }
  return d
}
const circlePath = (cx, cy, r) => `M${f1(cx - r)} ${f1(cy)} A${f1(r)} ${f1(r)} 0 1 0 ${f1(cx + r)} ${f1(cy)} A${f1(r)} ${f1(r)} 0 1 0 ${f1(cx - r)} ${f1(cy)} Z `
// Topographic contour rings around a centre
function contours (cx, cy, r0, step, count, seed, squash = 0.72, wobble = 0.17) {
  const rand = rng(seed)
  const harm = [1, 2, 3, 5].map(k => ({ k, a: wobble * (0.4 + rand() * 0.6) / k, p: rand() * Math.PI * 2 }))
  let d = ''
  for (let j = 0; j < count; j++) {
    const R = r0 + j * step, pts = []
    for (let i = 0; i < 32; i++) {
      const t = i / 32 * Math.PI * 2
      let m = 1
      for (const h of harm) m += h.a * Math.sin(h.k * t + h.p + j * 0.08 * h.k)
      pts.push([cx + Math.cos(t) * R * m, cy + Math.sin(t) * R * m * squash])
    }
    d += closedSpline(pts)
  }
  return d
}
// A wavy band across the slide (northern-lights curtain)
function ribbon (W, H, y0, amp, thick, seed) {
  const rand = rng(seed)
  const ph = rand() * 6.28, ph2 = rand() * 6.28
  const top = [], bot = []
  for (let i = 0; i <= 16; i++) {
    const u = i / 16, x = W * (-0.08 + 1.16 * u)
    const y = H * y0 + Math.sin(u * 5.2 + ph) * amp * H + Math.sin(u * 11.3 + ph2) * amp * 0.3 * H
    top.push([x, y - thick * H * (0.5 + 0.5 * Math.abs(Math.sin(u * 3.3 + ph2)))]); bot.push([x, y])
  }
  return openSpline(top) + ' ' + openSpline(bot.reverse(), false) + ' Z'
}
function ridge (W, H, y0, amp, seed) {
  const rand = rng(seed)
  const pts = []
  for (let i = 0; i <= 18; i++) pts.push([W * (-0.04 + 1.08 * i / 18), H * y0 - rand() * amp * H * (0.4 + 0.6 * Math.sin(i / 18 * Math.PI))])
  return `M${f1(-W * 0.04)} ${f1(H + 2)} L` + pts.map(P).join(' L') + ` L${f1(W * 1.04)} ${f1(H + 2)} Z`
}
function stars (W, H, n, seed, yMax = 0.6) {
  const rand = rng(seed)
  let d = ''
  for (let i = 0; i < n; i++) d += circlePath(rand() * W, rand() * H * yMax, 0.35 + rand() * rand() * 1.1)
  return d
}
function gridPath (W, H, step) {
  let d = ''
  for (let x = step; x < W; x += step) d += `M${f1(x)} 0 L${f1(x)} ${f1(H)} `
  for (let y = step; y < H; y += step) d += `M0 ${f1(y)} L${f1(W)} ${f1(y)} `
  return d
}
const corners = (x, y, w, h, l) => `M${f1(x)} ${f1(y + l)} L${f1(x)} ${f1(y)} L${f1(x + l)} ${f1(y)} M${f1(x + w - l)} ${f1(y)} L${f1(x + w)} ${f1(y)} L${f1(x + w)} ${f1(y + l)} M${f1(x + w)} ${f1(y + h - l)} L${f1(x + w)} ${f1(y + h)} L${f1(x + w - l)} ${f1(y + h)} M${f1(x + l)} ${f1(y + h)} L${f1(x)} ${f1(y + h)} L${f1(x)} ${f1(y + h - l)}`
function reticle (cx, cy, r) {
  let d = circlePath(cx, cy, r) + circlePath(cx, cy, r * 0.7) + circlePath(cx, cy, r * 0.36)
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * Math.PI * 2, l = i % 6 === 0 ? 0.09 : 0.04
    d += `M${f1(cx + Math.cos(a) * r)} ${f1(cy + Math.sin(a) * r)} L${f1(cx + Math.cos(a) * r * (1 + l))} ${f1(cy + Math.sin(a) * r * (1 + l))} `
  }
  return d + `M${f1(cx - r * 1.25)} ${f1(cy)} L${f1(cx - r * 0.45)} ${f1(cy)} M${f1(cx + r * 0.45)} ${f1(cy)} L${f1(cx + r * 1.25)} ${f1(cy)} M${f1(cx)} ${f1(cy - r * 1.25)} L${f1(cx)} ${f1(cy - r * 0.45)} M${f1(cx)} ${f1(cy + r * 0.45)} L${f1(cx)} ${f1(cy + r * 1.25)}`
}
function floorGrid (W, H, horizon, cols = 14, rows = 9) {
  let d = ''
  for (let i = -cols; i <= cols; i++) d += `M${f1(W / 2 + i * W * 0.014)} ${f1(horizon)} L${f1(W / 2 + i * W * 0.12)} ${f1(H + 4)} `
  for (let k = 1; k <= rows; k++) { const y = horizon + (H + 4 - horizon) * Math.pow(k / rows, 1.85); d += `M0 ${f1(y)} L${f1(W)} ${f1(y)} ` }
  return d
}
// Decoration elements built from a path (drawn in slide coordinates)
const pathDec = (d, W, H, extra = {}) => ({ id: uid('m'), type: 'shape', shape: 'custom', name: 'Decoration', x: 0, y: 0, w: W, h: H, rot: 0, path: d, pathVB: { w: W, h: H }, pathLocked: true, fill: null, line: null, html: '', adj: {}, inset: { ...DEFAULT_INSET }, ...extra })
const ink = (color, alpha, width = 0.75) => ({ color, alpha, width, dash: 'solid' })
const glow = (x, y, w, h, color, a, spread = 68) => dec('ellipse', x, y, w, h, rg(50, 50, [color, 0, a], [color, spread * 0.55, a * 0.45], [color, spread, 0]))
const bar = (x, y, w, h, c1 = 'accent1', c2 = 'accent2') => dec('rect', x, y, w, h, g(0, [c1, 0], [c2, 100]))
// The accent under a top title; only layouts that have a title up there get it (see slideDecor)
const titleBar = (W, H) => [bar(W * 0.07 + 7, H * 0.228, 44, 3)]
const sunStops = () => {
  const s = [['accent3', 0, 1], ['accent5', 42, 1], ['accent1', 56, 1]]
  for (const [a, b] of [[58, 62], [67, 71.5], [76, 81], [85, 91]]) s.push(['accent1', a, 1], ['accent1', a, 0], ['accent1', b, 0], ['accent1', b, 1])
  s.push(['accent1', 100, 1])
  return s
}

export const THEMES = [
  {
    id: 'aurora', name: 'Aurora', dark: true,
    colors: { lt1: '#0B1124', dk1: '#F3F6FF', lt2: '#17213F', dk2: '#9AA6C8', accent1: '#2DD4BF', accent2: '#7B83FF', accent3: '#FF6B8A', accent4: '#F7C35F', accent5: '#4CC9F0', accent6: '#B48CFF', hlink: '#4CC9F0', folHlink: '#B48CFF' },
    fonts: { major: 'Segoe UI Semibold', minor: 'Segoe UI' },
    title: { size: 40, bold: false, align: 'left', color: 'dk1' }, body: { size: 22, color: 'dk1' }, sub: { color: 'dk2' }, shapeText: 'lt1',
    bg: { title: g(45, ['lt2', 0], ['lt1', 58]), content: g(45, ['lt2', 0], ['lt1', 45]), section: g(45, ['lt2', 0], ['lt1', 70]) },
    decor: (kind, W, H) => kind === 'title'
      ? [
          glow(-W * 0.3, -H * 0.62, W * 0.95, W * 0.95, 'accent1', 0.34),
          glow(W * 0.52, -H * 0.7, W * 0.9, W * 0.9, 'accent2', 0.3),
          glow(W * 0.72, H * 0.52, W * 0.46, W * 0.46, 'accent3', 0.12),
          pathDec(contours(W * 0.84, H * 0.66, W * 0.035, W * 0.026, 15, 7), W, H, { line: ink('dk1', 0.085) }),
          bar(W * 0.07 + 7, H * 0.535, 112, 4)
        ]
      : kind === 'section'
        ? [
            glow(W * 0.42, -H * 0.2, W * 0.8, W * 0.8, 'accent2', 0.26),
            glow(-W * 0.2, H * 0.3, W * 0.6, W * 0.6, 'accent1', 0.2),
            pathDec(contours(W * 0.12, H * 0.78, W * 0.03, W * 0.024, 13, 11), W, H, { line: ink('dk1', 0.07) }),
            bar(W * 0.07 + 7, H * 0.565, 72, 4)
          ]
        : [
            glow(-W * 0.24, -H * 0.72, W * 0.66, W * 0.66, 'accent1', 0.16),
            glow(W * 0.66, -H * 0.8, W * 0.62, W * 0.62, 'accent2', 0.13),
            pathDec(contours(W * 1.02, H * 1.04, W * 0.03, W * 0.022, 12, 3), W, H, { line: ink('dk1', 0.05) })
          ],
    titleBar,
    variants: [
      { name: 'Teal', colors: {} },
      { name: 'Violet', colors: { accent1: '#9D8CFF', accent2: '#2DD4BF', accent6: '#7B83FF' } },
      { name: 'Coral', colors: { accent1: '#FF6B8A', accent2: '#7B83FF', accent3: '#2DD4BF' } },
      { name: 'Deep blue', colors: { lt1: '#081A33', lt2: '#11294D', accent1: '#4CC9F0', accent2: '#2DD4BF', accent5: '#7B83FF' } }
    ]
  },
  {
    id: 'nordlys', name: 'Nordlys', dark: true,
    colors: { lt1: '#030E12', dk1: '#ECFFF9', lt2: '#0A2027', dk2: '#93C4BA', accent1: '#3BF0B0', accent2: '#36C5F0', accent3: '#9B7BFF', accent4: '#F5D76E', accent5: '#FF7EB6', accent6: '#7CF29A', hlink: '#36C5F0', folHlink: '#9B7BFF' },
    fonts: { major: 'Segoe UI Light', minor: 'Segoe UI' },
    title: { size: 46, bold: false, align: 'left', color: 'dk1' }, body: { size: 22, color: 'dk1' }, sub: { color: 'dk2' }, shapeText: 'lt1',
    bg: { title: g(90, ['lt2', 0], ['lt1', 72]), content: g(90, ['lt2', 0], ['lt1', 55]), section: g(90, ['lt2', 0], ['lt1', 80]) },
    decor: (kind, W, H) => kind === 'content'
      ? [
          pathDec(stars(W, H, 26, 5, 0.2), W, H, { fill: solid('dk1', 0.45) }),
          pathDec(ribbon(W, H, 0.07, 0.025, 0.1, 4), W, H, { fill: g(90, ['accent1', 0, 0], ['accent1', 78, 0.32], ['accent2', 100, 0.06]), softEdge: 5 }),
          pathDec(ribbon(W, H, 0.05, 0.02, 0.08, 9), W, H, { fill: g(90, ['accent3', 0, 0], ['accent3', 80, 0.22], ['accent3', 100, 0]), softEdge: 5 })
        ]
      : [
          pathDec(stars(W, H, 70, 2, 0.62), W, H, { fill: solid('dk1', 0.55) }),
          pathDec(ribbon(W, H, 0.24, 0.07, 0.3, 21), W, H, { fill: g(90, ['accent3', 0, 0], ['accent3', 82, 0.3], ['accent3', 100, 0.05]), softEdge: 9 }),
          pathDec(ribbon(W, H, 0.34, 0.06, 0.36, 8), W, H, { fill: g(90, ['accent1', 0, 0], ['accent1', 80, 0.55], ['accent2', 100, 0.1]), softEdge: 8 }),
          pathDec(ribbon(W, H, 0.3, 0.05, 0.2, 13), W, H, { fill: g(90, ['accent2', 0, 0], ['accent2', 85, 0.32], ['accent2', 100, 0]), softEdge: 7 }),
          pathDec(ridge(W, H, 0.9, 0.16, 6), W, H, { fill: g(90, ['lt2', 0], ['lt1', 100]) }),
          pathDec(ridge(W, H, 0.96, 0.1, 12), W, H, { fill: solid('lt1') })
        ],
    variants: [
      { name: 'Green', colors: {} },
      { name: 'Polar', colors: { accent1: '#36C5F0', accent2: '#9B7BFF', accent3: '#3BF0B0' } },
      { name: 'Magenta', colors: { accent1: '#FF7EB6', accent2: '#9B7BFF', accent3: '#36C5F0', lt1: '#0E0716', lt2: '#20102E' } }
    ]
  },
  {
    id: 'blueprint', name: 'Blueprint', dark: true,
    colors: { lt1: '#0B1E3A', dk1: '#EAF4FF', lt2: '#14305A', dk2: '#8FB3D9', accent1: '#3EE6FF', accent2: '#FF9BD2', accent3: '#F4E04D', accent4: '#7CF0B5', accent5: '#A99BFF', accent6: '#FFB86B', hlink: '#3EE6FF', folHlink: '#A99BFF' },
    fonts: { major: 'Bahnschrift SemiBold', minor: 'Bahnschrift' },
    title: { size: 38, bold: false, align: 'left', color: 'dk1' }, body: { size: 21, color: 'dk1' }, sub: { color: 'dk2' }, shapeText: 'lt1', titleBoxW: 0.56,
    bg: { title: g(90, ['lt2', 0], ['lt1', 100]), content: g(90, ['lt2', 0], ['lt1', 60]), section: g(90, ['lt2', 0], ['lt1', 100]) },
    decor: (kind, W, H) => {
      const grid = [pathDec(gridPath(W, H, 20), W, H, { line: ink('dk1', 0.045, 0.5) }), pathDec(gridPath(W, H, 100), W, H, { line: ink('accent1', 0.09, 0.75) })]
      if (kind === 'title') {
        return [
          ...grid,
          glow(W * 0.5, H * 0.05, W * 0.62, W * 0.62, 'accent1', 0.16),
          pathDec(reticle(W * 0.83, H * 0.47, H * 0.23), W, H, { line: ink('accent1', 0.38, 1) }),
          pathDec(corners(22, 22, W - 44, H - 44, 26), W, H, { line: ink('accent1', 0.75, 1.5) }),
          dec('rect', W * 0.07, H * 0.535, W * 0.42, 1, solid('dk1', 0.25)),
          dec('rect', W * 0.07, H * 0.535 - 1, 120, 3, solid('accent1'))
        ]
      }
      if (kind === 'section') {
        return [...grid, pathDec(reticle(W * 0.83, H * 0.5, H * 0.34), W, H, { line: ink('accent1', 0.3, 1) }), pathDec(corners(22, 22, W - 44, H - 44, 22), W, H, { line: ink('accent1', 0.6, 1.25) }), dec('rect', W * 0.07, H * 0.565, 72, 3, solid('accent1'))]
      }
      return [...grid, pathDec(corners(14, 14, W - 28, H - 28, 16), W, H, { line: ink('accent1', 0.5, 1.25) })]
    },
    titleBar: (W, H) => [dec('rect', W * 0.07, H * 0.228, W * 0.86, 1, solid('dk1', 0.2)), dec('rect', W * 0.07, H * 0.228 - 1, 64, 3, solid('accent1'))],
    variants: [
      { name: 'Cyan', colors: {} },
      { name: 'Signal', colors: { accent1: '#F4E04D', accent2: '#3EE6FF', accent3: '#FF9BD2' } },
      { name: 'Night', colors: { lt1: '#071224', lt2: '#0E2244' } }
    ]
  },
  {
    id: 'neon', name: 'Neon Grid', dark: true,
    colors: { lt1: '#0D0720', dk1: '#FFF2FF', lt2: '#24103F', dk2: '#C9A8FF', accent1: '#FF4FD8', accent2: '#22E1FF', accent3: '#FFD84D', accent4: '#8A5CFF', accent5: '#FF8A3D', accent6: '#3DFFA2', hlink: '#22E1FF', folHlink: '#8A5CFF' },
    fonts: { major: 'Bahnschrift SemiBold', minor: 'Bahnschrift' },
    title: { size: 44, bold: false, align: 'left', color: 'dk1' }, body: { size: 22, color: 'dk1' }, sub: { color: 'dk2' }, shapeText: 'lt1', titleBoxW: 0.55,
    bg: { title: g(90, ['lt1', 0], ['lt2', 100]), content: g(90, ['lt1', 0], ['lt1', 70], ['lt2', 100]), section: g(90, ['lt1', 0], ['lt2', 100]) },
    decor: (kind, W, H) => {
      if (kind === 'content') {
        return [
          glow(W * 0.55, -H * 0.85, W * 0.7, W * 0.7, 'accent1', 0.14),
          dec('rect', 0, H * 0.84, W, H * 0.16, g(90, ['accent1', 0, 0], ['accent1', 100, 0.16])),
          pathDec(floorGrid(W, H, H * 0.86, 14, 4), W, H, { line: ink('accent1', 0.32, 0.6) })
        ]
      }
      const hz = H * 0.73
      return [
        glow(W * 0.36, H * 0.05, W * 0.75, W * 0.75, 'accent4', 0.22),
        dec('ellipse', W * 0.645, H * 0.14, H * 0.62, H * 0.62, g(90, ...sunStops())),
        pathDec(ridge(W, H, hz / H + 0.005, 0.12, 31), W, H, { fill: solid('accent4', 0.38) }),
        dec('rect', 0, hz - H * 0.08, W, H * 0.08, g(90, ['accent1', 0, 0], ['accent1', 100, 0.45])),
        dec('rect', 0, hz, W, H - hz, g(90, ['lt1', 0], ['lt2', 100])),
        pathDec(floorGrid(W, H, hz), W, H, { line: ink('accent1', 0.62, 0.9) }),
        dec('rect', 0, hz - 1, W, 2, solid('accent1', 0.9)),
        bar(W * 0.07 + 7, H * (kind === 'title' ? 0.535 : 0.565), 112, 4, 'accent1', 'accent2')
      ]
    },
    titleBar,
    variants: [
      { name: 'Magenta', colors: {} },
      { name: 'Cyan', colors: { accent1: '#22E1FF', accent2: '#FF4FD8', accent5: '#3DFFA2' } },
      { name: 'Sunset', colors: { accent1: '#FF8A3D', accent2: '#FFD84D', accent3: '#FFE98A', accent5: '#FF4FD8', lt1: '#170A14', lt2: '#311327' } }
    ]
  },
  {
    id: 'graphite', name: 'Graphite', dark: true,
    colors: { lt1: '#111215', dk1: '#F4F5F7', lt2: '#1C1E24', dk2: '#A3A7B2', accent1: '#C6F432', accent2: '#5BC8FF', accent3: '#FF7A59', accent4: '#B593FF', accent5: '#FFD24D', accent6: '#38E0B0', hlink: '#5BC8FF', folHlink: '#B593FF' },
    fonts: { major: 'Segoe UI Black', minor: 'Segoe UI' },
    title: { size: 42, bold: false, align: 'left', color: 'dk1' }, body: { size: 21, color: 'dk1' }, sub: { color: 'dk2' }, shapeText: 'lt1', titleBoxW: 0.5,
    bg: { title: g(45, ['lt2', 0], ['lt1', 62]), content: g(45, ['lt2', 0], ['lt1', 50]), section: g(45, ['lt2', 0], ['lt1', 70]) },
    decor: (kind, W, H) => {
      const orb = (x, y, d, halo = 0.24) => [
        glow(x - d * 0.4, y - d * 0.4, d * 1.8, d * 1.8, 'accent1', halo),
        dec('ellipse', x, y, d, d, rg(34, 28, ['accent1:55', 0], ['accent1', 38], ['accent6', 78], ['accent6:-35', 100]))
      ]
      const glass = (x, y, w, h) => dec('roundRect', x, y, w, h, g(45, ['dk1', 0, 0.12], ['dk1', 100, 0.04]), { adj: { adj: 0.09 }, line: ink('dk1', 0.18, 0.75) })
      if (kind === 'title') {
        return [
          ...orb(W * 0.66, H * 0.12, H * 0.52),
          glass(W * 0.6, H * 0.5, W * 0.33, H * 0.36),
          dec('rect', W * 0.6 + 22, H * 0.5 + 28, W * 0.15, 6, solid('dk1', 0.45), { adj: {} }),
          dec('rect', W * 0.6 + 22, H * 0.5 + 44, W * 0.22, 4, solid('dk1', 0.2)),
          dec('rect', W * 0.6 + 22, H * 0.5 + 56, W * 0.18, 4, solid('dk1', 0.2)),
          dec('ellipse', W * 0.93 - 34, H * 0.86 - 34, 14, 14, solid('accent1')),
          dec('ellipse', W * 0.07 + 7, H * 0.535 - 5, 10, 10, solid('accent1')),
          dec('rect', W * 0.07 + 24, H * 0.535, 70, 1.5, solid('dk1', 0.35))
        ]
      }
      if (kind === 'section') return [...orb(W * 0.7, H * 0.22, H * 0.56, 0.2), glass(W * 0.62, H * 0.56, W * 0.28, H * 0.26), dec('ellipse', W * 0.07 + 7, H * 0.565 - 4, 9, 9, solid('accent1'))]
      return orb(W - 70, -46, 120, 0.14)
    },
    titleBar: (W, H) => [dec('rect', W * 0.07 + 7, H * 0.228, 44, 3, solid('accent1'))],
    variants: [
      { name: 'Lime', colors: {} },
      { name: 'Ice', colors: { accent1: '#5BC8FF', accent2: '#C6F432', accent6: '#B593FF' } },
      { name: 'Coral', colors: { accent1: '#FF7A59', accent2: '#FFD24D', accent6: '#FF5C9D' } }
    ]
  },
  {
    id: 'prism', name: 'Prism', dark: false,
    colors: { lt1: '#F7F8FC', dk1: '#121530', lt2: '#E9ECF7', dk2: '#56607E', accent1: '#6C5CFF', accent2: '#FF5C9D', accent3: '#18C3D9', accent4: '#FFB547', accent5: '#2FD39A', accent6: '#3B82F6', hlink: '#6C5CFF', folHlink: '#FF5C9D' },
    fonts: { major: 'Segoe UI Semibold', minor: 'Segoe UI' },
    title: { size: 42, bold: false, align: 'left', color: 'dk1' }, body: { size: 22, color: 'dk1' }, sub: { color: 'dk2' }, shapeText: 'lt1', titleBoxW: 0.56,
    bg: { title: solid('lt1'), content: solid('lt1'), section: solid('lt1') },
    decor: (kind, W, H) => kind === 'content'
      ? [
          glow(W * 0.8, -H * 0.42, W * 0.36, W * 0.36, 'accent3', 0.32),
          glow(W * 0.9, -H * 0.3, W * 0.3, W * 0.3, 'accent2', 0.28),
          glow(W * 0.7, -H * 0.5, W * 0.32, W * 0.32, 'accent1', 0.22)
        ]
      : [
          glow(W * 0.5, -H * 0.5, W * 0.72, W * 0.72, 'accent3', 0.5),
          glow(W * 0.62, H * 0.1, W * 0.62, W * 0.62, 'accent2', 0.48),
          glow(W * 0.42, H * 0.38, W * 0.5, W * 0.5, 'accent1', 0.36),
          glow(W * 0.82, H * 0.48, W * 0.36, W * 0.36, 'accent4', 0.42),
          pathDec(contours(W * 0.78, H * 0.42, W * 0.04, W * 0.03, 11, 17), W, H, { line: ink('lt1', 0.5, 0.75) }),
          bar(W * 0.07 + 7, H * (kind === 'title' ? 0.535 : 0.565), 96, 4)
        ],
    titleBar,
    variants: [
      { name: 'Iris', colors: {} },
      { name: 'Lagoon', colors: { accent1: '#18C3D9', accent2: '#6C5CFF', accent3: '#2FD39A' } },
      { name: 'Peach', colors: { accent1: '#FF5C9D', accent2: '#FFB547', accent3: '#6C5CFF' } }
    ]
  },
  {
    id: 'frost', name: 'Frost', dark: false,
    colors: { lt1: '#F1F6FB', dk1: '#0B1A33', lt2: '#DCE7F3', dk2: '#4C6280', accent1: '#0EA5A4', accent2: '#3B5BDB', accent3: '#E8590C', accent4: '#F59F00', accent5: '#7048E8', accent6: '#12B886', hlink: '#3B5BDB', folHlink: '#7048E8' },
    fonts: { major: 'Segoe UI Semibold', minor: 'Segoe UI' },
    title: { size: 40, bold: false, align: 'left', color: 'dk1' }, body: { size: 22, color: 'dk1' }, sub: { color: 'dk2' }, shapeText: 'lt1', titleBoxW: 0.5,
    bg: { title: g(90, ['lt1', 0], ['lt2', 100]), content: g(90, ['lt1', 0], ['lt1', 60], ['lt2', 100]), section: g(45, ['accent2', 0], ['accent1', 100]) },
    sectionText: 'lt1',
    decor: (kind, W, H) => {
      if (kind === 'title') {
        return [
          dec('roundRect', W * 0.6, H * 0.07, W * 0.33, H * 0.86, g(45, ['accent2', 0], ['accent1', 100]), { adj: { adj: 0.06 } }),
          pathDec(contours(W * 0.77, H * 0.5, W * 0.02, W * 0.022, 7, 23, 1.15, 0.14), W, H, { line: ink('lt1', 0.3, 0.75) }),
          dec('ellipse', W * 0.83, H * 0.16, 12, 12, solid('lt1', 0.9)),
          bar(W * 0.07 + 7, H * 0.535, 96, 4)
        ]
      }
      if (kind === 'section') return [pathDec(contours(W * 0.82, H * 0.5, W * 0.04, W * 0.03, 12, 29), W, H, { line: ink('lt1', 0.22, 0.75) }), dec('rect', W * 0.07 + 7, H * 0.565, 72, 4, solid('lt1'))]
      return [pathDec(contours(W * 0.98, -H * 0.04, W * 0.03, W * 0.022, 11, 5), W, H, { line: ink('dk2', 0.14, 0.75) })]
    },
    titleBar,
    variants: [
      { name: 'Glacier', colors: {} },
      { name: 'Indigo', colors: { accent1: '#3B5BDB', accent2: '#7048E8', accent6: '#0EA5A4' } },
      { name: 'Pine', colors: { accent1: '#12B886', accent2: '#0B6E4F', accent6: '#0EA5A4' } }
    ]
  },
  {
    id: 'ember', name: 'Ember', dark: true,
    colors: { lt1: '#120A09', dk1: '#FFF4EE', lt2: '#2A1610', dk2: '#CDA99A', accent1: '#FF6A2B', accent2: '#FFC24B', accent3: '#FF4F6D', accent4: '#9E7BFF', accent5: '#3DD6C6', accent6: '#F2E3D5', hlink: '#FFC24B', folHlink: '#9E7BFF' },
    fonts: { major: 'Segoe UI Semibold', minor: 'Segoe UI' },
    title: { size: 42, bold: false, align: 'left', color: 'dk1' }, body: { size: 22, color: 'dk1' }, sub: { color: 'dk2' }, shapeText: 'lt1',
    bg: { title: g(90, ['lt1', 0], ['lt1', 40], ['lt2', 100]), content: g(90, ['lt1', 0], ['lt1', 60], ['lt2', 100]), section: g(90, ['lt1', 0], ['lt2', 100]) },
    decor: (kind, W, H) => kind === 'content'
      ? [glow(W * 0.62, H * 0.62, W * 0.62, W * 0.62, 'accent1', 0.16), pathDec(contours(W * 0.96, H * 1.02, W * 0.03, W * 0.022, 12, 41), W, H, { line: ink('accent2', 0.08) })]
      : [
          glow(-W * 0.1, H * 0.42, W * 0.95, H * 1.25, 'accent1', 0.6),
          glow(W * 0.42, H * 0.5, W * 0.72, H * 1.0, 'accent3', 0.36),
          glow(W * 0.16, H * 0.74, W * 0.44, H * 0.5, 'accent2', 0.42),
          pathDec(contours(W * 0.82, H * 0.62, W * 0.03, W * 0.025, 15, 37), W, H, { line: ink('accent2', 0.12) }),
          bar(W * 0.07 + 7, H * (kind === 'title' ? 0.535 : 0.565), 112, 4)
        ],
    titleBar,
    variants: [
      { name: 'Ember', colors: {} },
      { name: 'Rose', colors: { accent1: '#FF4F6D', accent2: '#FF9AA9', accent3: '#9E7BFF' } },
      { name: 'Gold', colors: { accent1: '#FFC24B', accent2: '#FF7A3D', accent3: '#F2E3D5' } }
    ]
  },
  {
    id: 'mono', name: 'Mono', dark: false,
    colors: { lt1: '#FFFFFF', dk1: '#0B0B10', lt2: '#F1F2F5', dk2: '#5D6170', accent1: '#2E5BFF', accent2: '#0B0B10', accent3: '#FF4D3D', accent4: '#12B886', accent5: '#F59F00', accent6: '#7048E8', hlink: '#2E5BFF', folHlink: '#7048E8' },
    fonts: { major: 'Segoe UI Black', minor: 'Segoe UI' },
    title: { size: 46, bold: false, align: 'left', color: 'dk1' }, body: { size: 22, color: 'dk1' }, sub: { color: 'dk2' }, shapeText: 'lt1', titleBoxW: 0.58,
    sectionText: 'lt1',
    bg: { title: solid('lt1'), content: solid('lt1'), section: solid('accent1') },
    decor: (kind, W, H) => kind === 'title'
      ? [dec('ellipse', W * 0.66, -H * 0.18, W * 0.62, W * 0.62, solid('accent1')), dec('ellipse', W * 0.6, H * 0.62, W * 0.14, W * 0.14, solid('accent3')), dec('rect', W * 0.07 + 7, H * 0.535, W * 0.42, 2, solid('dk1'))]
      : kind === 'section'
        ? [dec('ellipse', W * 0.62, H * 0.1, H * 0.8, H * 0.8, null, { line: ink('lt1', 0.35, 1.5) }), dec('ellipse', W * 0.7, H * 0.25, H * 0.5, H * 0.5, null, { line: ink('lt1', 0.25, 1.5) }), dec('rect', W * 0.07 + 7, H * 0.565, 72, 4, solid('lt1'))]
        : [],
    titleBar: (W, H) => [dec('rect', W * 0.07 + 7, H * 0.228, W * 0.86, 1, solid('dk1', 0.18)), dec('rect', W * 0.07 + 7, H * 0.228 - 2, 44, 5, solid('accent1'))],
    variants: [
      { name: 'Electric', colors: {} },
      { name: 'Signal', colors: { accent1: '#FF4D3D', accent3: '#2E5BFF' } },
      { name: 'Acid', colors: { accent1: '#00B37A', accent3: '#2E5BFF' } }
    ]
  },
  {
    id: 'blank', name: 'Blank', dark: false,
    colors: { lt1: '#FFFFFF', dk1: '#000000', lt2: '#E8E8EC', dk2: '#3A3F4B', accent1: '#3B6FD8', accent2: '#E07A2E', accent3: '#8E8E93', accent4: '#F2B705', accent5: '#4BA3C3', accent6: '#5CB85C', hlink: '#2F6BD8', folHlink: '#8E5CC9' },
    fonts: { major: 'Calibri', minor: 'Calibri' },
    title: { size: 44, bold: false, align: 'left', color: 'dk1' }, body: { size: 24, color: 'dk1' }, sub: { color: 'dk2' }, shapeText: 'lt1', titleSlideAlign: 'center',
    bg: { title: solid('lt1'), content: solid('lt1'), section: solid('lt1') },
    decor: () => [],
    variants: [{ name: 'White', colors: {} }, { name: 'Soft gray', colors: { lt1: '#F4F5F7' } }, { name: 'Dark', colors: { lt1: '#16181D', dk1: '#F5F5F7', lt2: '#2A2D35', dk2: '#B8BCC6' } }]
  }
]
export const themeById = id => THEMES.find(t => t.id === id) || THEMES.find(t => t.id === 'blank')

// A document stores a snapshot of its theme (colours/fonts may be edited or imported); decor/bg are looked up by id.
export function makeDocTheme (themeId, variantIdx = 0) {
  const t = themeById(themeId)
  const v = t.variants?.[variantIdx] || { colors: {} }
  return { id: t.id, name: t.name, variant: variantIdx, colors: { ...t.colors, ...v.colors }, fonts: { ...t.fonts } }
}
export const themeSpec = theme => THEMES.find(t => t.id === theme?.id) || null

export const LAYOUTS = [
  { id: 'title', name: 'Title Slide', kind: 'title' },
  { id: 'titleContent', name: 'Title and Content', kind: 'content' },
  { id: 'section', name: 'Section Header', kind: 'section' },
  { id: 'twoContent', name: 'Two Content', kind: 'content' },
  { id: 'comparison', name: 'Comparison', kind: 'content' },
  { id: 'titleOnly', name: 'Title Only', kind: 'content' },
  { id: 'blank', name: 'Blank', kind: 'content' },
  { id: 'contentCaption', name: 'Content with Caption', kind: 'content' },
  { id: 'pictureCaption', name: 'Picture with Caption', kind: 'content' },
  { id: 'statement', name: 'Big Statement', kind: 'section' }
]
export const layoutKind = id => LAYOUTS.find(l => l.id === id)?.kind || 'content'

const BULLET_P = '<p data-bu="•" data-lvl="0" style="margin-left: 27pt; text-indent: -27pt; --hang: 27pt"><br></p>'
const PLAIN_P = '<p><br></p>'
export const PROMPTS = { title: 'Click to add title', ctrTitle: 'Click to add title', subTitle: 'Click to add subtitle', body: 'Click to add text', pic: 'Click icon to add picture' }

// Builds placeholder elements for a layout. Positions are relative to the slide size.
export function layoutPlaceholders (layoutId, size, theme) {
  const spec = themeSpec(theme) || themeById('blank')
  const W = size.w, H = size.h, mx = W * 0.07
  const T = spec.title, B = spec.body
  const kind = layoutKind(layoutId)
  const onAccent = kind === 'section' && spec.sectionText
  const titleColor = onAccent || T.color
  const ph = (role, x, y, w, h, ts, extra = {}) => ({
    id: uid(), type: 'text', name: role === 'title' ? 'Title' : role === 'subTitle' ? 'Subtitle' : role === 'pic' ? 'Picture Placeholder' : 'Content Placeholder',
    ph: role, x, y, w, h, rot: 0, html: role === 'body' ? BULLET_P : PLAIN_P, fill: null, line: null, inset: { ...DEFAULT_INSET },
    vAlign: extra.vAlign || 'top', wrap: true, autofit: 'shrink', ts, ...extra
  })
  const titleTs = (size, align) => ({ font: '+major', size, color: titleColor, bold: !!T.bold, align: align || T.align })
  const bodyTs = (size, color = B.color) => ({ font: '+minor', size, color: onAccent || color })
  const gap = W * 0.04
  const tw = spec.titleBoxW ? W * spec.titleBoxW : W - mx * 2 // keeps title and section text clear of the art on the right
  switch (layoutId) {
    case 'title': {
      const align = spec.titleSlideAlign || T.align
      return [
        ph('title', mx, H * 0.3, tw, H * 0.22, titleTs(Math.round(T.size * 1.35), align), { vAlign: 'bottom' }),
        ph('subTitle', mx, H * 0.56, tw, H * 0.16, { ...bodyTs(B.size, spec.sub.color), align }, { vAlign: 'top' })
      ]
    }
    case 'section':
      return [
        ph('title', mx, H * 0.36, tw, H * 0.2, titleTs(Math.round(T.size * 1.15)), { vAlign: 'bottom' }),
        ph('body', mx, H * 0.58, tw, H * 0.14, bodyTs(B.size - 2, onAccent || 'dk2'), { html: PLAIN_P })
      ]
    case 'statement':
      return [ph('body', mx, H * 0.2, W - mx * 2, H * 0.6, { ...bodyTs(Math.round(T.size * 1.1)), font: '+major', bold: !!T.bold, align: 'center' }, { html: PLAIN_P, vAlign: 'middle' })]
    case 'titleContent':
      return [ph('title', mx, H * 0.075, W - mx * 2, H * 0.14, titleTs(T.size), { vAlign: 'bottom' }), ph('body', mx, H * 0.26, W - mx * 2, H * 0.64, bodyTs(B.size))]
    case 'twoContent': {
      const cw = (W - mx * 2 - gap) / 2
      return [ph('title', mx, H * 0.075, W - mx * 2, H * 0.14, titleTs(T.size), { vAlign: 'bottom' }), ph('body', mx, H * 0.26, cw, H * 0.64, bodyTs(B.size - 2)), ph('body', mx + cw + gap, H * 0.26, cw, H * 0.64, bodyTs(B.size - 2))]
    }
    case 'comparison': {
      const cw = (W - mx * 2 - gap) / 2
      const head = { ...bodyTs(B.size), bold: true }
      return [
        ph('title', mx, H * 0.075, W - mx * 2, H * 0.14, titleTs(T.size), { vAlign: 'bottom' }),
        ph('body', mx, H * 0.25, cw, H * 0.09, head, { html: PLAIN_P, vAlign: 'bottom', name: 'Text Placeholder' }),
        ph('body', mx, H * 0.36, cw, H * 0.54, bodyTs(B.size - 2)),
        ph('body', mx + cw + gap, H * 0.25, cw, H * 0.09, head, { html: PLAIN_P, vAlign: 'bottom', name: 'Text Placeholder' }),
        ph('body', mx + cw + gap, H * 0.36, cw, H * 0.54, bodyTs(B.size - 2))
      ]
    }
    case 'titleOnly':
      return [ph('title', mx, H * 0.075, W - mx * 2, H * 0.14, titleTs(T.size), { vAlign: 'bottom' })]
    case 'contentCaption':
      return [
        ph('title', mx, H * 0.1, W * 0.32, H * 0.22, titleTs(Math.round(T.size * 0.75), 'left'), { vAlign: 'bottom' }),
        ph('body', W * 0.43, H * 0.1, W * 0.5, H * 0.8, bodyTs(B.size)),
        ph('body', mx, H * 0.35, W * 0.32, H * 0.55, bodyTs(Math.round(B.size * 0.75), 'dk2'), { html: PLAIN_P, name: 'Text Placeholder' })
      ]
    case 'pictureCaption':
      return [
        ph('title', mx, H * 0.1, W * 0.32, H * 0.22, titleTs(Math.round(T.size * 0.75), 'left'), { vAlign: 'bottom' }),
        ph('pic', W * 0.43, H * 0.1, W * 0.5, H * 0.8, bodyTs(B.size), { html: PLAIN_P }),
        ph('body', mx, H * 0.35, W * 0.32, H * 0.55, bodyTs(Math.round(B.size * 0.75), 'dk2'), { html: PLAIN_P, name: 'Text Placeholder' })
      ]
    default:
      return []
  }
}
// Theme background and decorative master elements for a slide
export function slideBackground (slide, theme) {
  if (slide.bg) return slide.bg
  const spec = themeSpec(theme)
  if (!spec) return solid('lt1')
  return spec.bg[layoutKind(slide.layout)] || spec.bg.content
}
export function slideDecor (slide, theme, size) {
  if (slide.hideMaster) return []
  if (slide.master) return slide.master
  const spec = themeSpec(theme)
  if (!spec || !slide.layout) return []
  // The statement's text runs across the middle, where the title and section art sits
  const k = slide.layout === 'statement' ? 'content' : layoutKind(slide.layout)
  const bar = TOP_TITLE.has(slide.layout) && spec.titleBar
  const key = `${spec.id}|${k}|${!!bar}|${size.w}x${size.h}`
  if (!decorCache.has(key)) decorCache.set(key, [...spec.decor(k, size.w, size.h), ...(bar ? bar(size.w, size.h) : [])])
  return decorCache.get(key)
}
const decorCache = new Map()
const TOP_TITLE = new Set(['titleContent', 'twoContent', 'comparison', 'titleOnly'])

export function newSlide (layoutId, size, theme) {
  return { id: uid('s'), layout: layoutId, bg: null, elements: layoutPlaceholders(layoutId, size, theme), notes: '', hidden: false, transition: null, animations: [], comments: [] }
}
export function newDocument (themeId = 'blank', variant = 0, size = { w: 960, h: 540 }) {
  const theme = makeDocTheme(themeId, variant)
  return {
    v: 1, id: uid('d'), size: { ...size }, theme,
    slides: [newSlide('title', size, theme)],
    props: { title: '', author: '', created: Date.now(), modified: Date.now() },
    show: { loop: false, useTimings: true, display: 'auto' },
    hf: { number: false, footer: '', date: false, dateText: '', hideOnTitle: true }
  }
}

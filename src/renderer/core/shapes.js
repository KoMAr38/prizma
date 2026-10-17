// Preset shape geometry. Names follow the OOXML preset names so files round-trip to PowerPoint.
// Each generator returns an SVG path string or an array of { d, fill: 'norm'|'darken'|'lighten'|'none' } parts.
const f2 = n => (Math.round(n * 100) / 100).toString()
const M = (x, y) => `M${f2(x)} ${f2(y)}`
const L = (x, y) => `L${f2(x)} ${f2(y)}`
const poly = pts => pts.map((p, i) => (i ? L : M)(p[0], p[1])).join(' ') + ' Z'
const npoly = (w, h, pts) => poly(pts.map(([x, y]) => [x * w, y * h]))
const u21 = (w, h, pts) => poly(pts.map(([x, y]) => [x / 21600 * w, y / 21600 * h]))
const ell = (cx, cy, rx, ry) => `${M(cx - rx, cy)} A${f2(rx)} ${f2(ry)} 0 1 0 ${f2(cx + rx)} ${f2(cy)} A${f2(rx)} ${f2(ry)} 0 1 0 ${f2(cx - rx)} ${f2(cy)} Z`
function rrect (x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  if (!r) return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])
  return `${M(x + r, y)} ${L(x + w - r, y)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w)} ${f2(y + r)} ${L(x + w, y + h - r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w - r)} ${f2(y + h)} ${L(x + r, y + h)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(x)} ${f2(y + h - r)} ${L(x, y + r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + r)} ${f2(y)} Z`
}
// DrawingML arcTo: the pen is on an ellipse wR × hR at the visual angle stAng and swings swAng degrees (clockwise)
function arcTo (p, wR, hR, stAng, swAng) {
  const par = deg => { const r = deg * Math.PI / 180; return Math.atan2(wR * Math.sin(r), hR * Math.cos(r)) }
  const t1 = par(stAng), want = swAng * Math.PI / 180
  let t2 = par(stAng + swAng)
  while (t2 - t1 - want > Math.PI) t2 -= 2 * Math.PI
  while (t2 - t1 - want < -Math.PI) t2 += 2 * Math.PI
  const cx = p[0] - wR * Math.cos(t1), cy = p[1] - hR * Math.sin(t1)
  return [cx + wR * Math.cos(t2), cy + hR * Math.sin(t2), Math.abs(t2 - t1) > Math.PI ? 1 : 0, swAng > 0 ? 1 : 0]
}
// PowerPoint's cloud outline: eleven arcs on a 43200-unit square, from its preset definition
const CLOUD_ARCS = [[6753, 9190, -11429249, 7426832], [5333, 7267, -8646143, 5396714], [4365, 5945, -8748475, 5983381], [4857, 6595, -7859164, 7034504], [5333, 7273, -4722533, 6541615], [6775, 9220, -2776035, 7816140], [5785, 7867, 37501, 6842000], [6752, 9215, 1347096, 6910353], [7720, 10543, 3974558, 4542661], [4360, 5918, -16496525, 8804134], [4345, 5945, -14809710, 9151131]]
function cloudPath (w, h) {
  const kx = w / 43200, ky = h / 43200
  let p = [3900, 14370], d = M(p[0] * kx, p[1] * ky)
  for (const [wR, hR, st, sw] of CLOUD_ARCS) {
    const [x, y, large, sweep] = arcTo(p, wR, hR, st / 60000, sw / 60000)
    d += ` A${f2(wR * kx)} ${f2(hR * ky)} 0 ${large} ${sweep} ${f2(x * kx)} ${f2(y * ky)}`
    p = [x, y]
  }
  return d + ' Z'
}
const SUN_RAYS = [[[1, 0.5], [0.7982, 0.5718], [0.7982, 0.4282]], [[0.8535, 0.1464], [0.7616, 0.3306], [0.6694, 0.2384]], [[0.5, 0], [0.5718, 0.2018], [0.4282, 0.2018]], [[0.1464, 0.1464], [0.3306, 0.2384], [0.2384, 0.3306]], [[0, 0.5], [0.2018, 0.4282], [0.2018, 0.5718]], [[0.1464, 0.8535], [0.2384, 0.6694], [0.3306, 0.7616]], [[0.5, 1], [0.4282, 0.7982], [0.5718, 0.7982]], [[0.8535, 0.8535], [0.6694, 0.7616], [0.7616, 0.6694]]]
// points around a circle, then stretched to fill the box (how PowerPoint draws stars and polygons)
function fitted (w, h, pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const x0 = Math.min(...xs), y0 = Math.min(...ys), sx = (Math.max(...xs) - x0) || 1, sy = (Math.max(...ys) - y0) || 1
  return poly(pts.map(([x, y]) => [(x - x0) / sx * w, (y - y0) / sy * h]))
}
function star (n, inner) {
  return (w, h, a) => {
    const r2 = (a.adj ?? inner)
    const pts = []
    for (let i = 0; i < n * 2; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r2 : 1
      pts.push([Math.cos(ang) * r, Math.sin(ang) * r])
    }
    return n >= 8 ? poly(pts.map(([x, y]) => [(x + 1) / 2 * w, (y + 1) / 2 * h])) : fitted(w, h, pts)
  }
}
function regular (n, rotate = -Math.PI / 2) {
  return (w, h) => {
    const pts = []
    for (let i = 0; i < n; i++) { const ang = rotate + i * 2 * Math.PI / n; pts.push([Math.cos(ang), Math.sin(ang)]) }
    return fitted(w, h, pts)
  }
}
const arcPt = (cx, cy, rx, ry, deg) => [cx + rx * Math.cos(deg * Math.PI / 180), cy + ry * Math.sin(deg * Math.PI / 180)]
function arcPath (cx, cy, rx, ry, a1, a2, move = true) {
  let sweep = ((a2 - a1) % 360 + 360) % 360
  if (sweep === 0) sweep = 360
  const [x1, y1] = arcPt(cx, cy, rx, ry, a1), [x2, y2] = arcPt(cx, cy, rx, ry, a1 + sweep)
  if (sweep >= 359.99) return ell(cx, cy, rx, ry)
  return `${move ? M(x1, y1) : L(x1, y1)} A${f2(rx)} ${f2(ry)} 0 ${sweep > 180 ? 1 : 0} 1 ${f2(x2)} ${f2(y2)}`
}

export const SHAPES = {
  // ----- rectangles
  rect: { cat: 'Rectangles', label: 'Rectangle', gen: (w, h) => poly([[0, 0], [w, 0], [w, h], [0, h]]) },
  roundRect: { cat: 'Rectangles', label: 'Rounded rectangle', adj: { adj: 0.16667 }, gen: (w, h, a) => rrect(0, 0, w, h, Math.min(w, h) * a.adj) },
  snip1Rect: { cat: 'Rectangles', label: 'Snip single corner', adj: { adj: 0.16667 }, gen: (w, h, a) => { const s = Math.min(w, h) * a.adj; return poly([[0, 0], [w - s, 0], [w, s], [w, h], [0, h]]) } },
  snip2SameRect: { cat: 'Rectangles', label: 'Snip same side corners', adj: { adj: 0.16667 }, gen: (w, h, a) => { const s = Math.min(w, h) * a.adj; return poly([[s, 0], [w - s, 0], [w, s], [w, h], [0, h], [0, s]]) } },
  snip2DiagRect: { cat: 'Rectangles', label: 'Snip diagonal corners', adj: { adj: 0.16667 }, gen: (w, h, a) => { const s = Math.min(w, h) * a.adj; return poly([[0, 0], [w - s, 0], [w, s], [w, h], [s, h], [0, h - s]]) } },
  round1Rect: { cat: 'Rectangles', label: 'Round single corner', adj: { adj: 0.16667 }, gen: (w, h, a) => { const r = Math.min(w, h) * a.adj; return `${M(0, 0)} ${L(w - r, 0)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(w)} ${f2(r)} ${L(w, h)} ${L(0, h)} Z` } },
  round2SameRect: { cat: 'Rectangles', label: 'Round same side corners', adj: { adj: 0.16667 }, gen: (w, h, a) => { const r = Math.min(w, h) * a.adj; return `${M(r, 0)} ${L(w - r, 0)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(w)} ${f2(r)} ${L(w, h)} ${L(0, h)} ${L(0, r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(r)} 0 Z` } },
  round2DiagRect: { cat: 'Rectangles', label: 'Round diagonal corners', adj: { adj: 0.16667 }, gen: (w, h, a) => { const r = Math.min(w, h) * a.adj; return `${M(r, 0)} ${L(w, 0)} ${L(w, h - r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(w - r)} ${f2(h)} ${L(0, h)} ${L(0, r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(r)} 0 Z` } },
  // ----- basic shapes
  ellipse: { cat: 'Basic shapes', label: 'Oval', gen: (w, h) => ell(w / 2, h / 2, w / 2, h / 2), text: [0.146, 0.146, 0.146, 0.146] },
  triangle: { cat: 'Basic shapes', label: 'Isosceles triangle', adj: { adj: 0.5 }, gen: (w, h, a) => poly([[w * a.adj, 0], [w, h], [0, h]]), text: [0.25, 0.5, 0.25, 0] },
  rtTriangle: { cat: 'Basic shapes', label: 'Right triangle', gen: (w, h) => poly([[0, 0], [w, h], [0, h]]), text: [0.08, 0.5, 0.5, 0.08] },
  parallelogram: { cat: 'Basic shapes', label: 'Parallelogram', adj: { adj: 0.25 }, gen: (w, h, a) => { const o = Math.min(w, h) * a.adj; return poly([[o, 0], [w, 0], [w - o, h], [0, h]]) } },
  trapezoid: { cat: 'Basic shapes', label: 'Trapezoid', adj: { adj: 0.25 }, gen: (w, h, a) => { const o = Math.min(w, h) * a.adj; return poly([[o, 0], [w - o, 0], [w, h], [0, h]]) } },
  diamond: { cat: 'Basic shapes', label: 'Diamond', gen: (w, h) => poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]), text: [0.25, 0.25, 0.25, 0.25] },
  pentagon: { cat: 'Basic shapes', label: 'Regular pentagon', gen: regular(5) },
  hexagon: { cat: 'Basic shapes', label: 'Hexagon', adj: { adj: 0.25 }, gen: (w, h, a) => { const o = Math.min(w, h) * a.adj; return poly([[o, 0], [w - o, 0], [w, h / 2], [w - o, h], [o, h], [0, h / 2]]) } },
  heptagon: { cat: 'Basic shapes', label: 'Heptagon', gen: regular(7) },
  octagon: { cat: 'Basic shapes', label: 'Octagon', adj: { adj: 0.29289 }, gen: (w, h, a) => { const o = Math.min(w, h) * a.adj; return poly([[o, 0], [w - o, 0], [w, o], [w, h - o], [w - o, h], [o, h], [0, h - o], [0, o]]) } },
  decagon: { cat: 'Basic shapes', label: 'Decagon', gen: regular(10, 0) },
  dodecagon: { cat: 'Basic shapes', label: 'Dodecagon', gen: regular(12, Math.PI / 12) },
  pie: { cat: 'Basic shapes', label: 'Partial circle', adj: { a1: 0, a2: 270 }, gen: (w, h, a) => `${M(w / 2, h / 2)} ${arcPath(w / 2, h / 2, w / 2, h / 2, a.a1, a.a2, false)} Z` },
  chord: { cat: 'Basic shapes', label: 'Chord', adj: { a1: 45, a2: 270 }, gen: (w, h, a) => `${arcPath(w / 2, h / 2, w / 2, h / 2, a.a1, a.a2)} Z` },
  teardrop: { cat: 'Basic shapes', label: 'Teardrop', gen: (w, h) => `${M(0, h / 2)} A${f2(w / 2)} ${f2(h / 2)} 0 0 1 ${f2(w / 2)} 0 ${L(w, 0)} ${L(w, h / 2)} A${f2(w / 2)} ${f2(h / 2)} 0 0 1 ${f2(w / 2)} ${f2(h)} A${f2(w / 2)} ${f2(h / 2)} 0 0 1 0 ${f2(h / 2)} Z` },
  frame: { cat: 'Basic shapes', label: 'Frame', adj: { adj: 0.125 }, evenodd: true, gen: (w, h, a) => { const t = Math.min(w, h) * a.adj; return poly([[0, 0], [w, 0], [w, h], [0, h]]) + ' ' + poly([[t, t], [t, h - t], [w - t, h - t], [w - t, t]]) } },
  halfFrame: {
    cat: 'Basic shapes', label: 'Half frame', adj: { adj: 0.33333 },
    // PowerPoint's preset: both bars a third of the short side thick, ends cut along the box's diagonal
    gen: (w, h, a) => { const ss = Math.min(w, h), x1 = ss * Math.min(a.adj, w / ss), y1 = Math.min(ss * a.adj, h - h * x1 / w); return poly([[0, 0], [w, 0], [w - y1 * w / h, y1], [x1, y1], [x1, h - x1 * h / w], [0, h]]) }
  },
  corner: { cat: 'Basic shapes', label: 'L-shape', adj: { adj: 0.5 }, gen: (w, h, a) => { const t = Math.min(w, h) * a.adj; return poly([[0, 0], [t, 0], [t, h - t], [w, h - t], [w, h], [0, h]]) } },
  diagStripe: { cat: 'Basic shapes', label: 'Diagonal stripe', adj: { adj: 0.5 }, gen: (w, h, a) => poly([[0, h * a.adj], [w * a.adj, 0], [w, 0], [0, h]]) },
  plus: { cat: 'Basic shapes', label: 'Cross', adj: { adj: 0.25 }, gen: (w, h, a) => { const o = Math.min(w, h) * a.adj; return poly([[o, 0], [w - o, 0], [w - o, o], [w, o], [w, h - o], [w - o, h - o], [w - o, h], [o, h], [o, h - o], [0, h - o], [0, o], [o, o]]) } },
  plaque: { cat: 'Basic shapes', label: 'Plaque', adj: { adj: 0.16667 }, gen: (w, h, a) => { const r = Math.min(w, h) * a.adj; return `${M(r, 0)} ${L(w - r, 0)} A${f2(r)} ${f2(r)} 0 0 0 ${f2(w)} ${f2(r)} ${L(w, h - r)} A${f2(r)} ${f2(r)} 0 0 0 ${f2(w - r)} ${f2(h)} ${L(r, h)} A${f2(r)} ${f2(r)} 0 0 0 0 ${f2(h - r)} ${L(0, r)} A${f2(r)} ${f2(r)} 0 0 0 ${f2(r)} 0 Z` } },
  can: {
    cat: 'Basic shapes', label: 'Cylinder', adj: { adj: 0.25 }, text: [0, 0.25, 0, 0],
    gen: (w, h, a) => { const ry = Math.min(w, h) * a.adj / 2; return [{ d: `${M(0, ry)} A${f2(w / 2)} ${f2(ry)} 0 0 0 ${f2(w)} ${f2(ry)} ${L(w, h - ry)} A${f2(w / 2)} ${f2(ry)} 0 0 1 0 ${f2(h - ry)} Z`, fill: 'norm' }, { d: ell(w / 2, ry, w / 2, ry), fill: 'lighten' }] }
  },
  cube: {
    cat: 'Basic shapes', label: 'Cube', adj: { adj: 0.25 }, text: [0, 0.25, 0.25, 0],
    gen: (w, h, a) => { const d = Math.min(w, h) * a.adj; return [{ d: poly([[0, d], [w - d, d], [w - d, h], [0, h]]), fill: 'norm' }, { d: poly([[0, d], [d, 0], [w, 0], [w - d, d]]), fill: 'lighten' }, { d: poly([[w - d, d], [w, 0], [w, h - d], [w - d, h]]), fill: 'darken' }] }
  },
  bevel: {
    cat: 'Basic shapes', label: 'Bevel', adj: { adj: 0.125 }, text: [0.125, 0.125, 0.125, 0.125],
    gen: (w, h, a) => { const t = Math.min(w, h) * a.adj; return [{ d: poly([[t, t], [w - t, t], [w - t, h - t], [t, h - t]]), fill: 'norm' }, { d: poly([[0, 0], [w, 0], [w - t, t], [t, t]]), fill: 'lighten' }, { d: poly([[w, 0], [w, h], [w - t, h - t], [w - t, t]]), fill: 'darken' }, { d: poly([[0, h], [t, h - t], [w - t, h - t], [w, h]]), fill: 'darken' }, { d: poly([[0, 0], [t, t], [t, h - t], [0, h]]), fill: 'lighten' }] }
  },
  donut: { cat: 'Basic shapes', label: 'Donut', adj: { adj: 0.25 }, evenodd: true, gen: (w, h, a) => { const t = Math.min(w, h) * a.adj; return ell(w / 2, h / 2, w / 2, h / 2) + ' ' + ell(w / 2, h / 2, Math.max(0.1, w / 2 - t), Math.max(0.1, h / 2 - t)) } },
  noSmoking: {
    cat: 'Basic shapes', label: '"No" symbol', adj: { adj: 0.1875 }, evenodd: true,
    // PowerPoint's geometry: a ring whose hole is two D shapes either side of the bar, so the outline stays inside
    gen: (w, h, a) => {
      const dr = Math.min(w, h) * a.adj, iw = w / 2 - dr, ih = h / 2 - dr, cx = w / 2, cy = h / 2
      const rAt = t => iw * ih / Math.hypot(ih * Math.cos(t), iw * Math.sin(t))
      const at = t => [cx + rAt(t) * Math.cos(t), cy + rAt(t) * Math.sin(t)]
      const t3 = Math.atan2(h, w), dang = Math.atan2(dr / 2, rAt(t3))
      const hole = st => { const p = at(st), q = at(st - Math.PI + 2 * dang); return `${M(p[0], p[1])} A${f2(iw)} ${f2(ih)} 0 0 0 ${f2(q[0])} ${f2(q[1])} Z` }
      return ell(cx, cy, w / 2, h / 2) + ' ' + hole(t3 - dang) + ' ' + hole(t3 - dang - Math.PI)
    }
  },
  blockArc: {
    cat: 'Basic shapes', label: 'Block arc', adj: { a1: 180, a2: 0, t: 0.25 },
    gen: (w, h, a) => { const t = Math.min(w, h) * a.t; const o = arcPath(w / 2, h / 2, w / 2, h / 2, a.a1, a.a2 === 0 ? 360 : a.a2); const [ix, iy] = arcPt(w / 2, h / 2, w / 2 - t, h / 2 - t, a.a2); return `${o} ${L(ix, iy)} A${f2(w / 2 - t)} ${f2(h / 2 - t)} 0 ${((a.a2 - a.a1 + 360) % 360 || 360) > 180 ? 1 : 0} 0 ${f2(arcPt(w / 2, h / 2, w / 2 - t, h / 2 - t, a.a1)[0])} ${f2(arcPt(w / 2, h / 2, w / 2 - t, h / 2 - t, a.a1)[1])} Z` }
  },
  foldedCorner: { cat: 'Basic shapes', label: 'Folded corner', adj: { adj: 0.16667 }, gen: (w, h, a) => { const s = Math.min(w, h) * a.adj; return [{ d: poly([[0, 0], [w, 0], [w, h - s], [w - s, h], [0, h]]), fill: 'norm' }, { d: poly([[w - s, h], [w - s * 0.8, h - s * 0.8], [w, h - s]]), fill: 'darken' }] } },
  smileyFace: {
    cat: 'Basic shapes', label: 'Smiley face',
    gen: (w, h) => [
      { d: ell(w / 2, h / 2, w / 2, h / 2), fill: 'norm' },
      { d: ell(w * 0.35, h * 0.38, w * 0.06, h * 0.06) + ' ' + ell(w * 0.65, h * 0.38, w * 0.06, h * 0.06), fill: 'darken' },
      { d: `${M(w * 0.25, h * 0.66)} Q${f2(w / 2)} ${f2(h * 0.86)} ${f2(w * 0.75)} ${f2(h * 0.66)}`, fill: 'none' }
    ]
  },
  heart: { cat: 'Basic shapes', label: 'Heart', gen: (w, h) => { const hc = w / 2, dx1 = w * 49 / 48, dx2 = w * 10 / 48, y1 = -h / 3; return `${M(hc, h / 4)} C${f2(hc + dx2)} ${f2(y1)} ${f2(hc + dx1)} ${f2(h / 4)} ${f2(hc)} ${f2(h)} C${f2(hc - dx1)} ${f2(h / 4)} ${f2(hc - dx2)} ${f2(y1)} ${f2(hc)} ${f2(h / 4)} Z` } }, // PowerPoint's preset curves
  lightningBolt: { cat: 'Basic shapes', label: 'Lightning bolt', gen: (w, h) => u21(w, h, [[8458, 0], [0, 3923], [7564, 8416], [4993, 9720], [12197, 13904], [9987, 14934], [21600, 21600], [14768, 12911], [16558, 12016], [11030, 6840], [12831, 6120]]) },
  sun: {
    cat: 'Basic shapes', label: 'Sun',
    // PowerPoint's preset at its default size: eight rays round a disc half the box wide
    gen: (w, h) => [ell(w / 2, h / 2, w / 4, h / 4), ...SUN_RAYS.map(r => npoly(w, h, r))].join(' ')
  },
  moon: { cat: 'Basic shapes', label: 'Moon', adj: { adj: 0.5 }, gen: (w, h, a) => `${M(w, 0)} A${f2(w)} ${f2(h / 2)} 0 0 0 ${f2(w)} ${f2(h)} A${f2(w * a.adj)} ${f2(h / 2)} 0 0 1 ${f2(w)} 0 Z` },
  cloud: { cat: 'Basic shapes', label: 'Cloud', gen: (w, h) => cloudPath(w, h) },
  arc: { cat: 'Basic shapes', label: 'Arc', strokeOnly: true, adj: { a1: 270, a2: 0 }, gen: (w, h, a) => arcPath(w / 2, h / 2, w / 2, h / 2, a.a1, a.a2) },
  bracketPair: { cat: 'Basic shapes', label: 'Double bracket', strokeOnly: true, gen: (w, h) => { const r = Math.min(w, h) * 0.16667; return `${M(r, h)} A${f2(r)} ${f2(r)} 0 0 1 0 ${f2(h - r)} ${L(0, r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(r)} 0 ${M(w - r, 0)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(w)} ${f2(r)} ${L(w, h - r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(w - r)} ${f2(h)}` } },
  bracePair: { cat: 'Basic shapes', label: 'Double brace', strokeOnly: true, gen: (w, h) => { const r = Math.min(w, h) * 0.083; return `${M(r * 2, h)} Q${f2(r)} ${f2(h)} ${f2(r)} ${f2(h - r)} L${f2(r)} ${f2(h / 2 + r)} Q${f2(r)} ${f2(h / 2)} 0 ${f2(h / 2)} Q${f2(r)} ${f2(h / 2)} ${f2(r)} ${f2(h / 2 - r)} L${f2(r)} ${f2(r)} Q${f2(r)} 0 ${f2(r * 2)} 0 ${M(w - r * 2, 0)} Q${f2(w - r)} 0 ${f2(w - r)} ${f2(r)} L${f2(w - r)} ${f2(h / 2 - r)} Q${f2(w - r)} ${f2(h / 2)} ${f2(w)} ${f2(h / 2)} Q${f2(w - r)} ${f2(h / 2)} ${f2(w - r)} ${f2(h / 2 + r)} L${f2(w - r)} ${f2(h - r)} Q${f2(w - r)} ${f2(h)} ${f2(w - r * 2)} ${f2(h)}` } },
  leftBracket: { cat: 'Basic shapes', label: 'Left bracket', strokeOnly: true, gen: (w, h) => { const r = Math.min(w, h * 0.08); return `${M(w, h)} A${f2(w)} ${f2(r)} 0 0 1 0 ${f2(h - r)} ${L(0, r)} A${f2(w)} ${f2(r)} 0 0 1 ${f2(w)} 0` } },
  rightBracket: { cat: 'Basic shapes', label: 'Right bracket', strokeOnly: true, gen: (w, h) => { const r = Math.min(w, h * 0.08); return `${M(0, 0)} A${f2(w)} ${f2(r)} 0 0 1 ${f2(w)} ${f2(r)} ${L(w, h - r)} A${f2(w)} ${f2(r)} 0 0 1 0 ${f2(h)}` } },
  leftBrace: { cat: 'Basic shapes', label: 'Left brace', strokeOnly: true, gen: (w, h) => `${M(w, h)} Q${f2(w / 2)} ${f2(h)} ${f2(w / 2)} ${f2(h * 0.9)} L${f2(w / 2)} ${f2(h * 0.6)} Q${f2(w / 2)} ${f2(h / 2)} 0 ${f2(h / 2)} Q${f2(w / 2)} ${f2(h / 2)} ${f2(w / 2)} ${f2(h * 0.4)} L${f2(w / 2)} ${f2(h * 0.1)} Q${f2(w / 2)} 0 ${f2(w)} 0` },
  rightBrace: { cat: 'Basic shapes', label: 'Right brace', strokeOnly: true, gen: (w, h) => `${M(0, 0)} Q${f2(w / 2)} 0 ${f2(w / 2)} ${f2(h * 0.1)} L${f2(w / 2)} ${f2(h * 0.4)} Q${f2(w / 2)} ${f2(h / 2)} ${f2(w)} ${f2(h / 2)} Q${f2(w / 2)} ${f2(h / 2)} ${f2(w / 2)} ${f2(h * 0.6)} L${f2(w / 2)} ${f2(h * 0.9)} Q${f2(w / 2)} ${f2(h)} 0 ${f2(h)}` },
  // ----- block arrows
  rightArrow: { cat: 'Block arrows', label: 'Right arrow', adj: { a1: 0.5, a2: 0.5 }, gen: (w, h, a) => { const t = h * a.a1 / 2, x = w - Math.min(w, h) * a.a2; return poly([[0, h / 2 - t], [x, h / 2 - t], [x, 0], [w, h / 2], [x, h], [x, h / 2 + t], [0, h / 2 + t]]) } },
  leftArrow: { cat: 'Block arrows', label: 'Left arrow', adj: { a1: 0.5, a2: 0.5 }, gen: (w, h, a) => { const t = h * a.a1 / 2, x = Math.min(w, h) * a.a2; return poly([[w, h / 2 - t], [x, h / 2 - t], [x, 0], [0, h / 2], [x, h], [x, h / 2 + t], [w, h / 2 + t]]) } },
  upArrow: { cat: 'Block arrows', label: 'Up arrow', adj: { a1: 0.5, a2: 0.5 }, gen: (w, h, a) => { const t = w * a.a1 / 2, y = Math.min(w, h) * a.a2; return poly([[w / 2 - t, h], [w / 2 - t, y], [0, y], [w / 2, 0], [w, y], [w / 2 + t, y], [w / 2 + t, h]]) } },
  downArrow: { cat: 'Block arrows', label: 'Down arrow', adj: { a1: 0.5, a2: 0.5 }, gen: (w, h, a) => { const t = w * a.a1 / 2, y = h - Math.min(w, h) * a.a2; return poly([[w / 2 - t, 0], [w / 2 + t, 0], [w / 2 + t, y], [w, y], [w / 2, h], [0, y], [w / 2 - t, y]]) } },
  leftRightArrow: { cat: 'Block arrows', label: 'Left-right arrow', adj: { a1: 0.5, a2: 0.5 }, gen: (w, h, a) => { const t = h * a.a1 / 2, x = Math.min(w / 2, Math.min(w, h) * a.a2); return poly([[0, h / 2], [x, 0], [x, h / 2 - t], [w - x, h / 2 - t], [w - x, 0], [w, h / 2], [w - x, h], [w - x, h / 2 + t], [x, h / 2 + t], [x, h]]) } },
  upDownArrow: { cat: 'Block arrows', label: 'Up-down arrow', adj: { a1: 0.5, a2: 0.5 }, gen: (w, h, a) => { const t = w * a.a1 / 2, y = Math.min(h / 2, Math.min(w, h) * a.a2); return poly([[w / 2, 0], [w, y], [w / 2 + t, y], [w / 2 + t, h - y], [w, h - y], [w / 2, h], [0, h - y], [w / 2 - t, h - y], [w / 2 - t, y], [0, y]]) } },
  quadArrow: {
    cat: 'Block arrows', label: 'Quad arrow',
    gen: (w, h) => { const ss = Math.min(w, h), t = ss * 0.1125, hd = ss * 0.225, hw = ss * 0.225, cx = w / 2, cy = h / 2; return poly([[cx, 0], [cx + hw, hd], [cx + t, hd], [cx + t, cy - t], [w - hd, cy - t], [w - hd, cy - hw], [w, cy], [w - hd, cy + hw], [w - hd, cy + t], [cx + t, cy + t], [cx + t, h - hd], [cx + hw, h - hd], [cx, h], [cx - hw, h - hd], [cx - t, h - hd], [cx - t, cy + t], [hd, cy + t], [hd, cy + hw], [0, cy], [hd, cy - hw], [hd, cy - t], [cx - t, cy - t], [cx - t, hd], [cx - hw, hd]]) }
  },
  notchedRightArrow: { cat: 'Block arrows', label: 'Notched right arrow', adj: { a1: 0.5, a2: 0.5 }, gen: (w, h, a) => { const t = h * a.a1 / 2, x = w - Math.min(w, h) * a.a2, n = (h / 2 - t) * 0.6 + t * 0.5; return poly([[0, h / 2 - t], [x, h / 2 - t], [x, 0], [w, h / 2], [x, h], [x, h / 2 + t], [0, h / 2 + t], [n, h / 2]]) } },
  stripedRightArrow: { cat: 'Block arrows', label: 'Striped right arrow', adj: { a1: 0.5, a2: 0.5 }, gen: (w, h, a) => { const t = h * a.a1 / 2, x = w - Math.min(w, h) * a.a2, s = Math.min(w, h) * 0.03125; return [poly([[0, h / 2 - t], [s, h / 2 - t], [s, h / 2 + t], [0, h / 2 + t]]), poly([[s * 2, h / 2 - t], [s * 4, h / 2 - t], [s * 4, h / 2 + t], [s * 2, h / 2 + t]]), poly([[s * 5, h / 2 - t], [x, h / 2 - t], [x, 0], [w, h / 2], [x, h], [x, h / 2 + t], [s * 5, h / 2 + t]])].join(' ') } },
  homePlate: { cat: 'Block arrows', label: 'Pentagon arrow', adj: { adj: 0.5 }, gen: (w, h, a) => { const x = w - Math.min(w, h) * a.adj; return poly([[0, 0], [x, 0], [w, h / 2], [x, h], [0, h]]) } },
  chevron: { cat: 'Block arrows', label: 'Chevron', adj: { adj: 0.5 }, gen: (w, h, a) => { const o = Math.min(w, h) * a.adj; return poly([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h], [o, h / 2]]) } },
  bentArrow: { cat: 'Block arrows', label: 'Bent arrow', gen: (w, h) => { const ss = Math.min(w, h), t = ss * 0.25, hd = ss * 0.25, hw = ss * 0.25; return `${M(0, h)} L0 ${f2(hw + t * 0.9)} Q0 ${f2(hw - t / 2)} ${f2(t * 1.6)} ${f2(hw - t / 2)} L${f2(w - hd)} ${f2(hw - t / 2)} L${f2(w - hd)} 0 L${f2(w)} ${f2(hw)} L${f2(w - hd)} ${f2(hw * 2)} L${f2(w - hd)} ${f2(hw + t / 2)} L${f2(t * 1.6)} ${f2(hw + t / 2)} Q${f2(t)} ${f2(hw + t / 2)} ${f2(t)} ${f2(hw + t * 1.1)} L${f2(t)} ${f2(h)} Z` } },
  uturnArrow: {
    cat: 'Block arrows', label: 'U-turn arrow',
    // PowerPoint's preset at its default adjustments
    gen: (w, h) => {
      const ss = Math.min(w, h), th = ss * 0.25, aw2 = ss * 0.25, dh2 = aw2 - th / 2, y5 = h * 0.75, y4 = y5 - ss * 0.25
      const x9 = w - dh2, bd = Math.max(0, Math.min(ss * 0.4375, x9 / 2, y4)), bd2 = Math.max(bd - th, 0)
      const x3 = th + bd2, x8 = w - aw2, x6 = x8 - aw2, x7 = x6 + dh2, x4 = x9 - bd
      return `${M(0, h)} ${L(0, bd)} A${f2(bd)} ${f2(bd)} 0 0 1 ${f2(bd)} 0 ${L(x4, 0)} A${f2(bd)} ${f2(bd)} 0 0 1 ${f2(x9)} ${f2(bd)} ${L(x9, y4)} ${L(w, y4)} ${L(x8, y5)} ${L(x6, y4)} ${L(x7, y4)} ${L(x7, x3)} A${f2(bd2)} ${f2(bd2)} 0 0 0 ${f2(x7 - bd2)} ${f2(th)} ${L(x3, th)} A${f2(bd2)} ${f2(bd2)} 0 0 0 ${f2(th)} ${f2(x3)} ${L(th, h)} Z`
    }
  },
  bentUpArrow: {
    cat: 'Block arrows', label: 'Bent-up arrow',
    // PowerPoint's preset: the shaft sits centred under the arrowhead
    gen: (w, h) => { const ss = Math.min(w, h), y1 = ss * 0.25, x1 = w - ss * 0.5, x3 = w - ss * 0.25, x2 = x3 - ss * 0.125, x4 = x3 + ss * 0.125, y2 = h - ss * 0.25; return poly([[0, y2], [x2, y2], [x2, y1], [x1, y1], [x3, 0], [w, y1], [x4, y1], [x4, h], [0, h]]) }
  },
  rightArrowCallout: { cat: 'Block arrows', label: 'Callout: right arrow', gen: (w, h) => { const ss = Math.min(w, h), x = w - ss * 0.25 - ss * 0.25, t = h * 0.125, hw = h * 0.25; return poly([[0, 0], [x, 0], [x, h / 2 - t], [w - ss * 0.25, h / 2 - t], [w - ss * 0.25, h / 2 - hw], [w, h / 2], [w - ss * 0.25, h / 2 + hw], [w - ss * 0.25, h / 2 + t], [x, h / 2 + t], [x, h], [0, h]]) }, text: [0, 0, 0.5, 0] },
  downArrowCallout: {
    cat: 'Block arrows', label: 'Callout: down arrow', text: [0, 0, 0, 0.35],
    // PowerPoint's preset: the box takes 65 % of the height, shaft and head are sized from the short side
    gen: (w, h) => { const ss = Math.min(w, h), y2 = Math.min(h * 0.64977, h - ss * 0.25), y3 = h - ss * 0.25, dx1 = ss * 0.25, dx2 = ss * 0.125, hc = w / 2; return poly([[0, 0], [w, 0], [w, y2], [hc + dx2, y2], [hc + dx2, y3], [hc + dx1, y3], [hc, h], [hc - dx1, y3], [hc - dx2, y3], [hc - dx2, y2], [0, y2]]) }
  },
  circularArrow: { cat: 'Block arrows', label: 'Circular arrow', gen: (w, h) => { const t = Math.min(w, h) * 0.125; const ro = [w / 2, h / 2], ri = [w / 2 - t, h / 2 - t]; const a1 = 180, a2 = 340; const [ox1, oy1] = arcPt(w / 2, h / 2, ro[0], ro[1], a1), [ox2, oy2] = arcPt(w / 2, h / 2, ro[0], ro[1], a2), [ix1, iy1] = arcPt(w / 2, h / 2, ri[0], ri[1], a1), [ix2, iy2] = arcPt(w / 2, h / 2, ri[0], ri[1], a2); const [mx, my] = arcPt(w / 2, h / 2, w / 2 - t / 2, h / 2 - t / 2, a2); const [tx, ty] = arcPt(w / 2, h / 2, w / 2 - t / 2, h / 2 - t / 2, a2 + 18); return `${M(ix1, iy1)} ${L(ox1, oy1)} A${f2(ro[0])} ${f2(ro[1])} 0 0 1 ${f2(ox2)} ${f2(oy2)} L${f2(ox2 + (ox2 - mx) * 0.9)} ${f2(oy2 + (oy2 - my) * 0.9)} L${f2(tx)} ${f2(ty)} L${f2(ix2 - (mx - ix2) * 0.9)} ${f2(iy2 - (my - iy2) * 0.9)} L${f2(ix2)} ${f2(iy2)} A${f2(ri[0])} ${f2(ri[1])} 0 0 0 ${f2(ix1)} ${f2(iy1)} Z` } },
  // ----- equation
  mathPlus: { cat: 'Equation shapes', label: 'Plus sign', gen: (w, h) => { const t = Math.min(w, h) * 0.1176, mx = w * 0.13255, my = h * 0.13255; return poly([[w / 2 - t, my], [w / 2 + t, my], [w / 2 + t, h / 2 - t], [w - mx, h / 2 - t], [w - mx, h / 2 + t], [w / 2 + t, h / 2 + t], [w / 2 + t, h - my], [w / 2 - t, h - my], [w / 2 - t, h / 2 + t], [mx, h / 2 + t], [mx, h / 2 - t], [w / 2 - t, h / 2 - t]]) } },
  mathMinus: { cat: 'Equation shapes', label: 'Minus sign', gen: (w, h) => { const t = h * 0.1176; return poly([[w * 0.13255, h / 2 - t], [w * 0.86745, h / 2 - t], [w * 0.86745, h / 2 + t], [w * 0.13255, h / 2 + t]]) } },
  mathMultiply: {
    cat: 'Equation shapes', label: 'Multiplication sign',
    // PowerPoint's preset: the arms run along the box diagonals and stop short of the corners
    gen: (w, h) => {
      const th = Math.min(w, h) * 0.2352, a = Math.atan2(h, w), sa = Math.sin(a), ca = Math.cos(a), ta = Math.tan(a)
      const lM = Math.hypot(w, h) * (1 - 0.51965), xM = ca * lM / 2, yM = sa * lM / 2, dx = sa * th / 2, dy = ca * th / 2
      const xA = xM - dx, yA = yM + dy, xB = xM + dx, yB = yM - dy, hc = w / 2, vc = h / 2
      const yC = (hc - xB) * ta + yB, xFE = (vc - yA) / ta
      return poly([[xA, yA], [xB, yB], [hc, yC], [w - xB, yB], [w - xA, yA], [w - xA - xFE, vc], [w - xA, h - yA], [w - xB, h - yB], [hc, h - yC], [xB, h - yB], [xA, h - yA], [xA + xFE, vc]])
    }
  },
  mathDivide: { cat: 'Equation shapes', label: 'Division sign', gen: (w, h) => { const dy1 = h * 0.1176, rad = Math.min(h * 0.1176, w * 0.36745), dx1 = w * 0.36745, y3 = h / 2 - dy1, y2 = y3 - h * 0.0588 - rad; return poly([[w / 2 - dx1, y3], [w / 2 + dx1, y3], [w / 2 + dx1, h / 2 + dy1], [w / 2 - dx1, h / 2 + dy1]]) + ' ' + ell(w / 2, y2, rad, rad) + ' ' + ell(w / 2, h - y2, rad, rad) } },
  mathEqual: { cat: 'Equation shapes', label: 'Equal', gen: (w, h) => { const t = h * 0.1176, g = h * 0.0588; return poly([[w * 0.13255, h / 2 - g - 2 * t], [w * 0.86745, h / 2 - g - 2 * t], [w * 0.86745, h / 2 - g], [w * 0.13255, h / 2 - g]]) + ' ' + poly([[w * 0.13255, h / 2 + g], [w * 0.86745, h / 2 + g], [w * 0.86745, h / 2 + g + 2 * t], [w * 0.13255, h / 2 + g + 2 * t]]) } },
  mathNotEqual: { cat: 'Equation shapes', label: 'Not equal', gen: (w, h) => { const t = h * 0.1176, g = h * 0.0588; return poly([[w * 0.13255, h / 2 - g - 2 * t], [w * 0.86745, h / 2 - g - 2 * t], [w * 0.86745, h / 2 - g], [w * 0.13255, h / 2 - g]]) + ' ' + poly([[w * 0.13255, h / 2 + g], [w * 0.86745, h / 2 + g], [w * 0.86745, h / 2 + g + 2 * t], [w * 0.13255, h / 2 + g + 2 * t]]) + ' ' + poly([[w * 0.58, h * 0.08], [w * 0.68, h * 0.12], [w * 0.42, h * 0.92], [w * 0.32, h * 0.88]]) }, nonzero: true },
  // ----- flowchart
  flowChartProcess: { cat: 'Flowchart', label: 'Process', gen: (w, h) => poly([[0, 0], [w, 0], [w, h], [0, h]]) },
  flowChartAlternateProcess: { cat: 'Flowchart', label: 'Alternate process', gen: (w, h) => rrect(0, 0, w, h, Math.min(w, h) * 0.125) },
  flowChartDecision: { cat: 'Flowchart', label: 'Decision', gen: (w, h) => poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]), text: [0.25, 0.25, 0.25, 0.25] },
  flowChartInputOutput: { cat: 'Flowchart', label: 'Data', gen: (w, h) => npoly(w, h, [[0.2, 0], [1, 0], [0.8, 1], [0, 1]]) },
  flowChartPredefinedProcess: { cat: 'Flowchart', label: 'Predefined process', gen: (w, h) => [{ d: npoly(w, h, [[0, 0], [1, 0], [1, 1], [0, 1]]), fill: 'norm' }, { d: `${M(w * 0.125, 0)} ${L(w * 0.125, h)} ${M(w * 0.875, 0)} ${L(w * 0.875, h)}`, fill: 'none' }] },
  flowChartInternalStorage: { cat: 'Flowchart', label: 'Internal storage', gen: (w, h) => [{ d: npoly(w, h, [[0, 0], [1, 0], [1, 1], [0, 1]]), fill: 'norm' }, { d: `${M(w * 0.1, 0)} ${L(w * 0.1, h)} ${M(0, h * 0.1)} ${L(w, h * 0.1)}`, fill: 'none' }] },
  flowChartDocument: { cat: 'Flowchart', label: 'Document', gen: (w, h) => `${M(0, 0)} ${L(w, 0)} ${L(w, h * 0.802)} C${f2(w / 2)} ${f2(h * 0.802)} ${f2(w / 2)} ${f2(h * 1.108)} 0 ${f2(h * 0.934)} Z`, text: [0, 0, 0, 0.2] },
  flowChartMultidocument: {
    cat: 'Flowchart', label: 'Multidocument',
    gen: (w, h) => { const doc = (x, y, ww, hh) => `${M(x, y)} ${L(x + ww, y)} ${L(x + ww, y + hh * 0.802)} C${f2(x + ww / 2)} ${f2(y + hh * 0.802)} ${f2(x + ww / 2)} ${f2(y + hh * 1.108)} ${f2(x)} ${f2(y + hh * 0.934)} Z`; return [{ d: doc(w * 0.12, 0, w * 0.88, h * 0.84), fill: 'norm' }, { d: doc(w * 0.06, h * 0.07, w * 0.88, h * 0.84), fill: 'norm' }, { d: doc(0, h * 0.14, w * 0.88, h * 0.84), fill: 'norm' }] }
  },
  flowChartTerminator: { cat: 'Flowchart', label: 'Terminator', gen: (w, h) => { const rx = Math.min(w * 0.161, w / 2), ry = h / 2; return `${M(rx, 0)} ${L(w - rx, 0)} A${f2(rx)} ${f2(ry)} 0 0 1 ${f2(w - rx)} ${f2(h)} ${L(rx, h)} A${f2(rx)} ${f2(ry)} 0 0 1 ${f2(rx)} 0 Z` } },
  flowChartPreparation: { cat: 'Flowchart', label: 'Preparation', gen: (w, h) => npoly(w, h, [[0.2, 0], [0.8, 0], [1, 0.5], [0.8, 1], [0.2, 1], [0, 0.5]]) },
  flowChartManualInput: { cat: 'Flowchart', label: 'Manual input', gen: (w, h) => npoly(w, h, [[0, 0.2], [1, 0], [1, 1], [0, 1]]) },
  flowChartManualOperation: { cat: 'Flowchart', label: 'Manual operation', gen: (w, h) => npoly(w, h, [[0, 0], [1, 0], [0.8, 1], [0.2, 1]]) },
  flowChartConnector: { cat: 'Flowchart', label: 'Connector', gen: (w, h) => ell(w / 2, h / 2, w / 2, h / 2) },
  flowChartOffpageConnector: { cat: 'Flowchart', label: 'Off-page connector', gen: (w, h) => npoly(w, h, [[0, 0], [1, 0], [1, 0.8], [0.5, 1], [0, 0.8]]) },
  flowChartPunchedCard: { cat: 'Flowchart', label: 'Card', gen: (w, h) => npoly(w, h, [[0.2, 0], [1, 0], [1, 1], [0, 1], [0, 0.2]]) },
  flowChartPunchedTape: { cat: 'Flowchart', label: 'Punched tape', gen: (w, h) => `${M(0, h * 0.1)} Q${f2(w * 0.25)} ${f2(h * 0.3)} ${f2(w * 0.5)} ${f2(h * 0.1)} Q${f2(w * 0.75)} ${f2(-h * 0.1)} ${f2(w)} ${f2(h * 0.1)} L${f2(w)} ${f2(h * 0.9)} Q${f2(w * 0.75)} ${f2(h * 0.7)} ${f2(w * 0.5)} ${f2(h * 0.9)} Q${f2(w * 0.25)} ${f2(h * 1.1)} 0 ${f2(h * 0.9)} Z` },
  flowChartSummingJunction: { cat: 'Flowchart', label: 'Summing junction', gen: (w, h) => { const c = 0.7071; return [{ d: ell(w / 2, h / 2, w / 2, h / 2), fill: 'norm' }, { d: `${M(w / 2 - c * w / 2, h / 2 - c * h / 2)} ${L(w / 2 + c * w / 2, h / 2 + c * h / 2)} ${M(w / 2 + c * w / 2, h / 2 - c * h / 2)} ${L(w / 2 - c * w / 2, h / 2 + c * h / 2)}`, fill: 'none' }] } },
  flowChartOr: { cat: 'Flowchart', label: 'Or', gen: (w, h) => [{ d: ell(w / 2, h / 2, w / 2, h / 2), fill: 'norm' }, { d: `${M(w / 2, 0)} ${L(w / 2, h)} ${M(0, h / 2)} ${L(w, h / 2)}`, fill: 'none' }] },
  flowChartCollate: { cat: 'Flowchart', label: 'Collate', gen: (w, h) => npoly(w, h, [[0, 0], [1, 0], [0.5, 0.5], [1, 1], [0, 1], [0.5, 0.5]]) },
  flowChartSort: { cat: 'Flowchart', label: 'Sort', gen: (w, h) => [{ d: npoly(w, h, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]), fill: 'norm' }, { d: `${M(0, h / 2)} ${L(w, h / 2)}`, fill: 'none' }] },
  flowChartExtract: { cat: 'Flowchart', label: 'Extract', gen: (w, h) => npoly(w, h, [[0.5, 0], [1, 1], [0, 1]]) },
  flowChartMerge: { cat: 'Flowchart', label: 'Merge', gen: (w, h) => npoly(w, h, [[0, 0], [1, 0], [0.5, 1]]) },
  flowChartOnlineStorage: { cat: 'Flowchart', label: 'Stored data', gen: (w, h) => `${M(w / 6, 0)} ${L(w, 0)} A${f2(w / 6)} ${f2(h / 2)} 0 0 0 ${f2(w)} ${f2(h)} ${L(w / 6, h)} A${f2(w / 6)} ${f2(h / 2)} 0 0 1 ${f2(w / 6)} 0 Z` },
  flowChartDelay: { cat: 'Flowchart', label: 'Delay', gen: (w, h) => `${M(0, 0)} ${L(w / 2, 0)} A${f2(w / 2)} ${f2(h / 2)} 0 0 1 ${f2(w / 2)} ${f2(h)} ${L(0, h)} Z` },
  flowChartMagneticDisk: { cat: 'Flowchart', label: 'Magnetic disk', gen: (w, h) => { const ry = h / 6; return [{ d: `${M(0, ry)} A${f2(w / 2)} ${f2(ry)} 0 0 1 ${f2(w)} ${f2(ry)} ${L(w, h - ry)} A${f2(w / 2)} ${f2(ry)} 0 0 1 0 ${f2(h - ry)} Z`, fill: 'norm' }, { d: `${M(0, ry)} A${f2(w / 2)} ${f2(ry)} 0 0 0 ${f2(w)} ${f2(ry)}`, fill: 'none' }] } },
  flowChartMagneticDrum: { cat: 'Flowchart', label: 'Direct access storage', gen: (w, h) => { const rx = w / 6; return [{ d: `${M(rx, 0)} ${L(w - rx, 0)} A${f2(rx)} ${f2(h / 2)} 0 0 1 ${f2(w - rx)} ${f2(h)} ${L(rx, h)} A${f2(rx)} ${f2(h / 2)} 0 0 1 ${f2(rx)} 0 Z`, fill: 'norm' }, { d: `${M(w - rx, 0)} A${f2(rx)} ${f2(h / 2)} 0 0 0 ${f2(w - rx)} ${f2(h)}`, fill: 'none' }] } },
  flowChartDisplay: { cat: 'Flowchart', label: 'Display', gen: (w, h) => `${M(0, h / 2)} ${L(w / 6, 0)} ${L(w * 5 / 6, 0)} A${f2(w / 6)} ${f2(h / 2)} 0 0 1 ${f2(w * 5 / 6)} ${f2(h)} ${L(w / 6, h)} Z` },
  // ----- stars and banners
  irregularSeal1: { cat: 'Stars and banners', label: 'Explosion: 8 points', gen: (w, h) => u21(w, h, [[10800, 5800], [14522, 0], [14155, 5325], [18380, 4457], [16702, 7315], [21097, 8137], [17607, 10475], [21600, 13290], [16837, 12942], [18145, 18095], [14020, 14457], [13247, 19737], [10532, 14935], [8485, 21600], [7715, 15627], [4762, 17617], [5667, 13937], [135, 14587], [3722, 11775], [0, 8615], [4627, 7617], [370, 2295], [7312, 6320], [8352, 2295]]), text: [0.25, 0.3, 0.25, 0.3] },
  irregularSeal2: { cat: 'Stars and banners', label: 'Explosion: 14 points', gen: (w, h) => u21(w, h, [[11462, 4342], [14790, 0], [14525, 5777], [18007, 3172], [16380, 6532], [21600, 6645], [16985, 9402], [18270, 11290], [16380, 12310], [18877, 15632], [14640, 14350], [14942, 17370], [12180, 15935], [11612, 18842], [9872, 17370], [8700, 19712], [7527, 18125], [4917, 21600], [4805, 18240], [1285, 17825], [3330, 15370], [0, 12877], [3935, 11592], [1172, 8270], [5372, 7817], [4502, 3625], [8550, 6382], [9722, 1887]]), text: [0.25, 0.3, 0.25, 0.3] },
  star4: { cat: 'Stars and banners', label: 'Star: 4 points', adj: { adj: 0.25 }, gen: star(4, 0.25) },
  star5: { cat: 'Stars and banners', label: 'Star: 5 points', adj: { adj: 0.382 }, gen: star(5, 0.382), text: [0.3, 0.38, 0.3, 0.2] },
  star6: { cat: 'Stars and banners', label: 'Star: 6 points', adj: { adj: 0.577 }, gen: star(6, 0.577) },
  star7: { cat: 'Stars and banners', label: 'Star: 7 points', adj: { adj: 0.692 }, gen: star(7, 0.692) },
  star8: { cat: 'Stars and banners', label: 'Star: 8 points', adj: { adj: 0.75 }, gen: star(8, 0.75) },
  star10: { cat: 'Stars and banners', label: 'Star: 10 points', adj: { adj: 0.85 }, gen: star(10, 0.85) },
  star12: { cat: 'Stars and banners', label: 'Star: 12 points', adj: { adj: 0.75 }, gen: star(12, 0.75) },
  star16: { cat: 'Stars and banners', label: 'Star: 16 points', adj: { adj: 0.75 }, gen: star(16, 0.75) },
  star24: { cat: 'Stars and banners', label: 'Star: 24 points', adj: { adj: 0.75 }, gen: star(24, 0.75) },
  star32: { cat: 'Stars and banners', label: 'Star: 32 points', adj: { adj: 0.75 }, gen: star(32, 0.75) },
  ribbon2: {
    cat: 'Stars and banners', label: 'Ribbon: tilted up',
    gen: (w, h) => [
      { d: npoly(w, h, [[0, 0.25], [0.18, 0.25], [0.18, 0.85], [0, 0.85], [0.08, 0.55]]), fill: 'darken' },
      { d: npoly(w, h, [[1, 0.25], [0.82, 0.25], [0.82, 0.85], [1, 0.85], [0.92, 0.55]]), fill: 'darken' },
      { d: npoly(w, h, [[0.12, 0], [0.88, 0], [0.88, 0.7], [0.12, 0.7]]), fill: 'norm' }
    ],
    text: [0.12, 0, 0.12, 0.3]
  },
  wave: { cat: 'Stars and banners', label: 'Wave', gen: (w, h) => { const y1 = h * 0.125, d = y1 * 10 / 3, y4 = h - y1; return `${M(0, y1)} C${f2(w / 3)} ${f2(y1 - d)} ${f2(w * 2 / 3)} ${f2(y1 + d)} ${f2(w)} ${f2(y1)} ${L(w, y4)} C${f2(w * 2 / 3)} ${f2(y4 + d)} ${f2(w / 3)} ${f2(y4 - d)} 0 ${f2(y4)} Z` } }, // PowerPoint's preset curves
  doubleWave: { cat: 'Stars and banners', label: 'Double wave', gen: (w, h) => `${M(0, h * 0.065)} C${f2(w * 0.17)} ${f2(-h * 0.06)} ${f2(w * 0.33)} ${f2(h * 0.19)} ${f2(w * 0.5)} ${f2(h * 0.065)} C${f2(w * 0.67)} ${f2(-h * 0.06)} ${f2(w * 0.83)} ${f2(h * 0.19)} ${f2(w)} ${f2(h * 0.065)} L${f2(w)} ${f2(h * 0.935)} C${f2(w * 0.83)} ${f2(h * 1.06)} ${f2(w * 0.67)} ${f2(h * 0.81)} ${f2(w * 0.5)} ${f2(h * 0.935)} C${f2(w * 0.33)} ${f2(h * 1.06)} ${f2(w * 0.17)} ${f2(h * 0.81)} 0 ${f2(h * 0.935)} Z` },
  horizontalScroll: { cat: 'Stars and banners', label: 'Scroll: horizontal', gen: (w, h) => { const s = Math.min(w, h) * 0.125; return [{ d: `${M(s, s)} ${L(w - s / 2, s)} ${L(w - s / 2, 0)} A${f2(s / 2)} ${f2(s / 2)} 0 0 1 ${f2(w)} ${f2(s / 2)} ${L(w, h - s * 1.5)} A${f2(s / 2)} ${f2(s / 2)} 0 0 1 ${f2(w - s / 2)} ${f2(h - s)} ${L(s / 2, h - s)} ${L(s / 2, h)} A${f2(s / 2)} ${f2(s / 2)} 0 0 1 0 ${f2(h - s / 2)} ${L(0, s * 1.5)} A${f2(s / 2)} ${f2(s / 2)} 0 0 1 ${f2(s / 2)} ${f2(s)} Z`, fill: 'norm' }, { d: ell(w - s / 2, s / 2, s / 4, s / 4), fill: 'darken' }] }, text: [0.06, 0.15, 0.06, 0.15] },
  // ----- callouts
  wedgeRectCallout: { cat: 'Callouts', label: 'Speech bubble: rectangle', adj: { x: -0.2083, y: 0.625 }, gen: (w, h, a) => { const tx = w / 2 + a.x * w, ty = h / 2 + a.y * h; return poly([[0, 0], [w, 0], [w, h], [w * 0.5833, h], [tx, ty], [w * 0.3333, h], [0, h]]) } },
  wedgeRoundRectCallout: { cat: 'Callouts', label: 'Speech bubble: rounded rectangle', adj: { x: -0.2083, y: 0.625 }, gen: (w, h, a) => { const r = Math.min(w, h) * 0.16667, tx = w / 2 + a.x * w, ty = h / 2 + a.y * h; return `${M(r, 0)} ${L(w - r, 0)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(w)} ${f2(r)} ${L(w, h - r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(w - r)} ${f2(h)} ${L(w * 0.5833, h)} ${L(tx, ty)} ${L(w * 0.3333, h)} ${L(r, h)} A${f2(r)} ${f2(r)} 0 0 1 0 ${f2(h - r)} ${L(0, r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(r)} 0 Z` } },
  wedgeEllipseCallout: { cat: 'Callouts', label: 'Speech bubble: oval', adj: { x: -0.2083, y: 0.625 }, gen: (w, h, a) => { const tx = w / 2 + a.x * w, ty = h / 2 + a.y * h; const ang = Math.atan2((ty - h / 2) / h, (tx - w / 2) / w) * 180 / Math.PI; const s1 = ang + 10, s2 = ang - 10; const [x1, y1] = arcPt(w / 2, h / 2, w / 2, h / 2, s1); const [x2, y2] = arcPt(w / 2, h / 2, w / 2, h / 2, s2); return `${M(x1, y1)} A${f2(w / 2)} ${f2(h / 2)} 0 1 1 ${f2(x2)} ${f2(y2)} ${L(tx, ty)} Z` }, text: [0.146, 0.146, 0.146, 0.146] },
  cloudCallout: {
    cat: 'Callouts', label: 'Thought bubble: cloud', adj: { x: -0.2083, y: 0.625 }, nonzero: true,
    // PowerPoint's preset: the cloud, then three bubbles shrinking towards the point it thinks about
    gen: (w, h, a) => {
      const ss = Math.min(w, h), u = ss / 21600, xPos = w / 2 + w * a.x, yPos = h / 2 + h * a.y
      const t = Math.atan2(h * a.y, w * a.x), t2 = Math.atan2(w / 2 * Math.sin(t), h / 2 * Math.cos(t))
      const dx = w / 2 + w / 2 * Math.cos(t2) - xPos, dy = h / 2 + h / 2 * Math.sin(t2) - yPos, len = Math.hypot(dx, dy) || 1, step = (len - 6600 * u) / 3
      const bubble = (dist, r) => ell(xPos + dist * dx / len, yPos + dist * dy / len, r, r)
      return [cloudPath(w, h), bubble(0, 600 * u), bubble(step + 1800 * u, 1200 * u), bubble(4800 * u + 2 * step, 1800 * u)].join(' ')
    }
  }
}

export const SHAPE_CATS = ['Rectangles', 'Basic shapes', 'Block arrows', 'Equation shapes', 'Flowchart', 'Stars and banners', 'Callouts']
export const LINE_KINDS = [
  { kind: 'straight', label: 'Line' }, { kind: 'arrow', label: 'Line arrow' }, { kind: 'doubleArrow', label: 'Line arrow: double' },
  { kind: 'elbow', label: 'Connector: elbow' }, { kind: 'elbowArrow', label: 'Connector: elbow arrow' }, { kind: 'curve', label: 'Connector: curved' }, { kind: 'curveArrow', label: 'Connector: curved arrow' }
]

// Geometry for a shape element (array of parts). Falls back to the imported path, scaled to the current size.
// An imported or drawn outline is used as long as the shape keeps the size it was drawn at
export function pathDriven (el) {
  const def = SHAPES[el.shape]
  const w = Math.max(el.w, 0.01), h = Math.max(el.h, 0.01)
  return !!el.path && (!def || !!el.pathLocked || (!!el.pathVB && Math.abs(el.pathVB.w - w) < 0.05 && Math.abs(el.pathVB.h - h) < 0.05 && !el.adjEdited))
}
export function shapeParts (el) {
  const def = SHAPES[el.shape]
  const w = Math.max(el.w, 0.01), h = Math.max(el.h, 0.01)
  if (pathDriven(el)) {
    const vb = el.pathVB || { w, h }
    const sx = w / (vb.w || w), sy = h / (vb.h || h)
    const d = sx === 1 && sy === 1 ? el.path : scalePath(el.path, sx, sy)
    return [{ d, fill: el.strokeOnly ? 'none' : 'norm', evenodd: true }]
  }
  if (!def) return [{ d: poly([[0, 0], [w, 0], [w, h], [0, h]]), fill: 'norm' }]
  const a = { ...(def.adj || {}), ...(el.adj || {}) }
  const g = def.gen(w, h, a)
  if (typeof g === 'string') return [{ d: g, fill: def.strokeOnly ? 'none' : 'norm', evenodd: !!def.evenodd, nonzero: !!def.nonzero }]
  return g.map(p => ({ evenodd: !!def.evenodd, ...p }))
}
// A picture's outline as a shape: the preset it is cut to (Edit shape, or the file's), or a rounded rectangle for a corner
// radius in points. The slide clips the picture to it and the .pptx writes the same geometry.
export function picShape (el) {
  const shape = el.geom && el.geom !== 'rect' ? el.geom : el.radius ? 'roundRect' : 'rect'
  return { shape, w: el.w, h: el.h, adj: shape === 'roundRect' ? { adj: Math.min(0.5, (el.radius ?? 12) / Math.max(1, Math.min(el.w, el.h))) } : {} }
}
export function textRect (el) {
  const def = SHAPES[el.shape]
  const t = def?.text
  if (!t) return { l: 0, t: 0, r: 0, b: 0 }
  return { l: el.w * t[0], t: el.h * t[1], r: el.w * t[2], b: el.h * t[3] }
}
// Scales every coordinate of an SVG path (absolute or relative commands; arcs scale radii only).
export function scalePath (d, sx, sy) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []
  let out = '', cmd = '', idx = 0
  const params = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }
  for (let i = 0; i < toks.length;) {
    const t = toks[i]
    if (/[a-zA-Z]/.test(t)) { cmd = t; out += t + ' '; i++; idx = 0; if (cmd.toUpperCase() === 'Z') continue; continue }
    const C = cmd.toUpperCase()
    const n = params[C] || 2
    const v = parseFloat(t)
    let r
    if (C === 'H') r = v * sx
    else if (C === 'V') r = v * sy
    else if (C === 'A') { const k = idx % 7; r = k === 0 || k === 5 ? v * sx : k === 1 || k === 6 ? v * sy : v }
    else r = idx % 2 === 0 ? v * sx : v * sy
    out += f2(r) + ' '
    idx = (idx + 1) % n
    i++
  }
  return out.trim()
}
// Path for line elements in local box coordinates (from start point to end point)
export function linePath (el) {
  const w = el.w, h = el.h
  let x1 = el.flipH ? w : 0, y1 = el.flipV ? h : 0, x2 = el.flipH ? 0 : w, y2 = el.flipV ? 0 : h
  if (el.path) {
    const vb = el.pathVB || { w, h }
    let d = scalePath(el.path, w / (vb.w || w || 1), h / (vb.h || h || 1))
    return d
  }
  const k = el.kind || 'straight'
  if (k.startsWith('elbow')) { const mx = (x1 + x2) / 2; return `${M(x1, y1)} ${L(mx, y1)} ${L(mx, y2)} ${L(x2, y2)}` }
  if (k.startsWith('curve')) { const mx = (x1 + x2) / 2; return `${M(x1, y1)} C${f2(mx)} ${f2(y1)} ${f2(mx)} ${f2(y2)} ${f2(x2)} ${f2(y2)}` }
  return `${M(x1, y1)} ${L(x2, y2)}`
}

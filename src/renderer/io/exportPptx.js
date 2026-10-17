// PowerPoint writer: a complete .pptx / .ppsx / .potx package from a Prizma document, written natively.
// The theme becomes a real PowerPoint theme, every Prizma layout a slide layout carrying the theme's background
// art, and slides keep their notes, comments, charts (with editable data), media, transitions and animations.
import JSZip from 'jszip'
import { XML_HEAD, NS, NS_APR, esc, emu, emuPos, solidXml, fillXml, lineXml, effectsXml, xfrmXml, PRESETS, prstXml, custGeomXml, pct1, seal, TWIN_NS } from './pptx/xml.js'
import { parasXml, bodyPrXml, fontXml } from './pptx/text.js'
import { chartPart } from './pptx/chart.js'
import { transitionXml, timingXml } from './pptx/anim.js'
import { mediaInfo, settings, appInfo, redraw } from '../core/store.js'
import { imageSize } from '../core/actions.js'
import { walk, luminance, ELEMENT_LABEL, solid } from '../core/model.js'
import { SHAPES, shapeParts, pathDriven, linePath, picShape } from '../core/shapes.js'
import { LAYOUTS, layoutPlaceholders, themeSpec, slideDecor, PROMPTS } from '../core/themes.js'
import { tableCellLook } from '../render/tableStyles.js'
import { iconNode, iconSvgMarkup } from '../ui/Icon.jsx'
import { BULLET_CHARS } from '../core/html.js'

// ---------- package plumbing ----------
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const REL = {
  doc: R + 'officeDocument', core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', app: R + 'extended-properties', custom: R + 'custom-properties',
  master: R + 'slideMaster', layout: R + 'slideLayout', slide: R + 'slide', theme: R + 'theme', notesMaster: R + 'notesMaster', notes: R + 'notesSlide',
  presProps: R + 'presProps', viewProps: R + 'viewProps', tableStyles: R + 'tableStyles', image: R + 'image', chart: R + 'chart', package: R + 'package',
  link: R + 'hyperlink', video: R + 'video', audio: R + 'audio', media: 'http://schemas.microsoft.com/office/2007/relationships/media',
  comments: R + 'comments', commentAuthors: R + 'commentAuthors', customXml: R + 'customXml', customXmlProps: R + 'customXmlProps'
}
const OX = 'application/vnd.openxmlformats-officedocument.'
const PML = OX + 'presentationml.'
const MAIN = { pptx: PML + 'presentation.main+xml', ppsx: PML + 'slideshow.main+xml', potx: PML + 'template.main+xml' }

class Rels {
  constructor () { this.list = [] }
  add (type, target, external = false) {
    const hit = this.list.find(r => r.type === type && r.target === target && r.external === external)
    if (hit) return hit.id
    const id = 'rId' + (this.list.length + 1)
    this.list.push({ id, type, target, external })
    return id
  }
  xml () {
    return XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      this.list.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${esc(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('') + '</Relationships>'
  }
}
class Pkg {
  constructor () {
    this.zip = new JSZip()
    this.zip.file('[Content_Types].xml', '') // first entry; filled in at the end
    this.over = new Map()
    this.defs = new Map([['rels', 'application/vnd.openxmlformats-package.relationships+xml'], ['xml', 'application/xml']])
  }
  part (path, xml, ct) { this.zip.file(path, xml); if (ct) this.over.set('/' + path, ct) }
  bin (path, bytes, ct, store = true) {
    this.zip.file(path, bytes, { binary: true, compression: store ? 'STORE' : 'DEFLATE' })
    const ext = path.split('.').pop().toLowerCase()
    if (!this.defs.has(ext)) this.defs.set(ext, ct)
  }
  rels (path, rels) {
    if (!rels.list.length) return
    const i = path.lastIndexOf('/')
    this.zip.file(`${path.slice(0, i)}/_rels/${path.slice(i + 1)}.rels`, rels.xml())
  }
  types () {
    return XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      [...this.defs].map(([e, ct]) => `<Default Extension="${e}" ContentType="${ct}"/>`).join('') +
      [...this.over].map(([p, ct]) => `<Override PartName="${p}" ContentType="${ct}"/>`).join('') + '</Types>'
  }
}

// ---------- media ----------
const IMG = { 'image/png': ['png', 'image/png'], 'image/jpeg': ['jpeg', 'image/jpeg'], 'image/jpg': ['jpeg', 'image/jpeg'], 'image/gif': ['gif', 'image/gif'], 'image/bmp': ['bmp', 'image/bmp'], 'image/tiff': ['tiff', 'image/tiff'], 'image/x-emf': ['emf', 'image/x-emf'], 'image/emf': ['emf', 'image/x-emf'], 'image/x-wmf': ['wmf', 'image/x-wmf'], 'image/wmf': ['wmf', 'image/x-wmf'] }
const AV = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-msvideo': 'avi', 'video/x-ms-wmv': 'wmv', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/x-ms-wma': 'wma' }
const AV_CT = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', wma: 'audio/x-ms-wma' }

const canvasBytes = (c, type) => new Promise(resolve => c.toBlob(b => b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a))) : resolve(null), type, 0.92))
function draw (src, w, h, paint, type = 'image/png') {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h))
  const g = c.getContext('2d')
  if (paint) paint(g, c.width, c.height)
  else g.drawImage(src, 0, 0, c.width, c.height)
  return canvasBytes(c, type)
}
// An SVG's fallback picture, sharp at twice `side`: the longest side it is shown at, in points
async function svgPng (bytes, side = 600) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url })
    const w = img.naturalWidth || 300, h = img.naturalHeight || 150
    const k = Math.min(2000, Math.max(256, side * 8 / 3)) / Math.max(w, h)
    return { w, h, png: await draw(img, w * k, h * k) }
  } finally { URL.revokeObjectURL(url) }
}
// WebP, AVIF and other pictures PowerPoint can't read, converted once a session (the entry goes with the media's bytes)
const converted = new WeakMap()
// A frame of a video (and its length) for the poster PowerPoint shows before playback, about twice the size the video is
// shown at (`side`, in points). Read through the media's own URL, kept for the session (the entry goes with the media's bytes)
const probes = new WeakMap()
function probeMedia (m, video, side = 600) {
  const hit = probes.get(m.bytes)
  if (hit && hit.side >= side) return hit.p
  const p = new Promise(resolve => {
    const v = document.createElement(video ? 'video' : 'audio')
    let done = false
    const finish = r => { if (done) return; done = true; clearTimeout(timer); v.removeAttribute('src'); v.load?.(); resolve(r) }
    const timer = setTimeout(() => finish({ ms: 0 }), 8000)
    v.muted = true
    v.preload = 'auto'
    v.onerror = () => finish({ ms: 0 })
    v.onloadedmetadata = () => {
      const ms = Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0
      if (!video) { finish({ ms }); return }
      v.onseeked = async () => {
        const k = Math.min(1, side * 8 / 3 / Math.max(v.videoWidth, v.videoHeight))
        try { finish({ ms, frame: v.videoWidth ? await draw(v, v.videoWidth * k, v.videoHeight * k, null, 'image/jpeg') : null }) } catch { finish({ ms }) }
      }
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2)
    }
    v.src = m.url
  })
  probes.set(m.bytes, { side: video ? side : Infinity, p })
  return p
}
async function iconPng (name, color, bg, size = 256) {
  const url = URL.createObjectURL(new Blob([iconSvgMarkup(name, color, 1.6)], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url })
    return await draw(null, size, size, (g, w, h) => { if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h) } g.drawImage(img, w * 0.2, h * 0.2, w * 0.6, h * 0.6) })
  } finally { URL.revokeObjectURL(url) }
}

class MediaStore {
  constructor (pkg) { this.pkg = pkg; this.img = new Map(); this.av = new Map(); this.posters = new Map(); this.size = new Map(); this.fallback = {}; this.n = 0; this.m = 0 }
  put (bytes, ext, ct, prefix = 'image') {
    const name = `${prefix}${prefix === 'image' ? ++this.n : ++this.m}.${ext}`
    this.pkg.bin('ppt/media/' + name, bytes, ct)
    return name
  }
  async addImage (bytes, mime, side, url, sized) {
    mime = String(mime || '').toLowerCase()
    const known = IMG[mime]
    if (known) {
      // a format PowerPoint reads goes in as it is. Only a picture fill needs the size (to crop like the slide shows
      // it): reading it for every photo loaded each one into the page again and left a long garbage collection behind
      const sz = sized ? await imageSize(bytes, mime, url) : null
      return { name: this.put(bytes, known[0], known[1]), mime: known[1], svg: null, w: sz?.w || 0, h: sz?.h || 0 }
    }
    // WebP, AVIF …: a JPEG, or a PNG when see-through (a 5 MB WebP photo became a 32 MB PNG on every save).
    // A picture nothing can read is left out rather than breaking the file
    if (mime !== 'image/svg+xml') {
      if (!converted.has(bytes)) converted.set(bytes, redraw(bytes, mime).catch(() => null))
      const cv = await converted.get(bytes)
      return cv && { name: this.put(cv.bytes, IMG[cv.mime][0], cv.mime), mime: cv.mime, svg: null, w: cv.w, h: cv.h }
    }
    // SVG keeps its vector original next to a PNG
    try {
      const dec = await svgPng(bytes, side)
      if (!dec.png) return null
      const svg = this.put(bytes, 'svg', 'image/svg+xml')
      return { name: this.put(dec.png, 'png', 'image/png'), mime: 'image/png', svg, w: dec.w, h: dec.h }
    } catch (e) {
      return null
    }
  }
  // sized: the picture fills a shape, a cell or the background
  async image (id, sized) {
    if (!id) return null
    const m = mediaInfo(id)
    if (!this.img.has(id)) this.img.set(id, m?.bytes ? await this.addImage(m.bytes, m.mime, this.size.get(id), m.url, sized) : null)
    const out = this.img.get(id)
    if (sized && out && !out.w && IMG[String(m.mime || '').toLowerCase()]) Object.assign(out, await imageSize(m.bytes, m.mime, m.url) || {}) // shown as a picture first
    return out
  }
  async media (el) {
    const m = mediaInfo(el.src)
    if (!m?.bytes) return
    const video = el.type === 'video'
    if (!this.av.has(el.src)) {
      const ext = AV[String(m.mime || '').toLowerCase()] || (video ? 'mp4' : 'mp3')
      const probe = await probeMedia(m, video, this.size.get(el.src))
      this.av.set(el.src, { name: this.put(m.bytes, ext, AV_CT[ext], 'media'), mime: m.mime, ms: probe.ms, frame: probe.frame })
    }
    const av = this.av.get(el.src)
    let poster = el.poster ? await this.image(el.poster) : null
    if (!poster && av.frame) poster = await this.addImage(av.frame, 'image/jpeg')
    if (!poster) {
      if (!this.fallback[el.type]) this.fallback[el.type] = await this.addImage(await iconPng(video ? 'film' : 'volume-2', video ? '#FFFFFF' : '#5B6273', video ? '#14161C' : null), 'image/png')
      poster = this.fallback[el.type]
    }
    this.posters.set(el.id, poster)
  }
  async prepare (d) {
    const all = []
    for (const s of d.slides) {
      walk(s.elements, e => { all.push(e) })
      walk(s.master || [], e => { all.push(e) })
    }
    // how large each picture is shown (sizes the fallback picture of vector art)
    const shown = (id, w, h) => { if (id) this.size.set(id, Math.max(this.size.get(id) || 0, w, h)) }
    for (const e of all) {
      if (e.type === 'image' || e.type === 'video') shown(e.src, e.w, e.h)
      if (e.fill?.type === 'image') shown(e.fill.src, e.w, e.h)
      if (e.poster) shown(e.poster, e.w, e.h)
      if (e.type === 'table') for (const row of e.cells || []) for (const c of row || []) if (c?.fill?.type === 'image') shown(c.fill.src, e.w, e.h)
    }
    for (const s of d.slides) if (s.bg?.type === 'image') shown(s.bg.src, d.size.w, d.size.h)
    for (const e of all) {
      if (e.type === 'image') await this.image(e.src)
      if (e.fill?.type === 'image') await this.image(e.fill.src, true)
      if (e.type === 'video' || e.type === 'audio') await this.media(e)
      if (e.type === 'table') for (const row of e.cells || []) for (const c of row || []) if (c?.fill?.type === 'image') await this.image(c.fill.src, true)
    }
    for (const s of d.slides) if (s.bg?.type === 'image') await this.image(s.bg.src, true)
  }
  // where each of the document's media files sits in the package (for Prizma's own copy of the document)
  parts () {
    const out = {}
    for (const [id, m] of this.img) if (m) out[id] = m.svg ? { part: 'ppt/media/' + m.svg, mime: 'image/svg+xml' } : { part: 'ppt/media/' + m.name, mime: m.mime }
    for (const [id, m] of this.av) out[id] = { part: 'ppt/media/' + m.name, mime: m.mime }
    return out
  }
}

// ---------- shared XML bits ----------
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
const CLRMAP_STD = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"'
const ACC = 'accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"'
const guid = () => '{' + [8, 4, 4, 4, 12].map(n => Array.from({ length: n }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('')).join('-') + '}'
const LAYOUT_TYPE = { title: 'title', titleContent: 'obj', section: 'secHead', twoContent: 'twoObj', comparison: 'twoTxTwoObj', titleOnly: 'titleOnly', blank: 'blank', contentCaption: 'objTx', pictureCaption: 'picTx', statement: 'cust' }
const bgXml = (fill, c) => fill ? `<p:bg><p:bgPr>${fillXml(fill, c, 1, { w: c.env.W, h: c.env.H })}<a:effectLst/></p:bgPr></p:bg>` : ''
const hrefOf = link => link ? (link.url || (link.slide !== undefined && link.slide !== null ? '#slide:' + link.slide : '')) : ''
function langTag () {
  const l = String(navigator.language || 'en-US').replace('_', '-')
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(l) ? l : 'en-US'
}

// Writing context for one part (slide, layout, master): shape ids, relationships, link targets
function partCtx (env, rels, extra = {}) {
  let next = 1
  return {
    env, rels, theme: env.theme, lang: env.lang,
    id: () => ++next,
    targets: new Map(), media: [], names: new Map(),
    blip: mid => { const im = env.media.img.get(mid); return im ? rels.add(REL.image, '../media/' + im.name) : null },
    mediaSize: mid => { const im = env.media.img.get(mid); return im && im.w && im.h ? { w: im.w, h: im.h } : null },
    link: href => {
      if (!href) return ''
      const m = /^#slide:(.+)/.exec(href)
      const k = m ? env.d.slides.findIndex(s => s.id === m[1]) : -1
      if (m) return k >= 0 ? `<a:hlinkClick r:id="${rels.add(REL.slide, `../slides/slide${k + 1}.xml`)}" action="ppaction://hlinksldjump"/>` : ''
      if (href.startsWith('#')) return ''
      return `<a:hlinkClick r:id="${rels.add(REL.link, href, true)}"/>`
    },
    ...extra
  }
}
function cNvPr (el, c, id, inner) {
  const name = c.names.get(el.id) || el.name || `${ELEMENT_LABEL[el.type] || 'Shape'} ${id - 1}`
  return `<p:cNvPr id="${id}" name="${esc(name)}"${el.alt ? ` descr="${esc(el.alt)}"` : ''}${el.hidden ? ' hidden="1"' : ''}>${inner ?? c.link(hrefOf(el.link))}</p:cNvPr>`
}

// ---------- elements ----------
// presets whose outline never depends on adjustment handles, so an imported outline equals the preset
const FIXED = /^(rect|ellipse|rtTriangle|diamond|heart|lightningBolt|cloud|irregularSeal[12]|flowChart\w+)$/
function shapeGeom (el) {
  if (pathDriven(el)) {
    if (FIXED.test(el.shape || '') && !el.pathLocked) return prstXml(el.shape, {})
    return custGeomXml(shapeParts(el), el.w, el.h) || prstXml('rect', {})
  }
  if (PRESETS.has(el.shape)) return prstXml(el.shape, el.adj)
  return custGeomXml(shapeParts(el), el.w, el.h) || prstXml('rect', {})
}
function spXml (el, c, off) {
  const id = c.id()
  c.targets.set(el.id, { spid: id, sp: true })
  const op = el.opacity ?? 1
  const ph = c.ph ? c.ph(el) : ''
  const isText = el.type === 'text'
  const geom = isText ? prstXml(el.geom && PRESETS.has(el.geom) ? el.geom : 'rect', {}) : shapeGeom(el)
  const strokeOnly = !isText && (el.strokeOnly || SHAPES[el.shape]?.strokeOnly)
  const fill = strokeOnly ? '<a:noFill/>' : fillXml(el.fill, c, op, el)
  const tc = op < 1 ? { ...c, alpha: op } : c
  const body = `<p:txBody>${bodyPrXml(el)}<a:lstStyle/>${parasXml(el.html, el.ts, tc, { fx: el.textFx })}</p:txBody>`
  return `<p:sp${el.bgFill ? ' useBgFill="1"' : ''}><p:nvSpPr>${cNvPr(el, c, id)}<p:cNvSpPr${isText && !ph ? ' txBox="1"' : ''}>${ph ? '<a:spLocks noGrp="1"/>' : ''}</p:cNvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${xfrmXml(el, { off })}${geom}${fill}${lineXml(el.line, c, op)}${effectsXml(el, c)}</p:spPr>${body}</p:sp>`
}
function cxnXml (el, c, off) {
  const id = c.id()
  c.targets.set(el.id, { spid: id, sp: false })
  const k = el.kind || 'straight'
  const geom = el.path
    ? (custGeomXml([{ d: linePath(el), fill: 'none' }], el.w, el.h) || prstXml('line', {}))
    : prstXml(k.startsWith('elbow') ? 'bentConnector3' : k.startsWith('curve') ? 'curvedConnector3' : 'line', {})
  return `<p:cxnSp><p:nvCxnSpPr>${cNvPr(el, c, id)}<p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrmXml(el, { off })}${geom}<a:noFill/>${lineXml(el.line, c, el.opacity ?? 1, 'round')}${effectsXml(el, c)}</p:spPr></p:cxnSp>`
}
function picXml (el, c, off) {
  const im = c.env.media.img.get(el.src)
  if (!im) return ''
  const id = c.id()
  c.targets.set(el.id, { spid: id, sp: false })
  const f = el.adjust || {}
  const op = (el.opacity ?? 1) * (f.transparency ? 1 - f.transparency / 100 : 1)
  let fx = ''
  if (op < 0.999) fx += `<a:alphaModFix amt="${pct1(op)}"/>`
  if (f.grayscale) fx += '<a:grayscl/>'
  if (f.sepia) fx += '<a:duotone><a:prstClr val="black"/><a:srgbClr val="D9C3A5"><a:tint val="50000"/><a:satMod val="180000"/></a:srgbClr></a:duotone>' // PowerPoint's own Sepia recolour
  if (f.brightness || f.contrast) fx += `<a:lum bright="${Math.round((f.brightness || 0) * 1000)}" contrast="${Math.round((f.contrast || 0) * 1000)}"/>`
  if (f.saturate !== undefined && f.saturate !== 100) fx += `<a:hsl hue="0" sat="${Math.round(Math.max(-100, Math.min(100, f.saturate - 100)) * 1000)}" lum="0"/>`
  if (f.blur) fx += `<a:blur rad="${emuPos(f.blur)}"/>`
  if (im.svg) fx += `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="${NS.asvg}" r:embed="${c.rels.add(REL.image, '../media/' + im.svg)}"/></a:ext></a:extLst>`
  const cr = el.crop
  const src = cr && (cr.l || cr.t || cr.r || cr.b) ? `<a:srcRect${['l', 't', 'r', 'b'].map(k => cr[k] ? ` ${k}="${Math.round(cr[k] * 100000)}"` : '').join('')}/>` : '<a:srcRect/>'
  return `<p:pic><p:nvPicPr>${cNvPr(el, c, id)}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${c.rels.add(REL.image, '../media/' + im.name)}">${fx}</a:blip>${src}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrmXml(el, { off })}${shapeGeom(picShape(el))}${el.line ? lineXml(el.line, c, el.opacity ?? 1) : ''}${effectsXml(el, c)}</p:spPr></p:pic>`
}
const LN_TAG = { left: 'lnL', right: 'lnR', top: 'lnT', bottom: 'lnB' }
const sum = (list, i, n) => list.slice(i, i + n).reduce((a, b) => a + b, 0)
function tableXml (el, c, off) {
  const id = c.id()
  c.targets.set(el.id, { spid: id, sp: false })
  const rows = el.rows || [], cols = el.cols || []
  const nR = rows.length, nC = cols.length
  const ts = { font: '+minor', size: 14, color: 'dk1', ...(el.ts || {}) }
  const st = { header: true, banded: true, ...(el.style || {}) }
  // a table has no transparency of its own in PowerPoint: every fill, border and text carries it
  const op = el.opacity ?? 1
  const tc = op < 1 ? { ...c, alpha: op } : c
  // cells covered by a merge: PowerPoint marks them hMerge (to the right of the anchor) / vMerge (below)
  const cover = Array.from({ length: nR }, () => Array(nC).fill(null))
  for (let r = 0; r < nR; r++) {
    for (let k = 0; k < nC; k++) {
      const cell = el.cells?.[r]?.[k]
      if (!cell || cell.merged) continue
      const cs = Math.min(cell.colspan || 1, nC - k), rs = Math.min(cell.rowspan || 1, nR - r)
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) if (dr || dc) cover[r + dr][k + dc] = { h: dc > 0, v: dr > 0 }
    }
  }
  const trs = rows.map((rh, r) => {
    const tcs = cols.map((_, k) => {
      const cell = el.cells?.[r]?.[k] || { html: '' }
      const cv = cover[r][k]
      const look = tableCellLook(el, r, k)
      const span = cv ? (cv.h ? ' hMerge="1"' : '') + (cv.v ? ' vMerge="1"' : '') : ((cell.colspan || 1) > 1 ? ` gridSpan="${Math.min(cell.colspan, nC - k)}"` : '') + ((cell.rowspan || 1) > 1 ? ` rowSpan="${Math.min(cell.rowspan, nR - r)}"` : '')
      const base = { ...ts, ...(look.color ? { color: look.color } : {}), ...(cell.color ? { color: cell.color } : {}), ...(look.bold || cell.bold ? { bold: true } : {}) }
      const ins = cell.inset || { l: 7.2, t: 3.6, r: 7.2, b: 3.6 }
      const lines = ['left', 'right', 'top', 'bottom'].map(side => {
        const b = cell.borders?.[side] || look.borders?.[side]
        const t = LN_TAG[side]
        return b && b.width && b.color ? `<a:${t} w="${emuPos(b.width)}">${solidXml(b.color, op, c.theme)}<a:prstDash val="${b.dash && b.dash !== 'solid' ? 'dash' : 'solid'}"/></a:${t}>` : ''
      }).join('')
      // a picture fills the whole cell, merged ones included, cropped as the slide shows it
      const box = { w: sum(cols, k, Math.min(cell.colspan || 1, nC - k)), h: sum(rows, r, Math.min(cell.rowspan || 1, nR - r)) }
      const fill = cell.fill ? fillXml(cell.fill, c, op, box) : look.fill ? solidXml(look.fill, op, c.theme) : '<a:noFill/>'
      const anchor = cell.vAlign === 'middle' ? 'ctr' : cell.vAlign === 'bottom' ? 'b' : 't'
      return `<a:tc${span}><a:txBody><a:bodyPr/><a:lstStyle/>${parasXml(cv ? '' : cell.html, base, tc)}</a:txBody><a:tcPr marL="${emuPos(ins.l)}" marR="${emuPos(ins.r)}" marT="${emuPos(ins.t)}" marB="${emuPos(ins.b)}" anchor="${anchor}">${lines}${fill}</a:tcPr></a:tc>`
    }).join('')
    return `<a:tr h="${emuPos(rh)}">${tcs}</a:tr>`
  }).join('')
  // "No Style, No Grid": every colour and border is written on the cells, exactly as Prizma draws them
  const tbl = `<a:tbl><a:tblPr firstRow="${st.header ? 1 : 0}" bandRow="${st.banded ? 1 : 0}">${effectsXml(el, c)}<a:tableStyleId>{2D5ABB26-0587-4C30-8999-92F81FD0307C}</a:tableStyleId></a:tblPr><a:tblGrid>${cols.map(w => `<a:gridCol w="${emuPos(w)}"/>`).join('')}</a:tblGrid>${trs}</a:tbl>`
  return `<p:graphicFrame><p:nvGraphicFramePr>${cNvPr(el, c, id)}<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>${xfrmXml(el, { tag: 'p:xfrm', off })}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">${tbl}</a:graphicData></a:graphic></p:graphicFrame>`
}
async function chartXml (el, c, off) {
  const id = c.id()
  c.targets.set(el.id, { spid: id, sp: false })
  const env = c.env
  const n = ++env.charts
  const { xml, xlsx } = await chartPart(el, { theme: c.theme, lang: c.lang, alpha: el.opacity ?? 1 })
  const part = `ppt/charts/chart${n}.xml`
  env.pkg.part(part, xml, OX + 'drawingml.chart+xml')
  env.pkg.bin(`ppt/embeddings/Microsoft_Excel_Worksheet${n}.xlsx`, xlsx, OX + 'spreadsheetml.sheet')
  const r = new Rels()
  r.add(REL.package, `../embeddings/Microsoft_Excel_Worksheet${n}.xlsx`)
  env.pkg.rels(part, r)
  return `<p:graphicFrame><p:nvGraphicFramePr>${cNvPr(el, c, id)}<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrmXml(el, { tag: 'p:xfrm', off })}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="${NS.c}" r:id="${c.rels.add(REL.chart, `../charts/chart${n}.xml`)}"/></a:graphicData></a:graphic></p:graphicFrame>`
}
// Lucide icon nodes as path data (24 × 24 grid)
function svgNodePath (tag, a) {
  const n = k => parseFloat(a[k]) || 0
  switch (tag) {
    case 'path': return a.d || ''
    case 'circle': case 'ellipse': {
      const cx = n('cx'), cy = n('cy'), rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry')
      return rx && ry ? `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z` : ''
    }
    case 'rect': {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height')
      const rx = Math.min(n('rx') || n('ry'), w / 2), ry = Math.min(n('ry') || rx, h / 2)
      if (!rx) return `M${x} ${y} H${x + w} V${y + h} H${x} Z`
      return `M${x + rx} ${y} H${x + w - rx} A${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V${y + h - ry} A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H${x + rx} A${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V${y + ry} A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`
    }
    case 'line': return `M${n('x1')} ${n('y1')} L${n('x2')} ${n('y2')}`
    case 'polyline': case 'polygon': {
      const p = String(a.points || '').trim().split(/[\s,]+/).map(Number)
      if (p.length < 4) return ''
      let d = `M${p[0]} ${p[1]}`
      for (let i = 2; i + 1 < p.length; i += 2) d += ` L${p[i]} ${p[i + 1]}`
      return tag === 'polygon' ? d + ' Z' : d
    }
  }
  return ''
}
function iconXml (el, c, off) {
  const id = c.id()
  c.targets.set(el.id, { spid: id, sp: false })
  const parts = (iconNode(el.icon) || []).map(([tag, a]) => ({ d: svgNodePath(tag, a), fill: el.fillIcon ? 'norm' : 'none' })).filter(p => p.d)
  const op = el.opacity ?? 1
  // the icon's stroke scales with the box, like the SVG on the slide (unless it keeps a fixed width)
  const width = (el.stroke || 2) * (el.keepStroke ? 0.75 : Math.sqrt(Math.max(el.w, 0.01) * Math.max(el.h, 0.01)) / 24)
  const ln = `<a:ln w="${emuPos(width)}" cap="rnd">${solidXml(el.color || 'accent1', op, c.theme)}<a:prstDash val="solid"/><a:round/></a:ln>`
  return `<p:sp><p:nvSpPr>${cNvPr(el, c, id)}<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrmXml(el, { off })}${custGeomXml(parts, 24, 24, 1000) || prstXml('rect', {})}${el.fillIcon ? solidXml(el.fillIcon, op, c.theme) : '<a:noFill/>'}${ln}${effectsXml(el, c)}</p:spPr></p:sp>`
}
function inkXml (el, c, off) {
  const paths = (el.paths || []).filter(p => p.d)
  if (!paths.length) return ''
  const vb = el.vb || { w: el.w, h: el.h }
  const k = el.w / Math.max(0.01, vb.w)
  const stroke = (p, box, id, named) => `<p:sp><p:nvSpPr>${named}<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrmXml(box, { off })}${custGeomXml([{ d: p.d, fill: 'none' }], vb.w, vb.h)}<a:noFill/>${lineXml({ color: p.color || 'dk1', width: (p.width || 2) * k, alpha: (p.alpha ?? 1) * (p.hl ? 0.5 : 1) }, c, el.opacity ?? 1, 'round')}</p:spPr></p:sp>`
  const id = c.id()
  c.targets.set(el.id, { spid: id, sp: false })
  if (paths.length === 1) return stroke(paths[0], el, id, cNvPr(el, c, id))
  const kids = paths.map((p, i) => { const sid = c.id(); return stroke(p, { x: el.x, y: el.y, w: el.w, h: el.h }, sid, `<p:cNvPr id="${sid}" name="Ink stroke ${i + 1}"/>`) }).join('')
  return `<p:grpSp><p:nvGrpSpPr>${cNvPr(el, c, id)}<p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${xfrmXml(el, { off, child: true })}</p:grpSpPr>${kids}</p:grpSp>`
}
function mediaXml (el, c, off) {
  const av = c.env.media.av.get(el.src)
  const poster = c.env.media.posters.get(el.id)
  if (!av || !poster) return ''
  const id = c.id()
  c.targets.set(el.id, { spid: id, sp: false })
  const target = '../media/' + av.name
  const embed = c.rels.add(REL.media, target)
  const link = c.rels.add(el.type === 'audio' ? REL.audio : REL.video, target)
  c.media.push({ spid: id, kind: el.type, autoplay: !!el.autoplay, loop: !!el.loop, muted: !!el.muted, hideIdle: !!el.hideIdle, fullscreen: !!el.fullscreen, ms: av.ms })
  const file = el.type === 'audio' ? `<a:audioFile r:link="${link}"/>` : `<a:videoFile r:link="${link}"/>`
  return `<p:pic><p:nvPicPr>${cNvPr(el, c, id, '<a:hlinkClick r:id="" action="ppaction://media"/>')}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr>${file}<p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE9BCB7C2F7}"><p14:media xmlns:p14="${NS.p14}" r:embed="${embed}"/></p:ext></p:extLst></p:nvPr></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${c.rels.add(REL.image, '../media/' + poster.name)}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrmXml(el, { off })}${prstXml('rect', {})}</p:spPr></p:pic>`
}
async function grpXml (el, c, off) {
  const id = c.id()
  c.targets.set(el.id, { spid: id, sp: false })
  let kids = ''
  // a group has no transparency of its own in PowerPoint: its children carry it
  const op = el.opacity ?? 1
  for (const ch of el.children || []) kids += await elXml(op < 1 ? { ...ch, opacity: (ch.opacity ?? 1) * op } : ch, c, { x: off.x + el.x, y: off.y + el.y })
  if (!kids) { c.targets.delete(el.id); return '' }
  return `<p:grpSp><p:nvGrpSpPr>${cNvPr(el, c, id)}<p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${xfrmXml(el, { off, child: true })}${effectsXml(el, c)}</p:grpSpPr>${kids}</p:grpSp>`
}
async function elXml (el, c, off = { x: 0, y: 0 }) {
  switch (el.type) {
    case 'text': case 'shape': return spXml(el, c, off)
    case 'line': return cxnXml(el, c, off)
    case 'image': return picXml(el, c, off)
    case 'table': return tableXml(el, c, off)
    case 'chart': return chartXml(el, c, off)
    case 'icon': return iconXml(el, c, off)
    case 'ink': return inkXml(el, c, off)
    case 'video': case 'audio': return mediaXml(el, c, off)
    case 'group': return grpXml(el, c, off)
    default: return ''
  }
}

// ---------- placeholders ----------
// The placeholder slots of a layout: our layout placeholders with PowerPoint's type/idx
function phSlots (layoutId, env) {
  let idx = 0
  return layoutPlaceholders(layoutId, env.d.size, env.theme).map(el => {
    let xml
    if (el.ph === 'title') xml = `<p:ph type="${layoutId === 'title' ? 'ctrTitle' : 'title'}"/>`
    else if (el.ph === 'subTitle') xml = `<p:ph type="subTitle" idx="${++idx}"/>`
    else if (el.ph === 'pic') xml = `<p:ph type="pic" idx="${++idx}"/>`
    else xml = /data-bu/.test(el.html) ? `<p:ph idx="${++idx}"/>` : `<p:ph type="body" idx="${++idx}"/>`
    return { role: el.ph, xml, el, bullets: /data-bu/.test(el.html) }
  })
}
// Slide placeholders take the layout's slots in order, role by role; extra ones stay ordinary text boxes
function phMatcher (slots) {
  const used = new Map()
  return el => {
    if (!el.ph) return ''
    const role = el.ph === 'subTitle' && !slots.some(s => s.role === 'subTitle') ? 'body' : el.ph
    const k = used.get(role) || 0
    used.set(role, k + 1)
    return slots.filter(s => s.role === role)[k]?.xml || ''
  }
}
const defRPr = (ts, c, extra = '') => `<a:defRPr${ts.size ? ` sz="${Math.round(ts.size * 100)}"` : ''} b="${ts.bold ? 1 : 0}"${extra}>${ts.color ? solidXml(ts.color, 1, c.theme) : ''}${fontXml(ts.font)}</a:defRPr>`
const ALGN = { left: 'l', center: 'ctr', right: 'r', justify: 'just' }
// List style levels: bullets at 27 pt with a 27 pt hang, 36 pt more per level (as Prizma's editor indents)
function levelsXml (ts, c, bullets, levels = 5) {
  let out = ''
  for (let i = 0; i < levels; i++) {
    const sz = Math.max(12, (ts.size || 18) - i * 2)
    const t = { ...ts, size: i ? sz : ts.size }
    out += bullets
      ? `<a:lvl${i + 1}pPr marL="${emu(27 + i * 36)}" indent="${emu(-27)}" algn="${ALGN[ts.align] || 'l'}"><a:spcBef><a:spcPts val="${i ? 400 : 1000}"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="${BULLET_CHARS[i % BULLET_CHARS.length]}"/>${defRPr(t, c)}</a:lvl${i + 1}pPr>`
      : `<a:lvl${i + 1}pPr marL="${emu(i * 36)}" indent="0" algn="${ALGN[ts.align] || 'l'}"><a:buNone/>${defRPr(t, c)}</a:lvl${i + 1}pPr>`
  }
  return out
}
function phShapeXml (slot, c, name) {
  const el = slot.el
  const id = c.id()
  const ts = el.ts || {}
  const prompt = PROMPTS[el.ph] || PROMPTS.body
  const body = `<p:txBody>${bodyPrXml(el)}<a:lstStyle>${levelsXml(ts, c, slot.bullets, slot.bullets ? 5 : 1)}</a:lstStyle><a:p><a:r><a:rPr lang="${c.lang}" dirty="0"/><a:t>${esc(prompt)}</a:t></a:r><a:endParaRPr lang="${c.lang}" dirty="0"/></a:p></p:txBody>`
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name || el.name || 'Placeholder')} ${id - 1}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${slot.xml}</p:nvPr></p:nvSpPr><p:spPr>${xfrmXml(el)}</p:spPr>${body}</p:sp>`
}
// Date, footer and slide number (same places and style as Prizma draws them)
const HF_TS = { font: '+minor', size: 10.5 }
function hfBoxes (W, H) {
  return { dt: { x: W * 0.07, y: H - 34, w: W * 0.22, h: 22 }, ftr: { x: W * 0.3, y: H - 34, w: W * 0.4, h: 22 }, sldNum: { x: W * 0.71, y: H - 34, w: W * 0.22, h: 22 } }
}
const HF_NAME = { dt: 'Date Placeholder', ftr: 'Footer Placeholder', sldNum: 'Slide Number Placeholder' }
const HF_ALGN = { dt: 'l', ftr: 'ctr', sldNum: 'r' }
function hfShape (type, idx, c, content) {
  const id = c.id()
  const b = hfBoxes(c.env.W, c.env.H)[type]
  const rpr = `<a:rPr lang="${c.lang}" sz="1050" dirty="0">${solidXml('dk1', 0.62, c.theme)}${fontXml('+minor')}</a:rPr>`
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${HF_NAME[type]} ${id - 1}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="${type}" sz="${type === 'dt' ? 'half' : 'quarter'}" idx="${idx}"/></p:nvPr></p:nvSpPr><p:spPr>${xfrmXml(b)}</p:spPr>` +
    `<p:txBody><a:bodyPr lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"/><a:lstStyle><a:lvl1pPr algn="${HF_ALGN[type]}">${defRPr({ ...HF_TS, color: null }, c)}</a:lvl1pPr></a:lstStyle><a:p><a:pPr algn="${HF_ALGN[type]}"/>${content(rpr)}<a:endParaRPr lang="${c.lang}" sz="1050" dirty="0"/></a:p></p:txBody></p:sp>`
}
const dateField = (rpr, text) => `<a:fld id="${guid()}" type="datetime1">${rpr}<a:t>${esc(text)}</a:t></a:fld>`
const numField = (rpr, n) => `<a:fld id="${guid()}" type="slidenum">${rpr}<a:t>${n}</a:t></a:fld>`
const today = () => new Date().toLocaleDateString()

// ---------- theme ----------
const FMT = '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="109000"/><a:tint val="81000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="103000"/><a:lumMod val="102000"/><a:tint val="94000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="100000"/><a:shade val="100000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="99000"/><a:satMod val="120000"/><a:shade val="78000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:fillStyleLst>' +
  '<a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst>' +
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst>' +
  '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/><a:lumMod val="102000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/><a:lumMod val="103000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:bgFillStyleLst></a:fmtScheme>'
const hex6 = c => String(c || '#000000').replace('#', '').slice(0, 6).toUpperCase().padEnd(6, '0')
function themeXml (name, scheme, fonts) {
  const slot = k => `<a:${k}><a:srgbClr val="${hex6(scheme[k])}"/></a:${k}>`
  const face = f => esc(f || 'Calibri')
  return `${XML_HEAD}<a:theme xmlns:a="${NS.a}" name="${esc(name)}"><a:themeElements><a:clrScheme name="${esc(name)}">${['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(slot).join('')}</a:clrScheme>` +
    `<a:fontScheme name="${esc(name)}"><a:majorFont><a:latin typeface="${face(fonts.major)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${face(fonts.minor)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>${FMT}</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
}
const OFFICE = { dk1: '#000000', lt1: '#FFFFFF', dk2: '#44546A', lt2: '#E7E6E6', accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A5A5A5', accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47', hlink: '#0563C1', folHlink: '#954F72' }

// ---------- masters ----------
function defaultTextStyle (lang) {
  let lv = ''
  for (let i = 0; i < 9; i++) lv += `<a:lvl${i + 1}pPr marL="${i * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${i + 1}pPr>`
  return `<p:defaultTextStyle><a:defPPr><a:defRPr lang="${lang}"/></a:defPPr>${lv}</p:defaultTextStyle>`
}
function masterXml (env, c, variants, clrMap) {
  const spec = env.spec || themeSpec({ id: 'blank' })
  const titleSlot = phSlots('titleContent', env)
  const bodyTs = titleSlot[1].el.ts, titleTs = titleSlot[0].el.ts
  const title = phShapeXml({ ...titleSlot[0], xml: '<p:ph type="title"/>' }, c, 'Title Placeholder')
  const body = phShapeXml({ ...titleSlot[1], xml: '<p:ph type="body" idx="1"/>' }, c, 'Text Placeholder')
  const hf = hfShape('dt', 2, c, r => dateField(r, today())) + hfShape('ftr', 3, c, () => '') + hfShape('sldNum', 4, c, r => numField(r, '‹#›'))
  const bg = bgXml(env.spec ? spec.bg.content : solid('lt1'), c)
  const ids = variants.map((v, i) => `<p:sldLayoutId id="${2147483649 + i}" r:id="${c.rels.add(REL.layout, `../slideLayouts/slideLayout${v.n}.xml`)}"/>`).join('')
  const other = `<a:defPPr><a:defRPr lang="${c.lang}"/></a:defPPr>` + Array.from({ length: 9 }, (_, i) => `<a:lvl${i + 1}pPr marL="${i * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${i + 1}pPr>`).join('')
  return `${XML_HEAD}<p:sldMaster ${NS_APR}><p:cSld>${bg}<p:spTree>${GRP}${title}${body}${hf}</p:spTree></p:cSld><p:clrMap ${clrMap} ${ACC}/><p:sldLayoutIdLst>${ids}</p:sldLayoutIdLst>` +
    `<p:txStyles><p:titleStyle>${levelsXml(titleTs, c, false, 9)}</p:titleStyle><p:bodyStyle>${levelsXml(bodyTs, c, true, 9)}</p:bodyStyle><p:otherStyle>${other}</p:otherStyle></p:txStyles></p:sldMaster>`
}
async function layoutXml (v, env, c) {
  let tree = ''
  for (const el of v.decor) tree += await elXml(el, c)
  for (const s of v.slots) tree += phShapeXml(s, c)
  tree += hfShape('dt', 10, c, r => dateField(r, today())) + hfShape('ftr', 11, c, () => '') + hfShape('sldNum', 12, c, r => numField(r, '‹#›'))
  return `${XML_HEAD}<p:sldLayout ${NS_APR} type="${LAYOUT_TYPE[v.layout.id] || 'cust'}" preserve="1"><p:cSld name="${esc(v.name)}">${bgXml(v.bg, c)}<p:spTree>${GRP}${tree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
}
// One PowerPoint layout per Prizma layout (with the theme's art), plus one for every distinct set of
// imported background graphics, so slides from opened decks keep theirs as layout art too.
function layoutVariants (env) {
  const { d, spec, theme } = env
  const variants = []
  const std = new Map()
  for (const L of LAYOUTS) {
    const v = { n: variants.length + 1, layout: L, name: L.name, decor: spec ? slideDecor({ layout: L.id }, theme, d.size) : [], bg: spec ? (spec.bg[L.kind] || spec.bg.content) : null, slots: phSlots(L.id, env) }
    variants.push(v)
    std.set(L.id, v)
  }
  const custom = new Map()
  const sig = arr => JSON.stringify(arr, (k, val) => k === 'id' ? undefined : val)
  const forSlide = d.slides.map(s => {
    const L = LAYOUTS.find(l => l.id === s.layout) || LAYOUTS.find(l => l.id === 'blank')
    if (!s.master || !s.master.length) return std.get(L.id)
    const key = L.id + '|' + sig(s.master)
    if (!custom.has(key)) {
      const count = [...custom.values()].filter(v => v.layout.id === L.id).length
      const v = { n: variants.length + 1, layout: L, name: `${L.name} ${count + 2}`, decor: s.master, bg: null, slots: std.get(L.id).slots }
      variants.push(v)
      custom.set(key, v)
    }
    return custom.get(key)
  })
  return { variants, forSlide }
}
const hash4 = str => { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0).toString(36).slice(-4) }
// Morph pairs objects by name in PowerPoint; "!!" names make the pairing explicit
function morphNames (slides) {
  const names = slides.map(() => new Map())
  slides.forEach((s, i) => {
    if (!i || s.transition?.type !== 'morph') return
    const prev = new Map(slides[i - 1].elements.map(e => [e.id, e]))
    for (const e of s.elements) {
      if (!prev.has(e.id)) continue
      const nm = names[i - 1].get(e.id) || `!!${String(e.name || ELEMENT_LABEL[e.type] || 'Shape').replace(/^!!/, '')} ${hash4(e.id)}`
      names[i - 1].set(e.id, nm)
      names[i].set(e.id, nm)
    }
  })
  return names
}

// ---------- notes ----------
function notesMasterXml (env) {
  const W = env.W, H = env.H
  const imgW = 5486400, imgH = Math.round(imgW * H / W), imgY = Math.max(457200, Math.round((4400550 - imgH) / 2) + 228600)
  const ph = (id, name, type, idx, x, y, cx, cy, text = '', extra = '') => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"${type === 'sldImg' ? ' noRot="1" noChangeAspect="1"' : ''}/></p:cNvSpPr><p:nvPr><p:ph type="${type}"${type === 'sldImg' ? '' : ' sz="quarter"'} idx="${idx}"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${extra}</p:spPr>${type === 'sldImg' ? '' : `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p>${text}<a:endParaRPr lang="${env.lang}"/></a:p></p:txBody>`}</p:sp>`
  let lv = ''
  for (let i = 0; i < 9; i++) lv += `<a:lvl${i + 1}pPr marL="${i * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${i + 1}pPr>`
  return `${XML_HEAD}<p:notesMaster ${NS_APR}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRP}` +
    ph(2, 'Header Placeholder 1', 'hdr', 0, 0, 0, 2971800, 458788) +
    ph(3, 'Date Placeholder 2', 'dt', 1, 3884613, 0, 2971800, 458788) +
    ph(4, 'Slide Image Placeholder 3', 'sldImg', 2, 685800, imgY, imgW, imgH, '', '<a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln>') +
    ph(5, 'Notes Placeholder 4', 'body', 3, 685800, 4400550, 5486400, 3600450, `<a:r><a:rPr lang="${env.lang}"/><a:t>Click to edit Master text styles</a:t></a:r>`) +
    ph(6, 'Footer Placeholder 5', 'ftr', 4, 0, 8685213, 2971800, 458787) +
    ph(7, 'Slide Number Placeholder 6', 'sldNum', 5, 3884613, 8685213, 2971800, 458787, `<a:fld id="${guid()}" type="slidenum"><a:rPr lang="${env.lang}"/><a:t>‹#›</a:t></a:fld>`) +
    `</p:spTree></p:cSld><p:clrMap ${CLRMAP_STD} ${ACC}/><p:notesStyle>${lv}</p:notesStyle></p:notesMaster>`
}
function notesXml (slide, lang) {
  const paras = String(slide.notes || '').split(/\r?\n/).map(line => `<a:p>${line ? `<a:r><a:rPr lang="${lang}" dirty="0"/><a:t>${esc(line)}</a:t></a:r>` : ''}<a:endParaRPr lang="${lang}" dirty="0"/></a:p>`).join('')
  return `${XML_HEAD}<p:notes ${NS_APR}><p:cSld><p:spTree>${GRP}` +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>' +
    `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>` +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>'
}

// ---------- slides ----------
function hfSlideXml (env, slide, i, c) {
  const hf = env.d.hf || {}
  if (!(hf.number || hf.footer || hf.date)) return ''
  if (hf.hideOnTitle && slide.layout === 'title') return ''
  let out = ''
  if (hf.date) out += hfShape('dt', 10, c, r => hf.dateText ? `<a:r>${r}<a:t>${esc(hf.dateText)}</a:t></a:r>` : dateField(r, today()))
  if (hf.footer) out += hfShape('ftr', 11, c, r => `<a:r>${r}<a:t>${esc(hf.footer)}</a:t></a:r>`)
  if (hf.number) out += hfShape('sldNum', 12, c, r => numField(r, i + 1))
  return out
}
async function slideXml (env, slide, i, c, v) {
  c.ph = phMatcher(v.slots)
  let tree = ''
  for (const el of slide.elements || []) tree += await elXml(el, c)
  tree += hfSlideXml(env, slide, i, c)
  const timing = timingXml(slide, id => c.targets.get(id) || null, c.media)
  const attrs = (slide.hidden ? ' show="0"' : '') + (slide.hideMaster ? ' showMasterSp="0"' : '')
  return `${XML_HEAD}<p:sld ${NS_APR}${attrs}><p:cSld>${bgXml(slide.bg, c)}<p:spTree>${GRP}${tree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transitionXml(slide)}${timing}</p:sld>`
}

// ---------- document properties ----------
const W3C = t => new Date(t || Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z')
function coreXml (d) {
  const p = d.props || {}
  const me = settings.value.author || appInfo.value.userName || '' // the name Options › Your name shows
  return `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(p.title || '')}</dc:title>${p.subject ? `<dc:subject>${esc(p.subject)}</dc:subject>` : ''}<dc:creator>${esc(p.author || me)}</dc:creator>${p.keywords ? `<cp:keywords>${esc(p.keywords)}</cp:keywords>` : ''}<cp:lastModifiedBy>${esc(me || p.author || '')}</cp:lastModifiedBy><cp:revision>1</cp:revision>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${W3C(p.created)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${W3C(Date.now())}</dcterms:modified></cp:coreProperties>`
}
function appXml (d) {
  const notes = d.slides.filter(s => (s.notes || '').trim()).length
  const hidden = d.slides.filter(s => s.hidden).length
  return `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><TotalTime>0</TotalTime><Application>Prizma</Application><PresentationFormat>Custom</PresentationFormat><Slides>${d.slides.length}</Slides><Notes>${notes}</Notes><HiddenSlides>${hidden}</HiddenSlides><MMClips>0</MMClips><ScaleCrop>false</ScaleCrop><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>`
}
// Lets Prizma recognise its own theme when the file is opened again. Kept short: Office keeps text properties up to
// 255 characters, so footers and show settings are read from the Prizma copy of the deck instead.
function customXml (d) {
  const info = { v: 1, theme: { id: d.theme.id, name: d.theme.name, variant: d.theme.variant || 0 } }
  return `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="PrizmaDocument"><vt:lpwstr>${esc(JSON.stringify(info))}</vt:lpwstr></property></Properties>`
}
function presPropsXml (d) {
  const s = d.show || {}
  const range = s.from ? `<p:sldRg st="${Math.max(1, s.from)}" end="${Math.max(s.from, s.to || d.slides.length)}"/>` : '<p:sldAll/>'
  return `${XML_HEAD}<p:presentationPr ${NS_APR}><p:showPr${s.loop ? ' loop="1"' : ''} showNarration="1"${s.noAnim ? ' showAnimation="0"' : ''} useTimings="${s.useTimings === false ? 0 : 1}"><p:present/>${range}<p:penClr><a:srgbClr val="${hex6(s.pen || '#E5484D')}"/></p:penClr></p:showPr></p:presentationPr>`
}
const VIEW_PROPS = `${XML_HEAD}<p:viewPr ${NS_APR}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr snapToGrid="0"><p:cViewPr varScale="1"><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr><p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="1" d="1"/><a:sy n="1" d="1"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`
const TABLE_STYLES = `${XML_HEAD}<a:tblStyleLst xmlns:a="${NS.a}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`

// ---------- the writer ----------
export async function exportPptx (d, { kind = 'pptx' } = {}) {
  const pkg = new Pkg()
  const theme = d.theme
  const spec = themeSpec(theme)
  const env = { pkg, d, theme, spec, lang: langTag(), media: new MediaStore(pkg), charts: 0, W: d.size.w, H: d.size.h }
  await env.media.prepare(d)

  // theme: dark designs keep their dark colour in Dark 1 and map the background to it, as PowerPoint's own dark themes do
  const col = { ...OFFICE, ...theme.colors }
  const dark = luminance(col.lt1) < luminance(col.dk1)
  const scheme = dark ? { ...col, dk1: col.lt1, lt1: col.dk1, dk2: col.lt2, lt2: col.dk2 } : col
  const clrMap = dark ? 'bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"' : CLRMAP_STD
  pkg.part('ppt/theme/theme1.xml', themeXml(theme.name || 'Prizma', scheme, theme.fonts || {}), OX + 'theme+xml')
  pkg.part('ppt/theme/theme2.xml', themeXml('Office Theme', OFFICE, { major: 'Calibri Light', minor: 'Calibri' }), OX + 'theme+xml')

  const presRels = new Rels()
  const masterRid = presRels.add(REL.master, 'slideMasters/slideMaster1.xml')

  // layouts and master
  const { variants, forSlide } = layoutVariants(env)
  for (const v of variants) {
    const rels = new Rels()
    rels.add(REL.master, '../slideMasters/slideMaster1.xml')
    const c = partCtx(env, rels)
    const part = `ppt/slideLayouts/slideLayout${v.n}.xml`
    pkg.part(part, await layoutXml(v, env, c), PML + 'slideLayout+xml')
    pkg.rels(part, rels)
  }
  {
    const rels = new Rels()
    const c = partCtx(env, rels)
    const xml = masterXml(env, c, variants, clrMap)
    rels.add(REL.theme, '../theme/theme1.xml')
    pkg.part('ppt/slideMasters/slideMaster1.xml', xml, PML + 'slideMaster+xml')
    pkg.rels('ppt/slideMasters/slideMaster1.xml', rels)
  }

  // slides, notes and comments
  const names = morphNames(d.slides)
  const authors = new Map()
  const slideRids = [], slideTexts = []
  let anyNotes = false
  for (let i = 0; i < d.slides.length; i++) {
    const s = d.slides[i]
    const v = forSlide[i]
    const part = `ppt/slides/slide${i + 1}.xml`
    const rels = new Rels()
    rels.add(REL.layout, `../slideLayouts/slideLayout${v.n}.xml`)
    const c = partCtx(env, rels)
    c.names = names[i]
    slideTexts.push(await slideXml(env, s, i, c, v))
    pkg.part(part, slideTexts[i], PML + 'slide+xml')
    if ((s.notes || '').trim()) {
      anyNotes = true
      const np = `ppt/notesSlides/notesSlide${i + 1}.xml`
      const nr = new Rels()
      nr.add(REL.notesMaster, '../notesMasters/notesMaster1.xml')
      nr.add(REL.slide, `../slides/slide${i + 1}.xml`)
      pkg.part(np, notesXml(s, env.lang), PML + 'notesSlide+xml')
      pkg.rels(np, nr)
      rels.add(REL.notes, `../notesSlides/notesSlide${i + 1}.xml`)
    }
    const cms = (s.comments || []).filter(cm => cm && cm.text)
    if (cms.length) {
      const list = cms.map(cm => {
        const name = cm.author || 'Author'
        if (!authors.has(name)) authors.set(name, { id: authors.size, last: 0 })
        const a = authors.get(name)
        a.last++
        const at = cm.el ? walkFind(s.elements, cm.el) : null
        const x = at ? Math.round((at.x + at.w) * 8) : 80, y = at ? Math.round(at.y * 8) : 80
        // dt has no zone: PowerPoint and our reader take it as local time
        const t = new Date(cm.time || Date.now())
        return `<p:cm authorId="${a.id}" dt="${new Date(t - t.getTimezoneOffset() * 60000).toISOString().replace('Z', '')}" idx="${a.last}"><p:pos x="${x}" y="${y}"/><p:text>${esc(cm.text)}</p:text></p:cm>`
      }).join('')
      const cp = `ppt/comments/comment${i + 1}.xml`
      pkg.part(cp, `${XML_HEAD}<p:cmLst ${NS_APR}>${list}</p:cmLst>`, PML + 'comments+xml')
      rels.add(REL.comments, `../comments/comment${i + 1}.xml`)
    }
    pkg.rels(part, rels)
    slideRids.push(presRels.add(REL.slide, `slides/slide${i + 1}.xml`))
  }

  // presentation part
  let notesMasterRid = ''
  if (anyNotes) {
    notesMasterRid = presRels.add(REL.notesMaster, 'notesMasters/notesMaster1.xml')
    pkg.part('ppt/notesMasters/notesMaster1.xml', notesMasterXml(env), PML + 'notesMaster+xml')
    const nr = new Rels()
    nr.add(REL.theme, '../theme/theme2.xml')
    pkg.rels('ppt/notesMasters/notesMaster1.xml', nr)
  }
  presRels.add(REL.presProps, 'presProps.xml')
  presRels.add(REL.viewProps, 'viewProps.xml')
  presRels.add(REL.theme, 'theme/theme1.xml')
  presRels.add(REL.tableStyles, 'tableStyles.xml')
  if (authors.size) {
    presRels.add(REL.commentAuthors, 'commentAuthors.xml')
    pkg.part('ppt/commentAuthors.xml', `${XML_HEAD}<p:cmAuthorLst ${NS_APR}>${[...authors].map(([name, a]) => `<p:cmAuthor id="${a.id}" name="${esc(name)}" initials="${esc(name.split(/\s+/).filter(Boolean).map(w => [...w][0]).slice(0, 3).join('').toUpperCase())}" lastIdx="${a.last}" clrIdx="${a.id % 8}"/>`).join('')}</p:cmAuthorLst>`, PML + 'commentAuthors+xml')
  }
  const sldSz = `<p:sldSz cx="${Math.min(51206400, Math.max(914400, emu(env.W)))}" cy="${Math.min(51206400, Math.max(914400, emu(env.H)))}"/>`
  const pres = `${XML_HEAD}<p:presentation ${NS_APR} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${masterRid}"/></p:sldMasterIdLst>` +
    (notesMasterRid ? `<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRid}"/></p:notesMasterIdLst>` : '') +
    `<p:sldIdLst>${slideRids.map((rid, i) => `<p:sldId id="${256 + i}" r:id="${rid}"/>`).join('')}</p:sldIdLst>${sldSz}<p:notesSz cx="6858000" cy="9144000"/>${defaultTextStyle(env.lang)}</p:presentation>`
  pkg.part('ppt/presentation.xml', pres, MAIN[kind] || MAIN.pptx)
  // Prizma's own copy of the document rides along (a custom XML part, which PowerPoint keeps): Prizma reopens
  // the file losslessly for as long as no other program has rewritten the slides
  presRels.add(REL.customXml, '../customXml/item1.xml')
  pkg.part('customXml/item1.xml', `${XML_HEAD}<pz:document xmlns:pz="${TWIN_NS}" seal="${seal([pres, ...slideTexts])}">${escText(JSON.stringify({ app: 'Prizma', format: 1, doc: { ...d, props: { ...d.props, modified: Date.now() } }, media: env.media.parts() }))}</pz:document>`)
  pkg.part('customXml/itemProps1.xml', `${XML_HEAD}<ds:datastoreItem ds:itemID="${guid()}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${TWIN_NS}"/></ds:schemaRefs></ds:datastoreItem>`, OX + 'customXmlProperties+xml')
  const itemRels = new Rels()
  itemRels.add(REL.customXmlProps, 'itemProps1.xml')
  pkg.rels('customXml/item1.xml', itemRels)
  pkg.rels('ppt/presentation.xml', presRels)
  pkg.part('ppt/presProps.xml', presPropsXml(d), PML + 'presProps+xml')
  pkg.part('ppt/viewProps.xml', VIEW_PROPS, PML + 'viewProps+xml')
  pkg.part('ppt/tableStyles.xml', TABLE_STYLES, PML + 'tableStyles+xml')

  // package-level parts
  pkg.part('docProps/core.xml', coreXml(d), 'application/vnd.openxmlformats-package.core-properties+xml')
  pkg.part('docProps/app.xml', appXml(d), OX + 'extended-properties+xml')
  pkg.part('docProps/custom.xml', customXml(d), OX + 'custom-properties+xml')
  const root = new Rels()
  root.add(REL.doc, 'ppt/presentation.xml')
  root.add(REL.core, 'docProps/core.xml')
  root.add(REL.app, 'docProps/app.xml')
  root.add(REL.custom, 'docProps/custom.xml')
  pkg.zip.file('_rels/.rels', root.xml())
  pkg.zip.file('[Content_Types].xml', pkg.types())
  return pkg.zip // written out piece by piece by the caller (files.js)
}
const escText = s => s.replace(/[\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function walkFind (list, id) {
  let hit = null
  walk(list, e => { if (e.id === id) { hit = e; return false } })
  return hit
}

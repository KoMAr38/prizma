// Prizma's own lossless file format: a zip with document.json and the media files.
import JSZip from 'jszip'
import { addMedia, mediaInfo } from '../core/store.js'
import { walk, pinSlideLinks } from '../core/model.js'
import { sanitize } from '../core/html.js'

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/bmp': 'bmp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'image/x-emf': 'emf', 'image/x-wmf': 'wmf', 'image/tiff': 'tif' }

// Media ids referenced by a document (elements, masters, backgrounds, posters, table cell fills)
export function usedMedia (d) {
  const ids = new Set()
  const scan = e => {
    if (e.src) ids.add(e.src)
    if (e.poster) ids.add(e.poster)
    if (e.fill?.type === 'image' && e.fill.src) ids.add(e.fill.src)
    if (e.type === 'table') for (const row of e.cells || []) for (const c of row || []) if (c?.fill?.type === 'image' && c.fill.src) ids.add(c.fill.src)
  }
  for (const s of d.slides) {
    walk(s.elements, scan)
    walk(s.master || [], scan)
    if (s.bg?.type === 'image' && s.bg.src) ids.add(s.bg.src)
  }
  return ids
}

// The package for a document; the caller writes it out piece by piece (files.js), so it never sits in memory whole
export function writeNative (d) {
  const zip = new JSZip()
  const media = {}
  for (const id of usedMedia(d)) {
    const m = mediaInfo(id)
    if (!m) continue
    const name = `media/${id}.${EXT[m.mime] || 'bin'}`
    zip.file(name, m.bytes, { binary: true, compression: 'STORE' }) // as in .pptx: photos and video are compressed already, deflating them only costs time
    media[id] = { file: name, mime: m.mime }
  }
  zip.file('mimetype', 'application/vnd.prizma.presentation', { compression: 'STORE' })
  zip.file('document.json', JSON.stringify({ app: 'Prizma', format: 1, doc: { ...d, props: { ...d.props, modified: Date.now() } }, media }))
  return zip
}

export async function readNative (bytes) {
  const zip = await JSZip.loadAsync(bytes)
  const f = zip.file('document.json')
  if (!f) throw new Error('This is not a Prizma presentation.')
  const data = JSON.parse(await f.async('string'))
  const d = data.doc
  for (const [id, m] of Object.entries(data.media || {})) {
    const mf = zip.file(m.file)
    if (!mf) continue
    addMedia(await mf.async('uint8array'), m.mime, id)
  }
  // files from Prizma 1.0.1 and older point links at slide positions; the text is untrusted until sanitized
  return pinSlideLinks(d, sanitize)
}

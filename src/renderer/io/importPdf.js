// Opens a PDF as a presentation: every page becomes a slide with the page as a picture.
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs'
import { addMedia } from '../core/store.js'
import { newDocument } from '../core/themes.js'
import { imageEl, uid } from '../core/model.js'

pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs'

export async function importPdf (bytes, onProgress) {
  onProgress?.('Reading PDF')
  const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes)
  const pdf = await pdfjs.getDocument({
    data, isEvalSupported: false, cMapUrl: 'pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: 'pdfjs/standard_fonts/'
  }).promise
  try {
    const first = await pdf.getPage(1)
    const vp0 = first.getViewport({ scale: 1 }) // PDF units are points, like slides
    const size = { w: Math.round(vp0.width * 100) / 100, h: Math.round(vp0.height * 100) / 100 }
    const d = newDocument('blank', 0, size)
    d.slides = []
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.(`Page ${i} of ${pdf.numPages}`)
      const page = i === 1 ? first : await pdf.getPage(i)
      const vp1 = page.getViewport({ scale: 1 })
      // about 2400 px on the long side: sharp on a projector, not huge on disk
      const scale = Math.min(4, 2400 / Math.max(vp1.width, vp1.height))
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      const src = addMedia(new Uint8Array(await blob.arrayBuffer()), 'image/jpeg')
      // pages of a different shape are fitted inside the slide
      const k = Math.min(size.w / vp1.width, size.h / vp1.height)
      const w = vp1.width * k, h = vp1.height * k
      const notes = await pageText(page)
      d.slides.push({
        id: uid('s'), layout: 'blank', bg: null, notes, hidden: false, transition: null, animations: [], comments: [],
        elements: [imageEl(src, { x: (size.w - w) / 2, y: (size.h - h) / 2, w, h }, { name: `Page ${i}` })]
      })
      page.cleanup()
    }
    return d
  } finally {
    pdf.destroy()
  }
}

// The page's text goes into the notes so it stays searchable
async function pageText (page) {
  try {
    const tc = await page.getTextContent()
    let out = ''
    for (const it of tc.items) { out += it.str; if (it.hasEOL) out += '\n'; else if (it.str && !out.endsWith(' ')) out += ' ' }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  } catch { return '' }
}

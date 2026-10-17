// Home › New slide › "Slides from another presentation…": pick slides from a file and insert them after the current slide.
import { useState, useEffect } from 'preact/hooks'
import { doc, slideIdx, native, busy, toast, openDialog, closeDialog, update, goSlide, allMedia, keepMedia } from '../core/store.js'
import { uid, walk, mapSlideLinks } from '../core/model.js'
import { fitSlides } from '../core/actions.js'
import { readNative, usedMedia } from '../io/nativeFormat.js'
import { Dialog } from '../ui/dialogs.jsx'
import { SlideThumb } from '../ui/Thumbs.jsx'
import { Icon } from '../ui/Icon.jsx'
import { extOf, baseName } from './files.js'

export async function reuseSlides () {
  const paths = await native.openDialog({
    title: 'Reuse slides',
    filters: [{ name: 'Presentations (*.pptx, *.prizma)', extensions: ['pptx', 'pptm', 'ppsx', 'potx', 'prizma'] }]
  })
  const p = paths && paths[0]
  if (!p) return
  busy.value = { label: `Reading ${baseName(p)}…` }
  // the other file's media stay while the dialog shows them; then only those the inserted slides use are kept
  const before = new Set(allMedia().keys())
  const drop = () => { const used = usedMedia(doc.value); keepMedia(new Set([...allMedia().keys()].filter(id => before.has(id) || used.has(id)))) }
  try {
    const bytes = await native.readFile(p)
    const src = extOf(p) === 'prizma'
      ? await readNative(bytes)
      : await (await import('../io/importPptx.js')).importPptx(bytes)
    openDialog('custom', { C: ReuseDlg, src, name: baseName(p), drop })
  } catch (e) {
    drop()
    toast(`Couldn't read ${baseName(p)}: ${e.message || e}`, { kind: 'error' })
  } finally {
    busy.value = null
  }
}

function ReuseDlg ({ src, name, drop }) {
  useEffect(() => drop, [])
  const [picked, setPicked] = useState(() => new Set())
  const toggle = id => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const insert = ids => {
    const chosen = src.slides.filter(s => ids.has(s.id))
    if (!chosen.length) return
    const at = slideIdx.value + 1
    // fresh ids so nothing collides with the slides already here; animations, comments and slide links follow them
    const slideIds = new Map(chosen.map(s => [s.id, uid('s')]))
    // one id map for all the slides: an object that appears on two of them keeps one id, so Morph still pairs it
    const elIds = new Map()
    update(d => {
      const copies = chosen.map(s => {
        const c = JSON.parse(JSON.stringify(s))
        c.id = slideIds.get(s.id)
        walk(c.elements, el => { if (!elIds.has(el.id)) elIds.set(el.id, uid('e')); el.id = elIds.get(el.id) })
        for (const a of c.animations || []) a.el = elIds.get(a.el) || a.el
        for (const cm of c.comments || []) if (cm.el) cm.el = elIds.get(cm.el) || cm.el
        return c
      })
      fitSlides(copies, src.size, d.size) // another slide size: scaled to fit, group contents and tables too
      mapSlideLinks(copies, t => slideIds.get(t))
      d.slides.splice(at, 0, ...copies)
    })
    closeDialog()
    goSlide(at)
    toast(`${chosen.length} slide${chosen.length === 1 ? '' : 's'} inserted from ${name}. They now use this presentation's theme.`)
  }
  const all = new Set(src.slides.map(s => s.id))
  const tw = 176
  return (
    <Dialog title={`Reuse slides from ${name}`} width={680} cls="dlg-reuse"
      footer={<>
        <span class="dlg-hint">{picked.size ? `${picked.size} selected` : 'Click slides to select them'}</span>
        <button class="btn" onClick={() => insert(all)}>Insert all</button>
        <button class="btn btn-primary" disabled={!picked.size} onClick={() => insert(picked)}>Insert {picked.size || ''} slide{picked.size === 1 ? '' : 's'}</button>
      </>}>
      <div class="reuse-grid">
        {src.slides.map((s, i) => (
          <button key={s.id} class={'reuse-item' + (picked.has(s.id) ? ' on' : '')} onClick={() => toggle(s.id)} onDblClick={() => insert(new Set([s.id]))}>
            <SlideThumb slide={s} theme={src.theme} size={src.size} hf={src.hf} index={i} w={tw} ctx="ru" />
            <span class="reuse-n">{i + 1}</span>
            {picked.has(s.id) && <span class="reuse-check"><Icon name="check" size={14} /></span>}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

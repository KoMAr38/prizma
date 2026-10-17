// Starts the slide show windows from the editor and takes back ink, timings and the last slide when it ends.
import { doc, settings, native, allMedia, finishEditing, update, goSlide, showing, confirmDialog, toast } from '../core/store.js'
import { uid } from '../core/model.js'

let showWin = null, presWin = null, readWin = null
const alive = w => w && !w.closed

export async function startShow (start = 0, opts = {}) {
  finishEditing()
  const d = doc.value
  if (!d) return
  if (alive(showWin)) { showWin.focus(); return }
  if (alive(presWin)) { presWin.focus(); return }
  if (opts.reading && alive(readWin)) { readWin.focus(); return }
  const session = uid('show')
  let displays = []
  try { displays = await native.displays() } catch {}
  const primary = displays.find(x => x.primary) || displays[0] || { id: '' }
  let audience = null
  const pref = d.show?.display
  if (pref && pref !== 'auto') audience = displays.find(x => String(x.id) === String(pref))
  if (!audience) audience = displays.find(x => !x.primary) || primary
  const multi = displays.length > 1
  const wantPresenter = !opts.reading && (opts.presenter || (settings.value.presenterView !== false && multi))
  let ended = false
  const job = window.__prizmaShow = {
    doc: d,
    media: [...allMedia().entries()],
    start,
    session,
    rehearse: !!opts.rehearse,
    settings: { ...settings.value, pen: d.show?.pen || '#E5484D', laser: d.show?.laser || '#FF3B30' },
    // a window left from an earlier start (a Reading view still open) must not end the show that runs now
    onEnd: res => { if (ended || window.__prizmaShow !== job) return; ended = true; setTimeout(() => handleEnd(res || {}), 0) }
  }
  showing.value = true
  if (opts.reading) { readWin = window.open('index.html#reading', 'pz-reading'); return }
  if (wantPresenter && !multi) {
    // one screen: the presenter view runs the show itself
    presWin = window.open(`index.html?display=${primary.id}&solo=1#presenter`, 'pz-presenter')
    return
  }
  showWin = window.open(`index.html?display=${audience.id}#show`, 'pz-show')
  if (wantPresenter && multi) {
    const pres = displays.find(x => x.id !== audience.id) || primary
    presWin = window.open(`index.html?display=${pres.id}#presenter`, 'pz-presenter')
  }
}

async function handleEnd (res) {
  for (const w of [showWin, presWin, readWin]) if (alive(w)) try { w.close() } catch {}
  showWin = presWin = readWin = null
  window.__prizmaShow = null // lets the show's copy of the deck and its media go
  showing.value = false
  const d = doc.value
  if (!d) return
  if (typeof res.last === 'number' && res.last >= 0 && res.last < d.slides.length) goSlide(res.last)
  const ink = res.ink || {}
  const withInk = Object.entries(ink).filter(([, v]) => v && v.length)
  if (withInk.length) {
    const keep = await confirmDialog({ title: 'Keep your ink annotations?', text: `You drew on ${withInk.length} slide${withInk.length === 1 ? '' : 's'} during the show. Keep the drawings on the slides?`, buttons: [{ id: 'keep', label: 'Keep', primary: true }, { id: 'discard', label: 'Discard' }] })
    if (keep === 'keep') {
      update(dd => {
        for (const [sid, strokes] of withInk) {
          const s = dd.slides.find(x => x.id === sid)
          if (!s) continue
          for (const st of strokes) {
            const nums = st.d.match(/-?[\d.]+/g).map(Number)
            const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1)
            const pad = st.width
            const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad
            const w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad
            let k = 0
            const d2 = st.d.replace(/-?[\d.]+/g, m => { const v = +m - (k++ % 2 === 0 ? x0 : y0); return v.toFixed(1) })
            s.elements.push({ id: uid('i'), type: 'ink', name: st.hl ? 'Highlighter' : 'Ink', x: x0, y: y0, w, h, rot: 0, vb: { w, h }, paths: [{ d: d2, color: st.color, width: st.width, alpha: st.hl ? 0.45 : 1, hl: !!st.hl }] })
          }
        }
      })
    }
  }
  if (res.timings) {
    const total = Object.values(res.timings).reduce((a, b) => a + b, 0)
    const mm = Math.floor(total / 60), ss = Math.round(total % 60)
    const keep = await confirmDialog({ title: 'Keep the new slide timings?', text: `The slide show took ${mm}:${String(ss).padStart(2, '0')}. Use these times to advance the slides automatically?`, buttons: [{ id: 'yes', label: 'Keep timings', primary: true }, { id: 'no', label: "Don't keep" }] })
    if (keep === 'yes') {
      update(dd => {
        for (const s of dd.slides) if (res.timings[s.id] !== undefined) s.advanceAfter = Math.max(1, Math.round(res.timings[s.id]))
        dd.show = { ...(dd.show || {}), useTimings: true }
      })
      toast('Slide timings saved. Turn them off on the Slide Show tab with "Use timings".')
    }
  }
}

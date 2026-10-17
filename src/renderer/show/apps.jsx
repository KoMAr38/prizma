// Window-level apps for the slide show, presenter view, reading view and the picture-capture helper.
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'preact/hooks'
import { Show, buildGroups } from './Show.jsx'
import { adoptMedia, native } from '../core/store.js'
import { SlideView } from '../render/SlideView.jsx'
import { PX } from '../core/model.js'
import { numberingCss } from '../core/html.js'
import { Icon } from '../ui/Icon.jsx'
import { settle } from '../print/printing.js'

// Takes the job the editor left on window.opener; its media must be registered before the first slide renders
const fromOpener = key => {
  try {
    const job = window.opener && window.opener[key]
    if (job) adoptMedia(job.media)
    return job || null
  } catch { return null }
}
const ctxOf = () => fromOpener('__prizmaShow')
function NoContext () {
  return <div class="show-missing">This window lost its connection to Prizma. Close it and start the slide show again.</div>
}
function useEndGuard (ctx, lastRef) {
  useEffect(() => {
    const bye = () => { try { ctx?.onEnd({ last: lastRef.current }) } catch {} }
    window.addEventListener('beforeunload', bye)
    return () => window.removeEventListener('beforeunload', bye)
  }, [])
}

// ---------- audience window ----------
export function ShowApp () {
  const ctx = useMemo(ctxOf, [])
  const channel = useMemo(() => ctx ? new BroadcastChannel('pz-' + ctx.session) : null, [])
  const last = useRef(ctx?.start || 0)
  const [t0] = useState(Date.now())
  const [, tick] = useState(0)
  useEffect(() => { if (!ctx?.rehearse) return; const iv = setInterval(() => tick(x => x + 1), 500); return () => clearInterval(iv) }, [])
  useEndGuard(ctx, last)
  useEffect(() => {
    if (!channel) return
    const on = e => { if (e.data.type === 'state') last.current = e.data.i }
    const ch2 = new BroadcastChannel('pz-' + ctx.session)
    ch2.addEventListener('message', on)
    return () => ch2.close()
  }, [])
  if (!ctx) return <NoContext />
  document.title = 'Prizma Slide Show'
  const secs = Math.floor((Date.now() - t0) / 1000)
  return (
    <>
      <Show doc={ctx.doc} start={ctx.start} master channel={channel} mode="show" settings={ctx.settings} rehearse={ctx.rehearse}
        onEnd={res => { ctx.onEnd({ ...res }); setTimeout(() => window.close(), 30) }} />
      {ctx.rehearse && <div class="rehearse"><Icon name="timer" size={16} />Recording timings {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</div>}
    </>
  )
}

// ---------- presenter view ----------
const fmtTime = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0') }
export function PresenterApp () {
  const ctx = useMemo(ctxOf, [])
  const solo = new URLSearchParams(location.search).get('solo') === '1'
  const channel = useMemo(() => ctx ? new BroadcastChannel('pz-' + ctx.session) : null, [])
  const showChannel = useMemo(() => ctx ? new BroadcastChannel('pz-' + ctx.session) : null, [])
  const [state, setState] = useState({ i: ctx?.start || 0, step: 0, screen: null })
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [fs, setFs] = useState(20)
  const [tool, setToolKind] = useState('arrow')
  const boxRef = useRef(null)
  const [box, setBox] = useState({ w: 800, h: 450 })
  const last = useRef(ctx?.start || 0)
  useEndGuard(ctx, last)
  useEffect(() => {
    if (!channel) return
    const on = e => { const m = e.data; if (m.type === 'state') { setState({ i: m.i, step: m.step, screen: m.screen }); last.current = m.i } }
    channel.addEventListener('message', on)
    channel.postMessage({ type: 'cmd', cmd: 'hello' })
    return () => channel.removeEventListener('message', on)
  }, [])
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const iv = setInterval(() => { setNow(new Date()); if (!paused) setElapsed(x => x + 1) }, 1000); return () => clearInterval(iv) }, [paused])
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  const cmd = (c, extra = {}) => channel && channel.postMessage({ type: 'cmd', cmd: c, ...extra })
  useEffect(() => {
    if (solo) return
    const key = e => {
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'n': case 'N': case 'Enter': e.preventDefault(); cmd('next'); break
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': case 'p': case 'P': e.preventDefault(); cmd('prev'); break
        case 'b': case 'B': case '.': cmd('black'); break
        case 'w': case 'W': case ',': cmd('white'); break
        case 'Escape': cmd('end'); break
        default: break
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  if (!ctx) return <NoContext />
  document.title = 'Prizma Presenter View'
  const d = ctx.doc
  const s = d.slides[state.i]
  const groups = s ? buildGroups(s).filter((g, gi) => !(gi === 0 && g.auto)) : []
  const nextLabel = state.step < groups.length ? 'Next animation' : 'Next slide'
  let ni = state.i + 1
  while (ni < d.slides.length && d.slides[ni].hidden) ni++
  const next = d.slides[ni]
  const W = d.size.w, H = d.size.h
  const nw = 300, nk = nw / (W * PX)
  const endAll = res => { ctx.onEnd({ ...(res || {}), last: last.current }); setTimeout(() => window.close(), 30) }
  const setTool = k => { setToolKind(k); cmd('tool', { tool: { kind: k } }) }
  return (
    <div class="presenter">
      <header class="pv-top">
        <div class="pv-timer"><Icon name="timer" size={18} /><b>{fmtTime(elapsed)}</b>
          <button onClick={() => setPaused(!paused)} data-tip={paused ? 'Resume timer' : 'Pause timer'}><Icon name={paused ? 'play' : 'pause'} size={15} /></button>
          <button onClick={() => setElapsed(0)} data-tip="Restart timer"><Icon name="rotate-ccw" size={15} /></button>
        </div>
        <div class="pv-clock">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="pv-count">Slide {state.i + 1} of {d.slides.length}</div>
        <button class="btn" onClick={() => cmd('end')}><Icon name="x" size={15} />End slide show</button>
      </header>
      <main class="pv-main">
        <section class="pv-cur">
          <div class="pv-curbox" ref={boxRef}>
            <Show doc={d} start={ctx.start} master={solo} channel={solo ? showChannel : showChannel} mode={solo ? 'show-solo' : 'presenter-mirror'} fit={box} settings={ctx.settings} toolbar={false} onEnd={solo ? endAll : undefined} />
          </div>
          <div class="pv-tools">
            <button onClick={() => cmd('prev')} data-tip="Previous"><Icon name="chevron-left" size={22} /></button>
            <span class="pv-n">{state.i + 1} / {d.slides.length}</span>
            <button onClick={() => cmd('next')} data-tip={nextLabel}><Icon name="chevron-right" size={22} /></button>
            <span class="pv-sep" />
            <button class={tool === 'pen' ? 'on' : ''} onClick={() => setTool(tool === 'pen' ? 'arrow' : 'pen')} data-tip="Pen"><Icon name="pen-tool" size={18} /></button>
            <button class={tool === 'laser' ? 'on' : ''} onClick={() => setTool(tool === 'laser' ? 'arrow' : 'laser')} data-tip="Laser pointer"><Icon name="radio" size={18} /></button>
            <button class={tool === 'highlighter' ? 'on' : ''} onClick={() => setTool(tool === 'highlighter' ? 'arrow' : 'highlighter')} data-tip="Highlighter"><Icon name="highlighter" size={18} /></button>
            <button class={tool === 'eraser' ? 'on' : ''} onClick={() => setTool(tool === 'eraser' ? 'arrow' : 'eraser')} data-tip="Eraser"><Icon name="eraser" size={18} /></button>
            <button class={state.screen === 'black' ? 'on' : ''} onClick={() => cmd('black')} data-tip="Black screen (B)"><Icon name="square" size={18} /></button>
          </div>
        </section>
        <aside class="pv-side">
          <div class="pv-next">
            <div class="pv-lbl">{nextLabel}</div>
            {state.step < groups.length
              ? <div class="pv-nextanim" style={{ width: nw + 'px', height: nw * H / W + 'px' }}><Icon name="sparkles" size={26} /><span>{groups.length - state.step} animation{groups.length - state.step === 1 ? '' : 's'} left on this slide</span></div>
              : next
                ? <div class="pv-thumb" style={{ width: nw + 'px', height: nw * H / W + 'px' }}><div style={{ transform: `scale(${nk})`, transformOrigin: '0 0' }}><SlideView slide={next} docObj={d} mode="thumb" index={ni} ctx="pvn" /></div></div>
                : <div class="pv-nextanim" style={{ width: nw + 'px', height: nw * H / W + 'px' }}><span>End of slide show</span></div>}
          </div>
          <div class="pv-notes-h"><span class="pv-lbl">Notes</span><button onClick={() => setFs(f => Math.max(10, f - 2))} data-tip="Smaller text"><Icon name="a-arrow-down" size={16} /></button><button onClick={() => setFs(f => Math.min(48, f + 2))} data-tip="Larger text"><Icon name="a-arrow-up" size={16} /></button></div>
          <div class="pv-notes" style={{ fontSize: fs + 'px' }}>{s?.notes ? s.notes : <span class="pv-none">No notes for this slide.</span>}</div>
        </aside>
      </main>
      <style>{numberingCss()}</style>
    </div>
  )
}

// ---------- reading view ----------
export function ReadingApp () {
  const ctx = useMemo(ctxOf, [])
  const channel = useMemo(() => ctx ? new BroadcastChannel('pz-' + ctx.session) : null, [])
  const ctl = useMemo(() => ctx ? new BroadcastChannel('pz-' + ctx.session) : null, [])
  const [st, setSt] = useState({ i: ctx?.start || 0 })
  const boxRef = useRef(null)
  const [box, setBox] = useState({ w: 800, h: 500 })
  const last = useRef(ctx?.start || 0)
  useEndGuard(ctx, last)
  useLayoutEffect(() => {
    const el = boxRef.current
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (!ctl) return
    const on = e => { if (e.data.type === 'state') { setSt({ i: e.data.i }); last.current = e.data.i } }
    ctl.addEventListener('message', on)
    return () => ctl.removeEventListener('message', on)
  }, [])
  if (!ctx) return <NoContext />
  document.title = 'Prizma Reading View'
  const d = ctx.doc
  const end = res => { ctx.onEnd({ ...(res || {}), last: last.current }); setTimeout(() => window.close(), 30) }
  return (
    <div class="reading">
      <div class="reading-stage" ref={boxRef}>
        <Show doc={d} start={ctx.start} master channel={channel} mode="reading" fit={box} settings={{ ...ctx.settings, endBlack: false }} toolbar={false} onEnd={end} />
      </div>
      <footer class="reading-bar">
        <span>Slide {st.i + 1} of {d.slides.length}</span>
        <span class="rtabs-fill" />
        <button onClick={() => ctl.postMessage({ type: 'cmd', cmd: 'prev' })} data-tip="Previous"><Icon name="chevron-left" size={18} /></button>
        <button onClick={() => ctl.postMessage({ type: 'cmd', cmd: 'next' })} data-tip="Next"><Icon name="chevron-right" size={18} /></button>
        <button onClick={() => end()} data-tip="Back to normal view"><Icon name="layout-panel-left" size={17} /></button>
      </footer>
    </div>
  )
}

// ---------- capture helper (slide pictures, Save as picture) ----------
export function CaptureApp () {
  const job = useMemo(() => fromOpener('__prizmaCapture'), [])
  const [i, setI] = useState(0)
  // the picture is drawn as large as fits this window; if Windows made the window smaller than asked, nothing is cut off
  const drawn = it => {
    const w = (it.elements ? it.bounds.w : job.doc.size.w) * PX, h = (it.elements ? it.bounds.h : job.doc.size.h) * PX
    const k = Math.min(window.innerWidth / w, window.innerHeight / h)
    return { k, w: w * k, h: h * k }
  }
  useEffect(() => {
    if (!job) return
    const it = job.items[i]
    if (!it) { job.done({ count: i }); setTimeout(() => window.close(), 50); return }
    let cancel = false
    ;(async () => {
      await settle()
      if (cancel) return
      try {
        let bytes = await native.capture()
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const pw = job.pw || bmp.width, ph = job.ph || bmp.height
        // the window is sized in CSS pixels, so the capture can be off by the display scaling: redraw the drawn area at the exact size
        const px = bmp.width / window.innerWidth, area = drawn(it)
        const sw = Math.min(bmp.width, Math.round(area.w * px)), sh = Math.min(bmp.height, Math.round(area.h * px))
        if (it.fmt === 'jpg' || sw !== pw || sh !== ph || bmp.width !== pw || bmp.height !== ph) {
          const c = document.createElement('canvas'); c.width = pw; c.height = ph
          const g = c.getContext('2d')
          g.imageSmoothingQuality = 'high'
          if (it.fmt === 'jpg') { g.fillStyle = '#fff'; g.fillRect(0, 0, pw, ph) }
          g.drawImage(bmp, 0, 0, sw, sh, 0, 0, pw, ph)
          bytes = new Uint8Array(await (await new Promise(r => c.toBlob(r, it.fmt === 'jpg' ? 'image/jpeg' : 'image/png', 0.92))).arrayBuffer())
        }
        bmp.close?.()
        await native.writeFile(it.path, bytes)
      } catch (e) { job.error && job.error(String(e)) }
      setI(x => x + 1)
    })()
    return () => { cancel = true }
  }, [i])
  if (!job) return null
  const it = job.items[i]
  if (!it) return null
  const d = job.doc
  const vw = window.innerWidth
  const { k } = drawn(it)
  if (it.elements) {
    // selected objects only, on a transparent page
    const b = it.bounds
    const fake = { ...d.slides[it.slideIndex], elements: it.elements.map(e => ({ ...e, x: e.x - b.x, y: e.y - b.y })), bg: { type: 'none' }, hideMaster: true, master: [] }
    return (
      <div style={{ width: vw + 'px', height: window.innerHeight + 'px', overflow: 'hidden', background: 'transparent' }}>
        <style>{numberingCss() + 'html,body{background:transparent!important}.pz-slide{background:transparent!important}'}</style>
        <div style={{ transform: `scale(${k})`, transformOrigin: '0 0' }}><SlideView slide={fake} docObj={{ ...d, size: { w: b.w, h: b.h }, hf: null }} mode="show" ctx={'cap' + i} /></div>
      </div>
    )
  }
  const s = d.slides[it.slideIndex]
  return (
    <div style={{ width: vw + 'px', height: window.innerHeight + 'px', overflow: 'hidden' }}>
      <style>{numberingCss()}</style>
      <div key={i} style={{ transform: `scale(${k})`, transformOrigin: '0 0' }}><SlideView slide={s} docObj={d} mode="show" index={it.slideIndex} ctx={'cap' + i} /></div>
    </div>
  )
}

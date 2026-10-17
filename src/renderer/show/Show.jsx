// Slide show engine: slide transitions (incl. Morph), build animations, ink, laser pointer, overview grid.
// The same component runs the audience window, the presenter view's main slide, reading view and previews.
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'preact/hooks'
import { SlideView } from '../render/SlideView.jsx'
import { PX, walk, findEl } from '../core/model.js'
import { numberingCss } from '../core/html.js'
import { animFrames, transitionFrames } from './effects.js'
import { Icon } from '../ui/Icon.jsx'

// ---------- build steps ----------
// Splits a slide's animations into click groups. Each item gets a start time (s) within its group.
export function buildGroups (slide) {
  const anims = (slide.animations || []).filter(a => a && a.el && findEl(slide, a.el))
  const groups = []
  let cur = null, prevStart = 0, prevEnd = 0
  anims.forEach((a, i) => {
    if (!cur || a.start === 'click') {
      cur = { auto: i === 0 && a.start !== 'click', items: [] }
      groups.push(cur)
      prevStart = 0; prevEnd = 0
    }
    const dur = Math.max(0.01, a.dur ?? 0.5)
    const begin = (a.start === 'after' ? prevEnd : a.start === 'with' ? prevStart : 0) + (a.delay || 0)
    cur.items.push({ a, begin, dur })
    prevStart = begin; prevEnd = begin + dur
  })
  return groups
}
// Elements hidden before any build step (their first effect is an entrance)
function initiallyHidden (slide) {
  const seen = new Set(), hidden = new Set()
  for (const a of slide.animations || []) {
    if (seen.has(a.el)) continue
    seen.add(a.el)
    if (a.kind === 'entr') hidden.add(a.el)
  }
  return hidden
}
const isClickAdvance = s => s.advanceClick !== false

// Plays (or fast-forwards) one click group inside a rendered slide layer
function playGroup (layer, slide, group, instant, noAnim) {
  const anims = []
  const W = layer.offsetWidth, H = layer.offsetHeight
  for (const it of group.items) {
    const node = layer.querySelector(`.pz-el[data-id="${it.a.el}"]`)
    if (!node) continue
    const el = findEl(slide, it.a.el)?.el
    const box = el ? { x: el.x * PX, y: el.y * PX, w: el.w * PX, h: el.h * PX } : { x: 0, y: 0, w: 0, h: 0 }
    const f = animFrames(it.a, box, W, H)
    const entr = it.a.kind === 'entr'
    const frames = f.frames.map(fr => ({ ...fr, ...(entr && !('visibility' in fr) ? { visibility: 'visible' } : {}) }))
    const dur = f.dur ? f.dur : it.dur * 1000
    const anim = node.animate(frames, { duration: noAnim ? 1 : dur, delay: noAnim ? 0 : it.begin * 1000, easing: f.easing || 'ease-out', fill: f.keep === false ? 'none' : 'forwards' })
    if (entr) anim.onfinish = () => { node.style.visibility = 'visible' }
    if (it.a.kind === 'exit') anim.onfinish = () => { node.style.visibility = 'hidden' }
    if (instant) anim.finish()
    anims.push(anim)
  }
  return anims
}

// ---------- the engine ----------
// props: doc, start, master, channel, onEnd, mode ('show' | 'reading' | 'presenter' | 'preview'), previewKind, size: {w,h} box to fit into (defaults to window)
export function Show ({ doc: d, start = 0, master = true, channel, onEnd, mode = 'show', previewKind, fit, settings: st = {}, rehearse, onTimings, toolbar = true }) {
  const W = d.size.w, H = d.size.h
  const live = mode === 'show' || mode === 'show-solo' // the window that runs the audience's show
  const order = useRef(null)
  if (!order.current) {
    const opt = d.show || {}
    let idx = d.slides.map((_, i) => i).filter(i => !d.slides[i].hidden || i === start)
    if (opt.from) idx = idx.filter(i => i + 1 >= opt.from && i + 1 <= (opt.to || d.slides.length))
    order.current = idx.length ? idx : [start]
  }
  const seq = order.current
  // index of the slide on screen; pos.extra is a slide outside the show order (a hidden one jumped to), pos.i then the place before it
  const shown = p => p.extra ?? seq[p.i]
  const rootRef = useRef(null)
  const [vp, setVp] = useState(() => fit || { w: window.innerWidth, h: window.innerHeight })
  const [pos, setPos] = useState(() => ({ i: Math.max(0, seq.indexOf(start) >= 0 ? seq.indexOf(start) : 0), step: 0, key: 0, from: null, dir: 1 }))
  const [screen, setScreen] = useState(null) // 'black' | 'white' | 'end'
  const [toolState, setTool] = useState({ kind: 'arrow', color: st.pen || '#E5484D' })
  const [ink, setInk] = useState({}) // slideId -> [{ d, color, width, hl }]
  const [overview, setOverview] = useState(false)
  const [chrome, setChrome] = useState(true)
  const [laser, setLaser] = useState(null)
  const [typed, setTypedState] = useState('')
  const typedRef = useRef('') // read by the key handler, so Enter right after a digit sees it
  const setTyped = v => { typedRef.current = typeof v === 'function' ? v(typedRef.current) : v; setTypedState(typedRef.current) }
  const curLayer = useRef(null)
  const prevLayer = useRef(null)
  const running = useRef([])
  const timer = useRef(0)
  const times = useRef({ startedAt: Date.now(), slideStart: Date.now(), per: {} })
  const k = Math.min(vp.w / (W * PX), vp.h / (H * PX))
  const sw = W * PX * k, sh = H * PX * k
  const slide = d.slides[shown(pos)]

  useEffect(() => {
    if (fit) { setVp(fit); return }
    const r = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', r)
    return () => window.removeEventListener('resize', r)
  }, [fit && fit.w, fit && fit.h])

  // ----- state broadcast for presenter view / mirrors -----
  const broadcast = useCallback(p => { if (master && channel) channel.postMessage({ type: 'state', i: shown(p), step: p.step, screen, n: d.slides.length }) }, [master, channel, screen])

  // ----- navigation -----
  const stepsOf = s => buildGroups(s)
  const clickGroups = s => stepsOf(s).filter((g, gi) => !(gi === 0 && g.auto))
  const go = useCallback((dir) => {
    setScreen(sc => (sc === 'end' && dir > 0 ? sc : null))
    setPos(p => {
      if (screenRef.current === 'end') { if (dir > 0) finishRef.current(); return p }
      const s = d.slides[shown(p)]
      const cg = clickGroups(s)
      if (dir > 0) {
        if (p.step < cg.length) { const n = { ...p, step: p.step + 1, from: 'step' }; return n }
        if (p.i + 1 < seq.length) return { i: p.i + 1, step: 0, key: p.key + 1, from: 'slide', dir: 1, prev: shown(p) }
        if (d.show?.loop && live) return { i: 0, step: 0, key: p.key + 1, from: 'slide', dir: 1, prev: shown(p) }
        if (live && st.endBlack !== false) { setScreen('end'); return p }
        finishRef.current(); return p
      }
      if (p.step > 0) return { ...p, step: p.step - 1, key: p.key + 1, from: 'rebuild' }
      const b = p.extra != null ? p.i : p.i - 1 // back from a one-off slide is the place before it
      if (b >= 0) { const ps = d.slides[seq[b]]; return { i: b, step: clickGroups(ps).length, key: p.key + 1, from: 'back', dir: -1, prev: shown(p) } }
      return p
    })
  }, [seq])
  const goTo = useCallback((slideIndex, step = 0) => {
    const i = seq.indexOf(slideIndex)
    setScreen(null)
    // arriving with steps already taken (the presenter's copy following the show back a slide) builds them at once
    setPos(p => ({ i: i >= 0 ? i : seq.findLastIndex(x => x < slideIndex), extra: i >= 0 ? undefined : slideIndex, step, key: p.key + 1, from: slideIndex === shown(p) ? 'rebuild' : step ? 'back' : 'slide', dir: slideIndex > shown(p) ? 1 : -1, prev: shown(p) }))
  }, [seq])
  const screenRef = useRef(screen)
  screenRef.current = screen
  // "Use timings" waits while the screen is black or white, and never leaves the end screen by itself
  const autoNext = () => { const sc = screenRef.current; if (sc === 'black' || sc === 'white') timer.current = setTimeout(autoNext, 500); else if (sc !== 'end') go(1) }
  const finish = () => {
    if (rehearse) times.current.per[slide?.id] = (times.current.per[slide?.id] || 0) + (Date.now() - times.current.slideStart) / 1000
    for (const a of running.current) try { a.cancel() } catch {}
    onEnd && onEnd({ ink, last: shown(pos), timings: rehearse ? times.current.per : null })
  }
  // go() keeps its first closure and the channel listener misses ink changes: both end through the latest finish
  const finishRef = useRef(finish)
  finishRef.current = finish

  // ----- rendering a slide change -----
  useLayoutEffect(() => {
    const layer = curLayer.current
    if (!layer || !slide) return
    for (const a of running.current) { try { a.finish() } catch {} }
    running.current = []
    // initial build state
    const hidden = initiallyHidden(slide)
    for (const id of hidden) { const n = layer.querySelector(`.pz-el[data-id="${id}"]`); if (n) n.style.visibility = 'hidden' }
    const gs = buildGroups(slide)
    const autoFirst = gs[0]?.auto
    const clicks = gs.filter((g, gi) => !(gi === 0 && g.auto))
    const noAnim = !!d.show?.noAnim
    const doneSteps = pos.from === 'back' || pos.from === 'rebuild' ? pos.step : 0
    if (autoFirst) running.current.push(...playGroup(layer, slide, gs[0], doneSteps > 0 || pos.from === 'back', noAnim))
    for (let gi = 0; gi < doneSteps && gi < clicks.length; gi++) running.current.push(...playGroup(layer, slide, clicks[gi], true, noAnim))
    // media autoplay, only in the window that runs the show (the presenter's copy would play the sound twice)
    if (master) for (const m of layer.querySelectorAll('.pz-media-node[data-autoplay="1"]')) { m.currentTime = 0; m.play().catch(() => {}) }
    else for (const m of layer.querySelectorAll('.pz-media-node')) m.muted = true
    // Slide Show › Show media controls: videos get their own play bar
    if (master && d.show?.mediaControls !== false) for (const m of layer.querySelectorAll('video.pz-media-node')) m.controls = true
    // transition
    if (pos.from === 'slide' && slide.transition && mode !== 'presenter-mirror-still' && !d.show?.noAnim) runTransition(slide.transition, pos.dir)
    // Rehearse: the time so far goes to the slide being left; going back a step on the same slide keeps counting
    if (pos.from !== 'rebuild') {
      if (rehearse && pos.prev !== undefined) { const ps = d.slides[pos.prev]; if (ps) times.current.per[ps.id] = (times.current.per[ps.id] || 0) + (Date.now() - times.current.slideStart) / 1000 }
      times.current.slideStart = Date.now()
    }
    broadcast(pos)
    // automatic advance
    clearTimeout(timer.current)
    if (master && live && d.show?.useTimings !== false && slide.advanceAfter != null && !rehearse) {
      const total = (slide.transition?.dur || 0) + slide.advanceAfter
      timer.current = setTimeout(autoNext, Math.max(0.3, total) * 1000)
    }
  }, [pos.key])
  // a click step on the same slide
  useLayoutEffect(() => {
    if (pos.from !== 'step') return
    const layer = curLayer.current
    const gs = buildGroups(slide)
    const clicks = gs.filter((g, gi) => !(gi === 0 && g.auto))
    const g = clicks[pos.step - 1]
    if (g) running.current.push(...playGroup(layer, slide, g, false, !!d.show?.noAnim))
    broadcast(pos)
    // with timings every click step also waits the slide's time, so no step is left waiting for a click
    if (master && live && d.show?.useTimings !== false && slide.advanceAfter != null && !rehearse) {
      clearTimeout(timer.current)
      timer.current = setTimeout(autoNext, Math.max(0.3, slide.advanceAfter) * 1000)
    }
  }, [pos.step, pos.from === 'step' ? pos.key + ':' + pos.step : null])

  const [prevSlide, setPrevSlide] = useState(null)
  const runTransition = (t, dir) => {
    const ps = pos.prev !== undefined ? d.slides[pos.prev] : null
    if (!ps || t.type === 'none') return
    setPrevSlide({ slide: ps, t, dir, id: Math.random() })
  }
  // run the transition once the previous slide layer is mounted
  useLayoutEffect(() => {
    if (!prevSlide) return
    const cur = curLayer.current, prev = prevLayer.current
    if (!cur || !prev) return
    const t = prevSlide.t, ps = prevSlide.slide
    // the outgoing slide leaves fully built: entered objects in, exited ones gone (shortcut: a jump away mid-build shows it fully built too, keep the left step in pos if that matters)
    for (const id of initiallyHidden(ps)) { const n = prev.querySelector(`.pz-el[data-id="${id}"]`); if (n) n.style.visibility = 'hidden' }
    for (const g of buildGroups(ps)) playGroup(prev, ps, g, true)
    const dur = Math.max(0.05, t.dur ?? 0.7) * 1000
    const anims = []
    if (t.type === 'morph') anims.push(...morph(prev, cur, ps, slide, dur))
    else {
      const f = transitionFrames(t, W * PX, H * PX)
      if (f.prevOnTop) prev.style.zIndex = 3
      if (f.backface) { cur.parentNode.style.perspective = '2000px' }
      if (f.cur) anims.push(cur.animate(f.cur, { duration: dur, easing: f.easing, fill: 'both' }))
      if (f.prev) anims.push(prev.animate(f.prev, { duration: dur, easing: f.easing, fill: 'both' }))
    }
    let done = false
    const end = () => { if (done) return; done = true; setPrevSlide(null) }
    Promise.all(anims.map(a => a.finished.catch(() => {}))).then(end)
    setTimeout(end, dur + 400)
    return () => { for (const a of anims) try { a.cancel() } catch {} }
  }, [prevSlide && prevSlide.id])

  // ----- input -----
  useEffect(() => {
    if (!master) return
    const key = e => {
      if (overview) { if (e.key === 'Escape') { e.preventDefault(); setOverview(false) } return }
      const k2 = e.key
      if (/^[0-9]$/.test(k2)) { setTyped(t => (t + k2).slice(-4)); return }
      if (k2 === 'Enter' && typedRef.current) { goTo(Math.max(0, Math.min(d.slides.length - 1, parseInt(typedRef.current, 10) - 1))); setTyped(''); return }
      setTyped('')
      if (e.ctrlKey && (k2 === 'p' || k2 === 'P')) { e.preventDefault(); setTool(x => ({ ...x, kind: 'pen' })); return }
      if (e.ctrlKey && (k2 === 'l' || k2 === 'L')) { e.preventDefault(); setTool(x => ({ ...x, kind: 'laser' })); return }
      if (e.ctrlKey && (k2 === 'a' || k2 === 'A')) { e.preventDefault(); setTool(x => ({ ...x, kind: 'arrow' })); return }
      if (e.ctrlKey && (k2 === 'e' || k2 === 'E')) { e.preventDefault(); setTool(x => ({ ...x, kind: 'eraser' })); return }
      if (e.ctrlKey && (k2 === 'i' || k2 === 'I')) { e.preventDefault(); setTool(x => ({ ...x, kind: 'highlighter' })); return }
      switch (k2) {
        case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'n': case 'N': case 'Enter': e.preventDefault(); go(1); break
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': case 'p': case 'P': e.preventDefault(); go(-1); break
        case 'Home': goTo(seq[0]); break
        case 'End': goTo(seq[seq.length - 1]); break
        case 'b': case 'B': case '.': setScreen(s => s === 'black' ? null : 'black'); break
        case 'w': case 'W': case ',': setScreen(s => s === 'white' ? null : 'white'); break
        case 'e': case 'E': setInk(x => ({ ...x, [slide.id]: [] })); break
        case 'g': case 'G': case '-': setOverview(true); break
        case 'Escape': e.preventDefault(); if (toolState.kind !== 'arrow') setTool(x => ({ ...x, kind: 'arrow' })); else finish(); break
        default: break
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [master, go, goTo, overview, toolState.kind, slide && slide.id, ink])
  // commands from the presenter view
  useEffect(() => {
    if (!channel) return
    const on = ev => {
      const m = ev.data
      if (master && m.type === 'cmd') {
        if (m.cmd === 'next') go(1)
        else if (m.cmd === 'prev') go(-1)
        else if (m.cmd === 'goto') goTo(m.i, m.step || 0)
        else if (m.cmd === 'black') setScreen(s => s === 'black' ? null : 'black')
        else if (m.cmd === 'white') setScreen(s => s === 'white' ? null : 'white')
        else if (m.cmd === 'end') finishRef.current()
        else if (m.cmd === 'tool') setTool(x => ({ ...x, ...m.tool }))
        else if (m.cmd === 'ink') setInk(x => ({ ...x, [m.slide]: m.paths }))
        else if (m.cmd === 'media') { const n = curLayer.current?.querySelector(`.pz-el[data-id="${m.id}"] .pz-media-node`); if (n) { if (n.paused) n.play().catch(() => {}); else n.pause() } }
        else if (m.cmd === 'hello') broadcast(pos)
      }
      // the presenter's copy draws with the tool picked in the presenter view
      if (!master && m.type === 'cmd' && m.cmd === 'tool') setTool(x => ({ ...x, ...m.tool }))
      if (!master && m.type === 'state') {
        if (m.i !== shown(pos) || m.step !== pos.step) {
          if (m.i === shown(pos) && m.step === pos.step + 1) setPos(p => ({ ...p, step: m.step, from: 'step' }))
          else goTo(m.i, m.step)
        }
        setScreen(m.screen || null)
      }
      if (m.type === 'laser') setLaser(m.p)
      if (m.type === 'inkSync') setInk(x => ({ ...x, [m.slide]: m.paths }))
    }
    channel.addEventListener('message', on)
    if (!master) channel.postMessage({ type: 'cmd', cmd: 'hello' })
    return () => channel.removeEventListener('message', on)
  }, [channel, master, go, goTo, pos.i, pos.step, pos.extra, seq])
  useEffect(() => { if (master && channel) channel.postMessage({ type: 'state', i: shown(pos), step: pos.step, screen, n: d.slides.length }) }, [screen])

  // ----- pointer: click to advance, ink, laser -----
  const inkRef = useRef(null)
  const toPt = e => { const r = curLayer.current.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H } }
  const onDown = e => {
    if (e.button === 2) return
    const t = toolState.kind
    // in the presenter's copy a click on the black, white or end screen goes to the show itself
    if (screen && !master) { channel && channel.postMessage({ type: 'cmd', cmd: screen === 'end' ? 'end' : screen }); return }
    if (screen === 'end') { finish(); return }
    if (screen) { setScreen(null); return }
    if (t === 'pen' || t === 'highlighter') {
      const p = toPt(e)
      inkRef.current = { pts: [p] }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    if (t === 'eraser') { eraseAt(e); return }
    if (t === 'laser') return
    // links and media
    const linkEl = e.target.closest('[data-link]')
    const a = e.target.closest('a[href]')
    const href = linkEl?.dataset.link || a?.getAttribute('href')
    if (href) {
      e.preventDefault()
      if (href.startsWith('#slide:')) {
        const i = d.slides.findIndex(s => s.id === href.slice(7))
        if (i >= 0) { if (master) goTo(i); else channel && channel.postMessage({ type: 'cmd', cmd: 'goto', i }) } // the presenter's copy steers the show
      }
      else window.prizmaNative?.openExternal(href)
      return
    }
    if (e.target.closest('video[controls]')) return // its play bar plays, pauses and seeks
    const media = e.target.closest('.pz-video, .pz-audio, video, audio')
    if (media) {
      const node = (e.target.closest('.pz-el') || media).querySelector('.pz-media-node')
      // the presenter's copy plays and pauses the show's media, not its own
      if (node && !master) { channel && channel.postMessage({ type: 'cmd', cmd: 'media', id: node.closest('.pz-el')?.dataset.id }); return }
      if (node) { if (node.paused) node.play().catch(() => {}); else node.pause(); return }
    }
    if (!master) { channel && channel.postMessage({ type: 'cmd', cmd: 'next' }); return }
    if (isClickAdvance(slide)) go(1)
  }
  const onMove = e => {
    setChrome(true)
    clearTimeout(chromeTimer.current)
    chromeTimer.current = setTimeout(() => setChrome(false), 2800)
    if (toolState.kind === 'laser') {
      const p = toPt(e)
      setLaser(p)
      if (channel) channel.postMessage({ type: 'laser', p })
    }
    if (inkRef.current) {
      inkRef.current.pts.push(toPt(e))
      setInkLive([...inkRef.current.pts])
    }
    if (toolState.kind === 'eraser' && e.buttons) eraseAt(e)
  }
  const [inkLive, setInkLive] = useState(null)
  const chromeTimer = useRef(0)
  const onUp = () => {
    const g = inkRef.current
    inkRef.current = null
    setInkLive(null)
    if (!g || g.pts.length < 2) return
    const hl = toolState.kind === 'highlighter'
    const stroke = { d: g.pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' '), color: hl ? (st.highlighter || '#FFE500') : toolState.color, width: hl ? 14 : 2.5, hl }
    setInk(x => { const n = { ...x, [slide.id]: [...(x[slide.id] || []), stroke] }; if (channel) channel.postMessage({ type: 'inkSync', slide: slide.id, paths: n[slide.id] }); return n })
  }
  const eraseAt = e => {
    const r = curLayer.current.getBoundingClientRect()
    const p = toPt(e)
    const th = 12 / (r.width / W)
    setInk(x => {
      const list = (x[slide.id] || []).filter(s => !s.d.split(/[ML]/).filter(Boolean).some(seg => { const [px, py] = seg.trim().split(' ').map(Number); return Math.hypot(px - p.x, py - p.y) < th }))
      if (channel) channel.postMessage({ type: 'inkSync', slide: slide.id, paths: list })
      return { ...x, [slide.id]: list }
    })
  }
  const menu = e => {
    e.preventDefault()
    if (!master) return
    setCtx({ x: e.clientX, y: e.clientY })
  }
  const [ctx, setCtx] = useState(null)
  useEffect(() => {
    if (toolState.kind !== 'laser') { setLaser(null); if (channel) channel.postMessage({ type: 'laser', p: null }) }
    if (!master && channel) channel.postMessage({ type: 'cmd', cmd: 'tool', tool: { kind: toolState.kind === 'laser' ? 'arrow' : toolState.kind } })
  }, [toolState.kind])
  // previews in the editor: play the transition into this slide, or all its animations
  useEffect(() => {
    if (mode !== 'preview' || !slide) return
    const ts = []
    if (previewKind === 'transition') {
      ts.push(setTimeout(() => setPos(p => ({ ...p, key: p.key + 1, from: 'slide', dir: 1, prev: p.i > 0 ? seq[p.i - 1] : undefined })), 60))
      ts.push(setTimeout(() => onEnd && onEnd({}), (slide.transition?.dur || 0.7) * 1000 + 900))
    } else {
      const cg = clickGroups(slide)
      let t = 350
      cg.forEach((g, gi) => {
        ts.push(setTimeout(() => setPos(p => ({ ...p, step: gi + 1, from: 'step' })), t))
        t += Math.max(...g.items.map(it => it.begin + it.dur), 0.2) * 1000 + 300
      })
      ts.push(setTimeout(() => onEnd && onEnd({}), t + 500))
    }
    return () => ts.forEach(clearTimeout)
  }, [])
  useEffect(() => { if (mode === 'show') document.body.style.cursor = chrome || toolState.kind !== 'arrow' ? '' : 'none'; return () => { document.body.style.cursor = '' } }, [chrome, toolState.kind])

  if (!slide) return null
  const inkList = ink[slide.id] || []
  const cursor = toolState.kind === 'pen' || toolState.kind === 'highlighter' ? 'crosshair' : toolState.kind === 'eraser' ? 'cell' : toolState.kind === 'laser' ? 'none' : undefined
  const layerStyle = { position: 'absolute', left: 0, top: 0, width: W * PX + 'px', height: H * PX + 'px' }
  return (
    <div class={'show show-' + mode} ref={rootRef} style={{ width: vp.w + 'px', height: vp.h + 'px', cursor }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onContextMenu={menu}
      onClick={e => { if (e.target.closest('a[href]')) e.preventDefault() }}>
      <style>{numberingCss()}</style>
      <div class="show-stage" style={{ width: sw + 'px', height: sh + 'px', left: (vp.w - sw) / 2 + 'px', top: (vp.h - sh) / 2 + 'px' }}>
        {/* one scaled box holds both layers, so transitions move, zoom and turn them in slide px around the slide's centre */}
        <div style={{ ...layerStyle, transformOrigin: '0 0', transform: `scale(${k})` }}>
          {prevSlide && (
            <div class="show-layer" ref={prevLayer} key={'p' + prevSlide.id} style={{ ...layerStyle, zIndex: 1 }}>
              <SlideView slide={prevSlide.slide} docObj={d} mode="show" index={d.slides.indexOf(prevSlide.slide)} ctx={'sp' + mode} />
            </div>
          )}
          <div class="show-layer" ref={curLayer} key={'c' + pos.key} style={{ ...layerStyle, zIndex: 2 }}>
            <SlideView slide={slide} docObj={d} mode="show" index={shown(pos)} ctx={'sc' + mode} />
          </div>
        </div>
        <svg class="show-ink" viewBox={`0 0 ${W} ${H}`} style={{ zIndex: 4 }}>
          {inkList.map((s, i) => <path key={i} d={s.d} style={{ fill: 'none', stroke: s.color, strokeWidth: s.width, strokeOpacity: s.hl ? '0.45' : '1', strokeLinecap: 'round', strokeLinejoin: 'round' }} />)}
          {inkLive && <polyline points={inkLive.map(p => `${p.x},${p.y}`).join(' ')} style={{ fill: 'none', stroke: toolState.kind === 'highlighter' ? (st.highlighter || '#FFE500') : toolState.color, strokeOpacity: toolState.kind === 'highlighter' ? '0.45' : '1', strokeWidth: toolState.kind === 'highlighter' ? 14 : 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }} />}
        </svg>
        {laser && <span class="laser" style={{ left: laser.x / W * sw + 'px', top: laser.y / H * sh + 'px', background: st.laser || '#FF3B30', boxShadow: `0 0 12px 4px ${st.laser || '#FF3B30'}` }} />}
      </div>
      {screen === 'black' && <div class="show-screen" style={{ background: '#000' }} />}
      {screen === 'white' && <div class="show-screen" style={{ background: '#fff' }} />}
      {screen === 'end' && <div class="show-screen show-end"><span>End of slide show. Click to exit.</span></div>}
      {typed && <div class="show-typed">{typed}</div>}
      {master && toolbar && mode === 'show' && st.showToolbar !== false && (
        <div class={'show-bar' + (chrome ? ' vis' : '')} onPointerDown={e => e.stopPropagation()}>
          <button onClick={() => go(-1)} data-tip="Previous"><Icon name="chevron-left" size={18} /></button>
          <button onClick={() => go(1)} data-tip="Next"><Icon name="chevron-right" size={18} /></button>
          <button class={toolState.kind === 'pen' ? 'on' : ''} onClick={() => setTool(x => ({ ...x, kind: x.kind === 'pen' ? 'arrow' : 'pen' }))} data-tip="Pen (Ctrl+P)"><Icon name="pen-tool" size={17} /></button>
          <button class={toolState.kind === 'laser' ? 'on' : ''} onClick={() => setTool(x => ({ ...x, kind: x.kind === 'laser' ? 'arrow' : 'laser' }))} data-tip="Laser pointer (Ctrl+L)"><Icon name="radio" size={17} /></button>
          <button class={toolState.kind === 'highlighter' ? 'on' : ''} onClick={() => setTool(x => ({ ...x, kind: x.kind === 'highlighter' ? 'arrow' : 'highlighter' }))} data-tip="Highlighter"><Icon name="highlighter" size={17} /></button>
          <button class={toolState.kind === 'eraser' ? 'on' : ''} onClick={() => setTool(x => ({ ...x, kind: x.kind === 'eraser' ? 'arrow' : 'eraser' }))} data-tip="Eraser (Ctrl+E)"><Icon name="eraser" size={17} /></button>
          <button onClick={() => setOverview(true)} data-tip="See all slides (G)"><Icon name="layout-grid" size={17} /></button>
          <button onClick={() => setScreen(s => s === 'black' ? null : 'black')} data-tip="Black screen (B)"><Icon name="square" size={17} /></button>
          <span class="show-count">{shown(pos) + 1} / {d.slides.length}</span>
          <button onClick={finish} data-tip="End show (Esc)"><Icon name="x" size={18} /></button>
        </div>
      )}
      {ctx && (
        <div class="show-menu" style={{ left: ctx.x + 'px', top: ctx.y + 'px' }} onPointerDown={e => e.stopPropagation()}>
          {[
            ['Next', () => go(1)], ['Previous', () => go(-1)], ['See all slides', () => setOverview(true)], null,
            ['Arrow', () => setTool(x => ({ ...x, kind: 'arrow' }))], ['Pen', () => setTool(x => ({ ...x, kind: 'pen' }))], ['Laser pointer', () => setTool(x => ({ ...x, kind: 'laser' }))], ['Highlighter', () => setTool(x => ({ ...x, kind: 'highlighter' }))], ['Erase all ink on slide', () => setInk(x => ({ ...x, [slide.id]: [] }))], null,
            ['Black screen', () => setScreen('black')], ['White screen', () => setScreen('white')], null,
            ['End show', finish]
          ].map((it, i) => it ? <button key={i} onClick={() => { setCtx(null); it[1]() }}>{it[0]}</button> : <hr key={i} />)}
          <div class="show-menu-bg" onPointerDown={() => setCtx(null)} />
        </div>
      )}
      {overview && (
        <div class="show-overview" onPointerDown={e => e.stopPropagation()}>
          <div class="ov-grid">
            {d.slides.map((s, i) => (
              <button key={s.id} class={'ov-item' + (i === shown(pos) ? ' cur' : '') + (s.hidden ? ' hid' : '')} onClick={() => { setOverview(false); goTo(i) }}>
                <div class="ov-thumb" style={{ width: '220px', height: 220 * H / W + 'px' }}>
                  <div style={{ transform: `scale(${220 / (W * PX)})`, transformOrigin: '0 0' }}><SlideView slide={s} docObj={d} mode="thumb" index={i} ctx={'ov'} /></div>
                </div>
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Morph: matching elements (same id) move, resize and rotate between slides; others fade.
function morph (prevLayer, curLayer, ps, cs, dur) {
  const anims = []
  const ease = 'cubic-bezier(.45,0,.2,1)'
  const prevEls = new Map(), curEls = new Map()
  walk(ps.elements, (e, parent) => { if (!parent) prevEls.set(e.id, e) })
  walk(cs.elements, (e, parent) => { if (!parent) curEls.set(e.id, e) })
  const sameBg = JSON.stringify(ps.bg || null) === JSON.stringify(cs.bg || null) && ps.layout === cs.layout
  const curSlide = curLayer.querySelector('.pz-slide')
  if (sameBg && curSlide) {
    const bg = curSlide.style.background
    curSlide.style.background = 'transparent'
    const master = curSlide.querySelector('.pz-master'); if (master) master.style.visibility = 'hidden'
    setTimeout(() => { curSlide.style.background = bg; if (master) master.style.visibility = '' }, dur + 30)
  } else if (curSlide) anims.push(curSlide.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur * 0.6, easing: 'ease', fill: 'both' }))
  for (const [id, ce] of curEls) {
    const node = curLayer.querySelector(`.pz-el[data-id="${id}"]`)
    if (!node) continue
    const pe = prevEls.get(id)
    if (!pe) { anims.push(node.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: dur, easing: 'ease', fill: 'both' })); continue }
    const pc = { x: (pe.x + pe.w / 2) * PX, y: (pe.y + pe.h / 2) * PX }, cc = { x: (ce.x + ce.w / 2) * PX, y: (ce.y + ce.h / 2) * PX }
    const sx = ce.w ? pe.w / ce.w : 1, sy = ce.h ? pe.h / ce.h : 1
    const dr = (pe.rot || 0) - (ce.rot || 0)
    anims.push(node.animate([
      { translate: `${pc.x - cc.x}px ${pc.y - cc.y}px`, scale: `${sx} ${sy}`, rotate: `${dr}deg` },
      { translate: '0px 0px', scale: '1 1', rotate: '0deg' }
    ], { duration: dur, easing: ease, fill: 'both' }))
    anims.push(node.animate([{ opacity: (pe.opacity ?? 1) / (ce.opacity ?? 1) }, { opacity: 1 }], { duration: dur, easing: ease, fill: 'both' }))
    // the old object crossfades away along the same path (colour morph)
    const pnode = prevLayer.querySelector(`.pz-el[data-id="${id}"]`)
    if (pnode) {
      const isx = pe.w ? ce.w / pe.w : 1, isy = pe.h ? ce.h / pe.h : 1
      anims.push(pnode.animate([
        { translate: '0px 0px', scale: '1 1', rotate: '0deg', opacity: 1 },
        { translate: `${cc.x - pc.x}px ${cc.y - pc.y}px`, scale: `${isx} ${isy}`, rotate: `${-dr}deg`, opacity: 0 }
      ], { duration: dur, easing: ease, fill: 'both' }))
    }
  }
  for (const [id] of prevEls) {
    if (curEls.has(id)) continue
    const pnode = prevLayer.querySelector(`.pz-el[data-id="${id}"]`)
    if (pnode) anims.push(pnode.animate([{ opacity: 1 }, { opacity: 0, offset: 0.6 }, { opacity: 0 }], { duration: dur, easing: 'ease', fill: 'both' }))
  }
  // previous slide's own background stays underneath; master graphics fade only when the layout changes
  if (!sameBg) anims.push(prevLayer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: 'ease', fill: 'both' }))
  return anims
}

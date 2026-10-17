// Slide transitions and build animations for the PowerPoint writer (and the preset table the reader maps back).
// Effects are written as PowerPoint's own presets (same preset ids, subtypes and behaviours), so they show up
// with their real names in PowerPoint's Animation pane and keep playing the same way.
import { NS } from './xml.js'
import { buildGroups } from '../../show/Show.jsx'

// ---------- transitions ----------
// Our directions say where the new slide comes from; PowerPoint stores the direction of motion.
const MOTION = { bottom: 'u', top: 'd', left: 'r', right: 'l' }
const motion = (d, def) => MOTION[d] || MOTION[def]
function transitionEffect (t) {
  const d = t.dir
  switch (t.type) {
    case 'fade': return { el: '<p:fade/>' }
    case 'push': return { el: `<p:push dir="${motion(d, 'bottom')}"/>` }
    case 'wipe': return { el: `<p:wipe dir="${motion(d, 'right')}"/>` }
    case 'split': return { el: `<p:split orient="${d === 'horizontal' ? 'horz' : 'vert'}" dir="out"/>` }
    case 'cover': return { el: `<p:cover dir="${motion(d, 'right')}"/>` }
    case 'uncover': return { el: `<p:pull dir="${motion(d, 'left')}"/>` }
    case 'zoom': return { el: `<p:zoom dir="${d === 'out' ? 'out' : 'in'}"/>` }
    case 'shape': return { el: '<p:circle/>' }
    case 'blinds': return { el: '<p:blinds dir="horz"/>' }
    // PowerPoint 2010+ transitions, with a 2007 fallback
    case 'reveal': return { el: `<p14:reveal dir="${d === 'left' ? 'r' : 'l'}"/>`, fb: '<p:fade/>' }
    case 'flip': return { el: `<p14:flip dir="${d === 'left' ? 'l' : 'r'}"/>`, fb: '<p:fade/>' }
    case 'cube': return { el: `<p14:prism dir="${motion(d, 'right')}"/>`, fb: `<p:push dir="${motion(d, 'right')}"/>` }
    case 'glide': return { el: `<p14:gallery dir="${d === 'left' ? 'r' : 'l'}"/>`, fb: `<p:push dir="${d === 'left' ? 'r' : 'l'}"/>` }
    case 'morph': return { el: '<p159:morph option="byObject"/>', fb: '<p:fade/>', p159: true }
    default: return { el: '<p:fade/>' }
  }
}
// <p:transition> (wrapped for the duration attribute PowerPoint 2010 added) or '' when the slide has none
export function transitionXml (slide) {
  const t = slide.transition && slide.transition.type !== 'none' ? slide.transition : null
  const adv = (slide.advanceClick === false ? ' advClick="0"' : '') + (slide.advanceAfter != null ? ` advTm="${Math.max(0, Math.round(slide.advanceAfter * 1000))}"` : '')
  if (!t) return adv ? `<p:transition${adv}/>` : ''
  const ms = Math.max(10, Math.round((t.dur ?? 0.7) * 1000))
  const spd = ms <= 500 ? 'fast' : ms <= 750 ? 'med' : 'slow'
  const e = transitionEffect(t)
  const choiceNs = e.p159 ? `xmlns:p14="${NS.p14}" xmlns:p159="${NS.p159}" Requires="p159"` : `xmlns:p14="${NS.p14}" Requires="p14"`
  return `<mc:AlternateContent xmlns:mc="${NS.mc}"><mc:Choice ${choiceNs}><p:transition spd="${spd}" p14:dur="${ms}"${adv}>${e.el}</p:transition></mc:Choice>` +
    `<mc:Fallback><p:transition spd="${spd}"${adv}>${e.fb || e.el}</p:transition></mc:Fallback></mc:AlternateContent>`
}

// ---------- effect presets ----------
const SUB = { top: 1, right: 2, bottom: 4, left: 8 }
const FLY = { bottom: ['#ppt_x', '1+#ppt_h/2'], top: ['#ppt_x', '0-#ppt_h/2'], left: ['0-#ppt_w/2', '#ppt_y'], right: ['1+#ppt_w/2', '#ppt_y'] }
const WIPE = { bottom: 'down', top: 'up', left: 'left', right: 'right' }
// effect id → [presetID, presetClass, presetSubtype(dir)]
export const PRESETS = {
  appear: [1, 'entr', () => 0],
  fade: [10, 'entr', () => 0],
  flyIn: [2, 'entr', d => SUB[d] || 4],
  floatIn: [42, 'entr', () => 0],
  split: [16, 'entr', d => d === 'horizontal' ? 42 : 37],
  wipe: [22, 'entr', d => SUB[d] || 4],
  zoom: [53, 'entr', () => 16],
  growTurn: [31, 'entr', () => 0],
  bounce: [26, 'entr', () => 0],
  swivel: [19, 'entr', () => 10],
  pulse: [26, 'emph', () => 0],
  spin: [8, 'emph', () => 0],
  growShrink: [6, 'emph', () => 0],
  teeter: [32, 'emph', () => 0],
  flash: [35, 'emph', () => 0],
  transparency: [9, 'emph', () => 0],
  disappear: [1, 'exit', () => 0],
  fadeOut: [10, 'exit', () => 0],
  flyOut: [2, 'exit', d => SUB[d] || 4],
  floatOut: [42, 'exit', () => 0],
  splitOut: [16, 'exit', d => d === 'horizontal' ? 26 : 21],
  wipeOut: [22, 'exit', d => SUB[d] || 4],
  zoomOut: [53, 'exit', () => 16],
  shrinkTurn: [31, 'exit', () => 0]
}
const presetOf = a => {
  if (a.effect === 'floatIn' && a.dir === 'top') return [47, 'entr', 0]
  if (a.effect === 'floatOut' && a.dir === 'top') return [47, 'exit', 0]
  const p = PRESETS[a.effect] || (a.kind === 'exit' ? PRESETS.fadeOut : a.kind === 'emph' ? PRESETS.pulse : PRESETS.fade)
  return [p[0], p[1], p[2](a.dir)]
}

// Behaviour builders; c = { id(), tgt } where tgt is the <p:tgtEl> of the animated shape
const setStyle = (c, attr, val, { dur = 1, delay = 0, fill = 'hold' } = {}) =>
  `<p:set><p:cBhvr><p:cTn id="${c.id()}" dur="${dur}"${fill ? ` fill="${fill}"` : ''}><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn>${c.tgt}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${val}"/></p:to></p:set>`
const show = c => setStyle(c, 'style.visibility', 'visible')
const hideAt = (c, ms) => setStyle(c, 'style.visibility', 'hidden', { delay: Math.max(0, ms - 1) })
const filt = (c, dir, filter, ms, delay = 0) => `<p:animEffect transition="${dir}" filter="${filter}"><p:cBhvr><p:cTn id="${c.id()}" dur="${ms}"${delay ? `><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn>` : '/>'}${c.tgt}</p:cBhvr></p:animEffect>`
const prop = (c, attr, vals, ms, { hold = true, discrete = false } = {}) =>
  `<p:anim calcmode="${discrete ? 'discrete' : 'lin'}" valueType="${discrete ? 'str' : 'num'}"><p:cBhvr${discrete ? '' : ' additive="base"'}><p:cTn id="${c.id()}" dur="${ms}"${hold ? ' fill="hold"' : ''}/>${c.tgt}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst>${vals.map(([tm, v]) => `<p:tav tm="${tm}"><p:val><p:strVal val="${v}"/></p:val></p:tav>`).join('')}</p:tavLst></p:anim>`
const scale = (c, pct, ms, extra = '') => `<p:animScale><p:cBhvr><p:cTn id="${c.id()}" dur="${ms}"${extra} fill="hold"/>${c.tgt}</p:cBhvr><p:by x="${pct}" y="${pct}"/></p:animScale>`
const rot = (c, deg, ms, delay = 0) => `<p:animRot by="${Math.round(deg * 60000)}"><p:cBhvr><p:cTn id="${c.id()}" dur="${ms}" fill="hold"${delay ? `><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn>` : '/>'}${c.tgt}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`

function behaviours (a, c, ms) {
  const dir = a.dir
  switch (a.effect) {
    case 'appear': return show(c)
    case 'fade': return show(c) + filt(c, 'in', 'fade', ms)
    case 'flyIn': { const [x, y] = FLY[dir] || FLY.bottom; return show(c) + prop(c, 'ppt_x', [[0, x], [100000, '#ppt_x']], ms) + prop(c, 'ppt_y', [[0, y], [100000, '#ppt_y']], ms) }
    case 'floatIn': return show(c) + filt(c, 'in', 'fade', ms) + prop(c, 'ppt_x', [[0, '#ppt_x'], [100000, '#ppt_x']], ms) + prop(c, 'ppt_y', [[0, dir === 'top' ? '#ppt_y-.1' : '#ppt_y+.1'], [100000, '#ppt_y']], ms)
    case 'split': return show(c) + filt(c, 'in', dir === 'horizontal' ? 'barn(outHorizontal)' : 'barn(outVertical)', ms)
    case 'wipe': return show(c) + filt(c, 'in', `wipe(${WIPE[dir] || 'down'})`, ms)
    case 'zoom': return show(c) + prop(c, 'ppt_w', [[0, '0'], [100000, '#ppt_w']], ms) + prop(c, 'ppt_h', [[0, '0'], [100000, '#ppt_h']], ms) + filt(c, 'in', 'fade', ms)
    case 'growTurn': return show(c) + prop(c, 'ppt_w', [[0, '0'], [100000, '#ppt_w']], ms) + prop(c, 'ppt_h', [[0, '0'], [100000, '#ppt_h']], ms) + prop(c, 'style.rotation', [[0, '-90'], [100000, '0']], ms) + filt(c, 'in', 'fade', ms)
    // same keyframes as our renderer: a drop from a quarter of the slide with two smaller bounces
    case 'bounce': return show(c) + filt(c, 'in', 'fade', Math.round(ms * 0.3)) + prop(c, 'ppt_y', [[0, '#ppt_y-.25'], [45000, '#ppt_y'], [65000, '#ppt_y-.06'], [80000, '#ppt_y'], [90000, '#ppt_y-.015'], [100000, '#ppt_y']], ms)
    case 'swivel': return show(c) + prop(c, 'ppt_w', [[0, '0'], [100000, '#ppt_w']], ms) + filt(c, 'in', 'fade', ms)
    case 'pulse': return scale(c, 108000, Math.max(1, Math.round(ms / 2)), ' autoRev="1"')
    case 'spin': return rot(c, a.amount || 360, ms)
    case 'growShrink': return scale(c, Math.round((a.amount || 1.5) * 100000), ms)
    case 'teeter': { const s = ms / 1000, k = v => Math.round(v * s); return rot(c, 2, k(100)) + rot(c, -4, k(200), k(200)) + rot(c, 4, k(200), k(400)) + rot(c, -4, k(200), k(600)) + rot(c, 2, k(200), k(800)) }
    case 'flash': return `<p:anim calcmode="discrete" valueType="str"><p:cBhvr override="childStyle"><p:cTn id="${c.id()}" dur="${Math.max(1, Math.round(ms / 2))}" repeatCount="2000"/>${c.tgt}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="hidden"/></p:val></p:tav><p:tav tm="50000"><p:val><p:strVal val="visible"/></p:val></p:tav></p:tavLst></p:anim>`
    case 'transparency': return setStyle(c, 'style.opacity', '0.5', { dur: ms }) + `<p:animEffect filter="image" prLst="opacity: 0.5"><p:cBhvr rctx="IE"><p:cTn id="${c.id()}" dur="${ms}" fill="hold"/>${c.tgt}</p:cBhvr></p:animEffect>`
    case 'disappear': return setStyle(c, 'style.visibility', 'hidden')
    case 'fadeOut': return filt(c, 'out', 'fade', ms) + hideAt(c, ms)
    case 'flyOut': { const [x, y] = FLY[dir] || FLY.bottom; return prop(c, 'ppt_x', [[0, '#ppt_x'], [100000, x]], ms, { hold: false }) + prop(c, 'ppt_y', [[0, '#ppt_y'], [100000, y]], ms, { hold: false }) + hideAt(c, ms) }
    case 'floatOut': return filt(c, 'out', 'fade', ms) + prop(c, 'ppt_x', [[0, '#ppt_x'], [100000, '#ppt_x']], ms, { hold: false }) + prop(c, 'ppt_y', [[0, '#ppt_y'], [100000, dir === 'top' ? '#ppt_y-.1' : '#ppt_y+.1']], ms, { hold: false }) + hideAt(c, ms)
    case 'splitOut': return filt(c, 'out', dir === 'horizontal' ? 'barn(inHorizontal)' : 'barn(inVertical)', ms) + hideAt(c, ms)
    case 'wipeOut': return filt(c, 'out', `wipe(${WIPE[dir] || 'down'})`, ms) + hideAt(c, ms)
    case 'zoomOut': return prop(c, 'ppt_w', [[0, '#ppt_w'], [100000, '0']], ms, { hold: false }) + prop(c, 'ppt_h', [[0, '#ppt_h'], [100000, '0']], ms, { hold: false }) + filt(c, 'out', 'fade', ms) + hideAt(c, ms)
    case 'shrinkTurn': return prop(c, 'ppt_w', [[0, '#ppt_w'], [100000, '0']], ms, { hold: false }) + prop(c, 'ppt_h', [[0, '#ppt_h'], [100000, '0']], ms, { hold: false }) + prop(c, 'style.rotation', [[0, '0'], [100000, '90']], ms, { hold: false }) + filt(c, 'out', 'fade', ms) + hideAt(c, ms)
    default: return a.kind === 'exit' ? filt(c, 'out', 'fade', ms) + hideAt(c, ms) : a.kind === 'emph' ? scale(c, 108000, Math.max(1, Math.round(ms / 2)), ' autoRev="1"') : show(c) + filt(c, 'in', 'fade', ms)
  }
}
const SMOOTH = { flyIn: ' decel="100000"', floatIn: ' decel="100000"', zoom: ' decel="100000"', growTurn: ' decel="100000"', swivel: ' decel="100000"', flyOut: ' accel="100000"', floatOut: ' accel="100000"', zoomOut: ' accel="100000"', shrinkTurn: ' accel="100000"' }

// ---------- timing tree ----------
// target(elId) → { spid, sp } (sp: a shape with a text body, which PowerPoint lists in the build list)
// media: [{ spid, kind: 'video' | 'audio', autoplay, loop, muted, hideIdle, fullscreen, ms }]
export function timingXml (slide, target, media = []) {
  let n = 0
  const id = () => ++n
  // effects on objects that were not written are left out after timing, so the others keep their clicks and delays
  const groups = buildGroups(slide).map(g => ({ ...g, items: g.items.filter(it => target(it.a.el)) })).filter(g => g.items.length)
  const builds = [] // [spid, grpId]
  const grpCount = new Map()
  const autoMedia = media.filter(m => m.autoplay)
  if (!groups.length && !media.length) return ''

  const effectPar = (a, nodeType, delayMs) => {
    const t = target(a.el)
    if (!t) return ''
    const [pid, cls, sub] = presetOf(a)
    const grp = grpCount.get(t.spid) || 0
    grpCount.set(t.spid, grp + 1)
    if (t.sp) builds.push([t.spid, grp])
    const ms = Math.max(1, Math.round((a.dur ?? 0.5) * 1000))
    const c = { id, tgt: `<p:tgtEl><p:spTgt spid="${t.spid}"/></p:tgtEl>` }
    const own = id()
    return `<p:par><p:cTn id="${own}" presetID="${pid}" presetClass="${cls}" presetSubtype="${sub}"${SMOOTH[a.effect] || ''} fill="hold" grpId="${grp}" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${Math.max(0, Math.round(delayMs))}"/></p:stCondLst><p:childTnLst>${behaviours(a, c, ms)}</p:childTnLst></p:cTn></p:par>`
  }
  const mediaPar = (m, nodeType) => {
    const own = id()
    return `<p:par><p:cTn id="${own}" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="${nodeType}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="${id()}" dur="${m.ms > 0 ? m.ms : 1}" fill="hold"/><p:tgtEl><p:spTgt spid="${m.spid}"/></p:tgtEl></p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:par>`
  }
  const block = (startMs, inner) => { const own = id(); return `<p:par><p:cTn id="${own}" fill="hold"><p:stCondLst><p:cond delay="${Math.max(0, Math.round(startMs))}"/></p:stCondLst><p:childTnLst>${inner()}</p:childTnLst></p:cTn></p:par>` }

  const root = id(), main = id()
  const clickGroups = []
  // media that starts by itself plays with the slide, before the first click
  const autoFirst = groups[0]?.auto
  if (autoMedia.length && !autoFirst) {
    const own = id()
    clickGroups.push(`<p:par><p:cTn id="${own}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="${main}"/></p:cond></p:stCondLst><p:childTnLst>${block(0, () => autoMedia.map((m, i) => mediaPar(m, i ? 'withEffect' : 'afterEffect')).join(''))}</p:childTnLst></p:cTn></p:par>`)
  }
  groups.forEach((g, gi) => {
    // blocks: a click or "after previous" starts a new one; "with previous" joins the current one
    const blocks = []
    g.items.forEach((it, i) => {
      const a = it.a
      const ms = it.begin * 1000
      const startsBlock = i === 0 || a.start === 'after' || a.start === 'click'
      if (startsBlock) blocks.push({ start: ms - (a.delay || 0) * 1000, items: [] })
      const b = blocks[blocks.length - 1]
      const nodeType = i === 0 ? (g.auto ? (a.start === 'with' ? 'withEffect' : 'afterEffect') : 'clickEffect') : a.start === 'after' ? 'afterEffect' : 'withEffect'
      b.items.push({ a, nodeType, delay: ms - b.start })
    })
    const own = id()
    const cond = g.auto ? `<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="${main}"/></p:cond>` : '<p:cond delay="indefinite"/>'
    const extra = gi === 0 && g.auto && autoMedia.length ? () => autoMedia.map(m => mediaPar(m, 'withEffect')).join('') : () => ''
    clickGroups.push(`<p:par><p:cTn id="${own}" fill="hold"><p:stCondLst>${cond}</p:stCondLst><p:childTnLst>${blocks.map((b, bi) => block(b.start, () => (bi === 0 ? extra() : '') + b.items.map(x => effectPar(x.a, x.nodeType, x.delay)).join(''))).join('')}</p:childTnLst></p:cTn></p:par>`)
  })

  let out = ''
  if (clickGroups.length) {
    out += `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${main}" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${clickGroups.join('')}</p:childTnLst></p:cTn>` +
      '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
  }
  // clicking a video or sound plays/pauses it, like media inserted in PowerPoint
  for (const m of media) {
    const tg = `<p:tgtEl><p:spTgt spid="${m.spid}"/></p:tgtEl>`
    const seqId = id(), p1 = id(), p2 = id(), eff = id(), cmd = id()
    out += `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${seqId}" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq"><p:stCondLst><p:cond evt="onClick" delay="0">${tg}</p:cond></p:stCondLst><p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync><p:childTnLst>` +
      `<p:par><p:cTn id="${p1}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${p2}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
      `<p:par><p:cTn id="${eff}" presetID="2" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="clickEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:cmd type="call" cmd="togglePause"><p:cBhvr><p:cTn id="${cmd}" dur="1" fill="hold"/>${tg}</p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:par>` +
      `</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn><p:nextCondLst><p:cond evt="onClick" delay="0">${tg}</p:cond></p:nextCondLst></p:seq>`
    const tag = m.kind === 'audio' ? 'p:audio' : 'p:video'
    out += `<${tag}${m.fullscreen && tag === 'p:video' ? ' fullScrn="1"' : ''}><p:cMediaNode vol="80000"${m.muted ? ' mute="1"' : ''}${m.hideIdle ? ' showWhenStopped="0"' : ''}><p:cTn id="${id()}"${m.loop ? ' repeatCount="indefinite"' : ''} fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn>${tg}</p:cMediaNode></${tag}>`
  }
  const bld = builds.length ? `<p:bldLst>${builds.map(([spid, g]) => `<p:bldP spid="${spid}" grpId="${g}" animBg="1"/>`).join('')}</p:bldLst>` : ''
  return `<p:timing><p:tnLst><p:par><p:cTn id="${root}" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${out}</p:childTnLst></p:cTn></p:par></p:tnLst>${bld}</p:timing>`
}

// ---------- reading (PowerPoint → Prizma) ----------
const kid = (n, name) => n ? [...n.children].find(c => c.localName === name) || null : null
const kidsOf = (n, name) => n ? [...n.children].filter(c => c.localName === name) : []
const FROM_MOTION = { l: 'right', r: 'left', u: 'bottom', d: 'top', lu: 'right', ld: 'right', ru: 'left', rd: 'left' }
const SPEED = { fast: 0.5, med: 0.75, slow: 1 }
// The slide's transition and advance settings: { transition, advanceClick, advanceAfter }
export function readTransition (sld) {
  let tr = kid(sld, 'transition')
  const alt = kid(sld, 'AlternateContent')
  if (!tr && alt) tr = kid(kidsOf(alt, 'Choice').find(ch => /\b(p14|p15|p159)\b/.test(ch.getAttribute('Requires') || '')), 'transition') || kid(kid(alt, 'Fallback'), 'transition')
  if (!tr) return {}
  const out = {}
  if (/^(0|false)$/.test(tr.getAttribute('advClick'))) out.advanceClick = false
  if (tr.hasAttribute('advTm')) out.advanceAfter = Math.round(+tr.getAttribute('advTm') / 100) / 10
  const fx = [...tr.children].find(c => c.localName !== 'sndAc' && c.localName !== 'extLst')
  if (!fx) return out
  const durAttr = [...tr.attributes].find(a => a.localName === 'dur')
  const dur = durAttr ? Math.max(0.1, +durAttr.value / 1000) : SPEED[tr.getAttribute('spd') || 'fast'] || 0.5
  const d = fx.getAttribute('dir') || ''
  const from = def => FROM_MOTION[d] || def
  const T = {
    fade: { type: 'fade' }, dissolve: { type: 'fade' }, shred: { type: 'fade' }, flash: { type: 'fade' }, random: { type: 'fade' }, prstTrans: { type: 'fade' }, newsflash: { type: 'zoom', dir: 'in' },
    push: { type: 'push', dir: from('bottom') }, wipe: { type: 'wipe', dir: from('right') }, cover: { type: 'cover', dir: from('right') }, pull: { type: 'uncover', dir: from('left') },
    split: { type: 'split', dir: fx.getAttribute('orient') === 'horz' ? 'horizontal' : 'vertical' }, doors: { type: 'split', dir: 'vertical' }, window: { type: 'split', dir: 'vertical' },
    reveal: { type: 'reveal', dir: d === 'r' ? 'left' : 'right' }, flip: { type: 'flip', dir: d === 'l' ? 'left' : 'right' },
    prism: { type: 'cube', dir: from('right') }, gallery: { type: 'glide', dir: d === 'r' ? 'left' : 'right' }, conveyor: { type: 'push', dir: from('right') }, pan: { type: 'push', dir: from('bottom') }, ferris: { type: 'push', dir: from('right') }, switch: { type: 'cube', dir: from('right') },
    zoom: { type: 'zoom', dir: d === 'out' ? 'out' : 'in' }, vortex: { type: 'zoom', dir: 'in' }, ripple: { type: 'zoom', dir: 'out' }, flythrough: { type: 'zoom', dir: 'in' }, warp: { type: 'zoom', dir: 'in' }, glitter: { type: 'fade' }, honeycomb: { type: 'zoom', dir: 'in' },
    circle: { type: 'shape' }, diamond: { type: 'shape' }, plus: { type: 'shape' }, wedge: { type: 'shape' }, wheel: { type: 'shape' }, wheelReverse: { type: 'shape' },
    blinds: { type: 'blinds' }, checker: { type: 'blinds' }, comb: { type: 'blinds' }, strips: { type: 'wipe', dir: 'right' }, randomBar: { type: 'blinds' },
    morph: { type: 'morph' }
  }
  const t = T[fx.localName]
  if (t) out.transition = { ...t, dur }
  return out
}

const desc = (n, name) => n ? [...n.querySelectorAll('*')].find(x => x.localName === name) || null : null
const numAttr = (n, a) => { const v = n?.getAttribute(a); return v === null || v === undefined || v === '' || isNaN(+v) ? null : +v }
const condDelay = cTn => { for (const c of kidsOf(kid(cTn, 'stCondLst'), 'cond')) { const v = numAttr(c, 'delay'); if (v !== null) return v } return 0 }
// Total length of an effect: the latest end among its behaviours (with repeats and auto-reverse)
function effectLength (cTn) {
  let end = 0
  for (const n of cTn.querySelectorAll('*')) {
    if (n.localName !== 'cTn' || n === cTn) continue
    const dur = numAttr(n, 'dur')
    if (dur === null || dur <= 1) continue
    const rep = numAttr(n, 'repeatCount')
    end = Math.max(end, condDelay(n) + dur * (/^(1|true)$/.test(n.getAttribute('autoRev')) ? 2 : 1) * (rep && rep > 0 ? rep / 1000 : 1))
  }
  return end
}
const dirOfSub = sub => (sub & 4) ? 'bottom' : (sub & 1) ? 'top' : (sub & 8) ? 'left' : (sub & 2) ? 'right' : 'bottom'
// PowerPoint preset → our effect (nearest look when we have no exact match)
function effectOf (cls, id, sub, cTn) {
  if (cls === 'entr') {
    if (id === 1) return { effect: 'appear' }
    if (id === 2 || id === 12 || id === 7) return { effect: 'flyIn', dir: dirOfSub(sub) }
    if (id === 42 || id === 37 || id === 41) return { effect: 'floatIn', dir: 'bottom' }
    if (id === 47) return { effect: 'floatIn', dir: 'top' }
    if (id === 16 || id === 13) return { effect: 'split', dir: sub === 26 || sub === 42 ? 'horizontal' : 'vertical' }
    if (id === 22 || id === 14 || id === 17 || id === 3) return { effect: 'wipe', dir: dirOfSub(sub) }
    if (id === 53 || id === 23 || id === 30 || id === 4 || id === 6 || id === 8 || id === 55) return { effect: 'zoom' }
    if (id === 31 || id === 49) return { effect: 'growTurn' }
    if (id === 26 || id === 25) return { effect: 'bounce' }
    if (id === 19 || id === 45) return { effect: 'swivel' }
    return { effect: 'fade' }
  }
  if (cls === 'exit') {
    if (id === 1) return { effect: 'disappear' }
    if (id === 2 || id === 12 || id === 7) return { effect: 'flyOut', dir: dirOfSub(sub) }
    if (id === 42 || id === 37 || id === 41) return { effect: 'floatOut', dir: 'bottom' }
    if (id === 47) return { effect: 'floatOut', dir: 'top' }
    if (id === 16 || id === 13) return { effect: 'splitOut', dir: sub === 26 || sub === 42 ? 'horizontal' : 'vertical' }
    if (id === 22 || id === 14 || id === 17 || id === 3) return { effect: 'wipeOut', dir: dirOfSub(sub) }
    if (id === 53 || id === 23 || id === 30 || id === 4 || id === 6 || id === 8 || id === 55) return { effect: 'zoomOut' }
    if (id === 31 || id === 49) return { effect: 'shrinkTurn' }
    return { effect: 'fadeOut' }
  }
  if (cls === 'emph') {
    if (id === 6) { const x = numAttr(desc(desc(cTn, 'animScale'), 'by'), 'x'); return { effect: 'growShrink', amount: x ? Math.round(x / 1000) / 100 : 1.5 } }
    if (id === 8) { const by = numAttr(desc(cTn, 'animRot'), 'by'); return { effect: 'spin', amount: by ? Math.round(by / 60000) : 360 } }
    if (id === 9) return { effect: 'transparency' }
    if (id === 32 || id === 34) return { effect: 'teeter' }
    if (id === 35 || id === 36) return { effect: 'flash' }
    return { effect: 'pulse' }
  }
  return null
}
// Build animations of a slide. idOf(spid) gives our element id for a PowerPoint shape id.
// Returns { animations, autoplay: [element ids of media that starts with the slide], loop, muted, hideIdle, fullscreen: [ids] }
export function readTiming (sld, idOf) {
  const out = { animations: [], autoplay: [], loop: [], muted: [], hideIdle: [], fullscreen: [] }
  const timing = kid(sld, 'timing')
  if (!timing) return out
  // videos and sounds: play until stopped, muted, hidden while not playing, full screen (as timingXml writes them)
  const yes = v => v === '1' || v === 'true'
  for (const m of timing.querySelectorAll('*')) {
    if (m.localName !== 'cMediaNode') continue
    const tgt = desc(m, 'spTgt')
    const el = tgt ? idOf(tgt.getAttribute('spid')) : null
    if (!el) continue
    if (kid(m, 'cTn')?.getAttribute('repeatCount') === 'indefinite') out.loop.push(el)
    if (yes(m.getAttribute('mute'))) out.muted.push(el)
    if (['0', 'false'].includes(m.getAttribute('showWhenStopped'))) out.hideIdle.push(el)
    if (yes(m.parentElement?.getAttribute('fullScrn'))) out.fullscreen.push(el)
  }
  const main = [...timing.querySelectorAll('*')].find(n => n.localName === 'cTn' && n.getAttribute('nodeType') === 'mainSeq')
  if (!main) return out
  let prev = null
  kidsOf(kid(main, 'childTnLst'), 'par').forEach((gPar, g) => {
    const gTn = kid(gPar, 'cTn')
    const auto = kidsOf(kid(gTn, 'stCondLst'), 'cond').some(c => c.getAttribute('evt') === 'onBegin')
    let first = true
    for (const eff of gTn.querySelectorAll('*')) {
      if (eff.localName !== 'cTn' || !eff.hasAttribute('presetClass')) continue
      const tgt = desc(eff, 'spTgt')
      const el = tgt ? idOf(tgt.getAttribute('spid')) : null
      if (!el) continue
      const cls = eff.getAttribute('presetClass')
      // the start time within the click group: the block's delay plus the effect's own
      const block = eff.parentElement?.parentElement?.parentElement
      const begin = (block && block.localName === 'cTn' && block !== gTn ? condDelay(block) : 0) + condDelay(eff)
      if (cls === 'mediacall') {
        if (auto && [...eff.querySelectorAll('*')].some(n => n.localName === 'cmd' && /^playFrom/.test(n.getAttribute('cmd') || ''))) out.autoplay.push(el)
        continue
      }
      const m = effectOf(cls, numAttr(eff, 'presetID') ?? 0, numAttr(eff, 'presetSubtype') ?? 0, eff)
      if (!m) continue
      const kind = cls
      // "by paragraph" builds come as one effect per paragraph: Prizma animates the object once
      const byPara = [...tgt.children].some(n => n.localName === 'txEl')
      if (byPara && out.animations.some(a => a.el === el && a.kind === kind)) continue
      const node = eff.getAttribute('nodeType')
      const start = !first ? (node === 'afterEffect' ? 'after' : node === 'clickEffect' ? 'click' : 'with') : (g === 0 && auto ? (node === 'withEffect' ? 'with' : 'after') : 'click')
      const len = effectLength(eff) / 1000
      const dur = Math.max(0.1, Math.round((len || 0.5) * 100) / 100)
      const b = begin / 1000
      // Prizma times "with" from the previous start and "after" from the previous end
      const raw = start === 'click' || !prev || prev.g !== g ? b : start === 'with' ? b - prev.b : b - (prev.b + prev.dur)
      out.animations.push({ id: 'a' + Math.random().toString(36).slice(2, 9), el, kind, ...m, start, dur, delay: Math.max(0, Math.round(raw * 100) / 100) })
      prev = { g, b, dur }
      first = false
    }
  })
  return out
}

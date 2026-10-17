// Transitions and animation effects: catalog for the UI and Web Animations keyframes for playback.

export const DIRS4 = ['bottom', 'left', 'right', 'top']
export const DIR_LABEL = { bottom: 'From bottom', left: 'From left', right: 'From right', top: 'From top', vertical: 'Vertical', horizontal: 'Horizontal', in: 'In', out: 'Out' }

export const TRANSITIONS = [
  { id: 'none', label: 'None', icon: 'ban' },
  { id: 'morph', label: 'Morph', icon: 'blend', desc: 'Moves, resizes and recolors matching objects between slides. Duplicate a slide, change it, then apply Morph to the second slide.' },
  { id: 'fade', label: 'Fade', icon: 'sunset' },
  { id: 'push', label: 'Push', icon: 'chevrons-left', dirs: DIRS4, dir: 'bottom' },
  { id: 'wipe', label: 'Wipe', icon: 'panel-left-open', dirs: DIRS4, dir: 'right' },
  { id: 'split', label: 'Split', icon: 'columns-2', dirs: ['vertical', 'horizontal'], dir: 'vertical' },
  { id: 'reveal', label: 'Reveal', icon: 'square-arrow-out-up-left', dirs: ['left', 'right'], dir: 'left' },
  { id: 'cover', label: 'Cover', icon: 'layers-2', dirs: DIRS4, dir: 'right' },
  { id: 'uncover', label: 'Uncover', icon: 'layers', dirs: DIRS4, dir: 'left' },
  { id: 'zoom', label: 'Zoom', icon: 'zoom-in', dirs: ['in', 'out'], dir: 'in' },
  { id: 'shape', label: 'Shape', icon: 'circle-dashed' },
  { id: 'flip', label: 'Flip', icon: 'flip-horizontal-2', dirs: ['left', 'right'], dir: 'right' },
  { id: 'cube', label: 'Cube', icon: 'box', dirs: DIRS4, dir: 'right' },
  { id: 'glide', label: 'Glide', icon: 'wind', dirs: ['left', 'right'], dir: 'right' },
  { id: 'blinds', label: 'Blinds', icon: 'blinds' }
]
export const transitionById = id => TRANSITIONS.find(t => t.id === id) || TRANSITIONS[0]

export const ANIM_KIND = { entr: 'Entrance', emph: 'Emphasis', exit: 'Exit' }
export const ANIMS = [
  { id: 'appear', kind: 'entr', label: 'Appear', icon: 'sparkle' },
  { id: 'fade', kind: 'entr', label: 'Fade', icon: 'sunset' },
  { id: 'flyIn', kind: 'entr', label: 'Fly in', icon: 'send', dirs: DIRS4, dir: 'bottom' },
  { id: 'floatIn', kind: 'entr', label: 'Float in', icon: 'arrow-up-from-dot', dirs: ['bottom', 'top'], dir: 'bottom' },
  { id: 'split', kind: 'entr', label: 'Split', icon: 'columns-2', dirs: ['vertical', 'horizontal'], dir: 'vertical' },
  { id: 'wipe', kind: 'entr', label: 'Wipe', icon: 'panel-left-open', dirs: DIRS4, dir: 'bottom' },
  { id: 'zoom', kind: 'entr', label: 'Zoom', icon: 'zoom-in' },
  { id: 'growTurn', kind: 'entr', label: 'Grow & turn', icon: 'rotate-3d' },
  { id: 'bounce', kind: 'entr', label: 'Bounce', icon: 'arrow-big-down-dash' },
  { id: 'swivel', kind: 'entr', label: 'Swivel', icon: 'refresh-ccw-dot' },
  { id: 'pulse', kind: 'emph', label: 'Pulse', icon: 'activity' },
  { id: 'spin', kind: 'emph', label: 'Spin', icon: 'rotate-cw' },
  { id: 'growShrink', kind: 'emph', label: 'Grow/Shrink', icon: 'maximize-2' },
  { id: 'teeter', kind: 'emph', label: 'Teeter', icon: 'vibrate' },
  { id: 'flash', kind: 'emph', label: 'Flash', icon: 'zap' },
  { id: 'transparency', kind: 'emph', label: 'Transparency', icon: 'blend' },
  { id: 'disappear', kind: 'exit', label: 'Disappear', icon: 'sparkle' },
  { id: 'fadeOut', kind: 'exit', label: 'Fade', icon: 'sunset' },
  { id: 'flyOut', kind: 'exit', label: 'Fly out', icon: 'send', dirs: DIRS4, dir: 'bottom' },
  { id: 'floatOut', kind: 'exit', label: 'Float out', icon: 'arrow-down-to-dot', dirs: ['bottom', 'top'], dir: 'bottom' },
  { id: 'splitOut', kind: 'exit', label: 'Split', icon: 'columns-2', dirs: ['vertical', 'horizontal'], dir: 'vertical' },
  { id: 'wipeOut', kind: 'exit', label: 'Wipe', icon: 'panel-left-close', dirs: DIRS4, dir: 'bottom' },
  { id: 'zoomOut', kind: 'exit', label: 'Zoom', icon: 'zoom-out' },
  { id: 'shrinkTurn', kind: 'exit', label: 'Shrink & turn', icon: 'rotate-3d' }
]
export const animById = id => ANIMS.find(a => a.id === id)

// ---------- element animation keyframes ----------
// Returns { frames, options } for Web Animations. `box` is the element box in slide px, `W/H` slide px.
const offFor = (dir, box, W, H) => {
  switch (dir) {
    case 'left': return [-(box.x + box.w) - 20, 0]
    case 'right': return [W - box.x + 20, 0]
    case 'top': return [0, -(box.y + box.h) - 20]
    default: return [0, H - box.y + 20]
  }
}
export function animFrames (a, box, W, H) {
  const id = a.effect
  const ease = 'cubic-bezier(.2,.7,.2,1)'
  switch (id) {
    case 'appear': return { frames: [{ visibility: 'hidden' }, { visibility: 'visible' }], easing: 'steps(1, start)', dur: 1 }
    case 'disappear': return { frames: [{ visibility: 'visible' }, { visibility: 'hidden' }], easing: 'steps(1, end)', dur: 1 }
    case 'fade': return { frames: [{ opacity: 0 }, { opacity: 1 }] }
    case 'fadeOut': return { frames: [{ opacity: 1 }, { opacity: 0 }] }
    case 'flyIn': { const [dx, dy] = offFor(a.dir || 'bottom', box, W, H); return { frames: [{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], easing: ease } }
    case 'flyOut': { const [dx, dy] = offFor(a.dir || 'bottom', box, W, H); return { frames: [{ translate: '0 0' }, { translate: `${dx}px ${dy}px` }], easing: 'cubic-bezier(.6,0,.8,.3)' } }
    case 'floatIn': { const d = (a.dir === 'top' ? -1 : 1) * Math.min(80, H * 0.08); return { frames: [{ opacity: 0, translate: `0 ${d}px` }, { opacity: 1, translate: '0 0' }], easing: ease } }
    case 'floatOut': { const d = (a.dir === 'top' ? -1 : 1) * Math.min(80, H * 0.08); return { frames: [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `0 ${d}px` }], easing: 'ease-in' } }
    case 'split': return { frames: a.dir === 'horizontal' ? [{ clipPath: 'inset(50% 0 50% 0)' }, { clipPath: 'inset(0 0 0 0)' }] : [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0 0 0)' }] }
    case 'splitOut': return { frames: a.dir === 'horizontal' ? [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(50% 0 50% 0)' }] : [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 50% 0 50%)' }] }
    case 'wipe': return { frames: [{ clipPath: wipeFrom(a.dir || 'bottom') }, { clipPath: 'inset(0 0 0 0)' }] }
    case 'wipeOut': return { frames: [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: wipeFrom(a.dir || 'bottom') }] }
    case 'zoom': return { frames: [{ opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1 }], easing: ease }
    case 'zoomOut': return { frames: [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.3 }], easing: 'ease-in' }
    case 'growTurn': return { frames: [{ opacity: 0, scale: 0.1, rotate: '-90deg' }, { opacity: 1, scale: 1, rotate: '0deg' }], easing: ease }
    case 'shrinkTurn': return { frames: [{ opacity: 1, scale: 1, rotate: '0deg' }, { opacity: 0, scale: 0.1, rotate: '90deg' }], easing: 'ease-in' }
    case 'bounce': return { frames: [{ opacity: 0, translate: `0 ${-H * 0.25}px`, offset: 0 }, { opacity: 1, translate: '0 0', offset: 0.45 }, { translate: `0 ${-H * 0.06}px`, offset: 0.65 }, { translate: '0 0', offset: 0.8 }, { translate: `0 ${-H * 0.015}px`, offset: 0.9 }, { translate: '0 0', offset: 1 }], easing: 'ease-out' }
    case 'swivel': return { frames: [{ opacity: 0, transform: 'perspective(800px) rotateY(90deg)' }, { opacity: 1, transform: 'perspective(800px) rotateY(0deg)' }], easing: ease, transformProp: true }
    case 'pulse': return { frames: [{ scale: 1 }, { scale: 1.08 }, { scale: 1 }], easing: 'ease-in-out', keep: false }
    case 'spin': return { frames: [{ rotate: '0deg' }, { rotate: (a.amount || 360) + 'deg' }], easing: 'ease-in-out', keep: false }
    case 'growShrink': return { frames: [{ scale: 1 }, { scale: a.amount || 1.5 }], easing: 'ease-in-out' }
    case 'teeter': return { frames: [{ rotate: '0deg' }, { rotate: '4deg' }, { rotate: '-4deg' }, { rotate: '4deg' }, { rotate: '-4deg' }, { rotate: '0deg' }], easing: 'ease-in-out', keep: false }
    case 'flash': return { frames: [{ opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }], keep: false }
    case 'transparency': return { frames: [{ opacity: 1 }, { opacity: 0.5 }] }
    default: return { frames: [{ opacity: 0 }, { opacity: 1 }] }
  }
}
function wipeFrom (dir) {
  // the edge the wipe starts from
  if (dir === 'left') return 'inset(0 100% 0 0)'
  if (dir === 'right') return 'inset(0 0 0 100%)'
  if (dir === 'top') return 'inset(0 0 100% 0)'
  return 'inset(100% 0 0 0)'
}

// ---------- slide transitions ----------
// Returns keyframes for the incoming (cur) and outgoing (prev) slide layers; w × h is the slide size in layer px.
export function transitionFrames (t, w, h) {
  const d = t.dir
  const ease = 'cubic-bezier(.4,0,.2,1)'
  const v = { left: ['-100%', '0'], right: ['100%', '0'], top: ['0', '-100%'], bottom: ['0', '100%'] }
  switch (t.type) {
    case 'fade': return { cur: [{ opacity: 0 }, { opacity: 1 }], prev: null, easing: 'ease' }
    case 'push': { const [x, y] = v[d || 'bottom']; const inv = s => s === '0' ? '0' : s.startsWith('-') ? s.slice(1) : '-' + s; return { cur: [{ translate: `${x} ${y}` }, { translate: '0 0' }], prev: [{ translate: '0 0' }, { translate: `${inv(x)} ${inv(y)}` }], easing: ease } }
    case 'cover': { const [x, y] = v[d || 'right']; return { cur: [{ translate: `${x} ${y}` }, { translate: '0 0' }], prev: null, easing: ease } }
    case 'uncover': { const [x, y] = v[d || 'left']; const inv = s => s === '0' ? '0' : s.startsWith('-') ? s.slice(1) : '-' + s; return { cur: null, prev: [{ translate: '0 0' }, { translate: `${inv(x)} ${inv(y)}` }], easing: ease, prevOnTop: true } }
    case 'wipe': return { cur: [{ clipPath: wipeFrom(d || 'right') }, { clipPath: 'inset(0 0 0 0)' }], prev: null, easing: 'ease-in-out' }
    case 'split': return { cur: [{ clipPath: d === 'horizontal' ? 'inset(50% 0 50% 0)' : 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0 0 0)' }], prev: null, easing: ease }
    case 'reveal': { const s = d === 'right' ? 1 : -1; return { cur: [{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], prev: [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `${s * 8}% 0`, offset: 0.55 }, { opacity: 0, translate: `${s * 8}% 0` }], easing: 'ease-in-out', prevOnTop: true } }
    case 'zoom': return d === 'out'
      ? { cur: [{ opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1 }], prev: [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.8 }], easing: ease }
      : { cur: [{ opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1 }], prev: [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 1.4 }], easing: ease }
    case 'shape': return { cur: [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }], prev: null, easing: 'ease-in-out' }
    case 'flip': { const s = d === 'left' ? -1 : 1; return { cur: [{ transform: `perspective(1600px) rotateY(${-s * 90}deg)`, opacity: 0 }, { transform: `perspective(1600px) rotateY(${-s * 90}deg)`, opacity: 0, offset: 0.5 }, { transform: 'perspective(1600px) rotateY(0deg)', opacity: 1 }], prev: [{ transform: 'perspective(1600px) rotateY(0deg)', opacity: 1 }, { transform: `perspective(1600px) rotateY(${s * 90}deg)`, opacity: 1, offset: 0.5 }, { transform: `perspective(1600px) rotateY(${s * 90}deg)`, opacity: 0 }], easing: 'ease-in-out' } }
    case 'cube': {
      const ax = d === 'top' || d === 'bottom' ? 'X' : 'Y'
      const s = d === 'left' || d === 'top' ? -1 : 1
      const sign = ax === 'X' ? -s : s
      const z = (ax === 'X' ? h : w) / 2 + 'px' // half the cube, so the two faces meet at their edge
      return {
        cur: [{ transform: `perspective(2000px) translateZ(-${z}) rotate${ax}(${sign * 90}deg) translateZ(${z})` }, { transform: `perspective(2000px) translateZ(-${z}) rotate${ax}(0deg) translateZ(${z})` }],
        prev: [{ transform: `perspective(2000px) translateZ(-${z}) rotate${ax}(0deg) translateZ(${z})` }, { transform: `perspective(2000px) translateZ(-${z}) rotate${ax}(${-sign * 90}deg) translateZ(${z})` }],
        easing: 'ease-in-out', backface: true
      }
    }
    case 'glide': { const s = d === 'left' ? -1 : 1; return { cur: [{ opacity: 0, translate: `${s * 30}% 0`, scale: 0.9 }, { opacity: 1, translate: '0 0', scale: 1 }], prev: [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.9, translate: `${-s * 20}% 0` }], easing: ease } }
    case 'blinds': return { cur: [{ clipPath: strips(0) }, { clipPath: strips(1) }], prev: null, easing: 'ease-in-out' }
    default: return { cur: [{ opacity: 0 }, { opacity: 1 }], prev: null, easing: 'ease' }
  }
}

// Polygon covering n horizontal strips, each filled to fraction p (blinds)
function strips (p, n = 8) {
  const h = 100 / n
  const pts = []
  for (let i = 0; i < n; i++) { const y0 = i * h, y1 = y0 + Math.max(0.001, p * h); pts.push(`0% ${y0}%`, `100% ${y0}%`, `100% ${y1}%`, `0% ${y1}%`) }
  return `polygon(${pts.join(', ')})`
}

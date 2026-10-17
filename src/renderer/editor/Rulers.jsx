// View › Ruler: a horizontal and a vertical ruler along the canvas, zero at the slide centre like PowerPoint.
// The rulers live outside the scrolling canvas and follow its scroll position.
import { useEffect, useState } from 'preact/hooks'
import { settings, selected, slide } from '../core/store.js'
import { unionBounds, onSlide } from '../core/model.js'

export const RULER = 20 // px

function ticks (len, origin, k, unit) {
  // origin: px position of the slide centre along this ruler; k: px per pt
  const perUnit = unit === 'in' ? 72 : 72 / 2.54 // pt per major unit
  const minorDiv = unit === 'in' ? 8 : 4
  const major = perUnit * k // px per major unit
  const step = major < 22 ? 2 : 1 // label every other unit when zoomed far out
  const out = []
  const first = Math.floor(-origin / (major / minorDiv)) - 1
  const last = Math.ceil((len - origin) / (major / minorDiv)) + 1
  for (let i = first; i <= last; i++) {
    const pos = origin + i * major / minorDiv
    if (pos < -2 || pos > len + 2) continue
    const isMajor = i % minorDiv === 0
    const isHalf = !isMajor && i % (minorDiv / 2) === 0
    if (!isMajor && major / minorDiv < 4) continue // too dense
    out.push({ pos, size: isMajor ? 1 : isHalf ? 0.5 : 0.28, label: isMajor && (i / minorDiv) % step === 0 ? String(Math.abs(i / minorDiv)) : null })
  }
  return out
}

export function Rulers ({ stageRef, fx, fy, W, H, k }) {
  const [scroll, setScroll] = useState({ l: 0, t: 0, w: 800, h: 600 })
  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    const read = () => setScroll({ l: st.scrollLeft, t: st.scrollTop, w: st.clientWidth, h: st.clientHeight })
    read()
    st.addEventListener('scroll', read, { passive: true })
    const ro = new ResizeObserver(read)
    ro.observe(st)
    return () => { st.removeEventListener('scroll', read); ro.disconnect() }
  }, [stageRef.current])
  const unit = settings.value.units === 'in' ? 'in' : 'cm'
  const ox = fx - scroll.l + W / 2 * k // px of the slide centre in the horizontal ruler
  const oy = fy - scroll.t + H / 2 * k
  const hx = ticks(scroll.w, ox, k, unit)
  const vy = ticks(scroll.h, oy, k, unit)
  // the selection's extent shows as a band, the slide as the lit part of the ruler
  const sel = selected.value
  const b = sel.length ? unionBounds(sel.map(e => onSlide(slide.value, e))) : null
  const slideX = [fx - scroll.l, fx - scroll.l + W * k], slideY = [fy - scroll.t, fy - scroll.t + H * k]
  return (
    <>
      <div class="ruler ruler-h" style={{ left: RULER + 'px', height: RULER + 'px' }}>
        <svg width={scroll.w} height={RULER}>
          <rect class="ruler-slide" x={slideX[0]} y="0" width={Math.max(0, slideX[1] - slideX[0])} height={RULER} />
          {b && <rect class="ruler-sel" x={fx - scroll.l + b.x * k} y="0" width={b.w * k} height={RULER} />}
          {hx.map((t, i) => <line key={i} x1={Math.round(t.pos) + 0.5} x2={Math.round(t.pos) + 0.5} y1={RULER} y2={RULER - RULER * 0.5 * t.size} />)}
          {hx.filter(t => t.label).map((t, i) => <text key={'l' + i} x={t.pos} y={9}>{t.label}</text>)}
        </svg>
      </div>
      <div class="ruler ruler-v" style={{ top: RULER + 'px', width: RULER + 'px' }}>
        <svg width={RULER} height={scroll.h}>
          <rect class="ruler-slide" x="0" y={slideY[0]} width={RULER} height={Math.max(0, slideY[1] - slideY[0])} />
          {b && <rect class="ruler-sel" x="0" y={fy - scroll.t + b.y * k} width={RULER} height={b.h * k} />}
          {vy.map((t, i) => <line key={i} y1={Math.round(t.pos) + 0.5} y2={Math.round(t.pos) + 0.5} x1={RULER} x2={RULER - RULER * 0.5 * t.size} />)}
          {vy.filter(t => t.label).map((t, i) => <text key={'l' + i} x={7} y={t.pos} transform={`rotate(-90 7 ${t.pos})`}>{t.label}</text>)}
        </svg>
      </div>
      <div class="ruler-corner" style={{ width: RULER + 'px', height: RULER + 'px' }} />
    </>
  )
}

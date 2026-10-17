// Design, Transitions, Animations and Slide Show tabs.
import { useState, useEffect } from 'preact/hooks'
import { signal } from '@preact/signals'
import { doc, slide, selection, settings, native, update, updateSlide, openDialog, theme as themeSig, pane } from '../../core/store.js'
import { THEMES, makeDocTheme, newSlide, themeById } from '../../core/themes.js'
import { SLIDE_SIZES } from '../../core/model.js'
import { Group, Col, Row, Gallery, NumField, Check, Select, PickGrid } from '../controls.jsx'
import { Btn, Drop, Split, Icon, runCmd, A, closePop } from './common.jsx'
import { SlideThumb } from '../Thumbs.jsx'
import { TRANSITIONS, transitionById, ANIMS, ANIM_KIND, animById, DIR_LABEL } from '../../show/effects.js'

export const previewReq = signal(null) // { kind: 'transition' | 'animations' }

// ---------- theme previews ----------
const sampleCache = new Map()
export function themeSample (themeId, variant, size, title = 'Aa') {
  const key = themeId + ':' + variant + ':' + size.w + 'x' + size.h + ':' + title
  if (!sampleCache.has(key)) {
    const theme = makeDocTheme(themeId, variant)
    const s = newSlide('title', size, theme)
    const t = s.elements.find(e => e.ph === 'title')
    if (t) t.html = `<p>${title}</p>`
    const sub = s.elements.find(e => e.ph === 'subTitle')
    if (sub) sub.html = '<p>' + theme.name + '</p>'
    sampleCache.set(key, { slide: s, theme })
  }
  return sampleCache.get(key)
}
export function ThemeThumb ({ id, variant = 0, w = 112, title }) {
  const d = doc.value
  const size = d?.size || { w: 960, h: 540 }
  const smp = themeSample(id, variant, size, title)
  return <SlideThumb slide={smp.slide} theme={smp.theme} size={size} hf={null} index={0} w={w} ctx={'tt' + id + variant} />
}
const themeItems = () => THEMES.map(t => ({ id: t.id, label: t.name }))
const paletteOf = c => ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(k => c[k])
function Palette ({ colors }) {
  return <span class="palette">{paletteOf(colors).slice(2).map((c, i) => <i key={i} style={{ background: c }} />)}</span>
}
const FONT_PAIRS = [['Calibri Light', 'Calibri'], ['Segoe UI Semibold', 'Segoe UI'], ['Georgia', 'Segoe UI'], ['Bahnschrift', 'Segoe UI'], ['Cambria', 'Calibri'], ['Constantia', 'Corbel'], ['Trebuchet MS', 'Trebuchet MS'], ['Arial Black', 'Arial'], ['Franklin Gothic Medium', 'Franklin Gothic Book'], ['Century Gothic', 'Century Gothic'], ['Garamond', 'Garamond'], ['Times New Roman', 'Arial'], ['Tw Cen MT', 'Tw Cen MT'], ['Corbel', 'Corbel'], ['Candara', 'Candara'], ['Consolas', 'Segoe UI']]

export function DesignTab () {
  const d = doc.value
  const t = d.theme
  const spec = themeById(t.id)
  const imported = t.id === 'imported'
  const s = slide.value
  return (
    <>
      <Group label="Themes">
        <Gallery items={themeItems()} visible={5} itemW={98} itemH={58} expandCols={4} cls="gal-themes"
          render={it => <ThemeThumb id={it.id} w={92} />} isCurrent={it => it.id === t.id} onPick={it => A.applyTheme(it.id, 0)} title="Prizma themes" />
      </Group>
      <Group label="Variants">
        {!imported
          ? <Gallery items={spec.variants.map((v, i) => ({ i, label: v.name }))} visible={4} itemW={70} itemH={44} expandCols={4}
              render={it => <ThemeThumb id={t.id} variant={it.i} w={64} title="" />} isCurrent={it => it.i === t.variant} onPick={it => A.applyVariant(it.i)} />
          : <div class="rg-note">Variants come with Prizma themes. Pick a theme to restyle this deck, or edit its colors and fonts.</div>}
        <Col>
          <Drop icon="palette" label="Colors" render={() => (
            <div class="pop-pad pal-list">
              <div class="cp-h">Office-style palettes</div>
              {THEMES.flatMap(th => th.variants.map((v, i) => { const c = { ...th.colors, ...v.colors }; return (
                <button key={th.id + i} class="mi pal-item" onClick={() => { closePop(); A.setThemeColors(c) }}><Palette colors={c} /><span class="mi-l">{th.name}{th.variants.length > 1 ? ', ' + v.name : ''}</span></button>
              ) }))}
              <div class="msep" />
              <button class="mi" onClick={() => { closePop(); openDialog('themeColors') }}><span class="mi-ic"><Icon name="pipette" size={15} /></span><span class="mi-l">Customize colors…</span></button>
            </div>
          )} />
          <Drop icon="type" label="Fonts" render={() => (
            <div class="pop-pad font-pairs">
              {FONT_PAIRS.map(([ma, mi]) => (
                <button key={ma + mi} class="mi fp-item" onClick={() => { closePop(); A.setThemeFonts({ major: ma, minor: mi }) }}>
                  <span class="fp-aa" style={{ fontFamily: `"${ma}"` }}>Aa</span>
                  <span class="mi-l"><b style={{ fontFamily: `"${ma}"` }}>{ma}</b><small style={{ fontFamily: `"${mi}"` }}>{mi}</small></span>
                </button>
              ))}
              <div class="msep" />
              <button class="mi" onClick={() => { closePop(); openDialog('themeFonts') }}><span class="mi-ic"><Icon name="text-cursor" size={15} /></span><span class="mi-l">Customize fonts…</span></button>
            </div>
          )} />
          <Check label="Hide background graphics" checked={!!s?.hideMaster} onChange={v => A.setHideMaster(v)} />
        </Col>
      </Group>
      <Group label="Customize">
        <Drop size="lg" icon="ratio" label="Slide size" menu={() => [
          ...SLIDE_SIZES.slice(0, 2).map(z => ({ label: z.label, checked: Math.abs(d.size.w / d.size.h - z.w / z.h) < 0.01, run: () => openDialog('size', { preset: z.id }) })),
          { sep: true },
          { label: 'Custom slide size…', icon: 'scaling', run: () => openDialog('size') }
        ]} />
        <Btn size="lg" icon="paint-bucket" label="Format background" onClick={() => runCmd('design.bg')} />
      </Group>
    </>
  )
}

// ---------- transitions ----------
export function TransitionsTab () {
  const s = slide.value
  const t = s?.transition
  const cur = t?.type || 'none'
  const def = transitionById(cur)
  return (
    <>
      <Group label="Preview">
        <Btn size="lg" icon="play" label="Preview" disabled={cur === 'none'} onClick={() => { previewReq.value = { kind: 'transition' } }} />
      </Group>
      <Group label="Transition to this slide">
        <Gallery items={TRANSITIONS} visible={9} itemW={60} itemH={58} expandCols={6} cls="gal-fx"
          render={it => <span class="fx-item"><Icon name={it.icon} size={20} stroke={1.5} /><span>{it.label}</span></span>}
          isCurrent={it => it.id === cur} onPick={it => A.setTransition(it.id === 'none' ? null : { type: it.id, dir: it.dir })} />
        <Drop size="lg" icon="settings-2" label="Effect options" disabled={!def.dirs} menu={() => (def.dirs || []).map(dd => ({ label: DIR_LABEL[dd] || dd, checked: (t?.dir || def.dir) === dd, run: () => A.setTransition({ dir: dd }) }))} />
      </Group>
      <Group label="Timing">
        <Col>
          <NumField label="Duration" icon="timer" value={t?.dur ?? 0.8} step={0.25} min={0.1} max={60} width={150} disabled={!t} fmt={v => v.toFixed(2) + ' s'} parse={x => parseFloat(String(x).replace(',', '.'))} onChange={v => A.setTransition({ dur: v })} />
          <Btn icon="copy-check" label="Apply to all" desc="Use this slide's transition and timing on every slide." onClick={() => {
            const tr = s.transition ? { ...s.transition } : null
            update(dd => { for (const x of dd.slides) { x.transition = tr ? { ...tr } : null; x.advanceAfter = s.advanceAfter ?? null; x.advanceClick = s.advanceClick } })
          }} />
        </Col>
        <Col>
          <span class="rg-cap">Advance slide</span>
          <Check label="On mouse click" checked={s?.advanceClick !== false} onChange={v => updateSlide(x => { x.advanceClick = v })} />
          <Row>
            <Check label="After" checked={s?.advanceAfter != null} onChange={v => updateSlide(x => { x.advanceAfter = v ? (x.advanceAfter ?? 5) : null })} />
            <NumField tip="Advance after" value={s?.advanceAfter ?? 0} disabled={s?.advanceAfter == null} step={1} min={0} max={3600} width={86} fmt={v => v.toFixed(1) + ' s'} parse={x => parseFloat(String(x).replace(',', '.'))} onChange={v => updateSlide(x => { x.advanceAfter = v })} />
          </Row>
        </Col>
      </Group>
    </>
  )
}

// ---------- animations ----------
export const animItems = () => {
  const out = []
  for (const kind of ['entr', 'emph', 'exit']) { out.push({ header: ANIM_KIND[kind] }); out.push(...ANIMS.filter(a => a.kind === kind)) }
  return out
}
export const renderAnim = it => <span class={'fx-item fx-' + it.kind}><Icon name={it.icon} size={20} stroke={1.5} /><span>{it.label}</span></span>
export function AnimationsTab () {
  const s = slide.value
  const anims = s?.animations || []
  const sel = selection.value
  const curA = anims.find(a => sel.includes(a.el))
  const def = curA ? animById(curA.effect) : null
  const dis = !sel.length
  const upd = patch => { if (curA) for (const a of anims.filter(x => sel.includes(x.el))) A.updateAnimation(a.id, patch) }
  return (
    <>
      <Group label="Preview">
        <Btn size="lg" icon="play" label="Preview" disabled={!anims.length} onClick={() => { previewReq.value = { kind: 'animations' } }} />
      </Group>
      <Group label="Animation">
        <Gallery items={animItems()} visible={6} itemW={74} itemH={58} expandCols={6} cls="gal-fx"
          render={renderAnim} isCurrent={it => curA?.effect === it.id} onPick={it => { if (dis) return; A.addAnimation(it.id, it.kind, true) }} />
        <Drop size="lg" icon="settings-2" label="Effect options" disabled={!def?.dirs} menu={() => (def?.dirs || []).map(dd => ({ label: DIR_LABEL[dd] || dd, checked: (curA?.dir || def.dir) === dd, run: () => upd({ dir: dd }) }))} />
      </Group>
      <Group label="Advanced animation">
        <Drop size="lg" icon="star" label="Add animation" disabled={dis} desc="Add another effect to the selected object, keeping the ones it has." render={() => (
          <div class="pop-pad"><PickGrid items={animItems()} cols={6} itemW={74} itemH={58} render={renderAnim} onPick={it => A.addAnimation(it.id, it.kind, false)} /></div>
        )} />
        <Col>
          <Btn icon="list-video" label="Animation pane" active={pane.value === 'anim'} onClick={() => runCmd('view.animPane')} />
          <Btn icon="circle-off" label="Remove" disabled={!curA} onClick={() => A.removeAnimationsOfSelection()} />
        </Col>
      </Group>
      <Group label="Timing">
        <Col cls="timing-col">
          <Row><span class="rl">Start</span><Select width={128} value={curA?.start || 'click'} disabled={!curA} onChange={v => upd({ start: v })} options={[{ value: 'click', label: 'On click' }, { value: 'with', label: 'With previous' }, { value: 'after', label: 'After previous' }]} /></Row>
          <Row><span class="rl">Duration</span><NumField tip="Duration" value={curA?.dur ?? 0.5} disabled={!curA} step={0.25} min={0.05} max={60} width={128} fmt={v => v.toFixed(2) + ' s'} parse={x => parseFloat(String(x).replace(',', '.'))} onChange={v => upd({ dur: v })} /></Row>
          <Row><span class="rl">Delay</span><NumField tip="Delay" value={curA?.delay ?? 0} disabled={!curA} step={0.25} min={0} max={60} width={128} fmt={v => v.toFixed(2) + ' s'} parse={x => parseFloat(String(x).replace(',', '.'))} onChange={v => upd({ delay: v })} /></Row>
        </Col>
        <Col>
          <span class="rg-cap">Reorder animation</span>
          <Btn icon="arrow-up" label="Move earlier" disabled={!curA || anims.indexOf(curA) === 0} onClick={() => A.moveAnimation(curA.id, -1)} />
          <Btn icon="arrow-down" label="Move later" disabled={!curA || anims.indexOf(curA) === anims.length - 1} onClick={() => A.moveAnimation(curA.id, 1)} />
        </Col>
      </Group>
    </>
  )
}

// ---------- slide show ----------
export function SlideShowTab () {
  const d = doc.value
  const s = slide.value
  const [displays, setDisplays] = useState([])
  useEffect(() => { native?.displays().then(setDisplays).catch(() => {}) }, [])
  const setShow = patch => update(dd => { dd.show = { ...(dd.show || {}), ...patch } })
  return (
    <>
      <Group label="Start slide show">
        <Btn size="lg" icon="play" label="From beginning" kbd="F5" onClick={() => runCmd('show.start')} />
        <Btn size="lg" icon="presentation" label="From current slide" kbd="Shift+F5" onClick={() => runCmd('show.current')} />
        <Btn size="lg" icon="monitor-speaker" label="Presenter view" kbd="Alt+F5" desc="See your notes, the next slide and a timer while the audience sees the slides." onClick={() => runCmd('show.presenter')} />
      </Group>
      <Group label="Set up">
        <Btn size="lg" icon="settings-2" label="Set up slide show" onClick={() => runCmd('show.setup')} />
        <Btn size="lg" icon={s?.hidden ? 'eye' : 'eye-off'} label="Hide slide" active={!!s?.hidden} onClick={() => runCmd('slide.hide')} />
        <Btn size="lg" icon="timer" label="Rehearse timings" desc="Run the show with a stopwatch and keep the time spent on each slide." onClick={() => runCmd('show.rehearse')} />
        <Col>
          <Check label="Use timings" checked={d.show?.useTimings !== false} onChange={v => setShow({ useTimings: v })} />
          <Check label="Loop until Esc" checked={!!d.show?.loop} onChange={v => setShow({ loop: v })} />
          <Check label="Show media controls" checked={d.show?.mediaControls !== false} onChange={v => setShow({ mediaControls: v })} />
        </Col>
      </Group>
      <Group label="Monitors">
        <Col>
          <Row><Icon name="monitor" size={15} /><Select width={170} value={String(d.show?.display || 'auto')} onChange={v => setShow({ display: v })} options={[{ value: 'auto', label: 'Automatic' }, ...displays.map((x, i) => ({ value: String(x.id), label: `${x.primary ? 'Primary' : 'Monitor ' + (i + 1)} (${x.width}×${x.height})` }))]} /></Row>
          <Check label="Use presenter view" checked={settings.value.presenterView !== false} onChange={v => { settings.value = { ...settings.value, presenterView: v }; native?.setSettings({ presenterView: v }) }} />
        </Col>
      </Group>
    </>
  )
}

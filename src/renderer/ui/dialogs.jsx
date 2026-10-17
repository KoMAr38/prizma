// Modal dialogs and the floating Find/Replace panel.
import { useState, useEffect, useRef, useMemo } from 'preact/hooks'
import {
  dialog, closeDialog, doc, slide, slideIdx, selection, selected, editing, editCell, editorReq, settings, fonts, zoom, fitZoom, native, update, updateEl,
  select, goSlide, toast, appInfo, theme as themeSig, finishEditing, findState, recentColors
} from '../core/store.js'
import { SLIDE_SIZES, hexColor, textBox, findEl } from '../core/model.js'
import { textOf, FONT_SIZES, searchRe } from '../core/html.js'
import * as A from '../core/actions.js'
import { Icon, ICON_NAMES } from './Icon.jsx'
import { NumField, Check, Radio, Select, Combo, TextInput, Field, unitFmt, unitParse, Swatch } from './controls.jsx'
import { pop } from './popover.jsx'
import { CHART_TYPES } from '../render/chart.jsx'
import { activeEditor, applyRun, applyPara, liveState } from '../editor/richEdit.js'
import { fmtState, fontLabel, setFontFace, setFontSize, textRun, textPara, CMDS, refitSoon } from '../app/commands.js'
import { fontOptions, renderFont } from './ribbon/home.jsx'
import { SlideThumb } from './Thumbs.jsx'
import { previewReq } from './ribbon/design.jsx'

export function Dialog ({ title, children, footer, width = 460, onClose = closeDialog, cls = '', onEnter }) {
  const ref = useRef(null)
  const live = useRef(null)
  live.current = { onClose, onEnter } // the key listener lives as long as the dialog; it must see the latest field values
  const [back] = useState(() => document.activeElement) // read before the dialog takes the focus
  useEffect(() => {
    const key = e => {
      const { onClose, onEnter } = live.current
      if (e.key === 'Escape' && !pop.value) { e.stopPropagation(); onClose() } // with a dropdown open, Esc closes only the dropdown
      // Tab and Shift+Tab go round the dialog's own controls and never reach the window behind it
      if (e.key === 'Tab') {
        const f = [...ref.current.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')].filter(x => x.tabIndex >= 0 && !x.matches(':disabled') && x.getClientRects().length)
        const i = f.indexOf(document.activeElement)
        if (!ref.current.contains(document.activeElement) || i === (e.shiftKey ? 0 : f.length - 1)) { e.preventDefault(); f.at(e.shiftKey ? -1 : 0)?.focus() }
      }
      // Enter on a focused Cancel or OK presses that button; anywhere else (a field, a picked item) it means OK, which
      // runs once the field has taken the typed value (its own Enter handler comes after this one) and the dialog has
      // re-rendered with it
      if (e.key === 'Enter' && onEnter && !(e.target.tagName === 'TEXTAREA') && !e.target.closest('.combo, .dlg-f button, .dlg-h button')) { e.preventDefault(); setTimeout(() => live.current.onEnter?.()) }
    }
    window.addEventListener('keydown', key, true)
    setTimeout(() => { const f = ref.current?.querySelector('[autofocus], input, textarea, select, button.btn-primary'); f?.focus() }, 30)
    return () => {
      window.removeEventListener('keydown', key, true)
      live.current = {}
      // the keyboard goes back where it was (the text being edited, a ribbon button), unless something took it
      setTimeout(() => { const a = document.activeElement; if ((!a || a === document.body) && back?.isConnected) back.focus?.() })
    }
  }, [])
  return (
    <div class="modal" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div class={'dlg ' + cls} ref={ref} style={{ width: width + 'px' }} role="dialog" aria-modal="true" aria-label={title}>
        <div class="dlg-h"><h2>{title}</h2><button class="pane-x" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button></div>
        <div class="dlg-b">{children}</div>
        {footer && <div class="dlg-f">{footer}</div>}
      </div>
    </div>
  )
}
const Btn2 = ({ primary, onClick, children, disabled, danger }) => <button class={'btn' + (primary ? ' btn-primary' : '') + (danger ? ' btn-danger' : '')} onClick={onClick} disabled={disabled}>{children}</button>
const OkCancel = ({ onOk, ok = 'OK', disabled }) => <><Btn2 onClick={closeDialog}>Cancel</Btn2><Btn2 primary onClick={onOk} disabled={disabled}>{ok}</Btn2></>

function MessageDlg ({ title, text, link }) {
  return (
    <Dialog title={title} width={440} onEnter={closeDialog} footer={<>{link && <Btn2 onClick={() => native.openExternal(link.url)}>{link.label}</Btn2>}<Btn2 primary onClick={closeDialog}>OK</Btn2></>}>
      <p class="dlg-text">{text}</p>
    </Dialog>
  )
}
function ConfirmDlg ({ title, text, buttons, resolve }) {
  const done = id => { closeDialog(); resolve(id) }
  return (
    <Dialog title={title} width={440} onClose={() => done('cancel')} onEnter={() => done(buttons.find(b => b.primary)?.id)}
      footer={buttons.map(b => <Btn2 key={b.id} primary={b.primary} danger={b.danger} onClick={() => done(b.id)}>{b.label}</Btn2>)}>
      <p class="dlg-text">{text}</p>
    </Dialog>
  )
}

function TableDlg () {
  const [r, setR] = useState(3), [c, setC] = useState(4)
  const ok = () => { closeDialog(); A.insertTable(r, c) }
  return (
    <Dialog title="Insert table" width={320} onEnter={ok} footer={<OkCancel onOk={ok} />}>
      <Field label="Number of columns"><NumField value={c} min={1} max={30} onChange={v => setC(Math.round(v))} /></Field>
      <Field label="Number of rows"><NumField value={r} min={1} max={60} onChange={v => setR(Math.round(v))} /></Field>
    </Dialog>
  )
}
function ChartDlg () {
  const [t, setT] = useState('column')
  const [g, setG] = useState('clustered')
  const ok = () => { closeDialog(); const el = A.insertChart(t); if (g !== 'clustered') A.setProps({ grouping: g }, [el.id]) }
  const stackable = t === 'column' || t === 'bar' || t === 'area'
  return (
    <Dialog title="Insert chart" width={560} onEnter={ok} footer={<OkCancel onOk={ok} />}>
      <div class="chart-types">
        {CHART_TYPES.map(c => <button key={c.id} class={'ct' + (t === c.id ? ' cur' : '')} onClick={() => { setT(c.id); setG('clustered') }} onDblClick={ok}><Icon name={c.icon} size={30} stroke={1.4} /><span>{c.label}</span></button>)}
      </div>
      {stackable && <div class="dlg-row"><Radio name="grp" label="Clustered" checked={g === 'clustered'} onChange={() => setG('clustered')} /><Radio name="grp" label="Stacked" checked={g === 'stacked'} onChange={() => setG('stacked')} /><Radio name="grp" label="100% stacked" checked={g === 'percent'} onChange={() => setG('percent')} /></div>}
      <p class="fe-note">You can change the numbers right after inserting: the data editor opens with a double-click on the chart.</p>
    </Dialog>
  )
}
function ChartDataDlg ({ id }) {
  const s = slide.value
  const el = s && findEl(s, id)?.el
  const [cats, setCats] = useState(() => [...(el?.categories || [])])
  const [series, setSeries] = useState(() => (el?.series || []).map(x => ({ ...x, values: [...x.values] })))
  if (!el) return null
  const pie = el.chartType === 'pie' || el.chartType === 'doughnut'
  const apply = (c = cats, sr = series) => updateEl(id, x => { x.categories = c; x.series = sr.map(z => ({ ...z, values: z.values.map(v => typedNumber(v) || 0) })) }, { coalesce: 'chartdata:' + id })
  const setCell = (si, ci, v) => { const ns = series.map((z, i) => i === si ? { ...z, values: z.values.map((q, j) => j === ci ? v : q) } : z); setSeries(ns); apply(cats, ns) }
  const setCat = (ci, v) => { const nc = cats.map((q, j) => j === ci ? v : q); setCats(nc); apply(nc, series) }
  const setName = (si, v) => { const ns = series.map((z, i) => i === si ? { ...z, name: v } : z); setSeries(ns); apply(cats, ns) }
  const addRow = () => { const nc = [...cats, 'Category ' + (cats.length + 1)]; const ns = series.map(z => ({ ...z, values: [...z.values, 0] })); setCats(nc); setSeries(ns); apply(nc, ns) }
  const delRow = i => { if (cats.length < 2) return; const nc = cats.filter((_, j) => j !== i); const ns = series.map(z => ({ ...z, values: z.values.filter((_, j) => j !== i) })); setCats(nc); setSeries(ns); apply(nc, ns) }
  const addCol = () => { const ns = [...series, { name: 'Series ' + (series.length + 1), values: cats.map(() => 0) }]; setSeries(ns); apply(cats, ns) }
  const delCol = i => { if (series.length < 2) return; const ns = series.filter((_, j) => j !== i); setSeries(ns); apply(cats, ns) }
  return (
    <Dialog title="Chart data" width={Math.min(900, 260 + series.length * 130)} footer={<Btn2 primary onClick={closeDialog}>Done</Btn2>}>
      <div class="sheet-wrap">
        <table class="sheet">
          <thead><tr><th />{series.map((z, si) => <th key={si}><input value={z.name} onInput={e => setName(si, e.currentTarget.value)} />{!pie && series.length > 1 && <button class="sh-x" onClick={() => delCol(si)} data-tip="Remove series"><Icon name="x" size={12} /></button>}</th>)}{!pie && <th><button class="btn btn-ic" onClick={addCol} data-tip="Add series"><Icon name="plus" size={14} /></button></th>}</tr></thead>
          <tbody>
            {cats.map((c, ci) => (
              <tr key={ci}>
                <td class="sh-cat"><input value={c} onInput={e => setCat(ci, e.currentTarget.value)} />{cats.length > 1 && <button class="sh-x" onClick={() => delRow(ci)} data-tip="Remove row"><Icon name="x" size={12} /></button>}</td>
                {series.map((z, si) => <td key={si}><input class="num-in" value={z.values[ci]} onInput={e => setCell(si, ci, e.currentTarget.value)} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <button class="btn btn-sm" onClick={addRow}><Icon name="plus" size={13} />Add row</button>
      </div>
      <p class="fe-note">Changes show on the slide as you type.</p>
    </Dialog>
  )
}

// A number typed the way people write it: 1,5 and 1.5, with spaces or a dot or comma for thousands (1 234,5, 1.234,5, 1,234.5)
function typedNumber (v) {
  let t = String(v).replace(/\s/g, '')
  if (t.includes(',') && t.includes('.')) t = t.indexOf(',') < t.indexOf('.') ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(',', '.')
  return Number(t)
}
function IconsDlg () {
  const [q, setQ] = useState('')
  const [pick, setPick] = useState([])
  const list = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/\s+/g, '-')
    const all = ICON_NAMES.map(n => n.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase())
    const uniq = [...new Set(all)]
    return (t ? uniq.filter(n => n.includes(t)) : uniq).slice(0, 360)
  }, [q])
  const ok = (list = pick) => {
    closeDialog()
    const z = doc.value.size
    list.forEach((n, i) => { const el = A.insertIcon(n); A.setGeometry(el.id, { x: z.w / 2 - 36 + i * 24 - list.length * 12, y: z.h / 2 - 36 + i * 12 }) })
  }
  return (
    <Dialog title="Insert icons" width={720} cls="dlg-icons" onEnter={() => pick.length && ok()} footer={<><span class="fe-note">{pick.length ? `${pick.length} selected` : 'Click icons to select them'}</span><OkCancel ok="Insert" onOk={() => ok()} disabled={!pick.length} /></>}>
      <div class="search-in"><Icon name="search" size={15} /><input autoFocus value={q} placeholder="Search icons, e.g. arrow, chart, user" onInput={e => setQ(e.currentTarget.value)} /></div>
      <div class="icon-grid">
        {list.map(n => <button key={n} class={'icon-cell' + (pick.includes(n) ? ' cur' : '')} data-tip={n.replace(/-/g, ' ')} onClick={() => setPick(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n])} onDblClick={() => ok([n])}><Icon name={n} size={26} stroke={1.5} /></button>)}
        {!list.length && <div class="pane-empty">No icons match “{q}”.</div>}
      </div>
    </Dialog>
  )
}

const SYMBOL_SETS = [
  ['Common', '©®™°±×÷µ¶§•…–—‘’“”«»‹›€£¥¢¤¿¡¼½¾¹²³ªº'],
  ['Arrows', '←↑→↓↔↕↖↗↘↙⇐⇑⇒⇓⇔⇕➔➜➝➞➟➠➡➢➣➤↺↻⟲⟳'],
  ['Math', '∀∂∃∅∇∈∉∋∏∑−∓∗√∝∞∠∧∨∩∪∫∴∵∼≈≠≡≤≥⊂⊃⊆⊇⊕⊗⊥⋅⌈⌉⌊⌋π∆Ωαβγδεθλμσφψω'],
  ['Currency', '$€£¥¢₹₽₩₪₫₺₴₦₱₲₵₸₿'],
  ['Shapes', '■□▢▣▤▥▦▧▨▩▪▫▬▭▮▯▰▱▲△▴▵▶▷▸▹►▻▼▽▾▿◀◁◂◃◄◅◆◇◈◉◊○◌◍◎●◐◑◒◓◔◕◖◗◘◙◢◣◤◥◦◯★☆'],
  ['Symbols', '☀☁☂☃☄☎☏☐☑☒☕☘☚☛☜☝☞☟☠☢☣☮☯☹☺☻☼♀♂♠♣♥♦♪♫♬⚑⚐⚠⚡⚙✂✆✈✉✍✎✏✓✔✕✖✗✘✚✜✝✠✡✦✧✩✪✫✬✭✮✯✰❄❌❍❏❐❑❒❖❘❙❚❛❜❝❞❤'],
  ['Greek', 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω'],
  ['Serbian', 'ČĆĐŠŽčćđšžЉЊЏЂЋЈљњџђћјЖжШшЧчЦц'],
  ['Norwegian', 'ÆØÅæøåÄÖÜäöüß']
]
let recentSymbols = []
function SymbolDlg () {
  const [set, setSet] = useState(0)
  const [ch, setCh] = useState(SYMBOL_SETS[0][1][0])
  const insert = c => {
    recentSymbols = [c, ...recentSymbols.filter(x => x !== c)].slice(0, 16)
    if (activeEditor()) { closeDialog(); setTimeout(() => document.execCommand('insertText', false, c), 20); return }
    closeDialog()
    A.insertSymbol(c)
  }
  return (
    <Dialog title="Symbol" width={560} onEnter={() => insert(ch)} footer={<><span class="sym-big">{ch}</span><span class="fe-note">U+{ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}</span><OkCancel ok="Insert" onOk={() => insert(ch)} /></>}>
      <div class="seg">{SYMBOL_SETS.map(([n], i) => <button key={n} class={i === set ? 'on' : ''} onClick={() => setSet(i)}>{n}</button>)}</div>
      <div class="sym-grid">{[...SYMBOL_SETS[set][1]].map(c => <button key={c} class={c === ch ? 'cur' : ''} onClick={() => setCh(c)} onDblClick={() => insert(c)}>{c}</button>)}</div>
      {recentSymbols.length > 0 && <><div class="cp-h">Recently used</div><div class="sym-grid">{recentSymbols.map(c => <button key={c} onClick={() => setCh(c)} onDblClick={() => insert(c)}>{c}</button>)}</div></>}
    </Dialog>
  )
}

function LinkDlg () {
  const ed = activeEditor()
  const sel = window.getSelection()
  const selText = ed && sel.rangeCount ? sel.toString() : ''
  const el = selected.value[0]
  const cur = el?.link || {}
  const [mode, setMode] = useState(cur.slide !== undefined ? 'slide' : cur.url?.startsWith('mailto:') ? 'mail' : 'web')
  const [url, setUrl] = useState(cur.url && !cur.url.startsWith('mailto:') ? cur.url : '')
  const [mail, setMail] = useState(cur.url?.startsWith('mailto:') ? cur.url.slice(7).split('?')[0] : '')
  const [subj, setSubj] = useState('')
  const d = doc.value
  const [target, setTarget] = useState(() => Math.max(0, d.slides.findIndex(s => s.id === cur.slide)))
  const [text, setText] = useState(selText)
  const range = useRef(ed && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null)
  const ok = () => {
    let link
    if (mode === 'web') { let u = url.trim(); if (!u) return; if (!/^[a-z]+:/i.test(u)) u = 'https://' + u; link = { url: u } }
    else if (mode === 'mail') { if (!mail.trim()) return; link = { url: 'mailto:' + mail.trim() + (subj ? '?subject=' + encodeURIComponent(subj) : '') } }
    else link = { slide: d.slides[target].id }
    closeDialog()
    if (ed && range.current) {
      const s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(range.current); ed.el.focus()
      const href = link.url || '#slide:' + link.slide
      if (range.current.collapsed) document.execCommand('insertHTML', false, `<a href="${href.replace(/"/g, '&quot;')}">${(text || href).replace(/</g, '&lt;')}</a>`)
      else document.execCommand('createLink', false, href)
      ed.commit()
      return
    }
    if (!selection.value.length) {
      const z = d.size
      A.insertElement(textBox({ x: z.w * 0.3, y: z.h * 0.45, w: z.w * 0.4, h: 30 }, `<p><a href="${(link.url || '#slide:' + link.slide).replace(/"/g, '&quot;')}">${(text || link.url || 'Slide ' + (target + 1)).replace(/</g, '&lt;')}</a></p>`))
      return
    }
    A.setLink(link)
  }
  return (
    <Dialog title="Insert link" width={560} onEnter={ok} footer={<>{(el?.link) && <Btn2 danger onClick={() => { closeDialog(); A.setLink(null) }}>Remove link</Btn2>}<OkCancel onOk={ok} /></>}>
      <div class="seg"><button class={mode === 'web' ? 'on' : ''} onClick={() => setMode('web')}><Icon name="globe" size={14} />Web page</button><button class={mode === 'slide' ? 'on' : ''} onClick={() => setMode('slide')}><Icon name="presentation" size={14} />Slide in this deck</button><button class={mode === 'mail' ? 'on' : ''} onClick={() => setMode('mail')}><Icon name="mail" size={14} />Email</button></div>
      {(ed || !selection.value.length) && <Field label="Text to display"><TextInput value={text} onChange={setText} placeholder="Shown on the slide" /></Field>}
      {mode === 'web' && <Field label="Address"><TextInput autoFocus value={url} onChange={setUrl} placeholder="https://" /></Field>}
      {mode === 'mail' && <><Field label="Email address"><TextInput autoFocus value={mail} onChange={setMail} placeholder="name@example.com" /></Field><Field label="Subject"><TextInput value={subj} onChange={setSubj} /></Field></>}
      {mode === 'slide' && (
        <div class="slide-pick">
          {d.slides.map((s, i) => <button key={s.id} class={i === target ? 'cur' : ''} onClick={() => setTarget(i)}><SlideThumb slide={s} theme={d.theme} size={d.size} hf={d.hf} index={i} w={120} ctx="lk" /><span>{i + 1}</span></button>)}
        </div>
      )}
    </Dialog>
  )
}
function AltDlg () {
  const el = selected.value[0]
  const [v, setV] = useState(el?.alt || '')
  const ok = () => { closeDialog(); A.setProps({ alt: v.trim() || undefined }, [el.id]) }
  if (!el) return null
  return (
    <Dialog title="Alt text" width={440} footer={<OkCancel onOk={ok} />}>
      <p class="fe-note">How would you describe this object and its context to someone who can't see it?</p>
      <TextInput multiline rows={4} autoFocus value={v} onChange={setV} placeholder="Description" />
      <Check label="Mark as decorative" checked={v === '(decorative)'} onChange={c => setV(c ? '(decorative)' : '')} />
    </Dialog>
  )
}
function HfDlg () {
  const d = doc.value
  const [hf, setHf] = useState({ ...d.hf })
  const set = patch => setHf(h => ({ ...h, ...patch }))
  const ok = () => { closeDialog(); update(dd => { dd.hf = { ...hf } }) }
  return (
    <Dialog title="Header & footer" width={480} onEnter={ok} footer={<OkCancel ok="Apply to all" onOk={ok} />}>
      <Check label="Date and time" checked={!!hf.date} onChange={v => set({ date: v })} />
      {hf.date && <div class="dlg-indent">
        <Radio name="dt" label={`Update automatically (${new Date().toLocaleDateString()})`} checked={!hf.dateText} onChange={() => set({ dateText: '' })} />
        <Radio name="dt" label="Fixed" checked={!!hf.dateText} onChange={() => set({ dateText: hf.dateText || new Date().toLocaleDateString() })} />
        {hf.dateText && <TextInput value={hf.dateText} onChange={v => set({ dateText: v })} />}
      </div>}
      <Check label="Slide number" checked={!!hf.number} onChange={v => set({ number: v })} />
      <Check label="Footer" checked={!!hf.footer} onChange={v => set({ footer: v ? (hf.footer || 'Footer') : '' })} />
      {!!hf.footer && <div class="dlg-indent"><TextInput value={hf.footer} onChange={v => set({ footer: v })} /></div>}
      <Check label="Don't show on title slide" checked={hf.hideOnTitle !== false} onChange={v => set({ hideOnTitle: v })} />
    </Dialog>
  )
}
function SizeDlg ({ preset }) {
  const d = doc.value
  const start = preset ? SLIDE_SIZES.find(z => z.id === preset) : null
  const [w, setW] = useState(start ? start.w : d.size.w)
  const [h, setH] = useState(start ? start.h : d.size.h)
  const cur = SLIDE_SIZES.find(z => Math.abs(z.w - w) < 0.5 && Math.abs(z.h - h) < 0.5)
  const sameAspect = Math.abs(w / h - d.size.w / d.size.h) < 0.005
  const apply = mode => { closeDialog(); A.setSlideSize({ w, h }, mode) }
  return (
    <Dialog title="Slide size" width={440} footer={sameAspect
      ? <OkCancel onOk={() => apply('fit')} />
      : <><Btn2 onClick={closeDialog}>Cancel</Btn2><Btn2 onClick={() => apply('maximize')}>Maximize</Btn2><Btn2 primary onClick={() => apply('fit')}>Ensure fit</Btn2></>}>
      <Field label="Slides sized for"><Select value={cur?.id || 'custom'} options={[...SLIDE_SIZES.map(z => ({ value: z.id, label: z.label })), { value: 'custom', label: 'Custom' }]} onChange={v => { const z = SLIDE_SIZES.find(x => x.id === v); if (z) { setW(z.w); setH(z.h) } }} /></Field>
      <Field label="Width"><NumField value={w} min={72} max={4000} step={7.2} fmt={v => unitFmt(v)} parse={unitParse} width={120} onChange={setW} /></Field>
      <Field label="Height"><NumField value={h} min={72} max={4000} step={7.2} fmt={v => unitFmt(v)} parse={unitParse} width={120} onChange={setH} /></Field>
      <Field label="Orientation"><div class="dlg-row"><Radio name="or" label="Landscape" checked={w >= h} onChange={() => { if (w < h) { setW(h); setH(w) } }} /><Radio name="or" label="Portrait" checked={w < h} onChange={() => { if (w >= h) { setW(h); setH(w) } }} /></div></Field>
      {!sameAspect && <p class="fe-note">The shape of the slide changes. Maximize keeps content as large as possible (it may go past the edges); Ensure fit scales content down so everything stays on the slide.</p>}
    </Dialog>
  )
}
function SetupShowDlg () {
  const d = doc.value
  const [o, setO] = useState({ loop: false, useTimings: true, display: 'auto', noAnim: false, from: null, to: null, pen: '#E5484D', laser: '#FF3B30', ...(d.show || {}) })
  const [displays, setDisplays] = useState([])
  useEffect(() => { native?.displays().then(setDisplays).catch(() => {}) }, [])
  const set = p => setO(x => ({ ...x, ...p }))
  const ok = () => { closeDialog(); update(dd => { dd.show = { ...o } }) }
  const n = d.slides.length
  return (
    <Dialog title="Set up slide show" width={560} onEnter={ok} footer={<OkCancel onOk={ok} />}>
      <div class="dlg-cols">
        <div>
          <div class="cp-h">Show options</div>
          <Check label="Loop continuously until Esc" checked={!!o.loop} onChange={v => set({ loop: v })} />
          <Check label="Show without animation" checked={!!o.noAnim} onChange={v => set({ noAnim: v })} />
          <Field label="Pen color"><Swatch value={o.pen} onPick={c => set({ pen: c })} /></Field>
          <Field label="Laser pointer"><Swatch value={o.laser} onPick={c => set({ laser: c })} /></Field>
          <div class="cp-h">Advance slides</div>
          <Radio name="adv" label="Manually" checked={!o.useTimings} onChange={() => set({ useTimings: false })} />
          <Radio name="adv" label="Using timings, if present" checked={o.useTimings !== false} onChange={() => set({ useTimings: true })} />
        </div>
        <div>
          <div class="cp-h">Show slides</div>
          <Radio name="rng" label="All" checked={!o.from} onChange={() => set({ from: null, to: null })} />
          <Radio name="rng" label="From…to" checked={!!o.from} onChange={() => set({ from: 1, to: n })} />
          {o.from && <div class="dlg-row"><NumField value={o.from} min={1} max={n} width={70} tip="First slide" onChange={v => set({ from: Math.round(v) })} /><span>to</span><NumField value={o.to || n} min={1} max={n} width={70} tip="Last slide" onChange={v => set({ to: Math.round(v) })} /></div>}
          <div class="cp-h">Monitors</div>
          <Field label="Slide show monitor"><Select value={String(o.display || 'auto')} onChange={v => set({ display: v })} options={[{ value: 'auto', label: 'Automatic' }, ...displays.map((x, i) => ({ value: String(x.id), label: `${x.primary ? 'Primary' : 'Monitor ' + (i + 1)} (${x.width}×${x.height})` }))]} /></Field>
          <Check label="Use presenter view" checked={settings.value.presenterView !== false} onChange={v => { settings.value = { ...settings.value, presenterView: v }; native?.setSettings({ presenterView: v }) }} />
        </div>
      </div>
    </Dialog>
  )
}
function ZoomDlg () {
  const cur = Math.round((zoom.value || fitZoom.value) * 100)
  const [v, setV] = useState(cur)
  const [fit, setFit] = useState(zoom.value === 0)
  const ok = () => { closeDialog(); zoom.value = fit ? 0 : Math.max(10, Math.min(400, v)) / 100 }
  return (
    <Dialog title="Zoom" width={300} onEnter={ok} footer={<OkCancel onOk={ok} />}>
      <Radio name="z" label="Fit" checked={fit} onChange={() => setFit(true)} />
      {[400, 200, 100, 66, 50, 33].map(p => <Radio key={p} name="z" label={p + '%'} checked={!fit && v === p} onChange={() => { setFit(false); setV(p) }} />)}
      <Field label="Percent"><NumField value={v} min={10} max={400} step={10} fmt={x => x + '%'} onChange={x => { setFit(false); setV(Math.round(x)) }} /></Field>
    </Dialog>
  )
}
function ParagraphDlg () {
  const st = fmtState.value || {}
  const live = liveState()
  const p0 = live?.para || null
  const els = A.textTargets()
  const firstP = (() => { if (p0) return p0; const h = els[0]?.html; if (!h) return null; const t = document.createElement('template'); t.innerHTML = h; return t.content.querySelector('p') })()
  const ps = firstP?.style || {}
  const num = v => parseFloat(v) || 0
  const [align, setAlign] = useState(st.align || ps.textAlign || 'left')
  const [before, setBefore] = useState(num(ps.marginLeft) + Math.min(0, num(ps.textIndent)))
  const [special, setSpecial] = useState(num(ps.textIndent) < 0 ? 'hanging' : num(ps.textIndent) > 0 ? 'first' : 'none')
  const [by, setBy] = useState(Math.abs(num(ps.textIndent)))
  const [sb, setSb] = useState(num(ps.marginTop))
  const [sa, setSa] = useState(num(ps.marginBottom))
  const lh = ps.lineHeight || ''
  const [lsMode, setLsMode] = useState(lh.endsWith('pt') ? 'exact' : !lh ? 'single' : Math.abs(parseFloat(lh) - 1.8) < 0.01 ? '1.5' : Math.abs(parseFloat(lh) - 2.4) < 0.01 ? 'double' : 'multiple')
  const [at, setAt] = useState(lh.endsWith('pt') ? parseFloat(lh) : lh ? Math.round(parseFloat(lh) / 1.2 * 100) / 100 : 1)
  // only what was changed in the dialog is applied, so paragraphs with different alignment or spacing keep theirs
  const [init] = useState(() => ({ align, before, special, by, sb, sa, lsMode, at }))
  const ok = () => {
    closeDialog()
    const indent = special === 'hanging' ? -by : special === 'first' ? by : 0
    const ml = before + (special === 'hanging' ? by : 0)
    const line = lsMode === 'single' ? null : lsMode === '1.5' ? '1.8' : lsMode === 'double' ? '2.4' : lsMode === 'exact' ? at + 'pt' : String(Math.round(at * 1.2 * 100) / 100)
    const ind = before !== init.before || special !== init.special || by !== init.by
    const fn = p => {
      if (align !== init.align) p.style.textAlign = align
      if (ind && !p.hasAttribute('data-bu') && !p.hasAttribute('data-num')) { if (ml) p.style.marginLeft = ml + 'pt'; else p.style.removeProperty('margin-left'); if (indent) p.style.textIndent = indent + 'pt'; else p.style.removeProperty('text-indent') }
      if (sb !== init.sb) p.style.marginTop = sb + 'pt'
      if (sa !== init.sa) p.style.marginBottom = sa + 'pt'
      if (lsMode !== init.lsMode || at !== init.at) { if (line) p.style.lineHeight = line; else p.style.removeProperty('line-height') }
    }
    if (activeEditor()) { applyPara(fn); return }
    for (const e of els) {
      const doHtml = h => { const t = document.createElement('template'); t.innerHTML = h; for (const p of t.content.children) fn(p); return t.innerHTML }
      updateEl(e.id, x => { if (x.html) x.html = doHtml(x.html); if (x.type === 'table') for (const row of x.cells) for (const c of row) c.html = doHtml(c.html || '<p><br></p>') })
    }
    refitSoon()
  }
  return (
    <Dialog title="Paragraph" width={500} onEnter={ok} footer={<OkCancel onOk={ok} />}>
      <div class="cp-h">General</div>
      <Field label="Alignment"><Select value={align} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centered' }, { value: 'right', label: 'Right' }, { value: 'justify', label: 'Justified' }]} onChange={setAlign} /></Field>
      <div class="cp-h">Indentation</div>
      <div class="fe-grid">
        <Field label="Before text"><NumField value={before} min={0} step={7.2} fmt={v => unitFmt(v)} parse={unitParse} width={110} onChange={setBefore} /></Field>
        <Field label="Special"><Select value={special} options={[{ value: 'none', label: '(none)' }, { value: 'first', label: 'First line' }, { value: 'hanging', label: 'Hanging' }]} onChange={setSpecial} /></Field>
        <Field label="By"><NumField value={by} min={0} step={7.2} fmt={v => unitFmt(v)} parse={unitParse} width={110} disabled={special === 'none'} onChange={setBy} /></Field>
      </div>
      <div class="cp-h">Spacing</div>
      <div class="fe-grid">
        <Field label="Before"><NumField value={sb} min={0} step={6} fmt={v => v + ' pt'} width={110} onChange={setSb} /></Field>
        <Field label="After"><NumField value={sa} min={0} step={6} fmt={v => v + ' pt'} width={110} onChange={setSa} /></Field>
        <Field label="Line spacing"><Select value={lsMode} options={[{ value: 'single', label: 'Single' }, { value: '1.5', label: '1.5 lines' }, { value: 'double', label: 'Double' }, { value: 'exact', label: 'Exactly' }, { value: 'multiple', label: 'Multiple' }]} onChange={m => { setLsMode(m); if ((m === 'exact') !== (lsMode === 'exact')) setAt(m === 'exact' ? Math.round((st.size || 18) * 1.2) : 1) }} /></Field>
        <Field label="At"><NumField value={at} min={0.1} step={lsMode === 'exact' ? 1 : 0.1} fmt={v => lsMode === 'exact' ? v + ' pt' : String(v)} width={110} disabled={!(lsMode === 'exact' || lsMode === 'multiple')} onChange={setAt} /></Field>
      </div>
    </Dialog>
  )
}
function FontDlg () {
  const st = fmtState.value || {}
  const [font, setFont] = useState(st.font || '+minor')
  const [style, setStyle] = useState((st.bold ? 'b' : '') + (st.italic ? 'i' : ''))
  const [size, setSize] = useState(st.size || 18)
  const [color, setColor] = useState(st.color || 'dk1')
  const [u, setU] = useState(!!st.underline)
  const [strike, setStrike] = useState(!!st.strike)
  const [base, setBase] = useState(st.baseline || null)
  const [spacing, setSpacing] = useState(0)
  // only what was changed in the dialog is applied, so text with mixed fonts or sizes keeps them
  const [init] = useState(() => ({ font, style, size, color, u, strike, base }))
  const ok = () => {
    closeDialog()
    if (font !== init.font) setFontFace(font === '+major' || font === '+minor' ? fontLabel(font) : font)
    if (size !== init.size) setFontSize(size)
    if (style.includes('b') !== init.style.includes('b')) textRun('bold', style.includes('b'))
    if (style.includes('i') !== init.style.includes('i')) textRun('italic', style.includes('i'))
    if (color !== init.color) textRun('color', color)
    if (u !== init.u) textRun('underline', u)
    if (strike !== init.strike) textRun('strike', strike)
    if (base !== init.base) textRun('baseline', base)
    if (spacing) textRun('spacing', spacing)
  }
  return (
    <Dialog title="Font" width={520} onEnter={ok} footer={<OkCancel onOk={ok} />}>
      <div class="fe-grid fe-grid-3">
        <Field label="Font"><Combo width={200} listWidth={260} value={fontLabel(font)} options={fontOptions} renderOption={renderFont} onChange={v => setFont(v)} /></Field>
        <Field label="Style"><Select value={style} options={[{ value: '', label: 'Regular' }, { value: 'i', label: 'Italic' }, { value: 'b', label: 'Bold' }, { value: 'bi', label: 'Bold italic' }]} onChange={setStyle} /></Field>
        <Field label="Size"><Combo width={70} value={String(size)} options={FONT_SIZES.map(v => ({ value: v }))} onChange={v => setSize(typedNumber(v) || size)} /></Field>
      </div>
      <div class="fe-grid">
        <Field label="Font color"><Swatch value={color} onPick={c => setColor(c || 'dk1')} auto /></Field>
        <Field label="Character spacing"><NumField value={spacing} step={0.5} min={-10} max={50} fmt={v => (v > 0 ? '+' : '') + v + ' pt'} onChange={setSpacing} /></Field>
      </div>
      <div class="cp-h">Effects</div>
      <div class="dlg-row">
        <Check label="Underline" checked={u} onChange={setU} />
        <Check label="Strikethrough" checked={strike} onChange={setStrike} />
        <Check label="Superscript" checked={base === 'sup'} onChange={v => setBase(v ? 'sup' : null)} />
        <Check label="Subscript" checked={base === 'sub'} onChange={v => setBase(v ? 'sub' : null)} />
      </div>
      <div class="font-sample" style={{ fontFamily: font.startsWith('+') ? `"${font === '+major' ? themeSig.value?.fonts.major : themeSig.value?.fonts.minor}"` : `"${font}"`, fontWeight: style.includes('b') ? 700 : 400, fontStyle: style.includes('i') ? 'italic' : 'normal', textDecoration: [u && 'underline', strike && 'line-through'].filter(Boolean).join(' ') || 'none', color: hexColor(color, themeSig.value), letterSpacing: spacing + 'pt' }}>The quick brown fox jumps over the lazy dog</div>
    </Dialog>
  )
}
function WordCountDlg () {
  const d = doc.value
  const words = t => (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length
  let w = 0, c = 0, objs = 0, media = 0
  for (const s of d.slides) {
    const scan = list => list.forEach(e => {
      objs++
      if (e.html) { const t = textOf(e.html); w += words(t); c += t.replace(/\s/g, '').length }
      if (e.type === 'table') for (const row of e.cells) for (const cl of row) { const t = textOf(cl.html || ''); w += words(t); c += t.replace(/\s/g, '').length }
      if (e.type === 'video' || e.type === 'audio') media++
      if (e.children) scan(e.children)
    })
    scan(s.elements)
  }
  const notes = d.slides.reduce((a, s) => a + words(s.notes || ''), 0)
  const rows = [['Slides', d.slides.length], ['Hidden slides', d.slides.filter(s => s.hidden).length], ['Words on slides', w], ['Characters (no spaces)', c], ['Words in notes', notes], ['Objects', objs], ['Video and audio clips', media]]
  return (
    <Dialog title="Word count" width={360} onEnter={closeDialog} footer={<Btn2 primary onClick={closeDialog}>Close</Btn2>}>
      <table class="kv">{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.toLocaleString()}</td></tr>)}</table>
    </Dialog>
  )
}
const SLOT_ORDER = [['dk1', 'Text/background: dark 1'], ['lt1', 'Text/background: light 1'], ['dk2', 'Text/background: dark 2'], ['lt2', 'Text/background: light 2'], ['accent1', 'Accent 1'], ['accent2', 'Accent 2'], ['accent3', 'Accent 3'], ['accent4', 'Accent 4'], ['accent5', 'Accent 5'], ['accent6', 'Accent 6'], ['hlink', 'Hyperlink'], ['folHlink', 'Followed hyperlink']]
function ThemeColorsDlg () {
  const [c, setC] = useState({ ...themeSig.value.colors })
  const ok = () => { closeDialog(); A.setThemeColors(c) }
  return (
    <Dialog title="Customize theme colors" width={460} onEnter={ok} footer={<><Btn2 onClick={() => setC({ ...themeSig.value.colors })}>Reset</Btn2><OkCancel ok="Save" onOk={ok} /></>}>
      <div class="tc-grid">
        {SLOT_ORDER.map(([k, l]) => (
          <label key={k} class="tc-row"><span>{l}</span>
            <input type="color" value={c[k] || '#000000'} onInput={e => setC(x => ({ ...x, [k]: e.currentTarget.value.toUpperCase() }))} />
            <input class="tin tc-hex" value={c[k] || ''} onInput={e => { const v = e.currentTarget.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) setC(x => ({ ...x, [k]: v.toUpperCase() })) }} />
          </label>
        ))}
      </div>
      <div class="tc-sample" style={{ background: c.lt1, color: c.dk1 }}><b style={{ color: c.dk1 }}>Sample</b>{['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(a => <i key={a} style={{ background: c[a] }} />)}<u style={{ color: c.hlink }}>Hyperlink</u></div>
    </Dialog>
  )
}
function ThemeFontsDlg () {
  const t = themeSig.value
  const [major, setMajor] = useState(t.fonts.major)
  const [minor, setMinor] = useState(t.fonts.minor)
  const ok = () => { closeDialog(); A.setThemeFonts({ major, minor }) }
  const opts = () => fontOptions().filter(o => !o.value || !String(o.value).startsWith('+')).filter(o => !o.header || o.header === 'All fonts')
  return (
    <Dialog title="Customize theme fonts" width={460} onEnter={ok} footer={<OkCancel ok="Save" onOk={ok} />}>
      <Field label="Heading font"><Combo width={240} value={major} options={opts} renderOption={renderFont} onChange={setMajor} /></Field>
      <Field label="Body font"><Combo width={240} value={minor} options={opts} renderOption={renderFont} onChange={setMinor} /></Field>
      <div class="font-sample"><div style={{ fontFamily: `"${major}"`, fontSize: '24px', fontWeight: 600 }}>Heading</div><div style={{ fontFamily: `"${minor}"` }}>Body text body text body text. Body text body text.</div></div>
    </Dialog>
  )
}
const SHORTCUTS = [
  ['Files', [['Ctrl+N', 'New presentation'], ['Ctrl+O', 'Open'], ['Ctrl+S', 'Save'], ['F12', 'Save as'], ['Ctrl+P', 'Print'], ['Ctrl+W', 'Close presentation']]],
  ['Editing', [['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+X / C / V', 'Cut / copy / paste'], ['Ctrl+Shift+V', 'Paste text only'], ['Ctrl+D', 'Duplicate'], ['Ctrl+A', 'Select all'], ['Delete', 'Delete selection'], ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'], ['Ctrl+Shift+C / click', 'Format painter'], ['Arrow keys', 'Nudge (Shift = more, Ctrl = less)'], ['Tab', 'Select next object'], ['Enter / F2', 'Edit text of the selected object'], ['Esc', 'Leave text / clear selection']]],
  ['Text', [['Ctrl+B / I / U', 'Bold / italic / underline'], ['Ctrl+] / Ctrl+[', 'Bigger / smaller text'], ['Ctrl+L / E / R / J', 'Align left / center / right / justify'], ['Ctrl+Space', 'Clear formatting'], ['Tab / Shift+Tab', 'Indent / outdent list item'], ['Shift+Enter', 'Line break'], ['Ctrl+K', 'Insert link']]],
  ['Slides and view', [['Ctrl+M', 'New slide'], ['PageUp / PageDown', 'Previous / next slide'], ['Ctrl+Mouse wheel', 'Zoom'], ['Ctrl+F1', 'Collapse ribbon'], ['Ctrl+F / Ctrl+H', 'Find / replace'], ['Alt+Q', 'Search commands']]],
  ['Slide show', [['F5 / Shift+F5', 'Start from beginning / this slide'], ['Alt+F5', 'Presenter view'], ['Space, →, ↓, N', 'Next'], ['←, ↑, P, Backspace', 'Previous'], ['Number + Enter', 'Go to slide'], ['B / W', 'Black / white screen'], ['Ctrl+P / Ctrl+L', 'Pen / laser pointer'], ['E', 'Erase ink'], ['Esc', 'End show']]]
]
function ShortcutsDlg () {
  return (
    <Dialog title="Keyboard shortcuts" width={760} onEnter={closeDialog} footer={<Btn2 primary onClick={closeDialog}>Close</Btn2>}>
      <div class="sc-cols">
        {SHORTCUTS.map(([g, rows]) => (
          <div key={g} class="sc-group"><div class="cp-h">{g}</div><table class="kv">{rows.map(([k, l]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{l}</td></tr>)}</table></div>
        ))}
      </div>
    </Dialog>
  )
}
function AboutDlg () {
  const v = appInfo.value.version || '1.0.0'
  return (
    <Dialog title="About Prizma" width={480} onEnter={closeDialog} footer={<Btn2 primary onClick={closeDialog}>Close</Btn2>}>
      <div class="about">
        <img src="icon-256.png" alt="" />
        <div>
          <div class="about-name">Prizma</div>
          <div class="about-v">Version {v}</div>
          <p>A presentation studio for Windows. Opens and saves PowerPoint files (.pptx), and keeps everything in its own .prizma format too.</p>
          <p class="fe-note">Made for Marko Veselinović. Built with Electron, Preact, pptxtojson, PDF.js, JSZip, DOMPurify, immer and Lucide icons — thank you to their authors. Fonts: Manrope and Unbounded (SIL Open Font License).</p>
        </div>
      </div>
    </Dialog>
  )
}

// ---------- Find / Replace (floating, non-modal) ----------
function FindPanel ({ replace: withReplace }) {
  const [q, setQ] = useState(findState.value.query || (window.getSelection().toString().slice(0, 80)))
  const [r, setR] = useState(findState.value.replace || '')
  const [mc, setMc] = useState(!!findState.value.matchCase)
  const [ww, setWw] = useState(false)
  const [rep, setRep] = useState(!!withReplace)
  const [msg, setMsg] = useState('')
  const pos = useRef({ slide: slideIdx.value, id: null, n: -1 })
  useEffect(() => { findState.value = { query: q, replace: r, matchCase: mc } }, [q, r, mc])
  const hits = () => A.findAll(q, { matchCase: mc, wholeWord: ww, notes: true }).filter(h => !h.notes)
  const next = () => {
    const hs = hits()
    if (!hs.length) { setMsg(`“${q}” wasn't found.`); return }
    let i
    if (pos.current.n < 0) { i = hs.findIndex(h => h.slide >= slideIdx.value); if (i < 0) i = 0; setMsg('') } else {
      i = pos.current.n + 1
      if (i >= hs.length) { i = 0; setMsg('Reached the end; continued from the beginning.') } else setMsg('')
    }
    pos.current.n = i
    const h = hs[i]
    finishEditing()
    goSlide(h.slide)
    select([h.id])
    const el = findEl(doc.value.slides[h.slide], h.id)?.el
    const req = { find: q, matchCase: mc, wholeWord: ww, k: h.k }
    if (h.r !== undefined) { editorReq.value = req; editCell.value = { id: h.id, r: h.r, c: h.c } } else if (el && (el.type === 'text' || el.type === 'shape')) { editorReq.value = req; editing.value = h.id }
  }
  const replaceOne = () => {
    const sel = window.getSelection()
    const ed = activeEditor()
    if (ed && sel.rangeCount && (mc ? sel.toString() === q : sel.toString().toLowerCase() === q.toLowerCase())) {
      document.execCommand('insertText', false, r); ed.commit()
      // that hit is gone from the list now, so the next one has its number (unless the new text matches again)
      if (!searchRe(q, { matchCase: mc, wholeWord: ww }).test(r)) pos.current.n--
    }
    next()
  }
  const all = () => { finishEditing(); const n = A.replaceAll(q, r, { matchCase: mc, wholeWord: ww }); setMsg(n ? `Replaced ${n} occurrence${n === 1 ? '' : 's'}.` : `“${q}” wasn't found.`) }
  return (
    <div class="findpanel" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeDialog() } }}>
      <div class="dlg-h"><h2>{rep ? 'Replace' : 'Find'}</h2><button class="pane-x" aria-label="Close" onClick={closeDialog}><Icon name="x" size={16} /></button></div>
      <div class="search-in"><Icon name="search" size={14} /><input autoFocus value={q} placeholder="Find what" onInput={e => { setQ(e.currentTarget.value); pos.current = { n: -1 } }} onKeyDown={e => { if (e.key === 'Enter') next() }} /></div>
      {rep && <div class="search-in"><Icon name="replace" size={14} /><input value={r} placeholder="Replace with" onInput={e => setR(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') replaceOne() }} /></div>}
      <div class="dlg-row"><Check label="Match case" checked={mc} onChange={setMc} /><Check label="Whole words" checked={ww} onChange={setWw} /></div>
      {msg && <div class="fe-note">{msg}</div>}
      <div class="dlg-f">
        {!rep && <button class="btn" onClick={() => setRep(true)}>Replace…</button>}
        {rep && <button class="btn" disabled={!q} onClick={all}>Replace all</button>}
        {rep && <button class="btn" disabled={!q} onClick={replaceOne}>Replace</button>}
        <button class="btn btn-primary" disabled={!q} onClick={next}>Find next</button>
      </div>
    </div>
  )
}

export function Dialogs () {
  const d = dialog.value
  if (!d) return null
  const M = {
    message: MessageDlg, confirm: ConfirmDlg, table: TableDlg, chart: ChartDlg, chartData: ChartDataDlg, icons: IconsDlg, symbol: SymbolDlg, link: LinkDlg,
    alt: AltDlg, hf: HfDlg, size: SizeDlg, setupShow: SetupShowDlg, zoom: ZoomDlg, paragraph: ParagraphDlg, font: FontDlg, wordcount: WordCountDlg,
    themeColors: ThemeColorsDlg, themeFonts: ThemeFontsDlg, shortcuts: ShortcutsDlg, about: AboutDlg, find: FindPanel
  }
  const C = d.type === 'custom' ? d.C : M[d.type]
  if (!C) return null
  return <C {...d} />
}

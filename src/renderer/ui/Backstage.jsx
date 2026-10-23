// File backstage: start screen, new, open, info, save as, print, export, options.
import { useState, useEffect, useMemo } from 'preact/hooks'
import { signal } from '@preact/signals'
import {
  backstage, doc, file, appInfo, settings, recovery, native, update, slideIdx, setSetting, toast
} from '../core/store.js'
import { THEMES } from '../core/themes.js'
import { SLIDE_SIZES } from '../core/model.js'
import { Icon } from './Icon.jsx'
import { Check, Radio, Select, TextInput, Field } from './controls.jsx'
import { contextMenu } from './popover.jsx'
import { ThemeThumb } from './ribbon/design.jsx'
import { wordCount } from './dialogs.jsx'
import * as F from '../app/files.js'
import { runCmd, setUiTheme } from '../app/commands.js'
import { PrintPages, printOptsDefault } from '../print/PrintPages.jsx'

const NAV = [
  ['home', 'Home', 'house'], ['new', 'New', 'file-plus-2'], ['open', 'Open', 'folder-open'], null,
  ['info', 'Info', 'info'], ['save', 'Save', 'save'], ['saveAs', 'Save as', 'save-all'], ['print', 'Print', 'printer'], ['export', 'Export', 'file-output'], ['close', 'Close', 'x'], null,
  ['options', 'Options', 'settings']
]
const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }
const when = t => {
  const d = new Date(t), now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today, ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString()
}
const dirOf = p => p.replace(/[\\/][^\\/]*$/, '')
const extIcon = p => /\.prizma$/i.test(p) ? 'gem' : /\.pdf$/i.test(p) ? 'file-text' : /\.(odp|key|ppt)$/i.test(p) ? 'file-archive' : 'presentation'
const extColor = p => /\.prizma$/i.test(p) ? 'var(--violet)' : /\.pdf$/i.test(p) ? 'var(--coral)' : /\.(odp|key|ppt)$/i.test(p) ? 'var(--amber)' : 'var(--teal)'

export function Backstage () {
  const page = backstage.value
  if (!page) return null
  const go = id => {
    if (id === 'save') { F.save(); return }
    if (id === 'close') { backstage.value = null; F.closeDocument(); return }
    backstage.value = id
  }
  const P = { home: HomePage, new: NewPage, open: OpenPage, info: InfoPage, saveAs: SaveAsPage, print: PrintPage, export: ExportPage, options: OptionsPage }[page] || HomePage
  return (
    <div class="backstage" onKeyDown={e => { if (e.key === 'Escape' && doc.value) backstage.value = null }} tabIndex={-1}>
      <nav class="bs-nav">
        <button class="bs-back" onClick={() => { backstage.value = null }} data-tip="Back to the presentation" disabled={!doc.value}><Icon name="arrow-left" size={20} /></button>
        {NAV.map((n, i) => n ? <button key={n[0]} class={'bs-item' + (page === n[0] ? ' on' : '')} onClick={() => go(n[0])}><Icon name={n[2]} size={17} />{n[1]}</button> : <div key={'s' + i} class="bs-sep" />)}
        <span class="rtabs-fill" />
        <div class="bs-brand"><img src="mark.svg" alt="" /><span>Prizma<small>Vibe-coded by Marko&nbsp;Veselinović</small></span></div>
      </nav>
      <main class="bs-main"><P /></main>
    </div>
  )
}

function ThemeCards ({ limit, big }) {
  const list = limit ? THEMES.slice(0, limit) : THEMES
  const [vars, setVars] = useState({})
  const w = big ? 236 : 186
  return (
    <div class="bs-themes">
      <button class="bs-card" onClick={() => F.newPresentation('blank', 0)}>
        <ThemeThumb id="blank" w={w} title="" />
        <span class="bs-card-l">Blank presentation</span>
      </button>
      {list.filter(t => t.id !== 'blank').map(t => (
        <div class="bs-card" key={t.id}>
          <button class="bs-card-b" onClick={() => F.newPresentation(t.id, vars[t.id] || 0)}>
            <ThemeThumb id={t.id} variant={vars[t.id] || 0} w={w} title={t.name} />
          </button>
          <div class="bs-card-row">
            <span class="bs-card-l">{t.name}</span>
            {big && <span class="bs-vars">{t.variants.map((v, i) => <button key={i} class={(vars[t.id] || 0) === i ? 'on' : ''} style={{ background: { ...t.colors, ...v.colors }.accent1 }} data-tip={v.name} onClick={() => setVars(x => ({ ...x, [t.id]: i }))} />)}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
function RecentList ({ filter = '' }) {
  const list = (appInfo.value.recent || []).filter(r => !filter || r.name.toLowerCase().includes(filter.toLowerCase()))
  const remove = async p => { const r = await native.recent('remove', p); appInfo.value = { ...appInfo.value, recent: r } }
  if (!list.length) return <div class="bs-empty"><Icon name="clock" size={22} />Presentations you open or save show up here.</div>
  return (
    <div class="bs-recent">
      {list.map(r => (
        <button key={r.path} class="bs-file" onClick={() => F.openPath(r.path)} onContextMenu={e => contextMenu(e, [
          { label: 'Open', icon: 'folder-open', run: () => F.openPath(r.path) },
          { label: 'Open file location', icon: 'folder', run: () => native.showInFolder(r.path) },
          { label: 'Copy path', icon: 'copy', run: () => navigator.clipboard.writeText(r.path) },
          { sep: true },
          { label: 'Remove from list', icon: 'x', run: () => remove(r.path) }
        ])}>
          <span class="ic-badge bs-file-ic" style={{ '--c': extColor(r.path) }}><Icon name={extIcon(r.path)} size={17} /></span>
          <span class="bs-file-n" translate="no">{r.name}<small>{dirOf(r.path)}</small></span>
          <span class="bs-file-t">{when(r.time)}</span>
        </button>
      ))}
    </div>
  )
}
function Recovered () {
  const items = recovery.value
  if (!items.length) return null
  return (
    <section class="bs-sec bs-recover">
      <h3><Icon name="life-buoy" size={17} />Recovered presentations</h3>
      <p class="fe-note">Prizma closed before these were saved. Open one to keep working, or discard it.</p>
      {items.map(it => (
        <div class="bs-file" key={it.id}>
          <span class="ic-badge bs-file-ic" style={{ '--c': 'var(--amber)' }}><Icon name="file-clock" size={17} /></span>
          <span class="bs-file-n">{it.name || 'Presentation'}<small>Autosaved {when(it.time)}{it.path ? ' — ' + it.path : ''}</small></span>
          <button class="btn btn-primary btn-sm" onClick={() => F.openRecovered(it)}>Open</button>
          <button class="btn btn-sm" onClick={() => F.discardRecovered(it)}>Discard</button>
        </div>
      ))}
    </section>
  )
}
function HomePage () {
  const first = (settings.value.author || appInfo.value.userName || '').trim().split(/\s+/)[0] || ''
  const name = first && first[0].toUpperCase() + first.slice(1)
  const [q, setQ] = useState('')
  return (
    <div class="bs-page">
      <h1 class="bs-hello">{greet()}{name ? ', ' + name : ''}</h1>
      <section class="bs-sec">
        <h3>New</h3>
        <ThemeCards limit={4} />
        <button class="link-btn" onClick={() => { backstage.value = 'new' }}>More themes<Icon name="chevron-right" size={14} /></button>
      </section>
      <Recovered />
      <section class="bs-sec">
        <div class="bs-sec-h"><h3>Recent</h3><div class="search-in bs-search"><Icon name="search" size={14} /><input value={q} placeholder="Search recent" onInput={e => setQ(e.currentTarget.value)} /></div></div>
        <RecentList filter={q} />
        <button class="link-btn" onClick={() => runCmd('file.open')}><Icon name="folder-open" size={15} />Browse this PC…</button>
      </section>
    </div>
  )
}
function NewPage () {
  return (
    <div class="bs-page">
      <h1>New presentation</h1>
      <p class="fe-note">Pick a theme. You can switch themes, colors and fonts at any time on the Design tab.</p>
      <ThemeCards big />
    </div>
  )
}
function OpenPage () {
  const [q, setQ] = useState('')
  return (
    <div class="bs-page">
      <h1>Open</h1>
      <div class="bs-open-row">
        <button class="bs-big" onClick={() => runCmd('file.open')}><Icon name="folder-open" size={26} /><span>Browse<small>PowerPoint (.pptx, .ppsx, .potx), Prizma, PDF, and with LibreOffice also .ppt, .odp and Keynote</small></span></button>
      </div>
      <Recovered />
      <section class="bs-sec">
        <div class="bs-sec-h"><h3>Recent presentations</h3><div class="search-in bs-search"><Icon name="search" size={14} /><input value={q} placeholder="Search recent" onInput={e => setQ(e.currentTarget.value)} /></div></div>
        <RecentList filter={q} />
        {(appInfo.value.recent || []).length > 0 && <button class="link-btn" onClick={async () => { const r = await native.recent('clear'); appInfo.value = { ...appInfo.value, recent: r } }}>Clear the list</button>}
      </section>
    </div>
  )
}
function InfoPage () {
  const d = doc.value
  const f = file.value
  const [stat, setStat] = useState(null)
  useEffect(() => { if (f.path) native.stat(f.path).then(setStat).catch(() => setStat(null)) }, [f.path])
  const setProp = (k, v) => update(dd => { dd.props = { ...(dd.props || {}), [k]: v } }, { coalesce: 'prop:' + k })
  const words = useMemo(() => wordCount(d).w, [d])
  return (
    <div class="bs-page">
      <h1>Info</h1>
      <div class="bs-info">
        <div>
          <div class="bs-doc"><Icon name="presentation" size={30} /><div><b translate="no">{f.name}</b><small>{f.path || 'Not saved yet'}</small></div></div>
          <div class="bs-actions">
            {f.path && <button class="btn" onClick={() => native.showInFolder(f.path)}><Icon name="folder-open" size={15} />Open file location</button>}
            <button class="btn" onClick={() => F.saveAs()}><Icon name="save-all" size={15} />Save a copy…</button>
          </div>
          <div class="bs-callout">
            <Icon name="shield-check" size={20} />
            <div><b>AutoRecover is {Number(settings.value.autosaveMinutes) > 0 ? `on, every ${settings.value.autosaveMinutes} min` : 'off'}</b><small>If Prizma or Windows closes unexpectedly, unsaved work is offered back the next time you start Prizma.</small></div>
          </div>
        </div>
        <table class="kv bs-props">
          <tr><td>Size</td><td>{stat ? (stat.size / 1048576).toFixed(2) + ' MB' : '—'}</td></tr>
          <tr><td>Slides</td><td>{d.slides.length}</td></tr>
          <tr><td>Hidden slides</td><td>{d.slides.filter(s => s.hidden).length}</td></tr>
          <tr><td>Words</td><td>{words.toLocaleString()}</td></tr>
          <tr><td>Slide size</td><td>{(SLIDE_SIZES.find(z => Math.abs(z.w - d.size.w) < 1 && Math.abs(z.h - d.size.h) < 1)?.label) || `${(d.size.w / 72 * 2.54).toFixed(2)} × ${(d.size.h / 72 * 2.54).toFixed(2)} cm`}</td></tr>
          <tr><td>Title</td><td><TextInput value={d.props?.title || ''} placeholder="Add a title" onChange={v => setProp('title', v)} /></td></tr>
          <tr><td>Author</td><td><TextInput value={d.props?.author || settings.value.author || ''} placeholder="Add an author" onChange={v => setProp('author', v)} /></td></tr>
          <tr><td>Created</td><td>{d.props?.created ? new Date(d.props.created).toLocaleString() : (stat ? new Date(stat.ctime).toLocaleString() : '—')}</td></tr>
          <tr><td>Last modified</td><td>{stat ? new Date(stat.mtime).toLocaleString() : '—'}</td></tr>
        </table>
      </div>
    </div>
  )
}
const FORMATS = [
  ['pptx', 'PowerPoint presentation', '.pptx', 'presentation', 'Opens in PowerPoint, Keynote, Google Slides and Prizma.'],
  ['prizma', 'Prizma presentation', '.prizma', 'gem', 'Keeps every Prizma feature exactly, including Morph and WordArt effects.'],
  ['ppsx', 'PowerPoint show', '.ppsx', 'presentation', 'Starts straight in slide show when opened.'],
  ['potx', 'PowerPoint template', '.potx', 'layout-template', 'A starting point for new presentations.'],
  ['pdf', 'PDF', '.pdf', 'file-text', 'Fixed layout for sharing and printing.']
]
function SaveAsPage () {
  return (
    <div class="bs-page">
      <h1>Save as</h1>
      <div class="bs-formats">
        {FORMATS.map(([id, l, ext, ic, desc]) => (
          <button key={id} class="bs-fmt" onClick={() => F.saveAs(id)}>
            <Icon name={ic} size={24} />
            <span><b>{l} <em>{ext}</em></b><small>{desc}</small></span>
          </button>
        ))}
      </div>
    </div>
  )
}

export const printOpts = signal(null)
function PrintPage () {
  const d = doc.value
  const [o, setO] = useState(() => printOpts.value || printOptsDefault())
  const set = p => { const n = { ...o, ...p }; setO(n); printOpts.value = n }
  const [busy, setBusy] = useState(false)
  const go = async kind => {
    setBusy(true)
    try { const m = await import('../print/printing.js'); if (kind === 'pdf') await m.exportPdfDialog(o); else await m.printSystem(o) } finally { setBusy(false) }
  }
  return (
    <div class="bs-page bs-print">
      <div class="pr-side">
        <h1>Print</h1>
        <div class="pr-btns">
          <button class="bs-big" disabled={busy} onClick={() => go('print')}><Icon name="printer" size={26} /><span>Print<small>Choose a printer and copies in the next window</small></span></button>
          <button class="bs-big" disabled={busy} onClick={() => go('pdf')}><Icon name="file-text" size={26} /><span>Save as PDF<small>Same layout as printing</small></span></button>
        </div>
        <div class="cp-h">Slides</div>
        <Select value={o.range} onChange={v => set({ range: v })} options={[{ value: 'all', label: 'Print all slides' }, { value: 'current', label: 'Print current slide' }, { value: 'custom', label: 'Custom range' }]} />
        {o.range === 'custom' && <TextInput value={o.custom} placeholder="e.g. 1-3, 5, 8" onChange={v => set({ custom: v })} />}
        <div class="cp-h">Layout</div>
        <Select value={o.layout} onChange={v => set({ layout: v })} options={[{ value: 'slides', label: 'Full page slides' }, { value: 'notes', label: 'Notes pages' }, { value: 'outline', label: 'Outline' }, { value: 'h1', label: 'Handouts: 1 slide per page' }, { value: 'h2', label: 'Handouts: 2 slides per page' }, { value: 'h3', label: 'Handouts: 3 slides with lines' }, { value: 'h4', label: 'Handouts: 4 slides per page' }, { value: 'h6', label: 'Handouts: 6 slides per page' }, { value: 'h9', label: 'Handouts: 9 slides per page' }]} />
        {o.layout !== 'slides' && <><div class="cp-h">Paper</div><Select value={o.paper} onChange={v => set({ paper: v })} options={[{ value: 'a4', label: 'A4 (21 × 29.7 cm)' }, { value: 'letter', label: 'Letter (8.5 × 11 in)' }]} /></>}
        <div class="cp-h">Options</div>
        <Check label="Frame slides" checked={o.frame} onChange={v => set({ frame: v })} />
        <Check label="Print hidden slides" checked={o.hidden} onChange={v => set({ hidden: v })} />
        <Check label="Grayscale" checked={o.gray} onChange={v => set({ gray: v })} />
        <Check label="Slide numbers on handouts" checked={o.numbers} onChange={v => set({ numbers: v })} />
      </div>
      <div class="pr-preview">
        <PrintPages docObj={d} opts={{ ...o, current: slideIdx.value }} preview />
      </div>
    </div>
  )
}
function ExportPage () {
  const [fmt, setFmt] = useState('png')
  const [which, setWhich] = useState('all')
  const [scale, setScale] = useState(2)
  const pics = async () => { const m = await import('../print/printing.js'); m.exportImagesDialog({ fmt, which, scale }) }
  return (
    <div class="bs-page">
      <h1>Export</h1>
      <div class="bs-export">
        <section class="bs-sec">
          <h3><Icon name="file-text" size={18} />Create a PDF</h3>
          <p class="fe-note">Fonts, pictures and layout stay exactly as they look here. Use Print for handouts and notes pages.</p>
          <button class="btn btn-primary" onClick={() => import('../print/printing.js').then(m => m.exportPdfDialog())}>Create PDF…</button>
        </section>
        <section class="bs-sec">
          <h3><Icon name="images" size={18} />Export slides as pictures</h3>
          <div class="dlg-row"><Radio name="xf" label="PNG" checked={fmt === 'png'} onChange={() => setFmt('png')} /><Radio name="xf" label="JPEG" checked={fmt === 'jpg'} onChange={() => setFmt('jpg')} /></div>
          <div class="dlg-row"><Radio name="xw" label="All slides" checked={which === 'all'} onChange={() => setWhich('all')} /><Radio name="xw" label="Current slide" checked={which === 'current'} onChange={() => setWhich('current')} /></div>
          <Field label="Resolution"><Select value={String(scale)} onChange={v => setScale(+v)} options={[{ value: '1', label: 'Standard (1280 px wide)' }, { value: '1.5', label: 'Full HD (1920 px wide)' }, { value: '2', label: 'High (2560 px wide)' }, { value: '3', label: 'Ultra (3840 px wide)' }]} /></Field>
          <button class="btn btn-primary" onClick={pics}>Export pictures…</button>
        </section>
        <section class="bs-sec">
          <h3><Icon name="file-output" size={18} />Change file type</h3>
          <div class="bs-formats">
            {FORMATS.filter(x => x[0] !== 'pdf').map(([id, l, ext, ic, desc]) => (
              <button key={id} class="bs-fmt" onClick={() => F.saveAs(id)}><Icon name={ic} size={22} /><span><b>{l} <em>{ext}</em></b><small>{desc}</small></span></button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
// each language in its own name, so anyone can find theirs
const LANGUAGES = [['en', 'English'], ['bg', 'Български'], ['da', 'Dansk'], ['de', 'Deutsch'], ['el', 'Ελληνικά'], ['es', 'Español'], ['fr', 'Français'], ['it', 'Italiano'], ['mk', 'Македонски'], ['hu', 'Magyar'], ['nb', 'Norsk bokmål'], ['pt-BR', 'Português (Brasil)'], ['pt-PT', 'Português (Portugal)'], ['ro', 'Română'], ['ru', 'Русский'], ['sr', 'Srpski'], ['fi', 'Suomi'], ['sv', 'Svenska'], ['tr', 'Türkçe'], ['uk', 'Українська'], ['ja', '日本語'], ['zh', '中文（简体）']].map(([value, label]) => ({ value, label }))
function OptionsPage () {
  const s = settings.value
  const set = patch => { setSetting(patch); if ('autosaveMinutes' in patch) F.startAutosave() }
  return (
    <div class="bs-page bs-options">
      <h1>Options</h1>
      <section class="bs-sec">
        <h3>General</h3>
        <Field label="Interface"><Select value={s.theme || 'dark'} onChange={v => setUiTheme(v)} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Same as Windows' }]} /></Field>
        <Field label="Language"><Select value={s.language || 'auto'} onChange={v => { set({ language: v }); toast('Restart Prizma to use the new language.') }} options={[{ value: 'auto', label: 'Same as Windows' }, ...LANGUAGES]} /></Field>
        <Field label="Your name"><TextInput value={s.author || ''} placeholder={appInfo.value.userName} onChange={v => set({ author: v })} /></Field>
        <Field label="Measurement units"><Select value={s.units || 'cm'} onChange={v => set({ units: v })} options={[{ value: 'cm', label: 'Centimeters' }, { value: 'in', label: 'Inches' }, { value: 'pt', label: 'Points' }]} /></Field>
        <Check label="Show the start screen when Prizma opens" checked={s.showStart !== false} onChange={v => set({ showStart: v })} />
      </section>
      <section class="bs-sec">
        <h3>Save</h3>
        <Field label="Save AutoRecover information every"><Select value={String(s.autosaveMinutes ?? 2)} onChange={v => set({ autosaveMinutes: +v })} options={[{ value: '0', label: 'Never' }, { value: '1', label: '1 minute' }, { value: '2', label: '2 minutes' }, { value: '5', label: '5 minutes' }, { value: '10', label: '10 minutes' }]} /></Field>
        <Field label="Save files in this format"><Select value={s.defaultFormat || 'pptx'} onChange={v => set({ defaultFormat: v })} options={[{ value: 'pptx', label: 'PowerPoint presentation (.pptx)' }, { value: 'prizma', label: 'Prizma presentation (.prizma)' }]} /></Field>
      </section>
      <section class="bs-sec">
        <h3>Editing</h3>
        <Check label="Check spelling as you type" checked={s.spellcheck !== false} onChange={v => set({ spellcheck: v })} />
        <Check label="Smart guides while moving objects" checked={s.smartGuides !== false} onChange={v => set({ smartGuides: v })} />
        <Check label="Keep pictures at full size when inserting them" checked={!!s.keepPictures} onChange={v => set({ keepPictures: v })} />
        <Field label="New presentations"><Select value={s.newSize || 'wide'} onChange={v => set({ newSize: v })} options={SLIDE_SIZES.slice(0, 2).map(z => ({ value: z.id, label: z.label }))} /></Field>
      </section>
      <section class="bs-sec">
        <h3>Slide show</h3>
        <Check label="Use presenter view when a second screen is connected" checked={s.presenterView !== false} onChange={v => set({ presenterView: v })} />
        <Check label="End with a black slide" checked={s.endBlack !== false} onChange={v => set({ endBlack: v })} />
        <Check label="Show the slide show toolbar" checked={s.showToolbar !== false} onChange={v => set({ showToolbar: v })} />
      </section>
    </div>
  )
}

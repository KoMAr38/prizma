// The ribbon: tab strip (with contextual tabs for the selection) and the active tab's command groups.
import { useEffect, useRef, useState } from 'preact/hooks'
import { ribbonTab, ribbonCollapsed, selected, editCell, backstage, finishEditing } from '../core/store.js'
import { Icon } from './Icon.jsx'
import { HomeTab } from './ribbon/home.jsx'
import { InsertTab, DrawTab } from './ribbon/insert.jsx'
import { DesignTab, TransitionsTab, AnimationsTab, SlideShowTab } from './ribbon/design.jsx'
import { ReviewTab, ViewTab, HelpTab } from './ribbon/view.jsx'
import { ShapeFormatTab, PictureFormatTab, TableDesignTab, TableLayoutTab, ChartDesignTab, PlaybackTab } from './ribbon/context.jsx'
import { Split } from './controls.jsx'
import { runCmd } from '../app/commands.js'

const TABS = [
  { id: 'home', label: 'Home', C: HomeTab },
  { id: 'insert', label: 'Insert', C: InsertTab },
  { id: 'draw', label: 'Draw', C: DrawTab },
  { id: 'design', label: 'Design', C: DesignTab },
  { id: 'transitions', label: 'Transitions', C: TransitionsTab },
  { id: 'animations', label: 'Animations', C: AnimationsTab },
  { id: 'slideshow', label: 'Slide Show', C: SlideShowTab },
  { id: 'review', label: 'Review', C: ReviewTab },
  { id: 'view', label: 'View', C: ViewTab },
  { id: 'help', label: 'Help', C: HelpTab }
]
const CONTEXT = {
  shape: { label: 'Shape Format', C: ShapeFormatTab },
  picture: { label: 'Picture Format', C: PictureFormatTab },
  tableDesign: { label: 'Table Design', C: TableDesignTab },
  tableLayout: { label: 'Layout', C: TableLayoutTab },
  chart: { label: 'Chart Design', C: ChartDesignTab },
  playback: { label: 'Playback', C: PlaybackTab }
}
export function contextTabs () {
  const sel = selected.value
  const out = []
  if (!sel.length && !editCell.value) return out
  const types = new Set(sel.map(e => e.type))
  if (types.has('table') || editCell.value) out.push('tableDesign', 'tableLayout')
  if (types.has('chart')) out.push('chart')
  if (types.has('image')) out.push('picture')
  if (types.has('video') || types.has('audio')) out.push('playback')
  if ([...types].some(t => ['shape', 'text', 'line', 'icon', 'group', 'ink'].includes(t))) out.push('shape')
  return out
}

export function Ribbon () {
  const ctx = contextTabs()
  let tab = ribbonTab.value
  const ctxIds = new Set(Object.keys(CONTEXT))
  if (ctxIds.has(tab) && !ctx.includes(tab)) tab = 'home'
  const collapsed = ribbonCollapsed.value
  const [peek, setPeek] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!peek) return
    const down = e => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('.pop')) setPeek(false) }
    window.addEventListener('pointerdown', down, true)
    return () => window.removeEventListener('pointerdown', down, true)
  }, [peek])
  const pick = id => {
    if (id === 'file') { finishEditing(); backstage.value = 'home'; return }
    ribbonTab.value = id
    if (collapsed) setPeek(p => (tab === id ? !p : true))
  }
  const C = (TABS.find(t => t.id === tab) || CONTEXT[tab] || TABS[0]).C
  const showBody = !collapsed || peek
  return (
    <div class={'ribbon' + (collapsed ? ' collapsed' : '') + (peek ? ' peek' : '')} ref={ref} onDblClick={e => { if (e.target.closest('.rtab')) runCmd('view.collapseRibbon') }}>
      <div class="rtabs" role="tablist">
        <button class="rtab rtab-file" onMouseDown={e => e.preventDefault()} onClick={() => pick('file')}>File</button>
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} class={'rtab' + (tab === t.id ? ' on' : '')} onMouseDown={e => e.preventDefault()} onClick={() => pick(t.id)}>{t.label}</button>
        ))}
        {ctx.length > 0 && <span class="rtab-ctx-sep" />}
        {ctx.map(id => (
          <button key={id} role="tab" aria-selected={tab === id} class={'rtab rtab-ctx' + (tab === id ? ' on' : '')} onMouseDown={e => e.preventDefault()} onClick={() => pick(id)}>{CONTEXT[id].label}</button>
        ))}
        <span class="rtabs-fill" />
        <Split size="sm" icon="presentation" label="Present" tip="Start the slide show" kbd="F5" onClick={() => runCmd('show.current')}
          menu={[{ label: 'From beginning', icon: 'play', kbd: 'F5', run: () => runCmd('show.start') }, { label: 'From current slide', icon: 'presentation', kbd: 'Shift+F5', run: () => runCmd('show.current') }, { label: 'Presenter view', icon: 'monitor-speaker', kbd: 'Alt+F5', run: () => runCmd('show.presenter') }, { sep: true }, { label: 'Set up slide show…', icon: 'settings-2', run: () => runCmd('show.setup') }]}>
        </Split>
      </div>
      {showBody && (
        <div class="rbody" onClick={() => { if (peek) setTimeout(() => setPeek(false), 0) }}>
          <div class="rbody-in"><C /></div>
          <button class="rcollapse" onMouseDown={e => e.preventDefault()} onClick={() => { setPeek(false); runCmd('view.collapseRibbon') }} data-tip={collapsed ? 'Pin the ribbon' : 'Collapse the ribbon'} data-kbd="Ctrl+F1">
            <Icon name={collapsed ? 'pin' : 'chevron-up'} size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

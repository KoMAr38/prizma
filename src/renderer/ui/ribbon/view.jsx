// Review, View and Help tabs.
import { doc, slideIdx, pane, showRuler, showGrid, showGuides, snapGrid, showNotes, grayscale, settings, view, update, updateSlide, goSlide, openDialog } from '../../core/store.js'
import { Group, Col, Check } from '../controls.jsx'
import { Btn, Drop, Icon, runCmd } from './common.jsx'
import { setUiTheme } from '../../app/commands.js'

export function ReviewTab () {
  const d = doc.value
  const withComments = d.slides.map((s, i) => (s.comments?.length ? i : -1)).filter(i => i >= 0)
  const go = dir => {
    const cur = slideIdx.value
    const next = dir > 0 ? withComments.find(i => i > cur) : [...withComments].reverse().find(i => i < cur)
    if (next !== undefined) { goSlide(next); pane.value = 'comments' }
  }
  return (
    <>
      <Group label="Proofing">
        <Btn size="lg" icon="spell-check" label="Spelling" active={settings.value.spellcheck !== false} desc="Underline misspelled words while you type. Right-click a word for suggestions." onClick={() => runCmd('view.spelling')} />
        <Btn size="lg" icon="text-search" label="Word count" onClick={() => openDialog('wordcount')} />
      </Group>
      <Group label="Comments">
        <Btn size="lg" icon="message-square-plus" label="New comment" kbd="Ctrl+Alt+M" onClick={() => runCmd('ins.comment')} />
        <Col>
          <Drop icon="message-square-x" label="Delete" disabled={!withComments.length} menu={() => [
            { label: 'Delete all comments on this slide', run: () => updateSlide(s => { s.comments = [] }) },
            { label: 'Delete all comments in this presentation', danger: true, run: () => update(dd => { for (const s of dd.slides) s.comments = [] }) }
          ]} />
          <Btn icon="arrow-left" label="Previous" disabled={!withComments.some(i => i < slideIdx.value)} onClick={() => go(-1)} />
          <Btn icon="arrow-right" label="Next" disabled={!withComments.some(i => i > slideIdx.value)} onClick={() => go(1)} />
        </Col>
        <Btn size="lg" icon="messages-square" label="Show comments" active={pane.value === 'comments'} onClick={() => runCmd('view.comments')} />
      </Group>
    </>
  )
}

export function ViewTab () {
  const v = view.value
  return (
    <>
      <Group label="Presentation views">
        <Btn size="lg" icon="layout-panel-left" label="Normal" active={v === 'normal'} onClick={() => runCmd('view.normal')} />
        <Btn size="lg" icon="list-tree" label="Outline view" active={v === 'outline'} onClick={() => runCmd('view.outline')} />
        <Btn size="lg" icon="layout-grid" label="Slide sorter" active={v === 'sorter'} onClick={() => runCmd('view.sorter')} />
        <Btn size="lg" icon="book-open" label="Reading view" onClick={() => runCmd('view.reading')} />
      </Group>
      <Group label="Show">
        <Col>
          <Check label="Ruler" checked={showRuler.value} onChange={x => { showRuler.value = x }} />
          <Check label="Gridlines" checked={showGrid.value} onChange={x => { showGrid.value = x }} />
          <Check label="Guides" checked={showGuides.value} onChange={x => { showGuides.value = x }} />
        </Col>
        <Col>
          <Check label="Snap to grid" checked={snapGrid.value} onChange={x => { snapGrid.value = x }} />
          <Check label="Notes" checked={showNotes.value} onChange={x => { showNotes.value = x }} />
        </Col>
      </Group>
      <Group label="Zoom">
        <Btn size="lg" icon="search" label="Zoom" onClick={() => runCmd('view.zoom')} />
        <Btn size="lg" icon="scan" label="Fit to window" onClick={() => runCmd('view.fit')} />
      </Group>
      <Group label="Color">
        <Col>
          <Btn icon="palette" label="Color" active={!grayscale.value} onClick={() => { grayscale.value = false }} />
          <Btn icon="contrast" label="Grayscale" active={grayscale.value} onClick={() => { grayscale.value = true }} />
        </Col>
      </Group>
      <Group label="Window">
        <Btn size="lg" icon="app-window" label="New window" onClick={() => runCmd('view.newWindow')} />
        <Drop size="lg" icon="sun-moon" label="Interface" menu={() => [
          { label: 'Dark', icon: 'moon', checked: settings.value.theme === 'dark', run: () => setUiTheme('dark') },
          { label: 'Light', icon: 'sun', checked: settings.value.theme === 'light', run: () => setUiTheme('light') },
          { label: 'Same as Windows', icon: 'monitor', checked: settings.value.theme === 'system', run: () => setUiTheme('system') }
        ]} />
        <Col>
          <Btn icon="layers" label="Selection pane" active={pane.value === 'selection'} onClick={() => runCmd('view.selectionPane')} />
          <Btn icon="list-video" label="Animation pane" active={pane.value === 'anim'} onClick={() => runCmd('view.animPane')} />
          <Btn icon="chevrons-up" label="Collapse ribbon" kbd="Ctrl+F1" onClick={() => runCmd('view.collapseRibbon')} />
        </Col>
      </Group>
    </>
  )
}

export function HelpTab () {
  return (
    <>
      <Group label="Help">
        <Btn size="lg" icon="keyboard" label="Keyboard shortcuts" kbd="F1" onClick={() => runCmd('help.shortcuts')} />
        <Btn size="lg" icon="graduation-cap" label="Take a tour" desc="Open a short presentation that shows what Prizma can do." onClick={() => import('../../app/tour.js').then(m => m.openTour())} />
        <Btn size="lg" icon="search" label="Search commands" kbd="Alt+Q" onClick={() => runCmd('app.search')} />
      </Group>
      <Group label="Prizma">
        <Btn size="lg" icon="info" label="About" onClick={() => runCmd('help.about')} />
        <Btn size="lg" icon="settings" label="Options" onClick={() => runCmd('file.options')} />
      </Group>
    </>
  )
}

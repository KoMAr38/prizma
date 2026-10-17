// Home tab: clipboard, slides, font, paragraph, drawing, editing.
import { slide, slideSel, selection, selected, painter, fonts, theme as themeSig, lastColors, openDialog } from '../../core/store.js'
import { FONT_SIZES } from '../../core/html.js'
import { fontStack } from '../../core/model.js'
import { Group, Col, Row, Combo } from '../controls.jsx'
import { fmtState, fontLabel, setFontFace, setFontSize, textRun, textPara } from '../../app/commands.js'
import {
  Btn, Drop, Split, ColorBtn, runCmd, A, NewSlideBtn, LayoutPicker, ShapeIcon, RECENT_SHAPES, pickShape, ShapePicker,
  arrangeMenu, shapeStyles, StyleSwatch, applyShapeStyle, FillBtn, OutlineBtn, EffectsBtn, openFormat
} from './common.jsx'
import { PickGrid } from '../controls.jsx'
import { addRecentColor } from '../controls.jsx'

export const FALLBACK_FONTS = ['Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Calibri Light', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Georgia', 'Impact', 'Ink Free', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Segoe UI Black', 'Segoe UI Light', 'Segoe UI Semibold', 'Sitka Text', 'Sylfaen', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana']
export function fontOptions () {
  const t = themeSig.value
  const list = fonts.value.length ? fonts.value : FALLBACK_FONTS
  return [
    { header: 'Theme fonts' },
    { value: '+major', label: fontLabel('+major'), font: t?.fonts.major, sub: 'Headings' },
    { value: '+minor', label: fontLabel('+minor'), font: t?.fonts.minor, sub: 'Body' },
    { header: 'All fonts' },
    ...list.map(f => ({ value: f, label: f, font: f }))
  ]
}
export const renderFont = o => <span class="mi-l font-opt" style={{ fontFamily: fontStack(o.font || o.value) }}>{o.sub ? <><b>{o.font}</b><small>{o.sub}</small></> : o.label}</span>

export function FontCombos ({ disabled }) {
  const st = fmtState.value
  return (
    <>
      <Combo width={150} listWidth={250} tip="Font" value={st ? fontLabel(st.font) : ''} placeholder={st ? '' : 'Font'} options={fontOptions} renderOption={renderFont} onChange={v => setFontFace(v === '+major' || v === '+minor' ? fontLabel(v) : v)} cls={disabled ? 'dis' : ''} />
      <Combo width={58} listWidth={70} tip="Font size" value={st && st.size ? String(Math.round(st.size * 10) / 10) : ''} options={FONT_SIZES.map(v => ({ value: v }))} onChange={setFontSize} cls={disabled ? 'dis' : ''} />
    </>
  )
}
export function FontColorBtn () {
  const v = lastColors.value.font
  const apply = c => { lastColors.value = { ...lastColors.value, font: c || lastColors.value.font }; if (c && c.startsWith('#')) addRecentColor(c); textRun('color', c) }
  return <ColorBtn icon="baseline" tip="Font color" value={v} onApply={apply} onPick={apply} auto autoLabel="Automatic" />
}
export function HighlightBtn () {
  const v = lastColors.value.highlight
  const apply = c => { lastColors.value = { ...lastColors.value, highlight: c === 'none' ? lastColors.value.highlight : c }; textRun('highlight', c === 'none' ? null : c) }
  return <ColorBtn icon="highlighter" tip="Text highlight color" value={v} onApply={apply} onPick={apply} none noneLabel="No color" />
}
export const caseMenu = () => [
  { label: 'Sentence case.', run: () => runCmd('fmt.sentence') },
  { label: 'lowercase', run: () => runCmd('fmt.lower') },
  { label: 'UPPERCASE', run: () => runCmd('fmt.upper') },
  { label: 'Capitalize Each Word', run: () => runCmd('fmt.title') },
  { label: 'tOGGLE cASE', kbd: 'Shift+F3', run: () => runCmd('fmt.toggleCase') }
]
export const spacingMenu = () => [
  ...[['Very tight', -3], ['Tight', -1.5], ['Normal', 0], ['Loose', 3], ['Very loose', 6]].map(([l, v]) => ({ label: l, hint: v ? `${v > 0 ? '+' : ''}${v} pt` : '', run: () => textRun('spacing', v || null) }))
]
export const bulletMenu = () => [
  { node: (
    <PickGrid cols={4} itemW={46} itemH={40} items={[{ label: 'None', ch: '' }, ...['•', '○', '■', '◆', '➢', '✓', '–', '★'].map(ch => ({ label: 'Bullet ' + ch, ch }))]}
      render={it => it.ch ? <span class="bullet-sample">{it.ch}<i /></span> : <span class="none-sample">None</span>}
      onPick={it => textPara('bullets', it.ch ? 'bu' : null, it.ch ? { char: it.ch } : undefined)} />
  ) }
]
const NUMS = [['arabicPeriod', '1.'], ['arabicParenR', '1)'], ['romanUcPeriod', 'I.'], ['alphaUcPeriod', 'A.'], ['alphaLcParenR', 'a)'], ['alphaLcPeriod', 'a.'], ['romanLcPeriod', 'i.']]
export const numberMenu = () => [
  { node: (
    <PickGrid cols={4} itemW={46} itemH={40} items={[{ label: 'None', f: null }, ...NUMS.map(([f, l]) => ({ label: l, f, l }))]}
      render={it => it.f ? <span class="bullet-sample bullet-num">{it.l}<i /></span> : <span class="none-sample">None</span>}
      onPick={it => textPara('bullets', it.f ? 'num' : null, it.f ? { format: it.f } : undefined)} />
  ) }
]
export const lineSpacingMenu = () => [
  ...[1, 1.15, 1.5, 2, 2.5, 3].map(v => { const lh = Math.round(v * 1.2 * 100) / 100; return { label: v.toFixed(v === 1.15 ? 2 : 1), checked: fmtState.value?.lineH === lh || (v === 1 && !fmtState.value?.lineH), run: () => textPara('lineH', v === 1 ? null : lh) } }),
  { sep: true },
  { label: 'Line spacing options…', run: () => openDialog('paragraph') }
]
export const vAlignMenu = () => [
  { label: 'Top', icon: 'align-vertical-justify-start', checked: fmtState.value?.vAlign === 'top', run: () => runCmd('para.vTop') },
  { label: 'Middle', icon: 'align-vertical-justify-center', checked: fmtState.value?.vAlign === 'middle', run: () => runCmd('para.vMiddle') },
  { label: 'Bottom', icon: 'align-vertical-justify-end', checked: fmtState.value?.vAlign === 'bottom', run: () => runCmd('para.vBottom') },
  { sep: true },
  { label: 'More options…', run: () => openFormat('textbox') }
]
export const textDirMenu = () => [
  { label: 'Horizontal', icon: 'type', run: () => A.setProps({ vertical: undefined }) },
  { label: 'Rotate all text 90°', icon: 'rotate-cw', run: () => A.setProps({ vertical: 'vert' }) },
  { label: 'Rotate all text 270°', icon: 'rotate-ccw', run: () => A.setProps({ vertical: 'vert270' }) },
  { label: 'Stacked', icon: 'arrow-down-narrow-wide', run: () => A.setProps({ vertical: 'stacked' }) }
]

export function FontGroup () {
  const st = fmtState.value
  const dis = !st
  const on = k => !!st && st[k] === true
  return (
    <Group label="Font" launcher={() => openDialog('font')}>
      <Row><FontCombos disabled={dis} /><Btn icon="a-arrow-up" tip="Increase font size" kbd="Ctrl+]" onClick={() => runCmd('fmt.grow')} disabled={dis} /><Btn icon="a-arrow-down" tip="Decrease font size" kbd="Ctrl+[" onClick={() => runCmd('fmt.shrink')} disabled={dis} /><Btn icon="remove-formatting" tip="Clear all formatting" kbd="Ctrl+Space" onClick={() => runCmd('fmt.clear')} disabled={dis} /></Row>
      <Row>
        <Btn icon="bold" tip="Bold" kbd="Ctrl+B" active={on('bold')} onClick={() => runCmd('fmt.bold')} disabled={dis} />
        <Btn icon="italic" tip="Italic" kbd="Ctrl+I" active={on('italic')} onClick={() => runCmd('fmt.italic')} disabled={dis} />
        <Btn icon="underline" tip="Underline" kbd="Ctrl+U" active={on('underline')} onClick={() => runCmd('fmt.underline')} disabled={dis} />
        <Btn icon="strikethrough" tip="Strikethrough" active={on('strike')} onClick={() => runCmd('fmt.strike')} disabled={dis} />
        <Btn icon="superscript" tip="Superscript" kbd="Ctrl+Shift+=" active={st?.baseline === 'sup'} onClick={() => runCmd('fmt.sup')} disabled={dis} />
        <Drop icon="move-horizontal" tip="Character spacing" menu={spacingMenu} disabled={dis} />
        <Drop icon="case-sensitive" tip="Change case" menu={caseMenu} disabled={dis} />
        <span class="rsep-s" />
        <HighlightBtn />
        <FontColorBtn />
      </Row>
    </Group>
  )
}
export function ParagraphGroup () {
  const st = fmtState.value
  const dis = !st
  const al = st?.align
  return (
    <Group label="Paragraph" launcher={() => openDialog('paragraph')}>
      <Row>
        <Split icon="list" tip="Bullets" active={st?.bullets === 'bu'} onClick={() => runCmd('para.bullets')} render={() => <div class="pop-pad">{bulletMenu()[0].node}</div>} disabled={dis} />
        <Split icon="list-ordered" tip="Numbering" active={st?.bullets === 'num'} onClick={() => runCmd('para.numbering')} render={() => <div class="pop-pad">{numberMenu()[0].node}</div>} disabled={dis} />
        <Btn icon="indent-decrease" tip="Decrease list level" onClick={() => runCmd('para.outdent')} disabled={dis} />
        <Btn icon="indent-increase" tip="Increase list level" onClick={() => runCmd('para.indent')} disabled={dis} />
        <Drop icon="list-collapse" tip="Line spacing" menu={lineSpacingMenu} disabled={dis} />
      </Row>
      <Row>
        <Btn icon="align-left" tip="Align left" kbd="Ctrl+L" active={al === 'left'} onClick={() => runCmd('para.left')} disabled={dis} />
        <Btn icon="align-center" tip="Center" kbd="Ctrl+E" active={al === 'center'} onClick={() => runCmd('para.center')} disabled={dis} />
        <Btn icon="align-right" tip="Align right" kbd="Ctrl+R" active={al === 'right'} onClick={() => runCmd('para.right')} disabled={dis} />
        <Btn icon="align-justify" tip="Justify" kbd="Ctrl+J" active={al === 'justify'} onClick={() => runCmd('para.justify')} disabled={dis} />
        <Drop icon="align-vertical-justify-center" tip="Align text" menu={vAlignMenu} disabled={dis} />
        <Drop icon="arrow-down-up" tip="Text direction" menu={textDirMenu} disabled={!selection.value.length} />
      </Row>
    </Group>
  )
}
function DrawingGroup () {
  const items = RECENT_SHAPES.map(k => ({ key: k, label: k, ...(k.startsWith('line:') ? { line: k.slice(5) } : { shape: k }) }))
  return (
    <Group label="Drawing" launcher={() => openFormat('fill')}>
      <div class="shape-strip">
        <PickGrid items={items} cols={6} itemW={24} itemH={24} onPick={pickShape} render={it => <ShapeIcon shape={it.key} size={18} />} />
        <Drop icon="chevrons-down" tip="All shapes" render={() => <ShapePicker />} cls="strip-more" />
      </div>
      <Drop size="lg" icon="layers-3" label="Arrange" tip="Arrange" desc="Order, group, align and rotate objects." menu={arrangeMenu} disabled={!selection.value.length} />
      <Drop size="lg" icon="swatch-book" label="Quick styles" tip="Quick styles" desc="Apply a ready-made combination of fill, outline and effects." disabled={!selection.value.length}
        render={() => <div class="pop-pad"><div class="cp-h">Theme styles</div><PickGrid cols={7} itemW={46} itemH={40} items={shapeStyles()} render={s2 => <StyleSwatch st={s2} />} onPick={applyShapeStyle} /></div>} />
      <Col><FillBtn /><OutlineBtn /><EffectsBtn /></Col>
    </Group>
  )
}

export function HomeTab () {
  const s = slide.value
  return (
    <>
      <Group label="Clipboard">
        <Split size="lg" icon="clipboard-paste" label="Paste" kbd="Ctrl+V" tip="Paste" onClick={() => runCmd('edit.paste')}
          menu={[{ label: 'Paste', icon: 'clipboard-paste', kbd: 'Ctrl+V', run: () => runCmd('edit.paste') }, { label: 'Keep text only', icon: 'clipboard-type', kbd: 'Ctrl+Shift+V', run: () => runCmd('edit.pasteText') }]} />
        <Col>
          <Btn icon="scissors" label="Cut" kbd="Ctrl+X" onClick={() => runCmd('edit.cut')} />
          <Btn icon="copy" label="Copy" kbd="Ctrl+C" onClick={() => runCmd('edit.copy')} />
          <Btn icon="paintbrush" label="Format painter" kbd="Ctrl+Shift+C" desc="Copy the formatting of the selected object, then click another object to apply it." active={!!painter.value} onClick={() => runCmd('edit.painter')} />
        </Col>
      </Group>
      <Group label="Slides">
        <NewSlideBtn />
        <Col>
          <Drop icon="layout-template" label="Layout" tip="Layout" render={() => <LayoutPicker current={s?.layout} onPick={id => A.setLayout(id, slideSel.value)} />} />
          <Btn icon="rotate-ccw" label="Reset" tip="Reset slide" desc="Put the placeholders back in their default position and formatting." onClick={() => runCmd('slide.reset')} />
          <Btn icon={s?.hidden ? 'eye' : 'eye-off'} label={s?.hidden ? 'Unhide' : 'Hide'} tip="Hide slide" desc="Hidden slides stay in the file but are skipped during the slide show." active={!!s?.hidden} onClick={() => runCmd('slide.hide')} />
        </Col>
      </Group>
      <FontGroup />
      <ParagraphGroup />
      <DrawingGroup />
      <Group label="Editing">
        <Col>
          <Btn icon="search" label="Find" kbd="Ctrl+F" onClick={() => runCmd('edit.find')} />
          <Btn icon="replace" label="Replace" kbd="Ctrl+H" onClick={() => runCmd('edit.replace')} />
          <Drop icon="mouse-pointer-2" label="Select" menu={() => [{ label: 'Select all', icon: 'box-select', kbd: 'Ctrl+A', run: () => runCmd('edit.selectAll') }, { label: 'Selection pane…', icon: 'layers', kbd: 'Alt+F10', run: () => runCmd('view.selectionPane') }]} />
        </Col>
      </Group>
    </>
  )
}

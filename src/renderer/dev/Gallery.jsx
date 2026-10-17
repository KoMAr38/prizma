// Developer harness: every theme (title, content, section) and every chart type, for design review screenshots.
import { SlideView } from '../render/SlideView.jsx'
import { THEMES, newDocument, newSlide } from '../core/themes.js'
import { chartEl, PX } from '../core/model.js'
import { numberingCss } from '../core/html.js'

const P = t => `<p>${t}</p>`
const BU = t => `<p data-bu="•" data-lvl="0" style="margin-left: 27pt; text-indent: -27pt; --hang: 27pt">${t}</p>`

function sampleDeck (themeId, variant = 0) {
  const d = newDocument(themeId, variant)
  const title = d.slides[0]
  title.elements[0].html = P('Hvor går kapasiteten tapt?')
  title.elements[1].html = P('Nordvare AS, seks lagre og 300 lastebiler')
  const content = newSlide('titleContent', d.size, d.theme)
  content.elements[0].html = P('Tre funn fra 2025')
  content.elements[1].html = [BU('To av tre tapte tonnkm skjer på returen'), BU('Semitrailerne står for over halvparten av tapet'), BU('Tomkjøringen ligger under SSB hele året')].join('')
  const section = newSlide('section', d.size, d.theme)
  section.elements[0].html = P('Sesong og trender')
  section.elements[1].html = P('Hva skjer gjennom året')
  d.slides = [title, content, section]
  return d
}
function chartDeck (themeId, variant = 0) {
  const d = newDocument(themeId, variant)
  const types = ['column', 'bar', 'pie', 'doughnut', 'line', 'area', 'scatter', 'radar']
  d.slides = types.map(t => {
    const s = newSlide('titleOnly', d.size, d.theme)
    s.elements[0].html = P(t[0].toUpperCase() + t.slice(1) + ' chart')
    const c = chartEl(t, { x: 60, y: 130, w: 840, h: 380 })
    if (t === 'line' || t === 'area') { c.categories = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']; c.series = [{ name: 'Tomkjøring %', values: [26.5, 26.7, 25.4, 28, 26.9, 27.1, 26.8, 27.6, 27.2, 24.8, 25.3, 25.1] }, { name: 'SSB', values: [24, 25, 25.5, 26, 27, 27.5, 27, 26, 25.6, 25, 24.6, 24] }] }
    if (t === 'column') { c.series = [{ name: 'Transportarbeid', values: [32, 27, 33, 34, 35, 36] }, { name: 'Tapt delvis', values: [18, 13, 17, 20, 19, 21] }, { name: 'Tapt tom', values: [15, 12, 14, 16, 15, 16] }]; c.categories = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun']; c.opts.labels = false }
    if (t === 'bar') { c.categories = ['Semitrailer', 'Modulvogntog', 'Distribusjonsbil']; c.series = [{ name: 'Tapt tom', values: [120, 70, 40] }, { name: 'Tapt delvis', values: [158, 80, 38] }]; c.grouping = 'stacked'; c.opts.labels = true }
    if (t === 'doughnut') { c.categories = ['Utgående', 'Retur']; c.series = [{ name: 'mill. tonnkm tapt', values: [161.8, 344] }] }
    if (t === 'scatter') { c.categories = Array.from({ length: 30 }, (_, i) => String(i * 3)); c.series = [{ name: 'Pris', values: Array.from({ length: 30 }, (_, i) => 20 + i * 2.2 + Math.sin(i) * 8) }] }
    s.elements.push(c)
    return s
  })
  return d
}

export function Gallery () {
  const mode = new URLSearchParams(location.search).get('g') || 'themes'
  const decks = mode === 'charts'
    ? [chartDeck('aurora'), chartDeck('prism')]
    : THEMES.map(t => sampleDeck(t.id, +(new URLSearchParams(location.search).get('v') || 0)))
  const w = mode === 'charts' ? 640 : 520
  const k = w / (960 * PX)
  setTimeout(() => { document.title = 'ready' }, 900)
  return (
    <div style={{ background: '#1b1e27', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <style>{numberingCss()}</style>
      {decks.map((d, di) => (
        <div key={di} class="g-row" style={{ display: 'flex', gap: '14px', flexWrap: mode === 'charts' ? 'wrap' : 'nowrap' }}>
          {d.slides.map((s, i) => (
            <div key={s.id} style={{ width: w + 'px', height: d.size.h * PX * k + 'px', overflow: 'hidden', borderRadius: '6px', flex: 'none' }}>
              <div style={{ transform: `scale(${k})`, transformOrigin: '0 0' }}><SlideView slide={s} docObj={d} mode="show" index={i} ctx={'g' + di + '-' + i} /></div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

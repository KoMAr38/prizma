// Help › Take a tour: a short presentation, built on the fly, that shows what Prizma can do.
import { loadDoc, clearMedia, backstage, native, toast } from '../core/store.js'
import { newDocument, newSlide } from '../core/themes.js'
import { textBox, shapeEl, solid } from '../core/model.js'
import { isPristine } from './files.js'

const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const P = t => `<p>${esc(t)}</p>`
const BU = t => `<p data-bu="•" data-lvl="0" style="margin-left: 27pt; text-indent: -27pt; --hang: 27pt">${esc(t)}</p>`

export function buildTour () {
  const d = newDocument('aurora', 0)
  const { size, theme } = d
  const W = size.w, H = size.h
  const make = (layout, fill, extra = {}) => {
    const s = newSlide(layout, size, theme)
    const ph = role => s.elements.filter(e => e.ph === role)
    fill(s, ph)
    return Object.assign(s, extra)
  }
  const fade = { type: 'fade', dur: 0.7 }

  const slides = [
    make('title', (s, ph) => {
      ph('title')[0].html = P('Welcome to Prizma')
      ph('subTitle')[0].html = P('A two-minute tour. Press F5 to play it as a slide show, or click through the slides on the left.')
    }, { notes: 'This is the notes pane. In Presenter view (Alt+F5) only you can see these notes while the audience sees the slide.' }),

    make('titleContent', (s, ph) => {
      ph('title')[0].html = P('Find every command fast')
      ph('body')[0].html = [
        'The ribbon groups commands by task: Home, Insert, Draw, Design, Transitions, Animations and more',
        'Select a picture, table or chart and its own tab appears at the end of the ribbon',
        'Right-click anything for the commands that fit it',
        'Press Alt+Q and type what you want to do'
      ].map(BU).join('')
    }, { transition: fade }),

    make('twoContent', (s, ph) => {
      ph('title')[0].html = P('Design in a few clicks')
      const [a, b] = ph('body')
      a.html = ['Design › Themes restyles every slide at once', 'Variants switch the colour scheme', 'Colors and Fonts fine-tune the theme'].map(BU).join('')
      b.html = ['The Format pane (Ctrl+1) sets exact fills, outlines, shadows and sizes', 'Format painter copies a look to other objects', 'Smart guides line things up while you drag'].map(BU).join('')
    }, { transition: fade })
  ]

  // Morph: the same objects on two slides, moved and resized
  const circle = shapeEl('ellipse', { x: W * 0.62, y: H * 0.36, w: 120, h: 120 }, { name: 'Circle', fill: solid('accent1'), line: null })
  const card = shapeEl('roundRect', { x: W * 0.74, y: H * 0.6, w: 170, h: 96 }, { name: 'Card', fill: solid('accent2'), line: null, html: P('Morph'), ts: { font: '+major', size: 22, bold: true, color: 'dk1', align: 'center' } })
  const dot = shapeEl('ellipse', { x: W * 0.84, y: H * 0.3, w: 44, h: 44 }, { name: 'Dot', fill: solid('accent4'), line: null })
  const caption = textBox({ x: W * 0.07, y: H * 0.34, w: W * 0.44, h: 120 }, P('Duplicate a slide, move or resize things on the copy, then choose Transitions › Morph. Prizma animates the difference.'), { name: 'Caption', ts: { font: '+minor', size: 20, color: 'dk2' } })
  const morphA = make('titleOnly', (s, ph) => {
    ph('title')[0].html = P('Morph moves things for you')
    s.elements.push(caption, circle, card, dot)
  }, { transition: fade })
  const morphB = make('titleOnly', (s, ph) => {
    ph('title')[0].html = P('Morph moves things for you')
    s.elements.push(
      { ...caption, x: W * 0.07, y: H * 0.74, w: W * 0.86, h: 60, ts: { ...caption.ts, size: 16 } },
      { ...circle, x: W * 0.07, y: H * 0.27, w: 230, h: 230, fill: solid('accent2') },
      { ...card, x: W * 0.36, y: H * 0.3, w: 360, h: 190, fill: solid('accent1'), ts: { ...card.ts, size: 40 } },
      { ...dot, x: W * 0.83, y: H * 0.36, w: 110, h: 110, fill: solid('accent3') }
    )
    // keep the title where it is so only the shapes move
    s.elements[0] = { ...morphA.elements[0] }
  }, { transition: { type: 'morph', dur: 1.2 }, notes: 'This slide uses the Morph transition. Play the show (F5) to see it.' })
  slides.push(morphA, morphB)

  // Animations: three cards that build one after the other
  const steps = ['Plan', 'Build', 'Present']
  const cards = steps.map((t, i) => shapeEl('roundRect', { x: W * 0.07 + i * (W * 0.29), y: H * 0.36, w: W * 0.27, h: H * 0.34 }, {
    name: t, fill: solid(['accent1', 'accent2', 'accent3'][i]), line: null, html: P(t), ts: { font: '+major', size: 30, bold: true, color: 'lt1', align: 'center' }
  }))
  slides.push(make('titleOnly', (s, ph) => {
    ph('title')[0].html = P('Bring in one idea at a time')
    s.elements.push(...cards)
    s.animations = cards.map((c, i) => ({ id: 'a' + i + c.id, el: c.id, kind: 'entr', effect: i === 0 ? 'flyIn' : 'floatIn', start: i === 0 ? 'click' : 'after', dur: 0.6, delay: i === 0 ? 0 : 0.1, dir: 'bottom' }))
  }, { transition: fade, notes: 'Animations › Add animation. The Animation pane lists every effect in order.' }))

  slides.push(make('titleContent', (s, ph) => {
    ph('title')[0].html = P('Present with confidence')
    ph('body')[0].html = [
      'Presenter view shows your notes, the next slide and a timer (Alt+F5)',
      'Draw on slides with the pen (Ctrl+P) or point with the laser (Ctrl+L)',
      'Rehearse timings to practise and keep to time',
      'Press B or W during a show to pause on a black or white screen'
    ].map(BU).join('')
  }, { transition: fade }))

  slides.push(make('titleContent', (s, ph) => {
    ph('title')[0].html = P('Works with your PowerPoint files')
    ph('body')[0].html = [
      'Open and save .pptx, .ppsx and .potx files',
      'Export to PDF or pictures from File › Export',
      'Prizma keeps a recovery copy while you work',
      'Save as .prizma for an exact copy of everything'
    ].map(BU).join('')
  }, { transition: fade }))

  slides.push(make('statement', (s, ph) => { ph('body')[0].html = P('Now make something great.') }, { transition: { type: 'zoom', dur: 0.9 } }))

  d.slides = slides
  d.props.title = 'Welcome to Prizma'
  return d
}

export function loadTour () {
  clearMedia()
  loadDoc(buildTour(), { name: 'Welcome to Prizma' })
  backstage.value = null
  native?.setIdle(false)
}
// Keep the current presentation: the tour opens in a new window unless this one is still empty
export function openTour () {
  if (isPristine() || !native) { loadTour(); return }
  native.newWindow(':tour')
  toast('The tour opens in a new window.')
}

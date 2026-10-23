// Interface language. The main process picks the language and hands over its table before the first render
// (preload); English strings are the keys and anything missing stays English.
// Text reaches the screen untouched in the code: a Preact hook swaps it when the element is created.
import { options, Fragment } from 'preact'

const L = globalThis.prizmaNative?.i18n || { lang: 'en', dict: {} }
export const lang = L.lang
const dict = L.dict || {}

// keys with {0}, {1}… match strings built at run time ("Saving {0}…")
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const patterns = Object.keys(dict).filter(k => /\{\d\}/.test(k)).map(k => {
  const order = []
  const re = new RegExp('^' + k.split(/\{(\d)\}/).map((part, i) => i % 2 ? (order.push(+part), '(.+?)') : esc(part)).join('') + '$', 's')
  return { re, order, out: dict[k] }
})
const memo = new Map()
export function t (s) {
  if (typeof s !== 'string' || !s || lang === 'en') return s
  const hit = dict[s]
  if (hit) return hit
  if (memo.has(s)) return memo.get(s)
  let r = s
  const trimmed = s.trim()
  if (trimmed !== s && dict[trimmed]) r = s.replace(trimmed, dict[trimmed]) // JSX keeps the spaces around a word
  else if (/[A-Za-z]{2}/.test(s)) {
    for (const p of patterns) {
      const m = p.re.exec(s)
      if (m) { r = p.out.replace(/\{(\d)\}/g, (_, n) => m[p.order.indexOf(+n) + 1] ?? ''); break }
    }
  }
  if (memo.size < 5000) memo.set(s, r)
  return r
}

const ATTRS = ['title', 'placeholder', 'aria-label', 'data-tip', 'alt']
const kids = c => typeof c === 'string' ? t(c) : Array.isArray(c) ? c.map(kids) : c
// translate="no" (the HTML attribute) keeps people's own words as they are; SVG <text> is chart data on a slide
if (lang !== 'en') {
  const prev = options.vnode
  options.vnode = v => {
    const p = v.props
    if ((typeof v.type === 'string' || v.type === Fragment) && p && p.translate !== 'no' && v.type !== 'text' && v.type !== 'tspan') {
      if (p.children !== undefined) p.children = kids(p.children)
      for (const a of ATTRS) if (typeof p[a] === 'string') p[a] = t(p[a])
    }
    if (prev) prev(v)
  }
  document.documentElement.lang = lang
}

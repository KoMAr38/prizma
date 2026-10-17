import { h } from 'preact'
import { icons } from 'lucide'

const pascal = s => s.replace(/(^|[-_ ])(\w)/g, (m, a, b) => b.toUpperCase())
export const iconNode = name => icons[name] || icons[pascal(name)] || null
export const ICON_NAMES = Object.keys(icons)

export function Icon ({ name, size = 16, stroke = 1.75, class: cls = '', style, title }) {
  const node = iconNode(name)
  return (
    <svg class={'ic ' + cls} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" style={style} aria-hidden={title ? undefined : 'true'}>
      {title && <title>{title}</title>}
      {node && node.map(([tag, attrs], i) => h(tag, { key: i, ...attrs }))}
    </svg>
  )
}
// Raw SVG markup for an icon (used for icon elements on slides and for export)
export function iconSvgMarkup (name, color = '#000', strokeWidth = 2) {
  const node = iconNode(name)
  if (!node) return ''
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ')}/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}

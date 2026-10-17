// Table style presets. A look resolves per cell from the table's style options and theme accent.
export const TABLE_STYLES = [
  { id: 'medium', label: 'Medium banded' },
  { id: 'light', label: 'Light lines' },
  { id: 'accentGrid', label: 'Accent grid' },
  { id: 'dark', label: 'Dark header' },
  { id: 'grid', label: 'Plain grid' },
  { id: 'none', label: 'No style' }
]
const B = (color, width = 1) => ({ color, width })
export function tableCellLook (el, r, c, styleOverride) {
  const st = { id: 'medium', accent: 'accent1', header: true, banded: true, firstCol: false, lastRow: false, ...(el.style || {}), ...(styleOverride || {}) }
  const rows = el.rows?.length || 0
  const a = st.accent || 'accent1'
  const isHead = st.header && r === 0
  const isLast = st.lastRow && r === rows - 1 && rows > 1
  const bodyR = st.header ? r - 1 : r
  const band = !isHead && !isLast && ((st.banded && bodyR % 2 === 0) || (st.bandCol && c % 2 === 0))
  const firstCol = st.firstCol && c === 0 && !isHead
  const lastCol = st.lastCol && c === (el.cols?.length || 1) - 1 && !isHead
  const look = { fill: null, color: null, bold: false, borders: {} }
  switch (st.id) {
    case 'medium':
      if (isHead) { look.fill = a; look.color = 'lt1'; look.bold = true } else look.fill = band ? a + '@26' : a + '@13'
      look.borders = { top: B('lt1'), bottom: B('lt1'), left: B('lt1'), right: B('lt1') }
      break
    case 'light':
      if (isHead) { look.bold = true; look.borders.bottom = B(a, 1.5) }
      if (band) look.fill = a + '@14'
      if (r === 0 && !st.header) look.borders.top = B(a, 1.5)
      if (r === rows - 1) look.borders.bottom = B(a, 1.5)
      break
    case 'accentGrid':
      if (isHead) { look.fill = a; look.color = 'lt1'; look.bold = true } else if (band) look.fill = a + '@10'
      look.borders = { top: B(a + '@55'), bottom: B(a + '@55'), left: B(a + '@55'), right: B(a + '@55') }
      break
    case 'dark':
      if (isHead) { look.fill = 'dk1'; look.color = 'lt1'; look.bold = true } else look.fill = band ? 'dk1@12' : 'dk1@5'
      look.borders = { bottom: B('dk1@25', 0.75) }
      break
    case 'grid':
      if (isHead) look.bold = true
      look.borders = { top: B('dk1@45'), bottom: B('dk1@45'), left: B('dk1@45'), right: B('dk1@45') }
      break
    default:
      break
  }
  if (firstCol || lastCol) look.bold = true
  if (isLast) { look.bold = true; look.borders = { ...look.borders, top: B(st.id === 'medium' ? 'lt1' : a, 2) } }
  return look
}

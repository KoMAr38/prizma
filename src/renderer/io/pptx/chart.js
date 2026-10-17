// Native PowerPoint charts (chart part + embedded workbook) from our chart elements.
// 3-D pies and columns become real 3-D charts in PowerPoint, with the same colours and soft shadows.
import JSZip from 'jszip'
import { esc, colorXml, solidXml, XML_HEAD, NS } from './xml.js'
import { fontXml } from './text.js'
import { seriesColor, xNumbers } from '../../render/chart.jsx'

const ACCENTS = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']
const catColor = (el, i) => (el.pointColors && el.pointColors[i]) || (i < 6 ? ACCENTS[i] : ACCENTS[i % 6] + ':' + (i < 12 ? -30 : 40))
const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const SHADOW = '<a:effectLst><a:outerShdw blurRad="63500" dist="25400" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst>'

function strRef (ref, values) {
  return `<c:strRef><c:f>${esc(ref)}</c:f><c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef>`
}
function numRef (ref, values) {
  return `<c:numRef><c:f>${esc(ref)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${num(v)}</c:v></c:pt>`).join('')}</c:numCache></c:numRef>`
}
function txPr (ctx, ts, { size, bold, alpha = 1 } = {}) {
  const sz = Math.round((size || ts.size || 12) * 100)
  return `<c:txPr><a:bodyPr rot="0" spcFirstLastPara="1" vertOverflow="ellipsis" wrap="square" anchor="ctr" anchorCtr="1"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}">${solidXml(ts.color || 'dk1', alpha, ctx.theme)}${fontXml(ts.font || '+minor')}</a:defRPr></a:pPr><a:endParaRPr lang="${ctx.lang}"/></a:p></c:txPr>`
}
const lineSp = (ctx, ts, alpha, w = 9525) => `<c:spPr><a:noFill/><a:ln w="${w}" cap="flat">${solidXml(ts.color || 'dk1', alpha, ctx.theme)}<a:round/></a:ln></c:spPr>`

function dLbls (kind, o, ctx, ts, { stacked } = {}) {
  if (!o.labels) return `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
  const pie = kind === 'pie' || kind === 'pie2d' || kind === 'doughnut'
  const outside = pie && o.labelPos === 'outside'
  const light = pie && !outside
  const pos = kind === 'bar' ? `<c:dLblPos val="${stacked ? 'ctr' : 'outEnd'}"/>` : (kind === 'pie2d' ? `<c:dLblPos val="${outside ? 'outEnd' : 'ctr'}"/>` : '')
  const tp = light
    ? `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${Math.round((ts.size || 12) * 100)}" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>${fontXml(ts.font || '+minor')}</a:defRPr></a:pPr><a:endParaRPr lang="${ctx.lang}"/></a:p></c:txPr>`
    : txPr(ctx, ts, { bold: pie })
  return `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${tp}${pos}<c:showLegendKey val="0"/><c:showVal val="${pie ? 0 : 1}"/><c:showCatName val="${outside ? 1 : 0}"/><c:showSerName val="0"/><c:showPercent val="${pie ? 1 : 0}"/><c:showBubbleSize val="0"/>${outside ? '<c:showLeaderLines val="1"/>' : ''}</c:dLbls>`
}

function axes (ctx, ts, o, { bar, horizontal, reversed, valMin, scatter } = {}) {
  const textAx = txPr(ctx, ts, { size: Math.max(8, (ts.size || 12) * 0.85), alpha: 0.75 })
  const grid = o.gridlines !== false ? `<c:majorGridlines>${lineSp(ctx, ts, 0.13)}</c:majorGridlines>` : ''
  const catPos = horizontal ? 'l' : 'b', valPos = horizontal ? 'b' : 'l'
  const cat = scatter
    ? `<c:valAx><c:axId val="500000001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${lineSp(ctx, ts, 0.3)}${textAx}<c:crossAx val="500000002"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`
    : `<c:catAx><c:axId val="500000001"/><c:scaling><c:orientation val="${reversed ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${catPos}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${lineSp(ctx, ts, 0.3)}${textAx}<c:crossAx val="500000002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
  const min = valMin !== undefined ? `<c:min val="${valMin}"/>` : ''
  const val = `<c:valAx><c:axId val="500000002"/><c:scaling><c:orientation val="minMax"/>${min}</c:scaling><c:delete val="0"/><c:axPos val="${valPos}"/>${grid}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${textAx}<c:crossAx val="500000001"/><c:crosses val="autoZero"/><c:crossBetween val="${bar ? 'between' : 'midCat'}"/></c:valAx>`
  return cat + val
}

// Returns { xml, xlsx } for one chart element
export async function chartPart (el, ctx) {
  const type = el.chartType || 'column'
  const deep = (el.look || '3d') === '3d'
  const o = el.opts || {}
  const ts = { font: '+minor', size: 12, color: 'dk1', ...(el.ts || {}) }
  const cats = (el.categories || []).map(c => String(c ?? ''))
  const series = (el.series || []).filter(Boolean)
  const n = cats.length
  const catRef = `Sheet1!$A$2:$A$${n + 1}`
  const serTx = (s, si) => `<c:tx>${strRef(`Sheet1!$${colName(si + 1)}$1`, [s.name || `Series ${si + 1}`])}</c:tx>`
  const valRef = si => `Sheet1!$${colName(si + 1)}$2:$${colName(si + 1)}$${n + 1}`
  const vals = s => cats.map((_, i) => num(s.values?.[i]))
  const grouping = el.grouping || 'clustered'
  const stacked = grouping === 'stacked' || grouping === 'percent'
  let plot = ''
  let view3D = ''
  let walls = ''
  if (type === 'pie' || type === 'doughnut') {
    const s = series[0] || { name: 'Series 1', values: [] }
    const dpts = cats.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${solidXml(catColor(el, i), 1, ctx.theme)}<a:ln w="12700">${solidXml('lt1', 1, ctx.theme)}</a:ln>${deep ? SHADOW : ''}</c:spPr></c:dPt>`).join('')
    const ser = `<c:ser><c:idx val="0"/><c:order val="0"/>${serTx(s, 0)}${dpts}${dLbls(type === 'pie' && !deep ? 'pie2d' : 'pie', o, ctx, ts)}<c:cat>${strRef(catRef, cats)}</c:cat><c:val>${numRef(valRef(0), vals(s))}</c:val></c:ser>`
    if (type === 'doughnut') plot = `<c:doughnutChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/><c:holeSize val="${Math.max(10, Math.min(90, Math.round(o.holeSize || 58)))}"/></c:doughnutChart>`
    else if (deep) {
      view3D = '<c:view3D><c:rotX val="30"/><c:rotY val="0"/><c:depthPercent val="100"/><c:rAngAx val="0"/></c:view3D>'
      plot = `<c:pie3DChart><c:varyColors val="1"/>${ser}</c:pie3DChart>`
    } else plot = `<c:pieChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/></c:pieChart>`
  } else if (type === 'scatter') {
    const xs = xNumbers(cats) || cats.map((_, i) => i + 1)
    const sers = series.map((s, si) => `<c:ser><c:idx val="${si}"/><c:order val="${si}"/>${serTx(s, si)}<c:spPr><a:ln w="28575" cap="rnd"><a:noFill/><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr>${solidXml(seriesColor(el, si), 1, ctx.theme)}<a:ln w="9525">${solidXml(seriesColor(el, si), 1, ctx.theme)}</a:ln>${deep ? SHADOW : ''}</c:spPr></c:marker>${dLbls('scatter', o, ctx, ts)}<c:xVal>${numRef(catRef, xs)}</c:xVal><c:yVal>${numRef(valRef(si), vals(s))}</c:yVal><c:smooth val="0"/></c:ser>`).join('')
    plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${sers}<c:axId val="500000001"/><c:axId val="500000002"/></c:scatterChart>` + axes(ctx, ts, o, { scatter: true })
  } else if (type === 'radar') {
    const sers = series.map((s, si) => `<c:ser><c:idx val="${si}"/><c:order val="${si}"/>${serTx(s, si)}<c:spPr>${solidXml(seriesColor(el, si), 0.22, ctx.theme)}<a:ln w="22225">${solidXml(seriesColor(el, si), 1, ctx.theme)}</a:ln></c:spPr>${dLbls('radar', o, ctx, ts)}<c:cat>${strRef(catRef, cats)}</c:cat><c:val>${numRef(valRef(si), vals(s))}</c:val></c:ser>`).join('')
    plot = `<c:radarChart><c:radarStyle val="filled"/><c:varyColors val="0"/>${sers}<c:axId val="500000001"/><c:axId val="500000002"/></c:radarChart>` + axes(ctx, ts, o, {})
  } else if (type === 'line' || type === 'area') {
    const g = grouping === 'percent' ? 'percentStacked' : grouping === 'stacked' ? 'stacked' : 'standard'
    // same automatic minimum as our renderer, so the curves keep their shape
    let valMin
    if (!stacked) {
      const all = series.flatMap(s => vals(s))
      const lo = Math.min(...all), hi = Math.max(...all)
      if (all.length && lo >= 0 && hi > 0 && (hi - lo) < hi * 0.6) {
        const raw = lo - (hi - lo) * 0.25
        const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, hi - lo))))
        valMin = Math.max(0, Math.floor(raw / mag) * mag)
      }
    }
    if (type === 'line') {
      const sers = series.map((s, si) => `<c:ser><c:idx val="${si}"/><c:order val="${si}"/>${serTx(s, si)}<c:spPr><a:ln w="31750" cap="rnd">${solidXml(seriesColor(el, si), 1, ctx.theme)}<a:round/></a:ln>${deep ? SHADOW : ''}</c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${solidXml(seriesColor(el, si), 1, ctx.theme)}<a:ln w="9525">${solidXml('lt1', 1, ctx.theme)}</a:ln></c:spPr></c:marker>${dLbls('line', o, ctx, ts)}<c:cat>${strRef(catRef, cats)}</c:cat><c:val>${numRef(valRef(si), vals(s))}</c:val><c:smooth val="1"/></c:ser>`).join('')
      plot = `<c:lineChart><c:grouping val="${g}"/><c:varyColors val="0"/>${sers}<c:marker val="1"/><c:axId val="500000001"/><c:axId val="500000002"/></c:lineChart>` + axes(ctx, ts, o, { valMin })
    } else {
      const sers = series.map((s, si) => {
        const c = seriesColor(el, si)
        const fill = `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0">${colorXml(c, 0.85, ctx.theme)}</a:gs><a:gs pos="100000">${colorXml(c, 0.12, ctx.theme)}</a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>`
        return `<c:ser><c:idx val="${si}"/><c:order val="${si}"/>${serTx(s, si)}<c:spPr>${fill}<a:ln w="22225">${solidXml(c, 1, ctx.theme)}</a:ln></c:spPr>${dLbls('area', o, ctx, ts)}<c:cat>${strRef(catRef, cats)}</c:cat><c:val>${numRef(valRef(si), vals(s))}</c:val></c:ser>`
      }).join('')
      plot = `<c:areaChart><c:grouping val="${g}"/><c:varyColors val="0"/>${sers}<c:axId val="500000001"/><c:axId val="500000002"/></c:areaChart>` + axes(ctx, ts, o, { valMin })
    }
  } else {
    // column / bar
    const horizontal = type === 'bar'
    const g = grouping === 'percent' ? 'percentStacked' : grouping === 'stacked' ? 'stacked' : 'clustered'
    const sers = series.map((s, si) => {
      const c = seriesColor(el, si)
      const fill = deep
        ? `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0">${colorXml(c.includes(':') ? c : c + ':14', 1, ctx.theme)}</a:gs><a:gs pos="100000">${colorXml(c, 1, ctx.theme)}</a:gs></a:gsLst><a:lin ang="${horizontal ? 0 : 5400000}" scaled="0"/></a:gradFill>`
        : solidXml(c, 1, ctx.theme)
      // 3-D bars take no label position (Excel can fail on one)
      return `<c:ser><c:idx val="${si}"/><c:order val="${si}"/>${serTx(s, si)}<c:spPr>${fill}<a:ln><a:noFill/></a:ln>${deep ? SHADOW : ''}</c:spPr><c:invertIfNegative val="0"/>${dLbls(deep ? 'bar3d' : 'bar', o, ctx, ts, { stacked })}<c:cat>${strRef(catRef, cats)}</c:cat><c:val>${numRef(valRef(si), vals(s))}</c:val></c:ser>`
    }).join('')
    if (deep) {
      view3D = `<c:view3D><c:rotX val="${horizontal ? 10 : 12}"/><c:rotY val="${horizontal ? 10 : 18}"/><c:depthPercent val="100"/><c:rAngAx val="1"/></c:view3D>`
      walls = '<c:floor><c:thickness val="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:floor><c:sideWall><c:thickness val="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:sideWall><c:backWall><c:thickness val="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:backWall>'
      plot = `<c:bar3DChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="${g}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="80"/><c:shape val="box"/><c:axId val="500000001"/><c:axId val="500000002"/></c:bar3DChart>`
    } else {
      plot = `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="${g}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="80"/>${stacked ? '<c:overlap val="100"/>' : '<c:overlap val="-8"/>'}<c:axId val="500000001"/><c:axId val="500000002"/></c:barChart>`
    }
    plot += axes(ctx, ts, o, { bar: true, horizontal, reversed: !!el.reversed })
  }
  const title = o.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${Math.round((ts.size || 12) * 140)}" b="1">${solidXml(ts.color || 'dk1', 1, ctx.theme)}${fontXml(ts.font || '+minor')}</a:defRPr></a:pPr><a:r><a:rPr lang="${ctx.lang}" sz="${Math.round((ts.size || 12) * 140)}" b="1">${solidXml(ts.color || 'dk1', 1, ctx.theme)}${fontXml(ts.font || '+minor')}</a:rPr><a:t>${esc(o.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : '<c:autoTitleDeleted val="1"/>'
  const legendPos = { bottom: 'b', right: 'r', top: 't', left: 'l' }[o.legend]
  const legend = legendPos ? `<c:legend><c:legendPos val="${legendPos}"/><c:overlay val="0"/>${txPr(ctx, ts, { size: Math.max(8, (ts.size || 12) * 0.9), alpha: 0.85 })}</c:legend>` : ''
  const xml = `${XML_HEAD}<c:chartSpace xmlns:c="${NS.c}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><c:date1904 val="0"/><c:lang val="${ctx.lang}"/><c:roundedCorners val="0"/><c:chart>${title}${view3D}${walls}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(ctx, ts)}<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`
  return { xml, xlsx: await workbook(cats, series, type === 'scatter') }
}

// Minimal workbook holding the chart data, so "Edit Data" works in PowerPoint
async function workbook (cats, series, scatter) {
  const cell = (r, c, v) => {
    const ref = colName(c) + r
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
  }
  const rows = []
  rows.push(`<row r="1">${cell(1, 0, scatter ? 'X' : '')}${series.map((s, i) => cell(1, i + 1, s.name || `Series ${i + 1}`)).join('')}</row>`)
  const xs = scatter ? xNumbers(cats) || cats.map((_, i) => i + 1) : cats
  cats.forEach((cat, ri) => {
    rows.push(`<row r="${ri + 2}">${cell(ri + 2, 0, xs[ri])}${series.map((s, i) => cell(ri + 2, i + 1, num(s.values?.[ri]))).join('')}</row>`)
  })
  const z = new JSZip()
  z.file('[Content_Types].xml', `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`)
  z.file('_rels/.rels', `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)
  z.file('xl/workbook.xml', `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS.r}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`)
  z.file('xl/_rels/workbook.xml.rels', `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)
  z.file('xl/styles.xml', `${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`)
  z.file('xl/worksheets/sheet1.xml', `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`)
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process')
const { chromium } = require('/opt/npm-tools/node_modules/playwright')
const B = require('./defs.js')
const out = path.resolve(__dirname, '../build'); fs.mkdirSync(out, { recursive: true })
const fontDir = path.resolve(__dirname, '../node_modules/@fontsource-variable')
const b64 = f => fs.readFileSync(f).toString('base64')
const fontCss = `@font-face{font-family:'Manrope Variable';src:url(data:font/woff2;base64,${b64(fontDir + '/manrope/files/manrope-latin-wght-normal.woff2')}) format('woff2');font-weight:200 800}
@font-face{font-family:'Unbounded Variable';src:url(data:font/woff2;base64,${b64(fontDir + '/unbounded/files/unbounded-latin-wght-normal.woff2')}) format('woff2');font-weight:200 900}`
const page = (body, w, h, bg = 'transparent') => `<!doctype html><html><head><style>${fontCss}html,body{margin:0;background:${bg};width:${w}px;height:${h}px;overflow:hidden}svg{display:block}</style></head><body>${body}</body></html>`
fs.writeFileSync(path.join(out, 'icon.svg'), B.appIcon(false))
fs.writeFileSync(path.join(out, 'mark.svg'), B.markOnly())
;(async () => {
  const browser = await chromium.launch()
  async function render(html, w, h, file, transparent = true) {
    const p = await browser.newPage({ viewport: { width: w, height: h } })
    await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(60)
    await p.screenshot({ path: file, omitBackground: transparent }); await p.close()
  }
  const sized = (svg, s) => svg.replace('width="256" height="256"', `width="${s}" height="${s}"`)
  const icoSet = async (name, mk) => {
    const files = []
    for (const s of [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]) {
      const f = path.join(out, `${name}-${s}.png`)
      await render(page(sized(mk(s <= 24, s), s), s, s), s, s, f); files.push(f)
    }
    execFileSync('convert', [...files, path.join(out, `${name}.ico`)])
    fs.copyFileSync(path.join(out, `${name}-256.png`), path.join(out, `${name}.png`))
    for (const f of files) if (!/-256\.png$/.test(f) && !/-(32|64|128)\.png$/.test(f)) fs.unlinkSync(f)
  }
  await icoSet('icon', small => B.appIcon(small))
  await icoSet('doc-prizma', (small, s) => B.docIcon(s >= 64 ? 'PRIZMA' : '', small))
  await icoSet('doc-pptx', (small, s) => B.docIcon(s >= 64 ? 'PPTX' : '', small))
  await icoSet('doc-show', (small, s) => B.docIcon(s >= 64 ? 'SHOW' : '', small))
  // 512 & 1024 app icon PNGs for window/about
  for (const s of [512, 1024]) await render(page(sized(B.appIcon(false), s), s, s), s, s, path.join(out, `icon-${s}.png`))
  // NSIS sidebar (164x314) and header (150x57) bitmaps
  const sidebar = `<div style="position:relative;width:164px;height:314px;background:linear-gradient(180deg,#232750 0%,#10122A 100%);overflow:hidden;font-family:'Manrope Variable'">
   <div style="position:absolute;inset:0;background:radial-gradient(120% 70% at 90% 0%,rgba(61,235,176,.30),rgba(61,235,176,0) 60%)"></div>
   <div style="position:absolute;left:-40px;right:-40px;bottom:-60px;height:160px;background:radial-gradient(60% 60% at 30% 100%,rgba(118,86,255,.35),rgba(118,86,255,0) 70%)"></div>
   <div style="position:absolute;left:22px;top:34px;width:58px">${B.markOnly().replace('width="136" height="166"', 'width="44" height="54"')}</div>
   <div style="position:absolute;left:22px;top:104px;color:#F2F3FF;font:600 23px 'Unbounded Variable';letter-spacing:.5px">Prizma</div>
   <div style="position:absolute;left:22px;top:138px;color:#AAB0D6;font:500 11.5px/1.45 'Manrope Variable';width:124px">Presentation studio for Windows</div>
   <div style="position:absolute;left:22px;bottom:20px;color:#7F86B3;font:500 10px 'Manrope Variable'">Version 1.0</div></div>`
  await render(page(sidebar, 164, 314, '#10122A'), 164, 314, path.join(out, 'sidebar.png'), false)
  const header = `<div style="position:relative;width:150px;height:57px;background:linear-gradient(90deg,#1A1D3F,#10122A);overflow:hidden;font-family:'Manrope Variable'">
   <div style="position:absolute;inset:0;background:radial-gradient(80% 120% at 100% 0%,rgba(61,235,176,.28),rgba(61,235,176,0) 70%)"></div>
   <div style="position:absolute;left:16px;top:13px">${B.markOnly().replace('width="136" height="166"', 'width="25" height="31"')}</div>
   <div style="position:absolute;left:50px;top:18px;color:#F2F3FF;font:600 16px 'Unbounded Variable'">Prizma</div></div>`
  await render(page(header, 150, 57, '#10122A'), 150, 57, path.join(out, 'header.png'), false)
  await browser.close()
  for (const n of ['sidebar', 'header']) execFileSync('convert', [path.join(out, n + '.png'), '-type', 'TrueColor', 'BMP3:' + path.join(out, n + '.bmp')])
  console.log(fs.readdirSync(out).join(' '))
})()

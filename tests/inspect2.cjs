const { _electron: electron } = require('/opt/npm-tools/node_modules/playwright')
const path = require('path')
;(async () => {
  const app = await electron.launch({ executablePath: path.join(__dirname, '../node_modules/electron/dist/electron'), args: [path.join(__dirname, '..'), '--no-sandbox'] })
  const page = await app.firstWindow()
  await page.evaluate(() => { window.__pzDebug = true })
  await page.goto('app://prizma/index.html?file=' + encodeURIComponent(path.resolve(process.argv[2])) + '#test')
  await page.addInitScript(() => { window.__pzDebug = true })
  await page.reload()
  await page.waitForFunction(() => document.title === 'ready' || document.title === 'error', null, { timeout: 60000 })
  const out = await page.evaluate(i => {
    const a = window.__pzAnalysis.slides[i]
    return JSON.stringify({ hideAll: a.hideAllMaster, hideMaster: a.hideMasterOnly, masterKeys: [...a.masterKeys], layoutKeys: [...a.layoutKeys], masterShapes: Object.fromEntries(Object.entries(a.masterShapes).map(([k, v]) => [k, { lineColor: v.lineColor, lineWidth: v.lineWidth }])) }, null, 0)
  }, Number(process.argv[3]))
  console.log(out.slice(0, 4000))
  await app.close()
})()

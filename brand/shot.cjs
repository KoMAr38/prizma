const { chromium } = require('/opt/npm-tools/node_modules/playwright')
;(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Number(process.argv[4] || 1400), height: Number(process.argv[5] || 800) }, deviceScaleFactor: Number(process.argv[6] || 1) })
  await p.goto('file://' + process.argv[2]); await p.waitForTimeout(300)
  await p.screenshot({ path: process.argv[3], fullPage: true }); await b.close()
})()

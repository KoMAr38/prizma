// Prints imported element HTML for one slide: node tests/inspect.cjs file.pptx slideIndex
const { _electron: electron } = require('/opt/npm-tools/node_modules/playwright')
const path = require('path')
;(async () => {
  const app = await electron.launch({ executablePath: path.join(__dirname, '../node_modules/electron/dist/electron'), args: [path.join(__dirname, '..'), '--no-sandbox'] })
  const page = await app.firstWindow()
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)) })
  await page.goto('app://prizma/index.html?file=' + encodeURIComponent(path.resolve(process.argv[2])) + '#test')
  await page.waitForFunction(() => document.title === 'ready' || document.title === 'error', null, { timeout: 60000 })
  const out = await page.evaluate(i => {
    const s = window.__doc.slides[i]
    const strip = e => { const c = { ...e }; if (c.html) c.html = c.html.slice(0, 900); return c }
    return JSON.stringify({ master: (s.master || []).map(strip), elements: s.elements.map(strip), bg: s.bg }, null, 1)
  }, Number(process.argv[3]))
  console.log(out.slice(0, 8000))
  await app.close()
})()

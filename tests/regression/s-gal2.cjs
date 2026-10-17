// Gallery after the fix: screenshots, label overflow check, ribbon fit, animation pane chips
const path = require('path')
module.exports = async ({ page, ev, shot, wait, errors, OUT }) => {
  await ev(`__pz.tour.loadTour(); __pz.store.backstage.value = null; __pz.store.goSlide(5)`)
  await wait(400)
  for (const ui of ['light', 'dark']) {
    await ev(`(() => { const s = __pz.store; s.settings.value = { ...s.settings.value, theme: '${ui}' }; document.documentElement.dataset.ui = '${ui}'; s.select([s.slide.value.elements[1].id]); s.ribbonTab.value = 'animations'; s.pane.value = 'anim' })()`)
    await wait(300)
    await page.locator('.gal.gal-fx .gal-nav button[data-tip="More"]').first().click()
    await wait(400)
    await page.locator('.gal-pop.gal-fx').screenshot({ path: path.join(OUT, `gal-anim-${ui}.png`) })
    const over = await ev(`[...document.querySelectorAll('.gal-pop.gal-fx .fx-item > span')].filter(s => s.scrollWidth > s.closest('.gi').clientWidth - 2).map(s => s.textContent)`)
    if (over.length) errors.push(`${ui}: labels wider than their tile: ${over.join(', ')}`)
    await page.keyboard.press('Escape')
    await wait(200)
    const rb = await ev(`(() => { const r = document.querySelector('.ribbon, .rb, [class*="ribbon"]'); const g = [...document.querySelectorAll('.rg')].pop(); return { win: innerWidth, lastGroupRight: g ? Math.round(g.getBoundingClientRect().right) : null } })()`)
    console.log(ui, 'ribbon', JSON.stringify(rb))
    if (rb.lastGroupRight > rb.win) errors.push(`${ui}: Animations ribbon overflows (${rb.lastGroupRight} > ${rb.win})`)
    await shot(`ribbon-anim-${ui}`)
  }
}

// Keyboard and screen reader basics: every control has a name, Tab reaches the ribbon, focus is visible
module.exports = async ({ page, ev, wait, errors, shot }) => {
  await ev(`__pz.tour.loadTour(); __pz.store.backstage.value = null; __pz.store.goSlide(3)`)
  await wait(300)
  const audit = () => ev(`(() => {
    const named = el => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.textContent || el.getAttribute('placeholder') || (el.labels && el.labels.length ? 'l' : '') || (el.closest('label') ? 'l' : '')).trim().length > 0
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
    const bad = [...document.querySelectorAll('button, [role=button], input, select, textarea, [contenteditable=true]')].filter(el => vis(el) && !named(el))
    return { n: bad.length, ex: bad.slice(0, 12).map(el => (el.dataset.tip || el.className || el.tagName).toString().slice(0, 40)) }
  })()`)
  const tabs = ['home', 'insert', 'draw', 'design', 'transitions', 'animations', 'slideshow', 'review', 'view']
  let total = 0
  for (const t of tabs) {
    await ev(`(() => { const s = __pz.store; s.select([s.slide.value.elements[s.slide.value.elements.length - 1].id]); s.ribbonTab.value = '${t}' })()`)
    await wait(150)
    const r = await audit()
    total += r.n
    console.log(t.padEnd(12), 'unnamed', r.n, JSON.stringify(r.ex))
  }
  for (const p of ['format', 'selection', 'anim', 'comments']) {
    await ev(`__pz.store.pane.value = '${p}'`); await wait(200)
    const r = await audit(); total += r.n
    console.log(('pane ' + p).padEnd(12), 'unnamed', r.n, JSON.stringify(r.ex))
  }
  await ev(`__pz.store.pane.value = null`)
  // keyboard: F6 walks the regions, Tab moves inside the ribbon with a visible ring, Enter presses, Esc returns to the slide
  const where = () => ev(`(() => { const a = document.activeElement; if (!a || a === document.body) return 'slide'; const cs = getComputedStyle(a); const ring = cs.outlineStyle !== 'none' || cs.boxShadow !== 'none'; return (a.closest('.ribbon') ? 'ribbon:' : a.closest('.thumbs') ? 'thumbs:' : a.closest('.notes') ? 'notes:' : a.closest('.statusbar') ? 'status:' : '?:') + (a.dataset.tip || a.textContent.trim().slice(0, 14) || a.tagName) + (ring ? '' : ' [NO RING]') })()`)
  await page.mouse.click(700, 500); await wait(100); await page.keyboard.press('Escape')
  const walk = []
  for (let i = 0; i < 6; i++) { await page.keyboard.press('F6'); walk.push(await where()) }
  console.log('F6:', walk.join(' → '))
  if (!walk.some(w => w.startsWith('ribbon')) || !walk.some(w => w.startsWith('thumbs')) || !walk.includes('slide')) errors.push('F6 does not reach every region: ' + walk.join(', '))
  while (!(await where()).startsWith('ribbon')) await page.keyboard.press('F6')
  const hops = []
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); hops.push(await where()) }
  console.log('Tab in ribbon:', hops.join(' → '))
  if (hops.some(x => x.includes('NO RING'))) errors.push('focus ring missing: ' + hops.filter(x => x.includes('NO RING')).join(', '))
  if (!hops.every(x => x.startsWith('ribbon'))) errors.push('Tab left the ribbon too early')
  const tabBefore = await ev(`__pz.store.ribbonTab.value`)
  await page.keyboard.press('Enter'); await wait(200)
  console.log('Enter on', hops[3], '→ ribbon tab', tabBefore, '->', await ev(`__pz.store.ribbonTab.value`))
  await page.keyboard.press('Escape'); await wait(100)
  const back = await where()
  console.log('Esc →', back)
  if (back !== 'slide') errors.push('Esc did not return to the slide')
  if (total) errors.push(`${total} controls without an accessible name`)
}

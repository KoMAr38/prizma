// Developer harness: renders every slide of a file at 100 % for screenshot comparison.
import { useEffect, useState } from 'preact/hooks'
import { importPptx } from '../io/importPptx.js'
import { SlideView } from '../render/SlideView.jsx'
import { native } from '../core/store.js'
import { numberingCss } from '../core/html.js'

export function TestView () {
  const [doc, setDoc] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    const file = new URLSearchParams(location.search).get('file')
    ;(async () => {
      try {
        const bytes = await native.readFile(file)
        const d = await importPptx(bytes)
        window.__doc = d
        setDoc(d)
        setTimeout(() => { document.title = 'ready' }, 600)
      } catch (e) { console.error(e); setErr(String(e.stack || e)); document.title = 'error' }
    })()
  }, [])
  if (err) return <pre style={{ color: 'red' }}>{err}</pre>
  if (!doc) return <div>loading</div>
  return (
    <div style={{ background: '#777', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
      <style>{numberingCss()}</style>
      {doc.slides.map((s, i) => <div class="test-slide" data-i={i}><SlideView slide={s} docObj={doc} mode="show" ctx={'t' + i} index={i} /></div>)}
    </div>
  )
}

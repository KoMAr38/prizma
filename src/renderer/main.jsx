// Entry point: one bundle serves the editor and every helper window, chosen by the URL hash.
import { render, options } from 'preact'
import '@fontsource-variable/manrope'
import '@fontsource-variable/unbounded'
import './styles/slide.css'
import './styles/app.css'
import { App } from './app/App.jsx'
import { ShowApp, PresenterApp, ReadingApp, CaptureApp } from './show/apps.jsx'
import * as store from './core/store.js'
import * as actions from './core/actions.js'
import * as files from './app/files.js'
import { runCmd } from './app/commands.js'
import * as tour from './app/tour.js'
import * as printing from './print/printing.js'

// Icon-only buttons carry their name in data-tip (the tooltip); screen readers get the same name
const vnodeHook = options.vnode
options.vnode = v => {
  const p = v.props
  if ((v.type === 'button' || v.type === 'a') && p['data-tip'] && p['aria-label'] === undefined) p['aria-label'] = p['data-tip']
  if (vnodeHook) vnodeHook(v)
}
const ROUTES = { editor: App, show: ShowApp, presenter: PresenterApp, reading: ReadingApp, capture: CaptureApp }
const mode = location.hash.replace('#', '') || 'editor'
document.documentElement.dataset.mode = mode
const gpu = soft => { document.documentElement.dataset.gpu = soft ? 'off' : 'on' }
store.native?.softGpu().then(gpu, () => {})
store.native?.onGpu(gpu)
const C = ROUTES[mode] || App
// automated UI tests drive the app through this hook (only when asked for in the URL)
if (/[?&]test=1/.test(location.search)) window.__pz = { store, actions, files, runCmd, tour, printing }
render(<C />, document.getElementById('root'))

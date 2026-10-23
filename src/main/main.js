'use strict'
// Prizma — Electron main process: windows, file access, dialogs, printing, autosave.
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, screen, nativeTheme, Menu, session } = require('electron')
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const os = require('os')
const { pathToFileURL } = require('url')
const { execFile } = require('child_process')

const isWin = process.platform === 'win32'
const ROOT = path.join(__dirname, '..', '..')
const DIST = path.join(ROOT, 'dist')
const ICON = path.join(ROOT, 'build', isWin ? 'icon.ico' : 'icon.png')
const OPENABLE = /\.(pptx|pptm|ppsx|ppsm|potx|potm|prizma|ppt|pps|pot|odp|otp|key|pdf)$/i

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true }
}])

app.setAppUserModelId('com.prizma.app')
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }

// ---------- persistent settings / recent files ----------
const userDir = () => app.getPath('userData')
const jsonPath = name => path.join(userDir(), name)
function readJson (name, fallback) {
  try { return JSON.parse(fs.readFileSync(jsonPath(name), 'utf8')) } catch { return fallback }
}
function writeJson (name, value) {
  try {
    fs.mkdirSync(userDir(), { recursive: true })
    const tmp = jsonPath(name) + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(value, null, 1))
    fs.renameSync(tmp, jsonPath(name))
  } catch (e) { console.error('writeJson', name, e) }
}
const DEFAULT_SETTINGS = {
  theme: 'dark', author: '', autosaveMinutes: 2, defaultFormat: 'pptx',
  showStart: true, presenterView: true, window: null, language: 'auto'
}
let settings = { ...DEFAULT_SETTINGS, ...readJson('settings.json', {}) }
let recent = readJson('recent.json', [])

function addRecent (p) {
  if (!p) return recent
  recent = [{ path: p, name: path.basename(p), time: Date.now() }, ...recent.filter(r => r.path.toLowerCase() !== p.toLowerCase())].slice(0, 25)
  writeJson('recent.json', recent)
  try { app.addRecentDocument(p) } catch {}
  return recent
}

// ---------- interface language ----------
// English strings are the keys of dist/locales/<lang>.json; a missing key stays English
const LANGS = ['sv', 'da', 'de', 'el', 'it', 'fr', 'ja', 'zh', 'pt-BR', 'es', 'pt-PT', 'ru', 'uk', 'mk', 'hu', 'bg', 'ro', 'tr', 'fi', 'nb', 'sr']
function supported (tag) {
  const t = String(tag || '').toLowerCase().replace('_', '-'), base = t.split('-')[0]
  if (['nb', 'no', 'nn'].includes(base)) return 'nb'
  if (['sr', 'hr', 'bs', 'sh'].includes(base)) return 'sr' // Serbian in Latin script reads for Croatian and Bosnian too
  if (base === 'pt') return t === 'pt-br' ? 'pt-BR' : 'pt-PT'
  if (base === 'zh') return 'zh' // Simplified Chinese, also for Traditional until it has its own table
  return base === 'en' || LANGS.includes(base) ? base : null
}
// called after app is ready: Windows' display languages are known only then
const uiLang = () => (settings.language && settings.language !== 'auto' && supported(settings.language)) ||
  [...app.getPreferredSystemLanguages(), app.getLocale()].map(supported).find(Boolean) || 'en'
const dicts = {}
const dictOf = l => dicts[l] || (dicts[l] = l === 'en' ? {} : readJsonAt(path.join(DIST, 'locales', l + '.json')))
function readJsonAt (p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { console.error('locale', p, e.message); return {} } }
const mt = s => dictOf(uiLang())[s] || s
ipcMain.on('i18n:get', e => { const lang = uiLang(); e.returnValue = { lang, dict: dictOf(lang) } })

// ---------- theme colours for the native title bar overlay ----------
const CHROME = { dark: { bar: '#0A0F1E', fg: '#E8ECF8', bg: '#090E1C' }, light: { bar: '#E9EEF7', fg: '#0E1630', bg: '#E9EEF7' } }
const effectiveTheme = () => settings.theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : settings.theme

// ---------- editor windows ----------
const windows = new Map() // webContents.id -> { win, file, pendingOpen, dirty, children:Set }

function filesFromArgv (argv) {
  return argv.slice(1).filter(a => a && !a.startsWith('-') && OPENABLE.test(a) && fs.existsSync(a)).map(a => path.resolve(a))
}

// fromShell: the file came from Windows (a double-click in Explorer), so a .ppsx starts its show as in PowerPoint
function createEditor (filePath, fromShell = false) {
  const st = settings.window || {}
  const t = CHROME[effectiveTheme()]
  const wa = screen.getPrimaryDisplay().workArea
  const bounds = { width: Math.min(st.width || 1440, wa.width), height: Math.min(st.height || 900, wa.height) }
  const focused = BrowserWindow.getFocusedWindow()
  // the saved place is used only while a screen still shows it (a second monitor may have been unplugged)
  const onScreen = (x, y) => screen.getAllDisplays().some(({ workArea: a }) => x + 120 > a.x && x + 120 < a.x + a.width && y + 16 > a.y && y + 16 < a.y + a.height)
  if (focused && windows.has(focused.webContents.id)) {
    const b = focused.getBounds(); bounds.x = b.x + 28; bounds.y = b.y + 28
  } else if (st.x !== undefined && onScreen(st.x, st.y)) { bounds.x = st.x; bounds.y = st.y }
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 980, minHeight: 620, show: false,
    title: 'Prizma', icon: ICON, backgroundColor: t.bg,
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : { color: t.bar, symbolColor: t.fg, height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true,
      backgroundThrottling: false
    }
  })
  const rec = { win, file: null, pendingOpen: filePath || null, fromShell, dirty: false, children: new Set() }
  const id = win.webContents.id
  windows.set(id, rec)
  if (st.maximized && !focused) win.maximize()
  win.once('ready-to-show', () => win.show())
  win.loadURL('app://prizma/index.html#editor')

  win.on('close', e => {
    if (rec.dirty && !rec.forceClose) {
      e.preventDefault()
      win.webContents.send('app:request-close')
      return
    }
    if (!win.isMinimized()) {
      const b = win.getNormalBounds()
      settings.window = { ...b, maximized: win.isMaximized() }
      writeJson('settings.json', settings)
    }
  })
  win.on('closed', () => {
    for (const c of rec.children) if (!c.isDestroyed()) c.close()
    windows.delete(id)
    dropHandles(id)
  })
  // A crashed page can't answer the close request, so X closes it. Its last autosave goes to the recovery list and the
  // window starts over, once, where the start screen offers that copy back (a page that keeps crashing is left closed).
  win.webContents.on('render-process-gone', async (e, d) => {
    rec.dirty = false
    dropHandles(id)
    if (rec.forceClose || d.reason === 'clean-exit' || Date.now() - (rec.restarted || 0) < 30000) return
    rec.restarted = Date.now()
    for (const c of rec.children) if (!c.isDestroyed()) c.close() // the show and print windows lived off the old page
    if (rec.copy) await autosave('orphan', { id: rec.copy }).catch(() => {})
    if (!win.isDestroyed()) win.webContents.reload()
  })
  wireWebContents(win, rec)
  return win
}

function wireWebContents (win, rec) {
  const wc = win.webContents
  wc.setWindowOpenHandler(({ url, frameName }) => {
    if (!url.startsWith('app://prizma/')) {
      if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url)
      return { action: 'deny' }
    }
    const q = new URL(url).searchParams // not url.split('?'): the #hash would stick to the last parameter
    const displays = screen.getAllDisplays()
    const primary = screen.getPrimaryDisplay()
    const pick = idv => displays.find(d => String(d.id) === String(idv)) || primary
    const base = { icon: ICON, autoHideMenuBar: true, backgroundColor: '#000000', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false } }
    if (frameName === 'pz-show') {
      const d = pick(q.get('display'))
      return { action: 'allow', overrideBrowserWindowOptions: { ...base, x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, frame: false, show: false, title: 'Prizma Slide Show' } }
    }
    if (frameName === 'pz-presenter') {
      const d = pick(q.get('display'))
      return { action: 'allow', overrideBrowserWindowOptions: { ...base, x: d.workArea.x, y: d.workArea.y, width: d.workArea.width, height: d.workArea.height, backgroundColor: CHROME.dark.bg, show: false, title: 'Prizma Presenter View' } }
    }
    if (frameName === 'pz-reading') {
      const b = win.getBounds()
      return { action: 'allow', overrideBrowserWindowOptions: { ...base, x: b.x + 40, y: b.y + 40, width: Math.min(b.width, 1280), height: Math.min(b.height, 800), show: false, title: 'Prizma Reading View' } }
    }
    if (frameName === 'pz-print') {
      const w = Number(q.get('w')) || 1280, h = Number(q.get('h')) || 720
      const clear = q.get('t') === '1'
      return { action: 'allow', overrideBrowserWindowOptions: { ...base, width: w, height: h, useContentSize: true, show: false, frame: false, skipTaskbar: true, focusable: false, enableLargerThanScreen: true, transparent: clear, backgroundColor: clear ? '#00000000' : '#FFFFFF' } }
    }
    return { action: 'deny' }
  })
  wc.on('did-create-window', (child, { frameName }) => {
    rec.children.add(child)
    child.on('closed', () => rec.children.delete(child))
    if (frameName === 'pz-show') child.once('ready-to-show', () => { child.show(); child.setFullScreen(true); child.focus() })
    if (frameName === 'pz-presenter') child.once('ready-to-show', () => { child.maximize(); child.show() })
    if (frameName === 'pz-reading') child.once('ready-to-show', () => child.show())
    wireContextMenu(child.webContents)
  })
  wireContextMenu(wc)
}

// Native menu for editable text (spelling suggestions, clipboard). The canvas uses its own menu.
function wireContextMenu (wc) {
  wc.on('context-menu', (e, p) => {
    if (!p.isEditable && !p.selectionText) return
    const items = []
    for (const s of (p.dictionarySuggestions || []).slice(0, 6)) items.push({ label: s, click: () => wc.replaceMisspelling(s) })
    if (p.misspelledWord) {
      if (!items.length) items.push({ label: mt('No suggestions'), enabled: false })
      items.push({ label: mt('Add to dictionary'), click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, { type: 'separator' })
    }
    if (p.isEditable) items.push({ role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy }, { role: 'paste', enabled: p.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll' })
    else items.push({ role: 'copy' })
    Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(wc) })
  })
}

// Brings forward the window that already has `p` open; false when no window has it
function focusFile (p) {
  const rec = [...windows.values()].find(r => r.file && r.file.toLowerCase() === String(p).toLowerCase())
  if (!rec) return false
  if (rec.win.isMinimized()) rec.win.restore()
  rec.win.focus()
  return true
}

function openPath (p, fromShell = false) {
  if (focusFile(p)) return
  // Reuse an editor that still shows the start screen
  for (const rec of windows.values()) {
    if (!rec.file && rec.idle) { rec.idle = false; rec.win.webContents.send('app:open-file', p, fromShell); rec.win.focus(); return }
  }
  createEditor(p, fromShell)
}

// ---------- fonts ----------
let fontCache = null
function listFonts (refresh) {
  if (fontCache && !refresh) return Promise.resolve(fontCache)
  const cached = readJson('fonts.json', null)
  if (cached && !refresh && Date.now() - cached.time < 7 * 864e5) { fontCache = cached.list; return Promise.resolve(fontCache) }
  return new Promise(resolve => {
    const done = list => {
      const fonts = [...new Set(list.map(s => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
      // a failed scan isn't remembered: the next start tries again
      if (fonts.length) { fontCache = fonts; writeJson('fonts.json', { time: Date.now(), list: fonts }) }
      resolve(fonts)
    }
    if (isWin) {
      // UTF-8 out, so font names in other scripts (Japanese, Cyrillic) come through intact
      const ps = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }'
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true, timeout: 20000, maxBuffer: 8 << 20 },
        (err, out) => done(err ? [] : out.split(/\r?\n/)))
    } else {
      execFile('fc-list', [':', 'family'], { timeout: 10000, maxBuffer: 8 << 20 }, (err, out) => done(err ? [] : out.split(/\n/).map(l => l.split(',')[0])))
    }
  })
}

// ---------- LibreOffice conversion for .ppt / .odp / .key ----------
// LibreOffice installed somewhere else than Program Files is found through the folder its installer records
const sofficeReg = []
if (isWin) {
  for (const key of ['HKLM\\SOFTWARE\\LibreOffice\\UNO\\InstallPath', 'HKLM\\SOFTWARE\\WOW6432Node\\LibreOffice\\UNO\\InstallPath']) {
    execFile('reg', ['query', key, '/ve'], { windowsHide: true }, (err, out) => { const m = !err && /REG_SZ\s+(.+)/.exec(out); if (m) sofficeReg.push(path.join(m[1].trim(), 'soffice.exe')) })
  }
}
function findSoffice () {
  const c = isWin
    ? [...sofficeReg, ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files', 'C:\\Program Files (x86)'].filter(Boolean).map(d => path.join(d, 'LibreOffice', 'program', 'soffice.exe'))]
    : ['/usr/bin/soffice', '/usr/local/bin/soffice', '/opt/libreoffice/program/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice']
  return c.find(p => fs.existsSync(p)) || null
}
// Returns the converted file's bytes; the temporary folder goes away either way
function convertWithLibreOffice (src) {
  const exe = findSoffice()
  if (!exe) return Promise.resolve({ ok: false, error: 'notfound' })
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'prizma-'))
  return new Promise(resolve => {
    // its own profile, so the conversion also works while LibreOffice itself is open
    const profile = pathToFileURL(path.join(os.tmpdir(), 'prizma-libreoffice')).href
    const child = execFile(exe, ['-env:UserInstallation=' + profile, '--headless', '--norestore', '--convert-to', 'pptx', '--outdir', out, src], { windowsHide: true }, async err => {
      clearTimeout(timer)
      const f = path.join(out, path.basename(src).replace(/\.[^.]+$/, '') + '.pptx')
      let data = null
      if (!err) data = await fsp.readFile(f).then(b => new Uint8Array(b), () => null)
      fsp.rm(out, { recursive: true, force: true }).catch(() => {})
      resolve(data ? { ok: true, data } : { ok: false, error: err ? String(err.message || err) : 'failed' })
    })
    // a stuck conversion is stopped with everything it started: soffice.exe hands the work to soffice.bin, which
    // would otherwise keep the profile locked and make every later conversion wait
    const timer = setTimeout(() => {
      if (isWin) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {})
      else child.kill('SIGKILL')
    }, 180000)
  })
}

// ---------- EMF/WMF pictures → PNG ----------
// GDI+ plays the metafile records (EMF+, EMF, WMF) much as Office does; one PowerShell run draws them all.
const DRAW_PS = `param($list)
Add-Type -AssemblyName System.Drawing
foreach ($line in Get-Content -LiteralPath $list -Encoding UTF8) {
  $p = $line.Split('|')
  try {
    $img = [System.Drawing.Image]::FromFile($p[0])
    $w = [int]$p[1]; $h = [int]$p[2]
    if ($w -le 0 -or $h -le 0) { $w = $img.Width; $h = $img.Height }
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.DrawImage($img, 0, 0, $w, $h)
    $bmp.Save($p[0] + '.png', [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  } catch { }
}`
async function rasterize (items) {
  if (!isWin || !items?.length) return (items || []).map(() => null)
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'prizma-pic-'))
  try {
    const files = await Promise.all(items.map(async (it, i) => {
      const f = path.join(dir, `p${i}.${it.ext === 'wmf' ? 'wmf' : 'emf'}`)
      await fsp.writeFile(f, Buffer.from(it.data))
      return f
    }))
    const list = path.join(dir, 'list.txt'), script = path.join(dir, 'draw.ps1')
    await fsp.writeFile(list, files.map((f, i) => `${f}|${Math.round(items[i].w || 0)}|${Math.round(items[i].h || 0)}`).join('\r\n'), 'utf8')
    await fsp.writeFile(script, DRAW_PS)
    await new Promise(resolve => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, list], { windowsHide: true, timeout: 90000 }, () => resolve()))
    return await Promise.all(files.map(f => fsp.readFile(f + '.png').then(b => new Uint8Array(b), () => null)))
  } finally {
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// ---------- autosave / recovery ----------
const recoverDir = () => path.join(userDir(), 'AutoRecover')
async function autosave (op, a = {}) {
  await fsp.mkdir(recoverDir(), { recursive: true })
  const safe = id => String(id).replace(/[^\w-]/g, '')
  // files go in via .tmp + rename: a crash mid-write must not leave a half file that hides the copy
  const put = async (f, data) => { await fsp.writeFile(f + '.tmp', data); await fsp.rename(f + '.tmp', f) }
  const meta = path.join(recoverDir(), safe(a.id) + '.json')
  const copy = id => path.join(recoverDir(), safe(id) + '.prizma')
  // the page writes the copy itself, in pieces (fs:open-write), to the path 'file' gives; 'write' then records it
  if (op === 'file') return copy(a.id)
  if (op === 'write') {
    await put(meta, JSON.stringify({ ...a.meta, id: a.id, time: Date.now(), pid: process.pid }))
    return true
  }
  // a window that reopened a recovered copy takes it over: its own copy first, then the old one goes
  if (op === 'adopt') {
    await fsp.copyFile(copy(a.from), copy(a.id) + '.tmp')
    await fsp.rename(copy(a.id) + '.tmp', copy(a.id))
    await put(meta, JSON.stringify({ ...a.meta, id: a.id, time: Date.now(), pid: process.pid }))
    for (const ext of ['.prizma', '.json']) await fsp.rm(path.join(recoverDir(), safe(a.from) + ext), { force: true })
    return true
  }
  // the window that wrote the copy crashed: offer the copy now, not only after a restart
  if (op === 'orphan') { await put(meta, JSON.stringify({ ...JSON.parse(await fsp.readFile(meta, 'utf8')), pid: 0 })); return true }
  if (op === 'delete') {
    for (const ext of ['.prizma', '.json']) await fsp.rm(path.join(recoverDir(), safe(a.id) + ext), { force: true })
    return true
  }
  if (op === 'list') {
    const items = []
    for (const f of await fsp.readdir(recoverDir())) {
      if (!f.endsWith('.json')) continue
      try {
        const m = JSON.parse(await fsp.readFile(path.join(recoverDir(), f), 'utf8'))
        if (m.pid === process.pid) continue // belongs to this running session
        if (fs.existsSync(path.join(recoverDir(), safe(m.id) + '.prizma'))) items.push({ ...m, file: path.join(recoverDir(), safe(m.id) + '.prizma') })
      } catch {}
    }
    return items.sort((x, y) => y.time - x.time)
  }
  return null
}

// ---------- IPC ----------
const recOf = e => windows.get(e.sender.id) || [...windows.values()].find(r => r.children.has(BrowserWindow.fromWebContents(e.sender)))
const FILTERS = {
  open: [
    { name: 'All presentations', extensions: ['pptx', 'pptm', 'ppsx', 'ppsm', 'potx', 'potm', 'prizma', 'ppt', 'pps', 'pot', 'odp', 'otp', 'key', 'pdf'] },
    { name: 'PowerPoint (*.pptx, *.ppsx, *.potx)', extensions: ['pptx', 'pptm', 'ppsx', 'ppsm', 'potx', 'potm'] },
    { name: 'Prizma (*.prizma)', extensions: ['prizma'] },
    { name: 'Older formats via LibreOffice (*.ppt, *.odp, *.key)', extensions: ['ppt', 'pps', 'pot', 'odp', 'otp', 'key'] },
    { name: 'PDF as slides (*.pdf)', extensions: ['pdf'] },
    { name: 'All files', extensions: ['*'] }
  ]
}

ipcMain.handle('app:init', e => {
  const rec = recOf(e)
  const open = rec ? rec.pendingOpen : null
  if (rec) { rec.pendingOpen = null; rec.idle = !open }
  return {
    platform: process.platform, version: app.getVersion(), openPath: open, fromShell: !!(open && rec.fromShell),
    settings, recent, userName: settings.author || os.userInfo().username,
    documents: app.getPath('documents'), theme: effectiveTheme(), hasLibreOffice: !!findSoffice()
  }
})
ipcMain.handle('dialog:open', async (e, o = {}) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: mt(o.title || 'Open'), defaultPath: o.defaultPath || app.getPath('documents'),
    filters: (o.filters || FILTERS.open).map(f => ({ ...f, name: mt(f.name) })), properties: ['openFile', ...(o.multi ? ['multiSelections'] : [])]
  })
  return r.canceled ? [] : r.filePaths
})
ipcMain.handle('dialog:save', async (e, o = {}) => {
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
    title: mt(o.title || 'Save as'), defaultPath: o.defaultPath ? (path.isAbsolute(o.defaultPath) ? o.defaultPath : path.join(app.getPath('documents'), o.defaultPath)) : app.getPath('documents'),
    filters: (o.filters || [{ name: 'PowerPoint Presentation (*.pptx)', extensions: ['pptx'] }]).map(f => ({ ...f, name: mt(f.name) }))
  })
  return r.canceled ? null : r.filePath
})
ipcMain.handle('fs:read', async (e, p) => new Uint8Array(await fsp.readFile(p)))
// Writes a whole new file next to the old one and then swaps it in, so a failed save never leaves half a file.
// Antivirus, indexing or a sync client can hold a file for a moment, so the swap is tried again for about a second;
// a file open in PowerPoint or Acrobat stays locked, and the message says what to do.
let tmpSeq = 0
async function openSafe (p) {
  await fsp.mkdir(path.dirname(p), { recursive: true })
  const tmp = `${p}.${process.pid}-${++tmpSeq}.prizma-tmp` // unique, so two saves of one file can't take each other's temp file
  try { return { p, tmp, fh: await fsp.open(tmp, 'w') } } catch (err) {
    throw /^(EPERM|EACCES|EROFS)$/.test(err.code) ? new Error(`Prizma can't save in ${path.dirname(p)}. Choose another folder, such as Documents.`) : err
  }
}
async function dropSafe (s) {
  await s.fh.close().catch(() => {})
  await fsp.rm(s.tmp, { force: true }).catch(() => {})
}
async function commitSafe (s) {
  try {
    await s.fh.close()
    for (let i = 0; ; i++) {
      try { await fsp.rename(s.tmp, s.p); break } catch (err) {
        if (!/^(EPERM|EBUSY|EACCES)$/.test(err.code)) throw err
        if (i === 7) throw new Error(`${path.basename(s.p)} is open in another program or is read-only. Close it there, or save under another name.`)
        await new Promise(r => setTimeout(r, 150))
      }
    }
  } catch (err) {
    await dropSafe(s)
    throw err
  }
}
async function writeSafe (p, data) {
  const s = await openSafe(p)
  try { await s.fh.writeFile(data) } catch (err) { await dropSafe(s); throw err }
  await commitSafe(s)
}
// Save as over a file another window holds would leave that window with an outdated copy (saving a window's own
// file is always fine)
function heldElsewhere (e, p) {
  const me = recOf(e), same = f => !!f && f.toLowerCase() === String(p).toLowerCase()
  if (!same(me?.file) && [...windows.values()].some(r => r !== me && same(r.file))) throw new Error(`${path.basename(p)} is open in another Prizma window. Close it there first, or save under another name.`)
}
ipcMain.handle('fs:write', async (e, p, data) => {
  heldElsewhere(e, p)
  await writeSafe(p, data)
  return true
})
// A presentation of a few hundred MB crosses between here and its window a few MB at a time. As one piece the
// preload bridge copies it twice, which held the window still for 3 to 4 seconds and kept several copies in memory.
const handles = new Map() // id -> { owner: webContents id, at, size, fh (reading) or save (writing) }
let handleSeq = 0
function keepHandle (e, h) { handles.set(++handleSeq, { ...h, owner: e.sender.id, at: 0 }); return handleSeq }
function handleOf (e, id) {
  const h = handles.get(id)
  if (!h || h.owner !== e.sender.id) throw new Error('The file was closed before Prizma finished with it.')
  return h
}
async function closeHandle (id, keep) {
  const h = handles.get(id)
  if (!h) return
  handles.delete(id)
  if (h.save) await (keep ? commitSafe(h.save) : dropSafe(h.save))
  else await h.fh.close().catch(() => {})
}
// a page that closed or crashed halfway leaves no open file and no temp file behind
const dropHandles = owner => { for (const [id, h] of handles) if (h.owner === owner) closeHandle(id, false) }
ipcMain.handle('fs:open-read', async (e, p) => {
  const fh = await fsp.open(p, 'r')
  try {
    const size = (await fh.stat()).size
    return { id: keepHandle(e, { fh, size }), size }
  } catch (err) { await fh.close().catch(() => {}); throw err }
})
ipcMain.handle('fs:read-piece', async (e, id, n) => {
  const h = handleOf(e, id), at = h.at, b = Buffer.allocUnsafe(Math.max(0, Math.min(n, h.size - at)))
  h.at += b.length
  const { bytesRead } = await h.fh.read(b, 0, b.length, at)
  return bytesRead < b.length ? b.subarray(0, bytesRead) : b
})
ipcMain.handle('fs:open-write', async (e, p) => {
  heldElsewhere(e, p)
  return keepHandle(e, { save: await openSafe(p) })
})
ipcMain.handle('fs:write-piece', async (e, id, data) => {
  const h = handleOf(e, id), at = h.at
  h.at += data.byteLength
  await h.save.fh.write(data, 0, data.byteLength, at) // at its own place, so pieces can't land out of order
  return true
})
ipcMain.handle('fs:close', async (e, id, keep) => { handleOf(e, id); await closeHandle(id, !!keep); return true })
ipcMain.handle('fs:stat', async (e, p) => { const s = await fsp.stat(p); return { size: s.size, mtime: s.mtimeMs, ctime: s.birthtimeMs } })
ipcMain.handle('settings:set', (e, patch) => {
  settings = { ...settings, ...patch }
  writeJson('settings.json', settings)
  if (patch.theme) {
    nativeTheme.themeSource = settings.theme === 'system' ? 'system' : settings.theme
    const t = CHROME[effectiveTheme()]
    for (const r of windows.values()) applyChrome(r.win, t)
  }
  for (const r of windows.values()) if (r.win.webContents.id !== e.sender.id) r.win.webContents.send('app:settings', settings) // the other windows follow
  return settings
})
ipcMain.handle('recent', (e, op, p) => {
  if (op === 'add') return addRecent(p)
  if (op === 'remove') { recent = recent.filter(r => r.path !== p); writeJson('recent.json', recent); return recent }
  if (op === 'clear') { recent = []; writeJson('recent.json', recent); try { app.clearRecentDocuments() } catch {} return recent }
  return recent
})
ipcMain.handle('fonts:list', (e, refresh) => listFonts(refresh))
ipcMain.handle('win:new', (e, p) => { if (p && !p.startsWith(':')) openPath(p); else createEditor(p || null); return true })
ipcMain.handle('win:focus-file', (e, p) => focusFile(p))
ipcMain.handle('displays', () => {
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({ id: d.id, primary: d.id === primary, label: d.label || mt('Display {0}').replace('{0}', i + 1), width: d.size.width, height: d.size.height, scale: d.scaleFactor }))
})
// without a graphics card Chromium composites on the CPU, and the blur behind the glass panels then costs about 0.1 s a frame
const softGpu = () => !/^enabled/.test(app.getGPUFeatureStatus().gpu_compositing || '')
ipcMain.handle('gpu:soft', () => softGpu())
app.on('gpu-info-update', () => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('app:gpu', softGpu()) })
ipcMain.handle('shell:open', (e, url) => { if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url); return true })
ipcMain.handle('shell:show', (e, p) => { shell.showItemInFolder(p); return true })
ipcMain.handle('pdf:print', async (e, o = {}) => {
  const data = await e.sender.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' }, landscape: !!o.landscape })
  if (o.path) await writeSafe(o.path, data)
  return o.path ? true : new Uint8Array(data)
})
ipcMain.handle('print:system', e => new Promise(resolve => {
  e.sender.print({ printBackground: true, silent: false }, (ok, reason) => resolve({ ok, reason }))
}))
ipcMain.handle('capture', async (e, rect) => {
  const img = await e.sender.capturePage(rect, { stayHidden: true })
  return new Uint8Array(img.toPNG())
})
ipcMain.handle('autosave', (e, op, a) => { const r = (op === 'write' || op === 'adopt') && recOf(e); if (r) r.copy = a.id; return autosave(op, a) })
ipcMain.handle('convert:lo', (e, p) => convertWithLibreOffice(p))
ipcMain.handle('raster:metafiles', (e, items) => rasterize(items))
ipcMain.on('win:title', (e, t) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setTitle(t) })
ipcMain.on('win:dirty', (e, v) => { const r = recOf(e); if (r) { r.dirty = !!v; if (v) r.idle = false } }) // work in it: a file opened from Explorer gets its own window
ipcMain.on('win:file', (e, p) => { const r = recOf(e); if (r) { r.file = p || null; r.idle = false } if (p) addRecent(p) })
ipcMain.on('win:idle', (e, v) => { const r = recOf(e); if (r) r.idle = !!v })
ipcMain.on('win:force-close', e => { const r = recOf(e); if (r) { r.forceClose = true; r.win.close() } })
ipcMain.on('win:theme', (e, theme) => { const w = BrowserWindow.fromWebContents(e.sender); if (w && CHROME[theme]) applyChrome(w, CHROME[theme]) })

function applyChrome (w, t) {
  try { w.setBackgroundColor(t.bg) } catch {}
  try { if (process.platform !== 'darwin') w.setTitleBarOverlay({ color: t.bar, symbolColor: t.fg, height: 40 }) } catch {}
}

// ---------- app lifecycle ----------
app.on('second-instance', (e, argv) => {
  const files = filesFromArgv(argv)
  if (files.length) files.forEach(f => openPath(f, true))
  else if (argv.includes('--new') || !windows.size) createEditor(null)
  else { const r = [...windows.values()].pop(); if (r.win.isMinimized()) r.win.restore(); r.win.focus() }
})

app.whenReady().then(() => {
  nativeTheme.themeSource = settings.theme === 'system' ? 'system' : settings.theme
  Menu.setApplicationMenu(null)
  protocol.handle('app', req => {
    const u = new URL(req.url)
    let p = decodeURIComponent(u.pathname)
    if (p === '/' || !p) p = '/index.html'
    const file = path.normalize(path.join(DIST, p))
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
  // only Prizma's own pages get these permissions
  const allowed = new Set(['fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'local-fonts', 'window-management', 'pointerLock'])
  const own = u => String(u || '').startsWith('app://prizma')
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, d) => cb(allowed.has(perm) && own(d?.requestingUrl || wc?.getURL())))
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => allowed.has(perm) && own(origin || wc?.getURL()))
  // Windows checks spelling in the languages set up in Windows; elsewhere Chromium needs a language
  if (!isWin) try { session.defaultSession.setSpellCheckerLanguages(['en-US']) } catch {}
  if (isWin) {
    try {
      app.setUserTasks([{ program: process.execPath, arguments: '--new', iconPath: process.execPath, iconIndex: 0, title: mt('New presentation'), description: mt('Open a new Prizma window') }])
    } catch {}
  }
  const files = filesFromArgv(process.argv)
  if (files.length) files.forEach(f => createEditor(f, true))
  else createEditor(null)
  listFonts(false).catch(() => {})
})

app.on('window-all-closed', () => app.quit())
// A window never leaves Prizma: a link clicked on a slide opens in the browser (the show does that), not in place of
// the show. A window opens only where an editor asks for one (wireWebContents replaces this rule for editors); the
// show, presenter, reading and print windows open none, so a link can't make a window that shares Prizma's access.
app.on('web-contents-created', (e, wc) => {
  wc.on('will-navigate', (ev, url) => { if (!url.startsWith('app://prizma/')) ev.preventDefault() })
  wc.setWindowOpenHandler(({ url }) => { if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url); return { action: 'deny' } })
})

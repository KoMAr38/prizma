'use strict'
const { contextBridge, ipcRenderer, webUtils } = require('electron')
// errors arrive as "Error invoking remote method 'fs:write': Error: …"; the page shows only the message itself
const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a).catch(e => { throw new Error(String(e?.message || e).replace(/^Error invoking remote method '[^']*': (\w*Error: )?/, '')) })

contextBridge.exposeInMainWorld('prizmaNative', {
  platform: process.platform,
  init: () => invoke('app:init'),
  openDialog: o => invoke('dialog:open', o),
  saveDialog: o => invoke('dialog:save', o),
  readFile: p => invoke('fs:read', p),
  writeFile: (p, d) => invoke('fs:write', p, d),
  // big files in pieces: the page puts them together or takes them apart (store.js, files.js)
  openRead: p => invoke('fs:open-read', p),
  readPiece: (id, n) => invoke('fs:read-piece', id, n),
  openWrite: p => invoke('fs:open-write', p),
  writePiece: (id, d) => invoke('fs:write-piece', id, d),
  closeFile: (id, keep) => invoke('fs:close', id, keep),
  exists: p => invoke('fs:exists', p),
  stat: p => invoke('fs:stat', p),
  setSettings: s => invoke('settings:set', s),
  recent: (op, p) => invoke('recent', op, p),
  fonts: refresh => invoke('fonts:list', refresh),
  newWindow: p => invoke('win:new', p),
  focusFile: p => invoke('win:focus-file', p),
  displays: () => invoke('displays'),
  openExternal: u => invoke('shell:open', u),
  showInFolder: p => invoke('shell:show', p),
  printToPDF: o => invoke('pdf:print', o),
  printSystem: () => invoke('print:system'),
  capture: r => invoke('capture', r),
  autosave: (op, a) => invoke('autosave', op, a),
  convert: p => invoke('convert:lo', p),
  rasterize: items => invoke('raster:metafiles', items),
  setTitle: t => ipcRenderer.send('win:title', t),
  setDirty: v => ipcRenderer.send('win:dirty', v),
  setFile: p => ipcRenderer.send('win:file', p),
  setIdle: v => ipcRenderer.send('win:idle', v),
  setTheme: t => ipcRenderer.send('win:theme', t),
  forceClose: () => ipcRenderer.send('win:force-close'),
  quit: () => ipcRenderer.send('app:quit'),
  onRequestClose: cb => ipcRenderer.on('app:request-close', () => cb()),
  onOpenFile: cb => ipcRenderer.on('app:open-file', (e, p, fromShell) => cb(p, fromShell)),
  onSettings: cb => ipcRenderer.on('app:settings', (e, s) => cb(s)),
  softGpu: () => invoke('gpu:soft'),
  onGpu: cb => ipcRenderer.on('app:gpu', (e, soft) => cb(soft)),
  pathForFile: f => { try { return webUtils.getPathForFile(f) } catch { return '' } }
})

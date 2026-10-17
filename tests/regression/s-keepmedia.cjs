// A file that fails to open must leave the open deck's pictures alone; a file that opens frees the old ones
const path = require('path')
module.exports = async ({ ev, wait, errors }) => {
  const r = await ev(`(async () => {
    __pz.files.newDocIn(); __pz.store.backstage.value = null
    const c = document.createElement('canvas'); c.width = 80; c.height = 60
    c.getContext('2d').fillRect(0, 0, 80, 60)
    const bytes = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer())
    const img = __pz.actions.insertImageBytes(bytes, 'image/png', 80, 60)
    const ok1 = await __pz.files.openPath(${JSON.stringify(path.join(__dirname, 'bad2', 'truncated.pptx'))}, { here: true })
    const kept = !!__pz.store.mediaInfo(img.src)
    const ok2 = await __pz.files.openPath(${JSON.stringify(path.join(__dirname, 'bad2', 'valid.pptx'))}, { here: true })
    const freed = !__pz.store.mediaInfo(img.src)
    return { ok1, kept, ok2, freed }
  })()`)
  console.log(JSON.stringify(r))
  // the truncated file is logged on purpose; that log line is not a failure
  for (let i = errors.length - 1; i >= 0; i--) if (/Corrupted zip/.test(errors[i])) errors.splice(i, 1)
  if (!r.kept) errors.push('a failed open removed the picture of the open deck')
  if (!r.freed) errors.push('the picture of the old deck stayed in memory after another file opened')
}

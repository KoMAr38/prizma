// Bundles the renderer (Preact + JSX) into dist/ with esbuild.
import * as esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const watch = process.argv.includes('--watch')
const dev = process.argv.includes('--dev')
fs.rmSync(dist, { recursive: true, force: true })
fs.mkdirSync(dist, { recursive: true })
fs.copyFileSync(path.join(root, 'src/renderer/index.html'), path.join(dist, 'index.html'))
for (const f of ['icon-256.png', 'icon-64.png', 'mark.svg']) fs.copyFileSync(path.join(root, 'build', f), path.join(dist, f))
// PDF import: pdf.js worker, character maps and the standard fonts
const pdfjs = path.join(root, 'node_modules/pdfjs-dist')
fs.copyFileSync(path.join(pdfjs, 'build/pdf.worker.min.mjs'), path.join(dist, 'pdf.worker.mjs'))
fs.cpSync(path.join(pdfjs, 'cmaps'), path.join(dist, 'pdfjs/cmaps'), { recursive: true })
fs.cpSync(path.join(pdfjs, 'standard_fonts'), path.join(dist, 'pdfjs/standard_fonts'), { recursive: true })
// interface languages: the main process reads the one it needs (src/main/main.js, uiLang)
fs.cpSync(path.join(root, 'src/locales'), path.join(dist, 'locales'), { recursive: true })

// pptxtojson throws on one odd object and the whole .pptx fails to open; its own source is bundled with each object read
// inside a try/catch, as importPptx's convert() does for Prizma's step (a missing anchor fails the build, never silently)
const pptxSrc = path.join(root, 'node_modules/pptxtojson/src/pptxtojson.js')
const safePptx = {
  name: 'safe-pptxtojson',
  setup (b) {
    b.onResolve({ filter: /^pptxtojson$/ }, () => ({ path: pptxSrc }))
    b.onLoad({ filter: /pptxtojson[\\/]src[\\/]pptxtojson\.js$/ }, async a => {
      const js = await fs.promises.readFile(a.path, 'utf8'), head = 'async function processNodesInSlide('
      if (js.split(head).length !== 2) throw new Error('pptxtojson changed: processNodesInSlide not found once in ' + a.path)
      return { contents: js.replace(head, 'async function readNode(') + "\nasync function processNodesInSlide (...a) { try { return await readNode(...a) } catch (e) { console.warn('left out an object pptxtojson could not read', e); return null } }\n", resolveDir: path.dirname(a.path) }
    })
  }
}

const opts = {
  entryPoints: { app: path.join(root, 'src/renderer/main.jsx') },
  plugins: [safePptx],
  bundle: true,
  outdir: dist,
  format: 'iife',
  target: ['chrome130'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.woff2': 'file', '.woff': 'file', '.svg': 'text' },
  assetNames: 'assets/[name]-[hash]',
  define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"', global: 'globalThis' },
  minify: !dev,
  sourcemap: dev ? 'linked' : false,
  legalComments: 'external',
  logLevel: 'info'
}
if (watch) { const ctx = await esbuild.context(opts); await ctx.watch() } else await esbuild.build(opts)

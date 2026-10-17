// Bundles the renderer (Preact + JSX) into dist/ with esbuild.
import * as esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
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

const opts = {
  entryPoints: { app: path.join(root, 'src/renderer/main.jsx') },
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

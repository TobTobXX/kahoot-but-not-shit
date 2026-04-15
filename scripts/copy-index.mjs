// Post-build: copy dist/index.html into each route subdirectory so direct
// URL navigation works on static file hosts without a catch-all redirect.
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const rootHtml = readFileSync('dist/index.html', 'utf-8')
// Asset paths in the root index.html are relative (./assets/, ./favicon.svg, etc.).
// One directory deeper they need to be ../assets/, ../favicon.svg, etc.
const subHtml = rootHtml.replaceAll('"\./', '"../')

const pages = ['host', 'join', 'play', 'edit', 'library', 'login']
for (const page of pages) {
  const dir = join('dist', page)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), subHtml)
}

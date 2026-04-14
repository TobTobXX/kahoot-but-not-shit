// Post-build script: moves dist/pages/*/index.html → dist/*/index.html
// and fixes relative asset paths (../../ → ../) since the files become
// one level shallower.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const pagesDir = 'dist/pages'

for (const page of readdirSync(pagesDir)) {
  const src = join(pagesDir, page, 'index.html')
  const destDir = join('dist', page)
  mkdirSync(destDir, { recursive: true })
  const html = readFileSync(src, 'utf-8').replaceAll('../../', '../')
  writeFileSync(join(destDir, 'index.html'), html)
}

rmSync(pagesDir, { recursive: true })

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, createLogger } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'
import shopifyInlineStyles from '../src/index.js'

const fixture = fileURLToPath(new URL('./fixture', import.meta.url))
const snippetFile = path.join(fixture, 'snippets', 'vite-style.liquid')
const warnings: string[] = []

beforeAll(async () => {
  fs.rmSync(path.join(fixture, 'assets'), { recursive: true, force: true })
  fs.rmSync(snippetFile, { force: true })

  const logger = createLogger('info', { allowClearScreen: false })
  logger.warn = (msg) => warnings.push(String(msg))
  logger.info = () => {}

  await build({
    root: fixture,
    logLevel: 'info',
    customLogger: logger,
    plugins: [shopifyInlineStyles({ themeRoot: fixture, linkEntries: ['l-button.css'] })],
    build: {
      outDir: 'assets',
      manifest: 'manifest.json',
      emptyOutDir: true,
      rollupOptions: {
        input: [
          path.join(fixture, 'src/snippets/l-atomic.css'),
          path.join(fixture, 'src/snippets/l-badge.css'),
          path.join(fixture, 'src/snippets/l-button.css'),
          path.join(fixture, 'src/snippets/l-oversize.css'),
          path.join(fixture, 'src/sections/section.hero.css'),
        ],
        output: { assetFileNames: '[name]-[hash][extname]' },
      },
    },
  })
}, 60_000)

describe('vite build integration', () => {
  it('writes the generated snippet', () => {
    expect(fs.existsSync(snippetFile)).toBe(true)
  })

  it('maps entries to hashed assets that exist on disk', () => {
    const snippet = fs.readFileSync(snippetFile, 'utf-8')
    const match = snippet.match(/assign vs_asset = '(l-badge-[\w-]+\.css)'/)
    expect(match).not.toBeNull()
    expect(fs.existsSync(path.join(fixture, 'assets', match![1]))).toBe(true)
  })

  it('emits both alias forms and the inline/link/unknown branches', () => {
    const snippet = fs.readFileSync(snippetFile, 'utf-8')
    expect(snippet).toContain("when '@/snippets/l-badge.css' or '~/snippets/l-badge.css'")
    expect(snippet).toContain('inline_asset_content')
    expect(snippet).toContain('stylesheet_tag')
    expect(snippet).toContain("unknown entry '{{ entry }}'")
  })

  it('marks the opted-out entry as a link', () => {
    const snippet = fs.readFileSync(snippetFile, 'utf-8')
    const buttonBranch = snippet.split("when '@/snippets/l-button.css'")[1]
    expect(buttonBranch).toContain('assign vs_link = true')
  })

  it('warns about the orphaned section.hero.css and nothing else', () => {
    const orphanWarnings = warnings.filter((w) => w.includes('never rendered'))
    expect(orphanWarnings).toHaveLength(1)
    expect(orphanWarnings[0]).toContain('src/sections/section.hero.css')
  })

  it('splits the oversized l-oversize.css into inline parts under the cap', () => {
    const snippet = fs.readFileSync(snippetFile, 'utf-8')
    const match = snippet.match(/assign vs_asset = '(l-oversize-[\w-]+-p1\.css[\w.,-]+)'/)
    expect(match).not.toBeNull()
    const parts = match![1].split(',')
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      const file = path.join(fixture, 'assets', part)
      expect(fs.existsSync(file)).toBe(true)
      expect(fs.statSync(file).size).toBeLessThan(15_000)
    }
  })

  it('keeps the original oversized asset on disk alongside its parts', () => {
    const assets = fs.readdirSync(path.join(fixture, 'assets'))
    const originals = assets.filter(
      (f) => f.startsWith('l-oversize-') && !/-p\d+\.css$/.test(f),
    )
    expect(originals).toHaveLength(1)
  })

  it('does not warn about the splittable oversized entry', () => {
    expect(warnings.filter((w) => w.includes('l-oversize'))).toEqual([])
  })

  it('falls back to a link for the unsplittable l-atomic.css and warns once', () => {
    const snippet = fs.readFileSync(snippetFile, 'utf-8')
    const atomicBranch = snippet.split("when '@/snippets/l-atomic.css'")[1].split('when')[0] ?? ''
    expect(atomicBranch).toContain('assign vs_link = true')

    const fallbackWarnings = warnings.filter((w) => w.includes('cannot be split'))
    expect(fallbackWarnings).toHaveLength(1)
    expect(fallbackWarnings[0]).toContain('l-atomic')
  })
})

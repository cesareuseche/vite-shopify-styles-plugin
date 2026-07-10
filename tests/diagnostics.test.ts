import { describe, expect, it } from 'vitest'
import { findOrphans, findVendorImports, formatReport, type EntrySize } from '../src/diagnostics.js'
import type { CssEntry } from '../src/generate.js'

const badge: CssEntry = { key: 'src/snippets/l-badge.css', aliasPath: 'snippets/l-badge.css', files: ['l-badge-X.css'], link: false }
const button: CssEntry = { key: 'src/snippets/l-button.css', aliasPath: 'snippets/l-button.css', files: ['l-button-D.css'], link: true }
const hero: CssEntry = { key: 'src/sections/section.hero.css', aliasPath: 'sections/section.hero.css', files: ['section.hero-B.css'], link: false }

describe('formatReport', () => {
  it('lists entries sorted by size descending with KB and decision', () => {
    const report = formatReport([
      { ...badge, bytes: 1024 },
      { ...button, bytes: 10240 },
    ])
    const lines = report.split('\n')
    expect(lines[0]).toContain('[vite-style]')
    expect(lines[1]).toContain('snippets/l-button.css')
    expect(lines[1]).toContain('10.0 KB')
    expect(lines[1]).toContain('link')
    expect(lines[2]).toContain('snippets/l-badge.css')
    expect(lines[2]).toContain('1.0 KB')
    expect(lines[2]).toContain('inline')
  })

  it('shows the part count for auto-split entries', () => {
    const split: EntrySize = {
      ...hero,
      files: ['section.hero-B-p1.css', 'section.hero-B-p2.css'],
      bytes: 21344,
    }
    const report = formatReport([split])
    expect(report).toContain('inline (2 parts)')
    expect(report).toContain('20.8 KB')
  })
})

describe('findOrphans', () => {
  it('treats entries referenced by @/ or ~/ alias as used', () => {
    const liquid = [
      "{% render 'vite-style', entry: '@/snippets/l-badge.css' %}",
      "{% render 'vite-style', entry: '~/snippets/l-button.css' %}",
    ]
    expect(findOrphans([badge, button, hero], liquid)).toEqual([hero])
  })

  it('returns nothing when everything is referenced', () => {
    const liquid = ["'@/snippets/l-badge.css'"]
    expect(findOrphans([badge], liquid)).toEqual([])
  })
})

describe('findVendorImports', () => {
  it('returns bare specifiers from @import statements', () => {
    const css = "@import 'swiper/css';\n@import \"swiper/css/navigation\";\n.x { color: red }"
    expect(findVendorImports(css)).toEqual(['swiper/css', 'swiper/css/navigation'])
  })

  it('supports the url() form', () => {
    expect(findVendorImports("@import url('swiper/css');")).toEqual(['swiper/css'])
    expect(findVendorImports('@import url(swiper/css);')).toEqual(['swiper/css'])
  })

  it('ignores relative, absolute, and alias specifiers', () => {
    const css = [
      "@import './local.css';",
      "@import '../shared.css';",
      "@import '/abs.css';",
      "@import '@/snippets/x.css';",
      "@import '~/snippets/x.css';",
    ].join('\n')
    expect(findVendorImports(css)).toEqual([])
  })

  it('ignores remote and data URLs', () => {
    const css = "@import 'https://fonts.example.com/x.css';\n@import '//cdn.example.com/x.css';"
    expect(findVendorImports(css)).toEqual([])
  })

  it('ignores bare http: URLs', () => {
    expect(findVendorImports("@import 'http://cdn.example.com/x.css';")).toEqual([])
  })

  it('ignores @import inside comments', () => {
    const css = "/* @import 'swiper/css'; */\n/*\n@import 'swiper/css';\n*/\n.x { color: red }"
    expect(findVendorImports(css)).toEqual([])
  })

  it('ignores @import-looking text mid-line (strings, url() values)', () => {
    const css = 'content: "@import \'swiper/css\'"; background: url(\'swiper/img.png\');'
    expect(findVendorImports(css)).toEqual([])
  })

  it('returns empty for CSS with no imports', () => {
    expect(findVendorImports('.x { color: red }')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { findOrphans, findOversized, formatReport, type EntrySize } from '../src/diagnostics.js'
import type { CssEntry } from '../src/generate.js'

const badge: CssEntry = { key: 'src/snippets/l-badge.css', aliasPath: 'snippets/l-badge.css', file: 'l-badge-X.css', link: false }
const button: CssEntry = { key: 'src/snippets/l-button.css', aliasPath: 'snippets/l-button.css', file: 'l-button-D.css', link: true }
const hero: CssEntry = { key: 'src/sections/section.hero.css', aliasPath: 'sections/section.hero.css', file: 'section.hero-B.css', link: false }

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

describe('findOversized', () => {
  it('flags inline entries above the limit, exempts link entries', () => {
    const sized: EntrySize[] = [
      { ...badge, bytes: 200_000 },
      { ...button, bytes: 200_000 },
      { ...hero, bytes: 100 },
    ]
    expect(findOversized(sized, 100_000)).toEqual([{ ...badge, bytes: 200_000 }])
  })
})

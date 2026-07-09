import { describe, expect, it } from 'vitest'
import { scanSegments, splitCss } from '../src/split.js'

const bytes = (s: string) => Buffer.byteLength(s)
const rules = (n: number) => Array.from({ length: n }, (_, i) => `.rule-${i}{color:red}`).join('')

describe('scanSegments', () => {
  it('produces statement and block segments that concatenate back to the input', () => {
    const css = `@import url("a.css");\n.a{color:red}\n@media (min-width:768px){.b{color:blue}}\n`
    const segments = scanSegments(css)
    expect(segments.map((s) => s.text).join('')).toBe(css)
    expect(segments.map((s) => s.text)).toEqual([
      `@import url("a.css");`,
      `\n.a{color:red}`,
      `\n@media (min-width:768px){.b{color:blue}}`,
      `\n`,
    ])
  })

  it('captures the block prelude and leaves statements without one', () => {
    const segments = scanSegments(`@import "a.css";.a{color:red}@media print{.b{color:blue}}`)
    expect(segments[0].prelude).toBeNull()
    expect(segments[1].prelude).toBe('.a')
    expect(segments[2].prelude).toBe('@media print')
  })

  it('ignores braces and semicolons inside strings', () => {
    const css = `.a::before{content:"};{"}.b{color:red}`
    expect(scanSegments(css).map((s) => s.text)).toEqual([
      `.a::before{content:"};{"}`,
      `.b{color:red}`,
    ])
  })

  it('handles escaped quotes inside strings', () => {
    const css = `.a{content:"\\"}"}.b{color:red}`
    expect(scanSegments(css).map((s) => s.text)).toEqual([
      `.a{content:"\\"}"}`,
      `.b{color:red}`,
    ])
  })

  it('ignores braces and semicolons inside comments', () => {
    const css = `/* } { ; */.a{color:red}`
    const segments = scanSegments(css)
    expect(segments).toHaveLength(1)
    expect(segments[0].text).toBe(css)
  })

  it('does not end a statement at a semicolon inside url()', () => {
    const css = `@import url(data:text/css;base64,QQ==);.a{color:red}`
    expect(scanSegments(css).map((s) => s.text)).toEqual([
      `@import url(data:text/css;base64,QQ==);`,
      `.a{color:red}`,
    ])
  })
})

describe('splitCss', () => {
  it('returns the input as a single part when it fits under the limit', () => {
    expect(splitCss('.a{color:red}', 100)).toEqual(['.a{color:red}'])
  })

  it('packs top-level rules into parts strictly under the limit that concatenate to the original', () => {
    const css = rules(40)
    const parts = splitCss(css, 100)
    expect(parts).not.toBeNull()
    expect(parts!.length).toBeGreaterThan(1)
    for (const part of parts!) expect(bytes(part)).toBeLessThan(100)
    expect(parts!.join('')).toBe(css)
  })

  it('emits parts with balanced braces', () => {
    const css = Array.from({ length: 30 }, (_, i) => `@media print{.r${i}{color:red}}`).join('')
    const parts = splitCss(css, 120)!
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(part.split('{').length).toBe(part.split('}').length)
    }
  })

  it('measures parts in bytes, not characters', () => {
    const css = Array.from({ length: 10 }, (_, i) => `.r${i}{content:"🎉🎉"}`).join('')
    const parts = splitCss(css, 60)!
    for (const part of parts) expect(bytes(part)).toBeLessThan(60)
  })

  it('re-wraps an oversized @media body with its prelude', () => {
    const body = rules(20)
    const prelude = '@media (min-width:768px)'
    const css = `${prelude}{${body}}`
    const parts = splitCss(css, 120)!
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(bytes(part)).toBeLessThan(120)
      expect(part.startsWith(`${prelude}{`)).toBe(true)
      expect(part.endsWith('}')).toBe(true)
    }
    const inner = parts.map((p) => p.slice(prelude.length + 1, -1)).join('')
    expect(inner).toBe(body)
  })

  it('re-wraps nested conditional groups with the full prelude chain', () => {
    const body = rules(20)
    const css = `@media print{@supports (display:grid){${body}}}`
    const parts = splitCss(css, 140)!
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(bytes(part)).toBeLessThan(140)
      expect(part.startsWith('@media print{@supports (display:grid){')).toBe(true)
    }
  })

  it('duplicates a leading @charset into every part', () => {
    const charset = `@charset "utf-8";`
    const css = charset + rules(40)
    const parts = splitCss(css, 100)!
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(part.startsWith(charset)).toBe(true)
    const rejoined = [parts[0], ...parts.slice(1).map((p) => p.slice(charset.length))].join('')
    expect(rejoined).toBe(css)
  })

  it('keeps a @layer statement in the first part and splits @layer blocks', () => {
    const css = `@layer a,b;@layer a{${rules(20)}}`
    const parts = splitCss(css, 120)!
    expect(parts.length).toBeGreaterThan(1)
    expect(parts[0]).toBe('@layer a,b;')
    for (const part of parts.slice(1)) expect(part.startsWith('@layer a{')).toBe(true)
  })

  it('returns null when a single atomic rule exceeds the limit', () => {
    const css = `.a{background:url(data:image/png;base64,${'A'.repeat(200)})}`
    expect(splitCss(css, 100)).toBeNull()
  })

  it('never splits inside @keyframes', () => {
    const frames = Array.from({ length: 20 }, (_, i) => `${i * 5}%{opacity:.${i}}`).join('')
    expect(splitCss(`@keyframes spin{${frames}}`, 100)).toBeNull()
  })

  it('returns null for an oversized @font-face', () => {
    const css = `@font-face{font-family:X;src:url(data:font/woff2;base64,${'A'.repeat(150)})}`
    expect(splitCss(css, 100)).toBeNull()
  })
})

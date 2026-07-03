import { describe, expect, it } from 'vitest'
import { normalizeOptions } from '../src/options.js'

describe('normalizeOptions', () => {
  it('applies defaults', () => {
    expect(normalizeOptions()).toEqual({
      linkEntries: [],
      snippetName: 'vite-style',
      themeRoot: './',
      sourceCodeDir: 'src',
    })
  })

  it('keeps overrides', () => {
    expect(
      normalizeOptions({
        snippetName: 'inline-css',
        linkEntries: ['a.css'],
        themeRoot: 'theme',
        sourceCodeDir: 'app',
      }),
    ).toEqual({
      linkEntries: ['a.css'],
      snippetName: 'inline-css',
      themeRoot: 'theme',
      sourceCodeDir: 'app',
    })
  })
})

import { describe, expect, it } from 'vitest'
import { normalizeOptions } from '../src/options.js'

describe('normalizeOptions', () => {
  it('applies defaults', () => {
    expect(normalizeOptions()).toEqual({
      linkEntries: [],
      autoLinkEntries: false,
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
        autoLinkEntries: true,
        themeRoot: 'theme',
        sourceCodeDir: 'app',
      }),
    ).toEqual({
      linkEntries: ['a.css'],
      autoLinkEntries: true,
      snippetName: 'inline-css',
      themeRoot: 'theme',
      sourceCodeDir: 'app',
    })
  })
})

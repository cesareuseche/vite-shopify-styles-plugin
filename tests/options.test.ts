import { describe, expect, it } from 'vitest'
import { normalizeOptions } from '../src/options.js'

describe('normalizeOptions', () => {
  it('applies defaults', () => {
    expect(normalizeOptions()).toEqual({
      linkEntries: [],
      autoLinkEntries: false,
      autoLinkMinBytes: 3000,
      snippetName: 'vite-style',
      themeRoot: './',
      sourceCodeDir: 'src',
      templateBudget: undefined,
    })
  })

  it('keeps overrides', () => {
    expect(
      normalizeOptions({
        snippetName: 'inline-css',
        linkEntries: ['a.css'],
        autoLinkEntries: true,
        autoLinkMinBytes: 5000,
        themeRoot: 'theme',
        sourceCodeDir: 'app',
        templateBudget: 40_000,
      }),
    ).toEqual({
      linkEntries: ['a.css'],
      autoLinkEntries: true,
      autoLinkMinBytes: 5000,
      snippetName: 'inline-css',
      themeRoot: 'theme',
      sourceCodeDir: 'app',
      templateBudget: 40_000,
    })
  })
})

import { describe, expect, it } from 'vitest'
import shopifyInlineStyles, { manifestFileName } from '../src/index.js'

describe('manifestFileName', () => {
  it('returns default path for manifest: true', () => {
    expect(manifestFileName(true)).toBe('.vite/manifest.json')
  })

  it('returns the configured string path', () => {
    expect(manifestFileName('manifest.json')).toBe('manifest.json')
  })

  it('throws a clear error when the manifest is disabled', () => {
    expect(() => manifestFileName(false)).toThrow(/build\.manifest is disabled/)
  })
})

describe('shopifyInlineStyles', () => {
  it('returns a named vite plugin', () => {
    expect(shopifyInlineStyles().name).toBe('vite-plugin-shopify-inline-styles')
  })
})

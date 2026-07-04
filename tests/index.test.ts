import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ResolvedConfig } from 'vite'
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

describe('configureServer', () => {
  it('writes the dev snippet and logs that inlining only happens on build', () => {
    const themeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-style-dev-hint-'))
    const infos: string[] = []

    const plugin = shopifyInlineStyles({ themeRoot })
    const configResolved = plugin.configResolved as (config: unknown) => void
    const configureServer = plugin.configureServer as () => void

    configResolved({
      command: 'serve',
      root: themeRoot,
      build: { outDir: 'assets', manifest: true },
      logger: { info: (msg: string) => infos.push(msg), warn: () => {}, error: () => {} },
    } as unknown as ResolvedConfig)

    configureServer()

    const snippet = fs.readFileSync(
      path.join(themeRoot, 'snippets', 'vite-style.liquid'),
      'utf-8',
    )
    expect(snippet).toContain("render 'vite-tag'")
    expect(infos.join('\n')).toMatch(/dev.*inline <style>.*build/s)
  })
})

describe('closeBundle', () => {
  it('throws a prefixed, actionable error when the manifest file is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-style-missing-manifest-'))
    const themeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-style-theme-root-'))
    const outDir = 'assets'

    const plugin = shopifyInlineStyles({ themeRoot })
    const configResolved = plugin.configResolved as (config: unknown) => void
    const closeBundle = plugin.closeBundle as () => void

    configResolved({
      command: 'build',
      root,
      build: { outDir, manifest: true },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    } as unknown as ResolvedConfig)

    const expectedManifestPath = path.resolve(root, outDir, '.vite/manifest.json')

    expect(() => closeBundle()).toThrow(
      /\[vite-plugin-shopify-inline-styles\].*manifest not found or unreadable/s,
    )
    expect(() => closeBundle()).toThrow(expectedManifestPath)
  })
})

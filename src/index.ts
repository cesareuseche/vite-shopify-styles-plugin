import fs from 'node:fs'
import path from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { findOrphans, findOversized, formatReport, type EntrySize } from './diagnostics.js'
import {
  extractCssEntries,
  generateBuildSnippet,
  generateDevSnippet,
  type ManifestChunk,
} from './generate.js'
import { normalizeOptions, type Options } from './options.js'

export type { Options } from './options.js'

/**
 * Shopify's documented cap for inline_asset_content: "The asset size must be less than 15KB
 * to be inlined." (verified 2026-07-03 against
 * https://shopify.dev/docs/api/liquid/filters/inline_asset_content). Expressed here in decimal
 * bytes (1 KB = 1000 B), consistent with Shopify's own threshold_in_bytes convention used by
 * theme-check's asset-size rules.
 */
const INLINE_SIZE_LIMIT = 15_000

const LIQUID_DIRS = ['layout', 'sections', 'snippets', 'blocks', 'templates']

export default function shopifyInlineStyles(userOptions: Options = {}): Plugin {
  const options = normalizeOptions(userOptions)
  let config: ResolvedConfig

  const snippetPath = () =>
    path.resolve(options.themeRoot, 'snippets', `${options.snippetName}.liquid`)

  return {
    name: 'vite-plugin-shopify-inline-styles',

    configResolved(resolved) {
      config = resolved
    },

    configureServer() {
      writeSnippet(snippetPath(), generateDevSnippet())
      config.logger.info(
        `[vite-style] dev: '${options.snippetName}' delegates to vite-tag, so CSS loads from the dev server — inline <style> tags are generated on build`,
      )
    },

    closeBundle() {
      if (config.command !== 'build') return

      const manifest = readManifest(config)
      const entries = extractCssEntries(manifest, options)
      writeSnippet(snippetPath(), generateBuildSnippet(entries))

      const outDir = path.resolve(config.root, config.build.outDir)
      const sized: EntrySize[] = entries.map((entry) => ({
        ...entry,
        bytes: statSizeSafe(path.join(outDir, entry.file)),
      }))
      config.logger.info(formatReport(sized))

      const liquidContents = readLiquidFiles(options.themeRoot, snippetPath())
      for (const orphan of findOrphans(entries, liquidContents)) {
        config.logger.warn(
          `[vite-style] '${orphan.key}' was built but is never rendered via '${options.snippetName}'`,
        )
      }
      for (const big of findOversized(sized, INLINE_SIZE_LIMIT)) {
        config.logger.warn(
          `[vite-style] '${big.key}' is ${big.bytes} bytes, above the inline_asset_content limit of ${INLINE_SIZE_LIMIT}; Shopify may refuse to inline it. Consider adding it to linkEntries.`,
        )
      }
    },
  }
}

export function manifestFileName(manifest: boolean | string): string {
  if (!manifest) {
    throw new Error(
      '[vite-plugin-shopify-inline-styles] build.manifest is disabled; enable it in your vite config (vite-plugin-shopify requires it too)',
    )
  }
  return typeof manifest === 'string' ? manifest : '.vite/manifest.json'
}

function readManifest(config: ResolvedConfig): Record<string, ManifestChunk> {
  const file = path.resolve(
    config.root,
    config.build.outDir,
    manifestFileName(config.build.manifest),
  )
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, ManifestChunk>
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[vite-plugin-shopify-inline-styles] manifest not found or unreadable at '${file}' — ensure the build ran with build.manifest enabled. ${reason}`,
    )
  }
}

function writeSnippet(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function statSizeSafe(filePath: string): number {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

function readLiquidFiles(themeRoot: string, excludePath: string): string[] {
  const contents: string[] = []
  for (const dir of LIQUID_DIRS) {
    const abs = path.resolve(themeRoot, dir)
    if (!fs.existsSync(abs)) continue
    for (const name of fs.readdirSync(abs, { recursive: true }) as string[]) {
      const file = path.join(abs, String(name))
      if (!file.endsWith('.liquid') || file === excludePath) continue
      contents.push(fs.readFileSync(file, 'utf-8'))
    }
  }
  return contents
}

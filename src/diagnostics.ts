import type { CssEntry } from './generate.js'

export interface EntrySize extends CssEntry {
  bytes: number
}

export function formatReport(entries: EntrySize[]): string {
  const rows = [...entries]
    .sort((a, b) => b.bytes - a.bytes)
    .map(
      (entry) =>
        `  ${entry.aliasPath.padEnd(44)} ${formatKb(entry.bytes).padStart(9)}  ${formatMode(entry)}`,
    )
  return ['[vite-style] generated snippet:', ...rows].join('\n')
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatMode(entry: EntrySize): string {
  if (entry.link) return 'link'
  return entry.files.length > 1 ? `inline (${entry.files.length} parts)` : 'inline'
}

export function findOrphans(entries: CssEntry[], liquidContents: string[]): CssEntry[] {
  return entries.filter(
    (entry) =>
      !liquidContents.some(
        (text) => text.includes(`@/${entry.aliasPath}`) || text.includes(`~/${entry.aliasPath}`),
      ),
  )
}

const IMPORT_RE = /^[ \t]*@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/gm
const NON_VENDOR_RE = /^(\.|\/|@\/|~\/|https?:|data:)/

/**
 * Bare `@import` specifiers ('swiper/css') in CSS source text — vendor CSS that,
 * bundled into an inline entry, re-ships on every page view.
 *
 * ponytail: scans one file only — transitive local @imports aren't followed.
 * Resolve relative imports recursively if real themes hide vendor imports a level down.
 * Line-anchored matching (real @imports start a statement) is what keeps strings out.
 * Preprocessor entries (.scss/.sass/.less/etc.) are skipped by the caller: bare specifiers
 * there are ambiguous (partials like 'variables' resolve to local files) without running
 * the preprocessor's module resolution, which this function doesn't do.
 */
export function findVendorImports(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...withoutComments.matchAll(IMPORT_RE)]
    .map((match) => match[1])
    .filter((spec) => !NON_VENDOR_RE.test(spec))
}

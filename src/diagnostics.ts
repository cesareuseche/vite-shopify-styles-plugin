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

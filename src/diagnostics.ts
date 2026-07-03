import type { CssEntry } from './generate.js'

export interface EntrySize extends CssEntry {
  bytes: number
}

export function formatReport(entries: EntrySize[]): string {
  const rows = [...entries]
    .sort((a, b) => b.bytes - a.bytes)
    .map(
      (entry) =>
        `  ${entry.aliasPath.padEnd(44)} ${formatKb(entry.bytes).padStart(9)}  ${entry.link ? 'link' : 'inline'}`,
    )
  return ['[vite-style] generated snippet:', ...rows].join('\n')
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function findOrphans(entries: CssEntry[], liquidContents: string[]): CssEntry[] {
  return entries.filter(
    (entry) =>
      !liquidContents.some(
        (text) => text.includes(`@/${entry.aliasPath}`) || text.includes(`~/${entry.aliasPath}`),
      ),
  )
}

export function findOversized(entries: EntrySize[], limit: number): EntrySize[] {
  return entries.filter((entry) => !entry.link && entry.bytes > limit)
}

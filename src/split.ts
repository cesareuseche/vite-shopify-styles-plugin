/**
 * Splits built CSS into parts that each fit under Shopify's inline_asset_content cap.
 * Segments are packed in source order so N consecutive <style> tags cascade exactly
 * like the unsplit file.
 */

export interface Segment {
  /** Full segment text, including its terminating ';' or matching '}'. */
  text: string
  /** For blocks, the text before the opening '{'; null for statements. */
  prelude: string | null
}

/** Conditional group at-rules whose bodies may be split and re-wrapped. */
const CONDITIONAL_GROUP = /^\s*@(media|supports|container|layer)\b/i

const byteLength = (s: string) => Buffer.byteLength(s)

/**
 * Scans CSS into top-level segments: a statement ending in ';' at depth 0, or a
 * block from its prelude through the matching '}'. Strings, comments, and
 * parenthesised content (url(), data URIs) never affect segmentation.
 */
export function scanSegments(css: string): Segment[] {
  const segments: Segment[] = []
  let segStart = 0
  let depth = 0
  let parens = 0
  let prelude: string | null = null
  let i = 0
  while (i < css.length) {
    const ch = css[i]
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      i = end === -1 ? css.length : end + 2
      continue
    }
    if (ch === '"' || ch === "'") {
      i++
      while (i < css.length && css[i] !== ch) i += css[i] === '\\' ? 2 : 1
      i++
      continue
    }
    if (ch === '(') parens++
    else if (ch === ')') parens = Math.max(0, parens - 1)
    else if (parens === 0) {
      if (ch === '{') {
        if (depth === 0) prelude = css.slice(segStart, i)
        depth++
      } else if (ch === '}') {
        depth = Math.max(0, depth - 1)
        if (depth === 0) {
          segments.push({ text: css.slice(segStart, i + 1), prelude })
          segStart = i + 1
          prelude = null
        }
      } else if (ch === ';' && depth === 0) {
        segments.push({ text: css.slice(segStart, i + 1), prelude: null })
        segStart = i + 1
      }
    }
    i++
  }
  if (segStart < css.length) segments.push({ text: css.slice(segStart), prelude: null })
  return segments
}

/**
 * Splits CSS into parts each strictly under `limit` bytes. A leading @charset is
 * duplicated as the first bytes of every part. Returns null when an atomic segment
 * (plain rule, @keyframes, @font-face, ...) alone exceeds the limit.
 */
export function splitCss(css: string, limit: number): string[] | null {
  const segments = scanSegments(css)
  const hasCharset =
    segments.length > 0 && segments[0].prelude === null && /^@charset\s/i.test(segments[0].text)
  const prefix = hasCharset ? segments[0].text : ''
  const parts = pack(hasCharset ? segments.slice(1) : segments, limit - byteLength(prefix))
  if (!parts) return null
  if (parts.length === 0) return [prefix]
  return parts.map((part) => prefix + part)
}

function pack(segments: Segment[], budget: number): string[] | null {
  if (budget <= 0) return null
  const parts: string[] = []
  let current = ''
  for (const seg of segments) {
    if (byteLength(current) + byteLength(seg.text) < budget) {
      current += seg.text
      continue
    }
    if (current) {
      parts.push(current)
      current = ''
    }
    if (byteLength(seg.text) < budget) {
      current = seg.text
      continue
    }
    const wrapped = splitBlock(seg, budget)
    if (!wrapped) return null
    parts.push(...wrapped)
  }
  if (current) parts.push(current)
  return parts
}

/**
 * Recursively splits an oversized conditional group's body, re-wrapping each part
 * with the group's prelude. Nested groups accumulate the full prelude chain through
 * recursion. Non-group blocks are atomic: never split internally.
 */
function splitBlock(seg: Segment, budget: number): string[] | null {
  if (seg.prelude === null || !CONDITIONAL_GROUP.test(seg.prelude)) return null
  const body = seg.text.slice(seg.prelude.length + 1, -1)
  const inner = pack(scanSegments(body), budget - byteLength(seg.prelude) - 2)
  if (!inner) return null
  return inner.map((part) => `${seg.prelude}{${part}}`)
}

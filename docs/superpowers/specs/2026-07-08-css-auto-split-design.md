# CSS auto-split for oversized inline entries — design

**Date:** 2026-07-08
**Status:** approved

## Problem

Shopify's `inline_asset_content` filter refuses assets ≥ 15KB, so any CSS entry
over the cap silently loses its styles in production. The plugin currently only
warns and suggests the manual `linkEntries` opt-out ([index.ts](../../../src/index.ts)).
Real themes hit this: makeup-by-mario's portable components include
`product-details` (22.5KB), `search` (21.5KB), `collection` (21KB), `cart`
(17.7KB), `cart-drawer` (16KB) at source scale.

## Decision

**Automatically split oversized CSS entries into ≤15KB part files at build time
and render them as consecutive inline `<style>` tags.** The cap is per asset,
so N parts under the cap inline everything — the Next.js `inlineCss` feel:
automatic, zero config, never breaks.

Alternatives considered and rejected:

1. **Auto-link oversized entries** — ~15-line diff, but concedes the plugin's
   inline value prop exactly for the biggest components. Retained only as the
   safety-net fallback (below).
2. **Bake CSS text into per-entry snippets** (makeup-by-mario's mechanism,
   256KB/file ceiling) — no `inline_asset_content` cap at all, but generated-file
   git churn on every CSS edit and `{{`/`{%` escaping hazards. Revisit only if
   `inline_asset_content` itself becomes a problem.

## Behavior

- On by default, no new options. At build, any CSS entry whose built file
  exceeds `INLINE_SIZE_LIMIT` (15,000 B) is split into part files named
  `<output-basename>-p1.css`, `<output-basename>-p2.css`, … written to the
  build output directory alongside the original. The original file is kept
  (other references such as a direct `vite-tag` render keep working; costs
  dead upload bytes only, nothing shipped to browsers).
- Parts render in order as consecutive `<style>` tags, so the cascade is
  equivalent to the unsplit file.
- Entries under the cap are unchanged (single tag). `linkEntries` remains the
  manual opt-out and takes precedence — linked entries are never split.
- The Vite manifest is not modified; the generated snippet is the only consumer
  of part filenames. Dev mode is untouched (delegates to `vite-tag`).

## Splitter (`src/split.ts`, no dependencies)

A single scanner walks the CSS tracking string literals, comments, and brace
depth, producing top-level segments: a statement ending in `;` at depth 0, or a
block from its prelude through the matching `}`. Segments are greedily packed
in order into parts strictly under the limit (Shopify requires *less than*
15KB).

- If a single segment exceeds the limit and is a conditional group at-rule
  (`@media`, `@supports`, `@container`, `@layer` block), recurse into its body
  and re-wrap each emitted part with the same prelude. Recursion handles
  nesting (e.g. `@media` inside `@supports`) by wrapping with the full prelude
  chain. Packing accounts for wrapper bytes so every emitted part file stays
  under 15,000 B.
- Atomic blocks (`@keyframes`, `@font-face`, a single plain rule) are never
  split internally. If one alone exceeds the limit, the splitter reports the
  entry unsplittable.
- A leading `@charset` statement is duplicated as the first bytes of every
  part. Order-preserving packing keeps surviving `@import` statements valid
  (they sit at the top of part 1).

## Snippet generation (`src/generate.ts`)

`CssEntry.file: string` becomes `files: string[]` (internal type). Branches
assign a comma-joined list; the render path becomes one uniform loop:

```liquid
when '@/snippets/product-details.css'
  assign vs_asset = 'product-details-Xk3D-p1.css,product-details-Xk3D-p2.css'
...
{%- assign vs_parts = vs_asset | split: ',' -%}
{%- for vs_part in vs_parts -%}
  <style data-vite-style="{{ entry }}">{{ vs_part | inline_asset_content }}</style>
{%- endfor -%}
```

Single-file entries flow through the same loop (`split: ','` yields one
element). The `data-vite-style` attribute is unchanged, repeated per part.

## Fallback policy (safety net)

If the splitter reports an entry unsplittable (an atomic segment alone exceeds
the cap, e.g. a base64 data-URI declaration), that whole entry falls back to
`<link rel="stylesheet">` with a build warning. Fallback is entry-level — no
mixed inline+link within one entry. Styles can never silently disappear.

## Diagnostics (`src/diagnostics.ts`)

- Size report shows part counts: `snippets/product-details.css → 2 inline
  parts (21,344 B)`.
- The oversized warning now fires only for the unsplittable-fallback case.
- Orphan detection unchanged (entry keys are unaffected by splitting).

## Testing

- Scanner unit tests: braces inside strings and comments, `url()` content,
  statement vs block segmentation.
- Splitter unit tests: `concat(parts) === original` whenever no re-wrap
  occurred; every part ≤ limit with balanced braces; `@media` re-wrap
  (including nested groups); `@charset` duplication; atomic-oversize →
  unsplittable signal.
- Snippet generation with multi-part entries; single-file entries render
  through the loop unchanged.
- One integration fixture: a >15KB CSS entry through a real Vite build ends
  with part files on disk and a snippet referencing them; oversized warning
  absent, fallback warning exercised by a second unsplittable fixture.

## Non-goals

Critical-CSS extraction, per-template aggregation/dedup, sourcemaps for part
files, dev-mode changes, and the baked-into-liquid mechanism.

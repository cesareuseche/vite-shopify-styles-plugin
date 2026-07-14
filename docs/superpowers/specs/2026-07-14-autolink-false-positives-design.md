# Design: precision fixes for autoLink repetition detection

**Date:** 2026-07-14
**Status:** Approved
**Scope:** `src/autolink.ts`, its tests, README/CHANGELOG wording. No API/options changes, no new dependencies.

## Problem

Since 0.7.0, `autoLinkEntries` promotes "repeat-rendered" entries to `<link>`
regardless of `autoLinkMinBytes`. The repetition detection has three
false-positive mechanisms, each of which turns small inline `<style>` entries
into render-blocking `<link>` requests:

1. **Mutually exclusive branches count as repeated.** Two static
   `{% render 'product-card' %}` occurrences in one file — e.g. the two arms of
   an `{% if %}/{% else %}` — are counted as repetition, though only one
   renders at runtime. The `counts > 1` clause in `buildSnippetRenderers` also
   poisons transitively: every render of that snippet is marked as looped.
2. **Raw string search counts dead code.** `aliasOccurrences` is a plain
   `indexOf`; an alias mentioned inside `{% comment %}`, `{% # … %}`, or an
   HTML comment counts as a render.
3. **`insideForLoop` breaks on unbalanced `for`.** A `{% for %}` example inside
   `{% comment %}`/`{% raw %}`/`{% schema %}` with no matching `endfor`
   inflates the depth counter permanently, so everything below it reads as
   "inside a loop".

Goal (confirmed with user): one *fetch* per stylesheet is enough — N identical
`<link>` tags for a truly loop-rendered component is fine (the browser dedupes
the download). The fix is precision: kill the false positives, keep genuine
loop promotion.

## Design

### 1. Dead-zone stripping

New module-level helper `stripDeadZones(content: string): string` removes, in
one pass:

- `{% comment %}…{% endcomment %}`
- `{% raw %}…{% endraw %}`
- `{% schema %}…{% endschema %}`
- whitespace-control variants of all the above (`{%- … -%}`)
- `{% # … %}` inline comment tags
- `<!-- … -->` HTML comments

Replacement is the empty string — offsets need not be preserved because all
downstream matching re-scans the stripped text. Files are stripped once up
front (in `decideAutoLinks` and `computeTemplateWeights`), not per entry.
Every consumer of `file.content` — `traceToRoots` (via `aliasOccurrences` and
`insideForLoop`), `buildSnippetRenderers`, `collectEveryPageSections` —
operates on stripped content.

An unclosed block strips to end-of-file. This is conservative: the analysis
sees less, which can only suppress a promotion, never fabricate one.

### 2. Remove static-repeat detection (added in 0.7.0)

- In `traceToRoots`: delete `repeated ||= occurrences.length > 1`.
- In `buildSnippetRenderers`: delete the `counts` map and the
  `(counts.get(match[1]) ?? 0) > 1` clause.

A render is a loop-render only if it uses `{% render 'x' for y %}` syntax or
sits inside an open `{% for %}`. Cost of a miss: a component genuinely
rendered twice statically ships its CSS twice inline (0.4.0 behavior) — mildly
wasteful, never breaking. Cost of the removed false positive: tiny CSS became
a render-blocking request. Precision wins the asymmetry.

### 3. Unchanged

- Loop promotion still bypasses `autoLinkMinBytes` (a 20-card grid multiplying
  inline bytes per render is exactly when `<link>` wins at any size).
- The transitive render-graph walk, the caching heuristics (every-page /
  2+ sections / most-templates), and `computeTemplateWeights` are untouched —
  they simply benefit from stripped content.

## Error handling

Stripping is regex-based and tolerant. No new runtime failure modes: inputs
are the same theme files already read today, and malformed Liquid degrades to
"strip to EOF" (conservative).

## Testing (TDD, existing vitest suites)

New cases in `tests/autolink.test.ts`:

- (a) one real render + one commented-out render → not repeated
- (b) `{% for %}` inside `{% comment %}` / `{% schema %}` does not mark later
  renders as looped
- (c) `{% if %}/{% else %}` rendering the same snippet in both arms → not
  repeated
- (d) render inside a real `{% for %}…{% endfor %}` → still promoted
- (e) `{% render 'x' for y %}` → still promoted
- (f) alias mention inside an HTML comment is ignored

Existing tests asserting the 0.7.0 static-repeat behavior are updated to the
new expectation.

## Docs

- CHANGELOG: note the "2+ static renders in one file" detection was removed as
  a false-positive source, and that analysis now ignores comments/raw/schema.
- README: repetition-detection wording updated to loops-only.

# AutoLink False-Positive Precision Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `autoLinkEntries` from promoting inline entries to `<link>` on false repetition signals: mutually exclusive branches, commented-out code, and unbalanced `{% for %}` inside comment/raw/schema blocks.

**Architecture:** Two changes to `src/autolink.ts`: (1) delete the 0.7.0 "2+ static renders in one file = repeated" detection so repetition means loops only; (2) strip Liquid/HTML dead zones (`{% comment %}`, `{% raw %}`, `{% schema %}`, `{% # … %}`, `<!-- … -->`) from file content before any analysis. No API changes, no new dependencies.

**Tech Stack:** TypeScript (ESM, Node16 resolution), vitest. Spec: `docs/superpowers/specs/2026-07-14-autolink-false-positives-design.md`.

## Global Constraints

- No new dependencies.
- No changes to plugin options or exported API signatures.
- Loop promotion must keep bypassing `autoLinkMinBytes` (existing test "repetition bypasses the gate" must stay green).
- Immutability: never mutate `LiquidFile` objects — build new ones.
- Imports in source use `.js` extensions (ESM Node16 style), matching the existing code.

---

### Task 1: Remove static-repeat detection (loops only)

**Files:**
- Modify: `src/autolink.ts:181-188` (`traceToRoots` occurrence loop) and `src/autolink.ts:204-220` (`buildSnippetRenderers`)
- Test: `tests/autolink.test.ts` (describe block "static repetition (no loop)", lines 196-232)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `buildSnippetRenderers(files: LiquidFile[]): Map<string, Renderer[]>` and `traceToRoots(...)` keep their exact signatures; only their repetition semantics change (loops only). Task 2 modifies the same file and assumes this task's version.

- [ ] **Step 1: Rewrite the "static repetition" describe block — flip two tests, add the if/else test**

In `tests/autolink.test.ts`, replace the entire `describe('decideAutoLinks: static repetition (no loop)', …)` block (lines 196-232) with:

```typescript
describe('decideAutoLinks: static repetition is not repetition (loops only)', () => {
  it('leaves an entry rendered twice statically in the same file inline', () => {
    const files: LiquidFile[] = [
      {
        path: 'sections/featured.liquid',
        content: `${render('snippets/l-card.css')}\n${render('snippets/l-card.css')}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-card.css')], files, theme())).toEqual([])
  })

  it('leaves an entry whose snippet is rendered twice statically by the same file inline', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/card.liquid', content: render('snippets/l-card.css') },
      {
        path: 'sections/featured.liquid',
        content: `{% render 'card', product: a %}\n{% render 'card', product: b %}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-card.css')], files, theme())).toEqual([])
  })

  it('does not flag a snippet rendered in both arms of an if/else', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/card.liquid', content: render('snippets/l-card.css') },
      {
        path: 'sections/featured.liquid',
        content: `{% if compact %}{% render 'card', compact: true %}{% else %}{% render 'card' %}{% endif %}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-card.css')], files, theme())).toEqual([])
  })

  it('does not flag two different snippets rendered once each', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/card.liquid', content: render('snippets/l-card.css') },
      {
        path: 'sections/featured.liquid',
        content: `{% render 'card' %}\n{% render 'other' %}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-card.css')], files, theme())).toEqual([])
  })
})
```

- [ ] **Step 2: Run the suite to verify the three repetition tests fail**

Run: `npx vitest run tests/autolink.test.ts`
Expected: FAIL — "leaves an entry rendered twice statically…", "leaves an entry whose snippet is rendered twice statically…", and "does not flag a snippet rendered in both arms of an if/else" fail (each currently returns a promotion decision). All other tests pass.

- [ ] **Step 3: Remove the static-repeat detection from `src/autolink.ts`**

In `traceToRoots`, replace:

```typescript
  for (const file of files) {
    const occurrences = aliasOccurrences(file.content, entry.aliasPath)
    // The same entry rendered 2+ times in one file duplicates without any loop.
    repeated ||= occurrences.length > 1
    for (const index of occurrences) {
      enqueue(file.path, insideForLoop(file.content, index))
    }
  }
```

with:

```typescript
  for (const file of files) {
    for (const index of aliasOccurrences(file.content, entry.aliasPath)) {
      enqueue(file.path, insideForLoop(file.content, index))
    }
  }
```

In `buildSnippetRenderers`, replace:

```typescript
  for (const file of files) {
    const matches = [...file.content.matchAll(RENDER_RE)]
    const counts = new Map<string, number>()
    for (const match of matches) counts.set(match[1], (counts.get(match[1]) ?? 0) + 1)
    for (const match of matches) {
      const loop =
        /^\s+for\s/.test(match[2]) ||
        insideForLoop(file.content, match.index) ||
        (counts.get(match[1]) ?? 0) > 1
      const existing = renderers.get(match[1]) ?? []
      renderers.set(match[1], [...existing, { path: file.path, loop }])
    }
  }
```

with:

```typescript
  for (const file of files) {
    for (const match of file.content.matchAll(RENDER_RE)) {
      const loop = /^\s+for\s/.test(match[2]) || insideForLoop(file.content, match.index)
      const existing = renderers.get(match[1]) ?? []
      renderers.set(match[1], [...existing, { path: file.path, loop }])
    }
  }
```

Update the two doc comments that describe the old behavior:
- On `decideAutoLinks` (lines 30-38): change "Repeat-rendered entries (in a loop, or rendered several times by one file) are always promoted" to "Loop-rendered entries are always promoted".
- On `buildSnippetRenderers` (line 203): change the comment to `/** snippet name -> files that {% render %} it, with a flag for loop renders */`.

- [ ] **Step 4: Run the full test suite to verify everything passes**

Run: `npx vitest run`
Expected: PASS — all files green (only `tests/autolink.test.ts` asserted the old behavior; `tests/index.test.ts` and `tests/generate.test.ts` are unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/autolink.ts tests/autolink.test.ts
git commit -m "fix: repetition detection counts loops only — static 2+ renders was a false-positive source"
```

---

### Task 2: Dead-zone stripping before analysis

**Files:**
- Modify: `src/autolink.ts` (new helper `stripDeadZones` + wiring in `decideAutoLinks` and `computeTemplateWeights`)
- Test: `tests/autolink.test.ts` (new describe block)

**Interfaces:**
- Consumes: Task 1's version of `src/autolink.ts` (loops-only `buildSnippetRenderers`).
- Produces: module-private `stripDeadZones(files: LiquidFile[]): LiquidFile[]` — not exported; tested through `decideAutoLinks`. Exported API unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `tests/autolink.test.ts`:

```typescript
describe('decideAutoLinks: dead zones are ignored', () => {
  it('a {% for %} inside {% comment %} does not mark a later render as looped', () => {
    const files: LiquidFile[] = [
      {
        path: 'sections/hero.liquid',
        content: `{% comment %} example: {% for p in c %} {% endcomment %}\n${render('snippets/l-hero.css')}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-hero.css')], files, theme())).toEqual([])
  })

  it('a {% for %} inside {% schema %} does not mark a later render as looped', () => {
    const files: LiquidFile[] = [
      {
        path: 'sections/hero.liquid',
        content: `${render('snippets/l-hero.css')}\n{% schema %}\n{ "settings": [{ "info": "use {% for %} here" }] }\n{% endschema %}`,
      },
      {
        path: 'sections/other.liquid',
        content: `{% schema %} {% for %} {% endschema %}\n${render('snippets/l-hero.css')}`,
      },
    ]
    const decisions = decideAutoLinks([entry('snippets/l-hero.css')], files, theme())
    expect(decisions.map((d) => d.reason).join()).not.toContain('duplicate per render')
  })

  it('a commented-out loop render of a snippet does not promote its entry', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/card.liquid', content: render('snippets/l-card.css') },
      {
        path: 'sections/featured.liquid',
        content: `{% comment %}{% render 'card' for collection.products %}{% endcomment %}\n{% render 'card' %}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-card.css')], files, theme())).toEqual([])
  })

  it('an alias mentioned in a layout {% comment %} does not create an every-page root', () => {
    const files: LiquidFile[] = [
      {
        path: 'layout/theme.liquid',
        content: `{% comment %} moved to section: @/snippets/l-badge.css {% endcomment %}`,
      },
      { path: 'sections/hero.liquid', content: render('snippets/l-badge.css') },
    ]
    const structure = theme({
      templates: ['index', 'product', 'collection'],
      sectionTemplates: new Map([['hero', ['index']]]),
    })
    expect(decideAutoLinks([entry('snippets/l-badge.css')], files, structure)).toEqual([])
  })

  it('an alias mentioned in an HTML comment is ignored', () => {
    const files: LiquidFile[] = [
      {
        path: 'layout/theme.liquid',
        content: `<!-- {% render 'vite-style', entry: '@/snippets/l-badge.css' %} -->`,
      },
      { path: 'sections/hero.liquid', content: render('snippets/l-badge.css') },
    ]
    const structure = theme({
      templates: ['index', 'product', 'collection'],
      sectionTemplates: new Map([['hero', ['index']]]),
    })
    expect(decideAutoLinks([entry('snippets/l-badge.css')], files, structure)).toEqual([])
  })

  it('an alias mentioned in a {% # %} inline comment is ignored', () => {
    const files: LiquidFile[] = [
      {
        path: 'layout/theme.liquid',
        content: `{% # style moved: @/snippets/l-badge.css %}`,
      },
      { path: 'sections/hero.liquid', content: render('snippets/l-badge.css') },
    ]
    const structure = theme({
      templates: ['index', 'product', 'collection'],
      sectionTemplates: new Map([['hero', ['index']]]),
    })
    expect(decideAutoLinks([entry('snippets/l-badge.css')], files, structure)).toEqual([])
  })

  it('an unclosed {% comment %} strips to end of file (conservative)', () => {
    const files: LiquidFile[] = [
      {
        path: 'sections/hero.liquid',
        content: `{% comment %} {% for p in c %} forgot to close\n${render('snippets/l-hero.css')}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-hero.css')], files, theme())).toEqual([])
  })

  it('computeTemplateWeights ignores dead zones too', () => {
    const files: LiquidFile[] = [
      {
        path: 'layout/theme.liquid',
        content: `{% comment %} ${render('snippets/l-a.css')} {% endcomment %}`,
      },
    ]
    const weights = computeTemplateWeights(
      [{ ...entry('snippets/l-a.css'), bytes: 2000 }],
      files,
      theme({ templates: ['index'] }),
    )
    expect(weights).toEqual([{ template: 'index', bytes: 0 }])
  })
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run tests/autolink.test.ts`
Expected: FAIL — all 8 new tests fail: the comment/schema/unclosed-comment `for` tests get a "duplicate per render" promotion, the three layout-comment alias tests get an "every page" promotion, and the weights test reports 2000 bytes instead of 0.

- [ ] **Step 3: Implement `stripDeadZones` and wire it in**

In `src/autolink.ts`, add below the existing regex constants (after line 28):

```typescript
// Dead zones: Liquid the runtime never executes and analysis must not see.
// Unclosed blocks strip to end-of-file — conservative: analyzing less can only
// suppress a promotion, never fabricate one.
const DEAD_ZONE_RE = new RegExp(
  [
    '\\{%-?\\s*comment\\s*-?%\\}[\\s\\S]*?(?:\\{%-?\\s*endcomment\\s*-?%\\}|$)',
    '\\{%-?\\s*raw\\s*-?%\\}[\\s\\S]*?(?:\\{%-?\\s*endraw\\s*-?%\\}|$)',
    '\\{%-?\\s*schema\\s*-?%\\}[\\s\\S]*?(?:\\{%-?\\s*endschema\\s*-?%\\}|$)',
    '\\{%-?\\s*#[\\s\\S]*?(?:%\\}|$)',
    '<!--[\\s\\S]*?(?:-->|$)',
  ].join('|'),
  'g',
)

function stripDeadZones(files: LiquidFile[]): LiquidFile[] {
  return files.map((file) => ({ ...file, content: file.content.replace(DEAD_ZONE_RE, '') }))
}
```

In `decideAutoLinks`, strip once up front — replace:

```typescript
  const renderers = buildSnippetRenderers(files)
  const everyPageSections = collectEveryPageSections(files, theme)
```

with:

```typescript
  const stripped = stripDeadZones(files)
  const renderers = buildSnippetRenderers(stripped)
  const everyPageSections = collectEveryPageSections(stripped, theme)
```

and in the same function change `traceToRoots(entry, files, renderers)` to `traceToRoots(entry, stripped, renderers)`.

In `computeTemplateWeights`, apply the same change — replace:

```typescript
  const renderers = buildSnippetRenderers(files)
  const everyPageSections = collectEveryPageSections(files, theme)
```

with:

```typescript
  const stripped = stripDeadZones(files)
  const renderers = buildSnippetRenderers(stripped)
  const everyPageSections = collectEveryPageSections(stripped, theme)
```

and change its `traceToRoots(entry, files, renderers)` to `traceToRoots(entry, stripped, renderers)`.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all suites green, including the pre-existing loop, section-sharing, page-coverage, size-gate, and weights tests.

- [ ] **Step 5: Commit**

```bash
git add src/autolink.ts tests/autolink.test.ts
git commit -m "fix: strip comment/raw/schema/HTML-comment dead zones before autoLink analysis"
```

---

### Task 3: README and CHANGELOG updates

**Files:**
- Modify: `README.md:42-44`, `README.md:197-200`, `README.md:222-225`, `README.md:317`
- Modify: `CHANGELOG.md` (under `## [Unreleased]`)

**Interfaces:**
- Consumes: the behavior shipped in Tasks 1-2 (loops-only repetition, dead-zone stripping).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Update README repetition wording (4 spots)**

Spot 1 — `README.md:42-44`, replace:

```markdown
- **Repeat-rendered components handled** — a card rendered 24 times in a grid would duplicate
  its inline CSS 24×, so [`autoLinkEntries`](#automatic-linkentries-autolinkentries-true)
  detects those and ships them as a single cached `<link>` instead.
```

with:

```markdown
- **Loop-rendered components handled** — a card rendered 24 times in a grid would duplicate
  its inline CSS 24×, so [`autoLinkEntries`](#automatic-linkentries-autolinkentries-true)
  detects loop renders and ships those entries as a single cached `<link>` instead.
```

Spot 2 — `README.md:197-200`, replace:

```markdown
The fix is delivery mode, not dedupe: for repeat-rendered entries, a `<link>` tag repeated 24
times costs ~150 bytes each and **one** cached download, while inline `<style>` repeats the
full CSS every time. That's why `autoLinkEntries` promotes any entry rendered repeatedly on a
page (in a loop, or several times by one file) to `<link>` — regardless of its size.
```

with:

```markdown
The fix is delivery mode, not dedupe: for repeat-rendered entries, a `<link>` tag repeated 24
times costs ~150 bytes each and **one** cached download, while inline `<style>` repeats the
full CSS every time. That's why `autoLinkEntries` promotes any entry rendered inside a loop
to `<link>` — regardless of its size. Detection is loops only ({% for %} and
`{% render 'card' for products %}`): static repeats can sit in mutually exclusive branches,
so counting them produced false promotions. Analysis ignores `{% comment %}`, `{% raw %}`,
`{% schema %}`, `{% # … %}`, and HTML comments.
```

Spot 3 — `README.md:222-225`, replace:

```markdown
- **Rendered repeatedly on a page** — inside a loop (`{% for %}` or
  `{% render 'card' for products %}`), or rendered two or more times by the same file,
  directly or via a snippet. Inline CSS duplicates per render, so this promotion applies
  **regardless of entry size**.
```

with:

```markdown
- **Rendered inside a loop** — `{% for %}` or `{% render 'card' for products %}`, directly
  or via a snippet. Inline CSS duplicates per render, so this promotion applies
  **regardless of entry size**.
```

Spot 4 — `README.md:317`, in the `autoLinkMinBytes` table row, replace "Repeat-rendered entries are promoted regardless of size" with "Loop-rendered entries are promoted regardless of size".

- [ ] **Step 2: Add the CHANGELOG entry**

Under `## [Unreleased]` in `CHANGELOG.md`, add:

```markdown
### Fixed

- `autoLinkEntries` false positives that promoted inline entries to `<link>` on
  phantom repetition:
  - The 0.7.0 "rendered 2+ times by one file" detection is removed — it counted
    mutually exclusive `{% if %}/{% else %}` branches as repetition and poisoned
    every render of the affected snippet. Repetition now means loops only
    (`{% for %}` and `{% render 'x' for y %}`). A component genuinely rendered
    twice statically ships its CSS twice inline again (0.4.0 behavior).
  - Static analysis now strips `{% comment %}`, `{% raw %}`, `{% schema %}`,
    `{% # … %}`, and HTML comments before matching, so commented-out renders,
    alias mentions in comments, and `{% for %}` examples inside comments or
    schema JSON no longer count as real renders or open loops.
```

- [ ] **Step 3: Verify build and tests still pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document loops-only repetition detection and dead-zone stripping"
```

# Vendor CSS Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn at build time when an inline-mode CSS entry imports vendor CSS (bare `@import` specifiers), and document the recommended vendor-CSS pattern in the README.

**Architecture:** A pure classifier function `findVendorImports()` in `src/diagnostics.ts` (alongside the existing `findOrphans`), wired into the `closeBundle` hook in `src/index.ts` after entries are computed — scanning each inline entry's **source** file (not the built asset, where Vite has already flattened imports). Plus a README recipe section.

**Tech Stack:** TypeScript, Vite plugin API, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-10-vendor-css-handling-design.md`

## Global Constraints

- Warn only — never change an entry's inline/link mode.
- Scan one level deep: the entry source file only, no transitive resolution (ceiling documented in a `ponytail:` comment).
- Entries in link mode (user `linkEntries` or auto-split fallback) are never scanned.
- No new plugin options.
- Bare specifier = does NOT start with `.`, `/`, `@/`, `~/`, `http:`, `https:`, `//`, or `data:`.
- All existing tests must keep passing: `npx vitest run`.

---

### Task 1: `findVendorImports` classifier in diagnostics.ts

**Files:**
- Modify: `src/diagnostics.ts` (append after `findOrphans`, line 33)
- Test: `tests/diagnostics.test.ts` (append new describe block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export function findVendorImports(css: string): string[]` — returns the bare (vendor) `@import` specifiers found in CSS source text, in order of appearance. Task 2 imports this from `./diagnostics.js`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/diagnostics.test.ts` (add `findVendorImports` to the existing import from `../src/diagnostics.js`):

```ts
describe('findVendorImports', () => {
  it('returns bare specifiers from @import statements', () => {
    const css = "@import 'swiper/css';\n@import \"swiper/css/navigation\";\n.x { color: red }"
    expect(findVendorImports(css)).toEqual(['swiper/css', 'swiper/css/navigation'])
  })

  it('supports the url() form', () => {
    expect(findVendorImports("@import url('swiper/css');")).toEqual(['swiper/css'])
    expect(findVendorImports('@import url(swiper/css);')).toEqual(['swiper/css'])
  })

  it('ignores relative, absolute, and alias specifiers', () => {
    const css = [
      "@import './local.css';",
      "@import '../shared.css';",
      "@import '/abs.css';",
      "@import '@/snippets/x.css';",
      "@import '~/snippets/x.css';",
    ].join('\n')
    expect(findVendorImports(css)).toEqual([])
  })

  it('ignores remote and data URLs', () => {
    const css = "@import 'https://fonts.example.com/x.css';\n@import '//cdn.example.com/x.css';"
    expect(findVendorImports(css)).toEqual([])
  })

  it('ignores @import inside comments', () => {
    const css = "/* @import 'swiper/css'; */\n/*\n@import 'swiper/css';\n*/\n.x { color: red }"
    expect(findVendorImports(css)).toEqual([])
  })

  it('ignores @import-looking text mid-line (strings, url() values)', () => {
    const css = 'content: "@import \'swiper/css\'"; background: url(\'swiper/img.png\');'
    expect(findVendorImports(css)).toEqual([])
  })

  it('returns empty for CSS with no imports', () => {
    expect(findVendorImports('.x { color: red }')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/diagnostics.test.ts`
Expected: FAIL — `findVendorImports` is not exported.

- [ ] **Step 3: Implement `findVendorImports`**

Append to `src/diagnostics.ts`:

```ts
const IMPORT_RE = /^[ \t]*@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/gm
const NON_VENDOR_RE = /^(\.|\/|@\/|~\/|https?:|data:)/

/**
 * Bare `@import` specifiers ('swiper/css') in CSS source text — vendor CSS that,
 * bundled into an inline entry, re-ships on every page view.
 *
 * ponytail: scans one file only — transitive local @imports aren't followed.
 * Resolve relative imports recursively if real themes hide vendor imports a level down.
 * Line-anchored matching (real @imports start a statement) is what keeps strings out.
 */
export function findVendorImports(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...withoutComments.matchAll(IMPORT_RE)]
    .map((match) => match[1])
    .filter((spec) => !NON_VENDOR_RE.test(spec))
}
```

Note: `//cdn...` is covered by the `/` prefix in `NON_VENDOR_RE`, so it needs no separate alternative.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/diagnostics.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics.ts tests/diagnostics.test.ts
git commit -m "feat: classify bare @import specifiers as vendor CSS"
```

---

### Task 2: Wire the warning into closeBundle

**Files:**
- Modify: `src/index.ts` (import at line 4; warning loop in `closeBundle` after the orphan loop, ~line 69; helper next to `statSizeSafe`, ~line 130)
- Test: `tests/index.test.ts` (append new describe block)

**Interfaces:**
- Consumes: `findVendorImports(css: string): string[]` from `./diagnostics.js` (Task 1).
- Produces: a build warning of the shape `[vite-style] '<entry.key>' inlines vendor CSS from '<spec>'[, '<spec>'…] — vendor styles re-ship on every page view; consider a dedicated entry in linkEntries`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/index.test.ts`. The helper builds a fake completed build on disk (manifest + built asset + source file), then runs `closeBundle` — same pattern as the existing missing-manifest test:

```ts
describe('closeBundle vendor import warning', () => {
  function runBuild(opts: { linkEntries?: string[]; source: string }): string[] {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-style-vendor-'))
    const themeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-style-vendor-theme-'))
    const warnings: string[] = []

    fs.mkdirSync(path.join(root, 'src/snippets'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src/snippets/l-carousel.css'), opts.source)
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(root, 'assets/l-carousel-X.css'), '.swiper{display:flex}')
    fs.writeFileSync(
      path.join(root, 'assets/manifest.json'),
      JSON.stringify({
        'src/snippets/l-carousel.css': {
          file: 'l-carousel-X.css',
          src: 'src/snippets/l-carousel.css',
          isEntry: true,
        },
      }),
    )

    const plugin = shopifyInlineStyles({ themeRoot, linkEntries: opts.linkEntries })
    const configResolved = plugin.configResolved as (config: unknown) => void
    const closeBundle = plugin.closeBundle as () => void

    configResolved({
      command: 'build',
      root,
      build: { outDir: 'assets', manifest: 'manifest.json' },
      logger: { info: () => {}, warn: (msg: string) => warnings.push(msg), error: () => {} },
    } as unknown as ResolvedConfig)

    closeBundle()
    return warnings.filter((w) => w.includes('vendor'))
  }

  it('warns when an inline entry has a bare vendor @import', () => {
    const vendorWarnings = runBuild({ source: "@import 'swiper/css';\n.s { color: red }" })
    expect(vendorWarnings).toHaveLength(1)
    expect(vendorWarnings[0]).toContain("'src/snippets/l-carousel.css'")
    expect(vendorWarnings[0]).toContain("'swiper/css'")
    expect(vendorWarnings[0]).toContain('linkEntries')
  })

  it('does not warn when the same entry is in linkEntries', () => {
    const vendorWarnings = runBuild({
      linkEntries: ['l-carousel.css'],
      source: "@import 'swiper/css';\n.s { color: red }",
    })
    expect(vendorWarnings).toEqual([])
  })

  it('does not warn for local and alias imports', () => {
    const vendorWarnings = runBuild({ source: "@import './base.css';\n@import '@/snippets/x.css';" })
    expect(vendorWarnings).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — first test gets no vendor warning (feature absent). The other two pass vacuously; that's fine.

- [ ] **Step 3: Implement the warning**

In `src/index.ts`:

1. Extend the diagnostics import (line 4):

```ts
import { findOrphans, findVendorImports, formatReport, type EntrySize } from './diagnostics.js'
```

2. In `closeBundle`, after the orphan-warning loop (after line 69), add:

```ts
      for (const entry of entries) {
        if (entry.link) continue
        const vendors = findVendorImports(readFileSafe(path.resolve(config.root, entry.key)))
        if (vendors.length === 0) continue
        config.logger.warn(
          `[vite-style] '${entry.key}' inlines vendor CSS from ${vendors
            .map((spec) => `'${spec}'`)
            .join(', ')} — vendor styles re-ship on every page view; consider a dedicated entry in linkEntries`,
        )
      }
```

Note: `entries` here is post-`autoSplit`, so an entry that fell back to `<link>` (unsplittable) is correctly skipped — it no longer inlines anything.

3. Add the helper next to `statSizeSafe` (~line 130):

```ts
function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS — new tests green, integration fixture untouched (no fixture entry has a bare import).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: warn when an inline entry bundles vendor CSS via bare @import"
```

---

### Task 3: README "Vendor / UI-library CSS" section

**Files:**
- Modify: `README.md` — new section after "Inline vs. `<link>`: choosing per component" (after line 136, before "## Automatic splitting of oversized entries"); one bullet added to the "Build diagnostics" warns-when list (line 190-193).

**Interfaces:**
- Consumes: the warning text from Task 2 (quoted in the diagnostics bullet).
- Produces: documentation only.

- [ ] **Step 1: Insert the new section**

After the "Inline vs. `<link>`" section (its last line is "An entry in `linkEntries` is never inlined and never split…"), insert:

````markdown
## Vendor / UI-library CSS (Swiper, etc.)

UI libraries ship large stylesheets that are the textbook `linkEntries` case: big, shared, and
reused across pages. Give them a **dedicated entry** and keep it as a cached `<link>`:

```css
/* src/snippets/l-vendor-swiper.css */
@import 'swiper/css';
@import 'swiper/css/navigation';
```

```js
shopifyInlineStyles({ linkEntries: ['l-vendor-swiper.css'] })
```

```liquid
{% render 'vite-style', entry: '@/snippets/l-vendor-swiper.css' %}
```

Render it in the section(s) that use the library, so it loads only on pages that need it —
fetched once, cached for every subsequent page view.

Two rules keep this fast:

1. **Import per-module, never the bundle.** `swiper/swiper-bundle.css` is ~18 KB; the core
   (`swiper/css`) plus only the modules you use is often 3–6 KB. The biggest optimization is
   bytes you don't ship.
2. **Don't `@import` vendor CSS inside a component's inline entry.** The vendor bytes get
   bundled into that entry, re-ship with every page view, duplicate per `{% render %}`, and
   usually push the entry over the 15 KB cap into auto-splitting. The build warns when it
   detects this.
````

- [ ] **Step 2: Extend the Build diagnostics warns-when list**

Change:

```markdown
It also warns when:

- a CSS entrypoint is built but never referenced via `render 'vite-style'` in any Liquid file (orphan); or
- an oversized entry can't be auto-split (an atomic block alone exceeds the 15 KB cap) and falls back to `<link>`.
```

to:

```markdown
It also warns when:

- a CSS entrypoint is built but never referenced via `render 'vite-style'` in any Liquid file (orphan);
- an oversized entry can't be auto-split (an atomic block alone exceeds the 15 KB cap) and falls back to `<link>`; or
- an inline entry `@import`s vendor CSS (a bare specifier like `'swiper/css'`) — see
  [Vendor / UI-library CSS](#vendor--ui-library-css-swiper-etc).
```

- [ ] **Step 3: Verify anchors and rendering**

Run: `npx vitest run` (guards against accidental non-doc changes) and eyeball the section order:
`Inline vs. <link>` → `Vendor / UI-library CSS` → `Automatic splitting`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: vendor / UI-library CSS recipe (dedicated linkEntries entry)"
```

> Note: `README.md` has an unrelated pre-existing modification in the working tree. Stage carefully — if the diff contains hunks unrelated to this task, use `git add -p README.md` and stage only the vendor-CSS hunks.

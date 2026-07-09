# Migrate Codemod CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `npx vite-plugin-shopify-inline-styles migrate` — a dry-run-by-default codemod that rewrites `vite-tag` CSS renders to `vite-style` across a theme's liquid files and suggests `linkEntries` for loop-rendered components.

**Architecture:** All logic lives in a new `src/migrate.ts` (pure rewrite/detection functions + fs walk + CLI runner, every function exported and unit-testable). A 3-line `src/cli.ts` with a shebang is the `bin` entry — it only imports `runCli` and exits with its return code, so tests never trigger self-execution. No new dependencies: `process.argv` parsing, `fs.readdirSync(..., { recursive: true })` for the walk.

**Tech Stack:** TypeScript (strict, NodeNext ESM, built with plain `tsc`), vitest, Node ≥20 stdlib only.

**Spec:** `docs/superpowers/specs/2026-07-04-migrate-codemod-design.md`

## Global Constraints

- Node `>=20` (from package.json `engines`); no new runtime or dev dependencies.
- ESM only: internal imports use `.js` extensions (`from './migrate.js'`), tsconfig is `module: NodeNext`, `strict: true`.
- Match existing code style: no semicolons, single quotes, 2-space indent, `node:`-prefixed stdlib imports.
- Only `.css`-suffixed entries are ever touched — JS renders keep using `vite-tag` (plugin contract).
- Default option values must equal the plugin defaults in `src/options.ts`: `themeRoot: './'`, `snippetName: 'vite-style'`.
- Liquid dirs scanned are exactly the plugin's list in `src/index.ts`: `layout`, `sections`, `snippets`, `blocks`, `templates`.
- Coverage must stay ≥80% (`npm run test:coverage`).
- Commit message prefixes: `feat:` for code, `docs:` for documentation-only commits.

---

### Task 1: `rewriteLiquid` — the pure rewrite rule

**Files:**
- Create: `src/migrate.ts`
- Create: `tests/migrate.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no imports needed yet).
- Produces: `rewriteLiquid(content: string, snippetName: string): { content: string; matches: Array<{ before: string; after: string }> }` — Task 3's `runMigrate` calls this per file; `before`/`after` are the exact matched tag text (used verbatim in Task 4's output).

- [ ] **Step 1: Write the failing tests**

Create `tests/migrate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rewriteLiquid } from '../src/migrate.js'

describe('rewriteLiquid', () => {
  it('rewrites a single-quoted vite-tag CSS render', () => {
    const { content, matches } = rewriteLiquid(
      "{% render 'vite-tag', entry: '@/snippets/l-badge.css' %}",
      'vite-style',
    )
    expect(content).toBe("{% render 'vite-style', entry: '@/snippets/l-badge.css' %}")
    expect(matches).toHaveLength(1)
    expect(matches[0].before).toBe("{% render 'vite-tag', entry: '@/snippets/l-badge.css' %}")
    expect(matches[0].after).toBe("{% render 'vite-style', entry: '@/snippets/l-badge.css' %}")
  })

  it('rewrites double-quoted and whitespace-control variants', () => {
    const input = '{%- render "vite-tag", entry: "@/sections/section.hero.css" -%}'
    const { content } = rewriteLiquid(input, 'vite-style')
    expect(content).toBe('{%- render "vite-style", entry: "@/sections/section.hero.css" -%}')
  })

  it('leaves JS entries, other snippets, and already-migrated calls untouched', () => {
    const input = [
      "{% render 'vite-tag', entry: '@/entrypoints/theme.js' %}",
      "{% render 'l-badge' %}",
      "{% render 'vite-style', entry: '@/snippets/l-badge.css' %}",
    ].join('\n')
    const { content, matches } = rewriteLiquid(input, 'vite-style')
    expect(content).toBe(input)
    expect(matches).toHaveLength(0)
  })

  it('rewrites multiple calls and preserves extra params', () => {
    const input = [
      "{% render 'vite-tag', entry: '@/snippets/a.css' %}",
      "{% render 'vite-tag', entry: '@/snippets/b.css', media: 'print' %}",
    ].join('\n')
    const { content, matches } = rewriteLiquid(input, 'vite-style')
    expect(matches).toHaveLength(2)
    expect(content).toContain("entry: '@/snippets/b.css', media: 'print'")
    expect(content).not.toContain('vite-tag')
  })

  it('respects a custom snippet name', () => {
    const { content } = rewriteLiquid(
      "{% render 'vite-tag', entry: '@/snippets/a.css' %}",
      'my-style',
    )
    expect(content).toBe("{% render 'my-style', entry: '@/snippets/a.css' %}")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/migrate.test.ts`
Expected: FAIL — `Cannot find module '../src/migrate.js'` (or missing export `rewriteLiquid`).

- [ ] **Step 3: Write the minimal implementation**

Create `src/migrate.ts`:

```ts
/**
 * Matches a `{% render 'vite-tag', entry: '<...>.css' %}` call — single or double
 * quotes, `{%-`/`-%}` whitespace-control variants, extra params after the entry.
 * Only `.css` entries: JS renders keep using vite-tag (same contract as the plugin).
 */
const VITE_TAG_CSS_RE =
  /\{%-?\s*render\s+(['"])vite-tag\1\s*,\s*entry:\s*(['"])[^'"]+\.css\2[\s\S]*?%\}/g

export function rewriteLiquid(
  content: string,
  snippetName: string,
): { content: string; matches: Array<{ before: string; after: string }> } {
  const matches: Array<{ before: string; after: string }> = []
  const next = content.replace(VITE_TAG_CSS_RE, (tag) => {
    const after = tag.replace('vite-tag', snippetName)
    matches.push({ before: tag, after })
    return after
  })
  return { content: next, matches }
}
```

(`tag.replace('vite-tag', snippetName)` replaces the first occurrence, which is always the snippet name — the entry path comes after it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/migrate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/migrate.ts tests/migrate.test.ts
git commit -m "feat: rewriteLiquid rewrites vite-tag CSS renders to the inline-styles snippet"
```

---

### Task 2: `findLinkCandidates` — loop + one-level-indirection detection

**Files:**
- Modify: `src/migrate.ts` (append)
- Modify: `tests/migrate.test.ts` (append)

**Interfaces:**
- Consumes: nothing from Task 1 (independent pure function).
- Produces: `findLinkCandidates(files: Map<string, string>, snippetName: string): string[]` — keys of `files` are theme-root-relative POSIX paths (e.g. `'snippets/l-card.liquid'`); returns sorted CSS basenames (e.g. `['l-card.css']`). Task 3's `runMigrate` calls it with the original (pre-rewrite) file contents.

- [ ] **Step 1: Write the failing tests**

Append to `tests/migrate.test.ts` (add `findLinkCandidates` to the existing import from `'../src/migrate.js'`):

```ts
const files = (entries: Record<string, string>) => new Map(Object.entries(entries))

describe('findLinkCandidates', () => {
  it('flags a CSS render directly inside a for loop', () => {
    const result = findLinkCandidates(
      files({
        'sections/grid.liquid':
          "{% for p in c.products %}{% render 'vite-tag', entry: '@/snippets/l-card.css' %}{% endfor %}",
      }),
      'vite-style',
    )
    expect(result).toEqual(['l-card.css'])
  })

  it('does not flag renders outside loops', () => {
    const result = findLinkCandidates(
      files({
        'sections/hero.liquid':
          "{% render 'vite-tag', entry: '@/sections/section.hero.css' %}\n{% for p in c.products %}{{ p.title }}{% endfor %}",
      }),
      'vite-style',
    )
    expect(result).toEqual([])
  })

  it('flags a snippet whose own CSS render is loop-rendered elsewhere (one level)', () => {
    const result = findLinkCandidates(
      files({
        'sections/grid.liquid':
          "{% for p in c.products %}{% render 'l-card', product: p %}{% endfor %}",
        'snippets/l-card.liquid': "{% render 'vite-tag', entry: '@/snippets/l-card.css' %}",
      }),
      'vite-style',
    )
    expect(result).toEqual(['l-card.css'])
  })

  it("treats the render-'x'-for-collection form as a loop", () => {
    const result = findLinkCandidates(
      files({
        'sections/grid.liquid': "{% render 'l-card' for c.products %}",
        'snippets/l-card.liquid': "{% render 'vite-tag', entry: '@/snippets/l-card.css' %}",
      }),
      'vite-style',
    )
    expect(result).toEqual(['l-card.css'])
  })

  it('counts already-migrated renders when detecting candidates', () => {
    const result = findLinkCandidates(
      files({
        'sections/grid.liquid':
          "{% for p in c.products %}{% render 'vite-style', entry: '@/snippets/l-card.css' %}{% endfor %}",
      }),
      'vite-style',
    )
    expect(result).toEqual(['l-card.css'])
  })

  it('does not flag a snippet rendered only outside loops, and survives endfor underflow', () => {
    const result = findLinkCandidates(
      files({
        'sections/a.liquid': "{% endfor %}{% render 'l-card' %}",
        'snippets/l-card.liquid': "{% render 'vite-tag', entry: '@/snippets/l-card.css' %}",
      }),
      'vite-style',
    )
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/migrate.test.ts`
Expected: FAIL — `findLinkCandidates` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/migrate.ts`:

```ts
const TAG_RE = /\{%-?([\s\S]*?)-?%\}/g
const RENDER_RE = /^render\s+(['"])([^'"]+)\1([\s\S]*)$/
const ENTRY_CSS_RE = /entry:\s*(['"])([^'"]+\.css)\1/

/**
 * CSS entries that should probably be linkEntries: rendered inside a {% for %} loop,
 * either directly or via one level of indirection (a snippet that contains the CSS
 * render and is itself loop-rendered — the product-card-in-a-grid case).
 * ponytail: one level only; dynamic render graphs are a roadmap non-goal.
 */
export function findLinkCandidates(
  liquidFiles: Map<string, string>,
  snippetName: string,
): string[] {
  const candidates = new Set<string>()
  const loopRendered = new Set<string>()
  const cssBySnippet = new Map<string, string[]>()

  for (const [file, content] of liquidFiles) {
    let depth = 0
    for (const tag of content.matchAll(TAG_RE)) {
      const inner = tag[1].trim()
      if (/^for\s/.test(inner)) {
        depth += 1
        continue
      }
      if (/^endfor\b/.test(inner)) {
        depth = Math.max(0, depth - 1)
        continue
      }
      const render = RENDER_RE.exec(inner)
      if (!render) continue
      const name = render[2]
      const rest = render[3]
      if (depth > 0 || /\sfor\s/.test(rest)) loopRendered.add(name)
      if (name !== 'vite-tag' && name !== snippetName) continue
      const entry = ENTRY_CSS_RE.exec(rest)
      if (!entry) continue
      const basename = entry[2].split('/').pop() as string
      if (depth > 0) candidates.add(basename)
      const snippet = /^snippets\/([^/]+)\.liquid$/.exec(file)
      if (snippet) {
        cssBySnippet.set(snippet[1], [...(cssBySnippet.get(snippet[1]) ?? []), basename])
      }
    }
  }

  for (const [snippet, basenames] of cssBySnippet) {
    if (!loopRendered.has(snippet)) continue
    for (const basename of basenames) candidates.add(basename)
  }

  return [...candidates].sort()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/migrate.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/migrate.ts tests/migrate.test.ts
git commit -m "feat: detect linkEntries candidates from loop-rendered CSS components"
```

---

### Task 3: `readThemeLiquid` + `runMigrate` — fs walk and orchestration

**Files:**
- Modify: `src/migrate.ts` (append; add `fs`/`path` imports at top)
- Create: `tests/cli.test.ts`

**Interfaces:**
- Consumes: `rewriteLiquid` (Task 1), `findLinkCandidates` (Task 2).
- Produces:
  - `interface MigrateOptions { themeRoot: string; snippetName: string }`
  - `interface RenderMatch { file: string; before: string; after: string }` (`file` is theme-root-relative POSIX path)
  - `interface MigrateResult { matches: RenderMatch[]; linkCandidates: string[]; rewritten: Map<string, string> }` (`rewritten` maps relative path → full new file content)
  - `runMigrate(options: MigrateOptions): MigrateResult` — reads from disk, never writes.
  - `readThemeLiquid(themeRoot: string, snippetName: string): Map<string, string>`

  Task 4's `runCli` calls `runMigrate` and writes `rewritten` entries itself when `--write` is passed.

- [ ] **Step 1: Write the failing tests**

Create `tests/cli.test.ts` (CLI tests land here in Task 4, sharing this fixture):

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMigrate } from '../src/migrate.js'

const HERO = `<h1>Hero</h1>
{% render 'vite-tag', entry: '@/sections/section.hero.css' %}
{% render 'vite-tag', entry: '@/entrypoints/hero.js' %}
`

const GRID = `{% render 'vite-tag', entry: '@/sections/section.grid.css' %}
{% for product in collection.products %}
  {% render 'l-product-card', product: product %}
{% endfor %}
`

const CARD = `{% render 'vite-tag', entry: '@/snippets/l-product-card.css' %}
<div class="card"></div>
`

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vsp-migrate-'))
  fs.mkdirSync(path.join(root, 'sections'), { recursive: true })
  fs.mkdirSync(path.join(root, 'snippets'), { recursive: true })
  fs.writeFileSync(path.join(root, 'sections', 'hero.liquid'), HERO)
  fs.writeFileSync(path.join(root, 'sections', 'grid.liquid'), GRID)
  fs.writeFileSync(path.join(root, 'snippets', 'l-product-card.liquid'), CARD)
  fs.writeFileSync(
    path.join(root, 'snippets', 'vite-style.liquid'),
    "{% render 'vite-tag', entry: entry %}\n",
  )
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('runMigrate', () => {
  it('finds all CSS renders, skips JS and the generated snippet, and never writes', () => {
    const result = runMigrate({ themeRoot: root, snippetName: 'vite-style' })
    expect(result.matches.map((m) => m.file).sort()).toEqual([
      'sections/grid.liquid',
      'sections/hero.liquid',
      'snippets/l-product-card.liquid',
    ])
    expect(result.rewritten.size).toBe(3)
    expect(result.rewritten.get('sections/hero.liquid')).toContain("'vite-style'")
    expect(result.rewritten.get('sections/hero.liquid')).toContain(
      "{% render 'vite-tag', entry: '@/entrypoints/hero.js' %}",
    )
    // dry: disk untouched
    expect(fs.readFileSync(path.join(root, 'sections', 'hero.liquid'), 'utf-8')).toBe(HERO)
  })

  it('suggests loop-rendered snippet CSS as a linkEntries candidate', () => {
    const result = runMigrate({ themeRoot: root, snippetName: 'vite-style' })
    expect(result.linkCandidates).toEqual(['l-product-card.css'])
  })

  it('returns no matches for an already-migrated theme', () => {
    for (const rel of ['sections/hero.liquid', 'sections/grid.liquid', 'snippets/l-product-card.liquid']) {
      const abs = path.join(root, rel)
      fs.writeFileSync(abs, fs.readFileSync(abs, 'utf-8').replaceAll('vite-tag', 'vite-style'))
    }
    const result = runMigrate({ themeRoot: root, snippetName: 'vite-style' })
    expect(result.matches).toEqual([])
    expect(result.rewritten.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli.test.ts`
Expected: FAIL — `runMigrate` is not exported.

- [ ] **Step 3: Write the implementation**

At the top of `src/migrate.ts` add:

```ts
import fs from 'node:fs'
import path from 'node:path'
```

Append:

```ts
const LIQUID_DIRS = ['layout', 'sections', 'snippets', 'blocks', 'templates']

export interface MigrateOptions {
  themeRoot: string
  snippetName: string
}

export interface RenderMatch {
  file: string
  before: string
  after: string
}

export interface MigrateResult {
  matches: RenderMatch[]
  linkCandidates: string[]
  rewritten: Map<string, string>
}

export function readThemeLiquid(themeRoot: string, snippetName: string): Map<string, string> {
  const liquidFiles = new Map<string, string>()
  const generated = path.join('snippets', `${snippetName}.liquid`)
  for (const dir of LIQUID_DIRS) {
    const abs = path.resolve(themeRoot, dir)
    if (!fs.existsSync(abs)) continue
    for (const name of fs.readdirSync(abs, { recursive: true }) as string[]) {
      const rel = path.join(dir, String(name))
      if (!rel.endsWith('.liquid') || rel === generated) continue
      const file = path.resolve(themeRoot, rel)
      if (!fs.statSync(file).isFile()) continue
      liquidFiles.set(rel.split(path.sep).join('/'), fs.readFileSync(file, 'utf-8'))
    }
  }
  return liquidFiles
}

export function runMigrate(options: MigrateOptions): MigrateResult {
  const liquidFiles = readThemeLiquid(options.themeRoot, options.snippetName)
  const matches: RenderMatch[] = []
  const rewritten = new Map<string, string>()
  for (const [file, content] of liquidFiles) {
    const result = rewriteLiquid(content, options.snippetName)
    if (result.matches.length === 0) continue
    rewritten.set(file, result.content)
    for (const m of result.matches) matches.push({ file, ...m })
  }
  return {
    matches,
    linkCandidates: findLinkCandidates(liquidFiles, options.snippetName),
    rewritten,
  }
}
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `npx vitest run`
Expected: PASS — all suites including the existing ones (14 new + existing).

- [ ] **Step 5: Commit**

```bash
git add src/migrate.ts tests/cli.test.ts
git commit -m "feat: runMigrate walks theme liquid dirs and computes rewrites"
```

---

### Task 4: `formatResult` + `runCli` + bin entry

**Files:**
- Modify: `src/migrate.ts` (append)
- Create: `src/cli.ts`
- Modify: `package.json` (add `bin`)
- Modify: `tests/cli.test.ts` (append)

**Interfaces:**
- Consumes: `runMigrate`, `MigrateResult` (Task 3).
- Produces:
  - `formatResult(result: MigrateResult, write: boolean): string`
  - `runCli(argv: string[]): number` — argv is `process.argv.slice(2)`; returns the exit code. Writes files only when `--write` is passed. This is the only function `src/cli.ts` uses.

- [ ] **Step 1: Write the failing tests**

Append to `tests/cli.test.ts` (add `runCli` to the import from `'../src/migrate.js'`):

```ts
describe('runCli', () => {
  const captureLogs = () => {
    const out: string[] = []
    vi.spyOn(console, 'log').mockImplementation((msg) => out.push(String(msg)))
    vi.spyOn(console, 'error').mockImplementation((msg) => out.push(String(msg)))
    return out
  }

  it('dry run prints before/after, the config block, and leaves files untouched', () => {
    const out = captureLogs()
    const code = runCli(['migrate', '--theme-root', root])
    expect(code).toBe(0)
    const text = out.join('\n')
    expect(text).toContain('sections/hero.liquid')
    expect(text).toContain("- {% render 'vite-tag', entry: '@/sections/section.hero.css' %}")
    expect(text).toContain("+ {% render 'vite-style', entry: '@/sections/section.hero.css' %}")
    expect(text).toContain("linkEntries: ['l-product-card.css']")
    expect(text).toContain('Re-run with --write to apply.')
    expect(fs.readFileSync(path.join(root, 'sections', 'hero.liquid'), 'utf-8')).toBe(HERO)
  })

  it('--write applies rewrites and a second run finds nothing to migrate', () => {
    captureLogs()
    expect(runCli(['migrate', '--write', '--theme-root', root])).toBe(0)
    const hero = fs.readFileSync(path.join(root, 'sections', 'hero.liquid'), 'utf-8')
    expect(hero).toContain("{% render 'vite-style', entry: '@/sections/section.hero.css' %}")
    expect(hero).toContain("{% render 'vite-tag', entry: '@/entrypoints/hero.js' %}")

    const out = captureLogs()
    expect(runCli(['migrate', '--theme-root', root])).toBe(0)
    expect(out.join('\n')).toContain('Nothing to migrate')
  })

  it('respects --snippet-name', () => {
    captureLogs()
    expect(runCli(['migrate', '--write', '--snippet-name', 'my-style', '--theme-root', root])).toBe(0)
    expect(fs.readFileSync(path.join(root, 'sections', 'grid.liquid'), 'utf-8')).toContain(
      "{% render 'my-style', entry: '@/sections/section.grid.css' %}",
    )
  })

  it('errors on missing command, unknown option, and bad theme root', () => {
    const out = captureLogs()
    expect(runCli([])).toBe(1)
    expect(runCli(['migrate', '--bogus'])).toBe(1)
    expect(runCli(['migrate', '--theme-root', path.join(root, 'does-not-exist')])).toBe(1)
    expect(out.join('\n')).toContain('Usage:')
    expect(out.join('\n')).toContain('Theme root not found')
  })

  it('prints usage on --help with exit 0', () => {
    const out = captureLogs()
    expect(runCli(['--help'])).toBe(0)
    expect(out.join('\n')).toContain('Usage:')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli.test.ts`
Expected: FAIL — `runCli` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/migrate.ts`:

```ts
const USAGE = `Usage: vite-plugin-shopify-inline-styles migrate [options]

Rewrites {% render 'vite-tag', entry: '*.css' %} calls to the inline-styles
snippet and suggests linkEntries for components rendered inside loops.
Dry run by default — review the output, then re-run with --write.

Options:
  --write                Apply the rewrites (default: dry run)
  --theme-root <dir>     Theme root containing sections/, snippets/, ... (default: ./)
  --snippet-name <name>  Generated snippet name (default: vite-style)
  -h, --help             Show this help`

export function formatResult(result: MigrateResult, write: boolean): string {
  const lines: string[] = []
  let currentFile = ''
  for (const m of result.matches) {
    if (m.file !== currentFile) {
      if (currentFile !== '') lines.push('')
      lines.push(m.file)
      currentFile = m.file
    }
    lines.push(`  - ${m.before}`)
    lines.push(`  + ${m.after}`)
  }
  const calls = result.matches.length
  const fileCount = result.rewritten.size
  const counts = `${calls} render call${calls === 1 ? '' : 's'} in ${fileCount} file${fileCount === 1 ? '' : 's'}`
  lines.push('')
  lines.push(write ? `Migrated ${counts}.` : `${counts} would be migrated.`)
  if (result.linkCandidates.length > 0) {
    lines.push('')
    lines.push('Suggested config for components rendered inside loops:')
    lines.push('')
    lines.push('  shopifyInlineStyles({')
    lines.push(`    linkEntries: [${result.linkCandidates.map((c) => `'${c}'`).join(', ')}],`)
    lines.push('  })')
  }
  if (!write) {
    lines.push('')
    lines.push('Re-run with --write to apply.')
  }
  return lines.join('\n')
}

export function runCli(argv: string[]): number {
  const [command, ...rest] = argv
  if (command === '-h' || command === '--help') {
    console.log(USAGE)
    return 0
  }
  if (command !== 'migrate') {
    console.error(USAGE)
    return 1
  }

  // ponytail: flags with plugin-default values instead of loading vite.config; pass
  // --theme-root/--snippet-name when the plugin options are customized.
  let write = false
  let themeRoot = './'
  let snippetName = 'vite-style'
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    if (arg === '--write') write = true
    else if (arg === '--theme-root' && rest[i + 1]) themeRoot = rest[(i += 1)]
    else if (arg === '--snippet-name' && rest[i + 1]) snippetName = rest[(i += 1)]
    else {
      console.error(`Unknown or incomplete option '${arg}'\n\n${USAGE}`)
      return 1
    }
  }

  if (!fs.existsSync(themeRoot)) {
    console.error(`Theme root not found: ${path.resolve(themeRoot)}`)
    return 1
  }

  const result = runMigrate({ themeRoot, snippetName })
  if (result.matches.length === 0) {
    console.log(
      `Nothing to migrate — no 'vite-tag' CSS renders found under ${path.resolve(themeRoot)}.`,
    )
    return 0
  }

  if (write) {
    for (const [rel, content] of result.rewritten) {
      fs.writeFileSync(path.resolve(themeRoot, rel), content)
    }
  }
  console.log(formatResult(result, write))
  return 0
}
```

Create `src/cli.ts`:

```ts
#!/usr/bin/env node
import { runCli } from './migrate.js'

process.exit(runCli(process.argv.slice(2)))
```

In `package.json`, add after the `"exports"` block:

```json
"bin": {
  "vite-plugin-shopify-inline-styles": "./dist/cli.js"
},
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, all suites.

- [ ] **Step 5: Build and smoke-test the real bin**

```bash
npm run build
node dist/cli.js migrate --theme-root examples/basic
node dist/cli.js --help
```

Expected: first command prints either migration output or `Nothing to migrate — …` (the example theme already uses `vite-style`); second prints usage, both exit 0. Verify the shebang survived: `head -1 dist/cli.js` → `#!/usr/bin/env node`.

- [ ] **Step 6: Commit**

```bash
git add src/migrate.ts src/cli.ts tests/cli.test.ts package.json
git commit -m "feat: migrate CLI — dry-run codemod with linkEntries suggestions"
```

---

### Task 5: Docs, changelog, coverage gate

**Files:**
- Modify: `README.md:105-115` (the "Migrating an existing vite-plugin-shopify theme" section)
- Modify: `CHANGELOG.md` (under `## [Unreleased]`)

**Interfaces:**
- Consumes: the CLI shipped in Task 4 (command names/flags must match exactly).
- Produces: user-facing docs; nothing consumed by other tasks.

- [ ] **Step 1: Replace the README migration section**

Replace lines 105–115 of `README.md` (the whole "Migrating…" section body) with:

```markdown
## Migrating an existing vite-plugin-shopify theme

One command — dry run by default:

```bash
npx vite-plugin-shopify-inline-styles migrate
```

It rewrites `render 'vite-tag'` → `render 'vite-style'` for CSS entries only (JS renders
untouched), prints each change, and suggests `linkEntries` for components rendered inside
loops. Review the output, re-run with `--write`, then check `git diff`. Pass
`--theme-root` / `--snippet-name` if you customized the plugin options.

Measure before/after with Lighthouse (or [unlighthouse](https://unlighthouse.dev)) on
home, collection, and product pages.
```

- [ ] **Step 2: Add the CHANGELOG entry**

Under `## [Unreleased]` in `CHANGELOG.md`:

```markdown
### Added

- `migrate` CLI (`npx vite-plugin-shopify-inline-styles migrate`): dry-run codemod
  that rewrites `vite-tag` CSS renders to the inline-styles snippet and suggests
  `linkEntries` for components rendered inside loops (including one level of
  snippet indirection). `--write` applies; git is the undo.
```

- [ ] **Step 3: Run the full coverage gate**

Run: `npm run test:coverage`
Expected: PASS, total coverage ≥80%. (`src/cli.ts` is a 3-line uncovered wrapper; if it drags coverage below the bar, add `coverage.exclude: ['src/cli.ts']` to `vitest.config.ts` with a one-line comment.)

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: migrate CLI usage in README and changelog"
```

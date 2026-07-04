# Adoption Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the proof (case study, example, CHANGELOG, CI matrix) and discoverability (keywords, topics, outreach) work that grows public adoption of `vite-plugin-shopify-inline-styles`, per `docs/superpowers/specs/2026-07-03-adoption-roadmap-design.md`.

**Architecture:** No plugin code changes. Track A adds trust artifacts (CHANGELOG, CI matrix, runnable `examples/basic` theme, README case study with real holts numbers). Track C adds discoverability (npm keywords, GitHub topics, outreach drafts). A final v0.1.1 patch release pushes the improved README to npm.

**Tech Stack:** Markdown, GitHub Actions YAML, Vite + vite-plugin-shopify (example only), Lighthouse CLI (measurements), `gh` CLI.

## Global Constraints

- **No new plugin options or code paths** — spec non-goal; `src/` is untouched by every task.
- Package is ESM-only, `engines.node >= 20`, `peerDependencies.vite >= 5`.
- Commit prefixes per repo convention: `docs:` for docs-only, `ci:` for workflow changes, `chore:` for metadata/release.
- Repo slug: `package.json` says `cesareuseche/vite-shopify-styles-plugin` — **verify with `gh repo view --json nameWithOwner -q .nameWithOwner` before embedding in any URL** and use the verified value everywhere `<SLUG>` appears below.
- Outward-facing actions (posting GitHub comments, opening awesome-list PRs, `git push` of a release tag) require explicit user go-ahead at the marked gates. Nothing is posted or published automatically.
- Tasks 4–7 have **user-input gates** (measurement inputs, release approval). Stop and ask at the gate; do not fabricate numbers.

---

### Task 1: CHANGELOG.md

**Files:**
- Create: `CHANGELOG.md`
- Modify: `package.json` (add `CHANGELOG.md` to `files`)

**Interfaces:**
- Produces: `CHANGELOG.md` with an `## [Unreleased]` section that Task 7 converts into `## [0.1.1]`.

- [ ] **Step 1: Get the real 0.1.0 publish date**

Run: `npm view vite-plugin-shopify-inline-styles time --json`
Expected: JSON containing a `"0.1.0": "<ISO date>"` key. Use its date (YYYY-MM-DD) below. If the command fails (offline), use the date of the `v0.1.0` git tag: `git log -1 --format=%as v0.1.0`.

- [ ] **Step 2: Write CHANGELOG.md**

```markdown
# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - <DATE FROM STEP 1>

### Added

- Initial release: generated `vite-style` snippet rendering built CSS entrypoints
  as inline `<style>` via `inline_asset_content`, with `linkEntries` opt-out to
  keep a cached `<link>` for repeat-rendered components.
- Dev mode delegation to vite-plugin-shopify's `vite-tag` (HMR unchanged).
- Build diagnostics: per-entry size report, orphan-entry warning, 15KB
  `inline_asset_content` oversize warning.
- Options: `linkEntries`, `snippetName`, `themeRoot`, `sourceCodeDir`.
```

- [ ] **Step 3: Add CHANGELOG.md to the npm tarball**

In `package.json`, change:

```json
"files": ["dist", "LICENSE", "README.md"],
```

to:

```json
"files": ["dist", "LICENSE", "README.md", "CHANGELOG.md"],
```

- [ ] **Step 4: Verify the tarball picks it up**

Run: `npm pack --dry-run 2>&1 | grep CHANGELOG`
Expected: a line listing `CHANGELOG.md`.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md package.json
git commit -m "docs: add CHANGELOG backfilled with v0.1.0"
```

---

### Task 2: CI matrix — Node 20/22 × Vite 5/6/7

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md` (add CI badge next to the npm badge)

**Interfaces:**
- Consumes: existing `npm run build` / `npm run test:coverage` scripts (unchanged).
- Produces: a green matrix that Task 6's outreach drafts can cite ("tested on Vite 5/6/7").

- [ ] **Step 1: Verify vitest's Vite peer range locally**

Run: `npm view vitest@3.2 peerDependencies --json`
Expected: `vite` range includes `^5.0.0 || ^6.0.0 || ^7.0.0` (possibly a `-beta` qualifier on 7).
If Vite 7 is **not** in the range: run `npm view vitest peerDependencies --json` for the latest 3.x; if a newer 3.x supports it, `npm i -D vitest@^3 @vitest/coverage-v8@^3` and re-run `npm test` (expect PASS). If no 3.x supports Vite 7, drop `7` from the matrix in Step 3 and add a ROADMAP backlog line: "Vite 7 in CI matrix — trigger: vitest supports vite 7 peer".

- [ ] **Step 2: Smoke-test the two matrix extremes locally**

```bash
npm i --no-save vite@5 && npm run build && npm test
npm i --no-save vite@7 && npm run build && npm test
npm ci   # restore lockfile state
```

Expected: both runs PASS (integration test builds the fixture with the installed Vite). If `vite@7` fails with ERESOLVE, apply the Step 1 contingency.

- [ ] **Step 3: Replace ci.yml's test job with the matrix**

Replace the entire `test` job in `.github/workflows/ci.yml` so the file reads:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: [20, 22]
        vite: [5, 6, 7]
    name: node ${{ matrix.node }} / vite ${{ matrix.vite }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm i --no-save vite@${{ matrix.vite }}
      - run: npm run build
      - run: npm run test:coverage
```

- [ ] **Step 4: Add the CI badge to README.md**

After the existing npm badge line, add (with `<SLUG>` from Global Constraints):

```markdown
[![CI](https://github.com/<SLUG>/actions/workflows/ci.yml/badge.svg)](https://github.com/<SLUG>/actions/workflows/ci.yml)
```

- [ ] **Step 5: Commit and verify on GitHub**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: test matrix across node 20/22 and vite 5/6/7"
```

After the branch is pushed (Task 7 or earlier user push), confirm all 6 matrix jobs are green: `gh run watch` or `gh run list --workflow=ci.yml --limit 1`. If a combination fails, fix or document it before Track C outreach — that is the point of the matrix (spec: Risks).

---

### Task 3: Runnable example theme (`examples/basic`)

**Files:**
- Create: `examples/basic/package.json`
- Create: `examples/basic/vite.config.js`
- Create: `examples/basic/src/entrypoints/theme.js`
- Create: `examples/basic/src/sections/section.hero.css`
- Create: `examples/basic/src/snippets/l-badge.css`
- Create: `examples/basic/sections/hero.liquid`
- Create: `examples/basic/snippets/l-badge.liquid`
- Create: `examples/basic/layout/theme.liquid`
- Create: `examples/basic/README.md`
- Modify: `.gitignore` (ignore example build output)
- Modify: `.github/workflows/ci.yml` (add `example` job)
- Modify: `README.md` (link the example)

**Interfaces:**
- Consumes: the plugin's own `dist/` via a `file:../..` dependency (root `npm run build` must run first).
- Produces: `examples/basic` that `npm install && npm run build` turns into `assets/` + `snippets/vite-style.liquid`; CI keeps it working.

- [ ] **Step 1: Write `examples/basic/package.json`**

```json
{
  "name": "vite-plugin-shopify-inline-styles-example-basic",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "devDependencies": {
    "vite": "^6.4.1",
    "vite-plugin-shopify-inline-styles": "file:../.."
  }
}
```

Then add vite-plugin-shopify at its current release (do not hand-pin a guessed version):

```bash
cd examples/basic && npm install --save-dev vite-plugin-shopify@latest
```

Expected: `package.json` gains a `vite-plugin-shopify` entry; install succeeds. If its peer range rejects vite 6, install the vite major it supports instead and mirror that in this file.

- [ ] **Step 2: Write `examples/basic/vite.config.js`**

```js
import shopify from 'vite-plugin-shopify'
import shopifyInlineStyles from 'vite-plugin-shopify-inline-styles'

export default {
  plugins: [
    shopify({
      themeRoot: './',
      sourceCodeDir: 'src',
      entrypointsDir: 'src/entrypoints',
      additionalEntrypoints: ['src/sections/*.css', 'src/snippets/*.css'],
    }),
    shopifyInlineStyles({
      // l-badge renders once per product card — keep it a cached <link>
      linkEntries: ['l-badge.css'],
    }),
  ],
  build: { manifest: 'manifest.json' },
}
```

- [ ] **Step 3: Write the theme source files**

`examples/basic/src/entrypoints/theme.js`:

```js
document.documentElement.classList.add('js')
```

`examples/basic/src/sections/section.hero.css`:

```css
.section-hero {
  display: grid;
  place-items: center;
  min-height: 60vh;
  text-align: center;
}

.section-hero h1 {
  margin: 0;
  font-size: clamp(2rem, 6vw, 4rem);
}
```

`examples/basic/src/snippets/l-badge.css`:

```css
.l-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: #111;
  color: #fff;
  font-size: 0.75rem;
}
```

`examples/basic/sections/hero.liquid`:

```liquid
{% render 'vite-style', entry: '@/sections/section.hero.css' %}
<section class="section-hero">
  <h1>{{ section.settings.heading | default: 'Inline styles demo' }}</h1>
  {% render 'l-badge', label: 'New' %}
</section>

{% schema %}
{
  "name": "Hero",
  "settings": [{ "type": "text", "id": "heading", "label": "Heading" }],
  "presets": [{ "name": "Hero" }]
}
{% endschema %}
```

`examples/basic/snippets/l-badge.liquid`:

```liquid
{% render 'vite-style', entry: '@/snippets/l-badge.css' %}
<span class="l-badge">{{ label }}</span>
```

`examples/basic/layout/theme.liquid`:

```liquid
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{{ shop.name }}</title>
    {{ content_for_header }}
    {% render 'vite-tag' with '@/entrypoints/theme.js' %}
  </head>
  <body>
    {{ content_for_layout }}
  </body>
</html>
```

- [ ] **Step 4: Write `examples/basic/README.md`**

```markdown
# Basic example

Minimal Shopify theme showing `vite-plugin-shopify-inline-styles` next to
`vite-plugin-shopify`: one section CSS entry rendered inline, one snippet CSS
entry kept as a cached `<link>` via `linkEntries`.

## Run

    npm run build --prefix ../..   # build the plugin itself once
    npm install
    npm run build

Then inspect `snippets/vite-style.liquid`: the hero entry maps to an
`inline_asset_content` `<style>` branch, the badge entry to a
`stylesheet_tag` link branch. The build log shows the per-entry size report.
```

- [ ] **Step 5: Ignore generated example output**

Append to `.gitignore`:

```
examples/basic/node_modules/
examples/basic/package-lock.json
examples/basic/assets/
examples/basic/snippets/vite-style.liquid
examples/basic/snippets/vite-tag.liquid
```

- [ ] **Step 6: Build the example and verify**

```bash
npm run build
cd examples/basic && npm install && npm run build
grep -c "inline_asset_content" snippets/vite-style.liquid
grep -c "stylesheet_tag" snippets/vite-style.liquid
grep "when '@/sections/section.hero.css'" snippets/vite-style.liquid
```

Expected: build succeeds; both grep counts are ≥ 1; the hero `when` branch exists. Also confirm hashed CSS files exist in `examples/basic/assets/`.

- [ ] **Step 7: Link the example from the root README**

In `README.md`, at the end of the `## Usage` section, add:

```markdown
A runnable end-to-end setup lives in [`examples/basic`](examples/basic).
```

- [ ] **Step 8: Commit the example**

```bash
git add examples/basic .gitignore README.md
git commit -m "docs: add runnable basic example theme"
```

- [ ] **Step 9: Keep the example green in CI**

Add a second job to `.github/workflows/ci.yml` (after the `test` job, same indentation level):

```yaml
  example:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - run: npm install
        working-directory: examples/basic
      - run: npm run build
        working-directory: examples/basic
      - run: grep -q inline_asset_content examples/basic/snippets/vite-style.liquid
```

- [ ] **Step 10: Commit the CI job**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: build the basic example on every PR"
```

---

### Task 4: README case study with real holts numbers

**Blocked on user input** — collect before writing:
1. Store domain of the holts production site (e.g. `https://<store>.com`).
2. Existing before/after measurements from the v0.2 migration, if the user kept them. If yes, skip Step 2 and use them directly.
3. If re-measuring: the theme ID of the pre-migration backup theme, one representative collection handle, one representative product handle.

**Files:**
- Modify: `README.md` (new `## Real-world results` section after `## Why`)

**Interfaces:**
- Produces: measured FCP/LCP/render-blocking numbers that Task 6's outreach drafts quote.

- [ ] **Step 1: Ask the user for the inputs above**

Do not proceed with invented numbers. If the user wants to skip the case study entirely, mark this task skipped, remove the case-study quote from Task 6's draft, and continue.

- [ ] **Step 2 (only if re-measuring): run Lighthouse on both themes**

For each page (home `/`, `/collections/<HANDLE>`, `/products/<HANDLE>`) × each theme (live = after; `?preview_theme_id=<BACKUP_ID>` appended = before), run 3 times and take the median:

```bash
npx lighthouse "<URL>" --preset=desktop --output=json \
  --output-path=./run.json --chrome-flags="--headless=new" --quiet
node -e "
const r = require('./run.json')
const fcp = r.audits['first-contentful-paint'].displayValue
const lcp = r.audits['largest-contentful-paint'].displayValue
const blocking = (r.audits['render-blocking-resources'].details?.items ?? []).length
console.log(fcp, lcp, blocking + ' render-blocking')
"
```

Note: the `preview_theme_id` query param must be on the exact URL measured (Lighthouse uses a fresh profile, so no preview cookie carries over). If the preview redirects or requires a password, measure from a logged-in browser via DevTools Lighthouse instead and transcribe the numbers.

- [ ] **Step 3: Add the section to README.md, after `## Why`**

Fill every `<...>` from the measurements — no blanks may remain:

```markdown
## Real-world results

Migrating a production theme (<N> component CSS entrypoints) from per-component
`<link>` tags to this plugin:

| Page       | FCP (before → after) | LCP (before → after) | Render-blocking stylesheets |
| ---------- | -------------------- | -------------------- | --------------------------- |
| Home       | <x.x s> → <x.x s>    | <x.x s> → <x.x s>    | <N> → <N>                   |
| Collection | <x.x s> → <x.x s>    | <x.x s> → <x.x s>    | <N> → <N>                   |
| Product    | <x.x s> → <x.x s>    | <x.x s> → <x.x s>    | <N> → <N>                   |

Median of 3 desktop Lighthouse runs per page (`npx lighthouse <url> --preset=desktop`),
live theme vs. the pre-migration theme preview, same day.
```

Honesty rule (spec: Risks): if the numbers are flat or negative, do not publish the table — report back to the user and decide together how to frame it (e.g. request-count reduction only).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add real-world before/after case study"
```

---

### Task 5: npm keywords + GitHub topics

**Files:**
- Modify: `package.json` (`keywords`)

**Interfaces:**
- Produces: search-facing metadata; no other task depends on it.

- [ ] **Step 1: Extend keywords in package.json**

Change:

```json
"keywords": ["vite-plugin", "shopify", "shopify-theme", "css", "inline-styles"],
```

to:

```json
"keywords": [
  "vite-plugin",
  "vite",
  "shopify",
  "shopify-theme",
  "css",
  "inline-styles",
  "critical-css",
  "performance",
  "web-performance"
],
```

- [ ] **Step 2: Set GitHub topics**

```bash
gh repo edit --add-topic shopify --add-topic vite-plugin --add-topic shopify-theme \
  --add-topic performance --add-topic critical-css --add-topic inline-css
```

Expected: no error. Verify: `gh repo view --json repositoryTopics -q '.repositoryTopics[].name'` lists all six.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: broaden npm keywords for discoverability"
```

---

### Task 6: Outreach drafts (`docs/OUTREACH.md`)

Drafts only — **the user posts everything** (Global Constraints).

**Files:**
- Create: `docs/OUTREACH.md`

**Interfaces:**
- Consumes: case-study numbers from Task 4 (quote the strongest single stat; omit the sentence if Task 4 was skipped) and the verified `<SLUG>`.

- [ ] **Step 1: Find live targets**

```bash
gh search issues --repo barrel/shopify-vite "inline css" --limit 10
gh search issues --repo barrel/shopify-vite "critical css OR render-blocking" --limit 10
```

Record the URLs of open, on-topic issues/discussions (typically people asking how to inline CSS or avoid render-blocking links). If none are open, record the closest closed ones — a helpful comment on a closed issue still ranks in search.

- [ ] **Step 2: Write `docs/OUTREACH.md`**

Use this content, substituting `<SLUG>`, the target URLs from Step 1, and the Task 4 stat:

```markdown
# Outreach checklist

Drafts for growing adoption. Each item is posted manually — nothing here is automated.

## 1. shopify-vite issue/discussion comments

Targets (found <DATE> via gh search):

- <URL 1>
- <URL 2>

Draft comment:

> In case it helps anyone here: I built a small companion plugin for
> vite-plugin-shopify that renders each section/snippet's built CSS as an
> inline `<style>` via Shopify's `inline_asset_content` filter instead of a
> render-blocking `<link>` — dev mode/HMR still delegates to `vite-tag`.
> On a production theme this took <STRONGEST STAT, e.g. "render-blocking
> stylesheets on the product page from N to 0">.
> Repeat-rendered components can opt out per entry to keep a cached link.
> https://github.com/<SLUG>

## 2. Awesome-list PRs

- [ ] [vitejs/awesome-vite](https://github.com/vitejs/awesome-vite) — under
  Plugins → Framework-agnostic:
  `- [vite-plugin-shopify-inline-styles](https://github.com/<SLUG>) - Render Shopify section/snippet CSS as inline style tags via inline_asset_content.`
- [ ] [julionc/awesome-shopify](https://github.com/julionc/awesome-shopify) —
  under the development-tools section, same one-liner.

Follow each list's CONTRIBUTING.md (alphabetical order, description format)
before opening the PR.

## 3. Optional write-up

Short post (Shopify community forum or dev.to) reusing the README case study:
problem (render-blocking per-component CSS links) → approach
(`inline_asset_content` + build-time snippet) → numbers → link. Only worth
doing after 1 and 2; skip if the case study was skipped.
```

- [ ] **Step 3: Commit**

```bash
git add docs/OUTREACH.md
git commit -m "docs: outreach checklist with comment and list-PR drafts"
```

- [ ] **Step 4: Hand the checklist to the user**

Summarize the targets and drafts in chat and ask the user to review/post. Do not post anything on their behalf.

---

### Task 7: Release v0.1.1 — user gate

**Blocked on user approval** — this publishes to npm (via the tag-triggered workflow) and pushes to GitHub.

**Files:**
- Modify: `CHANGELOG.md` (Unreleased → 0.1.1)
- Modify: `package.json` + git tag (via `npm version`)

**Interfaces:**
- Consumes: `## [Unreleased]` section from Task 1; all prior tasks committed.

- [ ] **Step 1: Move Unreleased to 0.1.1 in CHANGELOG.md**

Replace `## [Unreleased]` with:

```markdown
## [Unreleased]

## [0.1.1] - <TODAY YYYY-MM-DD>

### Added

- Real-world before/after case study in the README (production theme,
  desktop Lighthouse). <REMOVE THIS LINE IF TASK 4 WAS SKIPPED>
- Runnable example theme in `examples/basic`, built on every CI run.
- CHANGELOG (this file), shipped in the npm tarball.

### Changed

- CI now tests Node 20/22 × Vite 5/6/7.
- Broader npm keywords and GitHub topics for discoverability.
```

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for 0.1.1"
```

- [ ] **Step 2: Confirm the working tree is clean and tests pass**

```bash
git status --short   # expected: empty (the pre-existing docs/ROADMAP.md edit should have been committed or intentionally left by the user — ask if still present)
npm run build && npm run test:coverage
```

Expected: tests PASS with existing coverage thresholds.

- [ ] **Step 3: Ask the user to approve the release, then version and push**

Only after explicit approval:

```bash
npm version patch          # 0.1.0 -> 0.1.1, commits and tags v0.1.1
git push --follow-tags
```

- [ ] **Step 4: Verify publish**

```bash
gh run list --workflow=publish.yml --limit 1   # expect: completed / success
npm view vite-plugin-shopify-inline-styles version   # expect: 0.1.1
```

Confirm to the user: version published, CI matrix green, npm page shows the case study and example link.

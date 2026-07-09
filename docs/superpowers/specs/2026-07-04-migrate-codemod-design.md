# Design: `migrate` codemod

**Date:** 2026-07-04
**Goal:** Shrink "install → see it working on my theme" from an afternoon of manual
find/replace to one command. Adoption is the driver: trial effort is the biggest
drop-off point for prospective users, and the `linkEntries` judgment call is the one
migration step that requires actual thought. The codemod automates both.

## CLI surface

- Add `"bin"` to `package.json` pointing at `dist/cli.js` (new `src/cli.ts`, built by
  the existing `tsc` build — no bundler changes).
- Invocation: `npx vite-plugin-shopify-inline-styles migrate [--write] [--theme-root <dir>] [--snippet-name <name>]`
- Flags parsed directly from `process.argv` — no arg-parsing dependency for three flags.
- Defaults mirror the plugin's option defaults (`themeRoot: './'`, `snippetName: 'vite-style'`),
  so themes on the happy path type nothing.
- The CLI does **not** load `vite.config` to read the user's plugin options. Flag
  defaults cover most themes; mark the ceiling with a `ponytail:` comment in `cli.ts`.

## Rewrite rule

- Scan `{sections,snippets,layout,templates,blocks}/**/*.liquid` under `themeRoot`,
  discovered with `fs.readdirSync(dir, { recursive: true })` — no glob dependency.
- Match `{% render 'vite-tag', entry: '<…>.css' %}` calls:
  - single or double quotes around both the snippet name and the entry;
  - `{%-` / `-%}` whitespace-control variants;
  - only entries ending in `.css` — JS renders are untouched (same contract as the plugin).
- Rewrite the snippet name `vite-tag` → the configured snippet name (default `vite-style`).
  Nothing else on the line changes.

## `linkEntries` suggestion

Two detections feed the suggested list:

1. **Direct:** a matched CSS render sitting inside a `{% for %}…{% endfor %}` block in
   the same file, tracked with a simple depth counter.
2. **One level of indirection:** a snippet file that contains a CSS render (matched or
   already-migrated), where that snippet is itself rendered inside a loop in any other
   scanned file. This is the canonical product-card-in-a-grid case, so it is required,
   not optional.

No deeper render-graph walking — dynamic render graphs are a declared non-goal in the
roadmap. Suggested entries are reported by basename (e.g. `l-product-card.css`),
matching the `linkEntries` basename convention.

## Output

- **Dry-run is the default.** Prints:
  - per-file before/after lines for every rewrite;
  - a ready-to-paste config block:
    ```js
    shopifyInlineStyles({
      linkEntries: ['l-product-card.css'],
    })
    ```
  - the instruction to re-run with `--write` to apply.
- `--write` applies the rewrites in place. Git is the undo — no backup files.
- No matches found → friendly "nothing to migrate — no vite-tag CSS renders found",
  exit 0.
- IO errors (unreadable file, bad `--theme-root`) fail loudly with the path, nonzero exit.
- The config block is printed, never written — parsing and editing the user's
  `vite.config` is riskier than a paste.

## Testing

- Unit tests for the rewrite regex (quote/whitespace variants, `.css`-only filter) and
  for loop/indirection detection, on string fixtures.
- One integration test against a fixture theme directory (extending the existing
  `tests/fixture`) asserting dry-run output and `--write` file contents — including
  that `--write` is idempotent (second run finds nothing to migrate).
- Same vitest setup; coverage stays ≥80%.

## README

Replace the "Migrating an existing vite-plugin-shopify theme" find/replace instructions
with the one command + "review `git diff`", keeping the linkEntries and measurement
guidance.

## Deliberately skipped

- Reading `vite.config` from the CLI (flags with matching defaults instead).
- Interactive prompts.
- Backup files (git is the undo).
- Auto-editing the user's `vite.config` to insert `linkEntries` (print, don't parse).
- Render-graph analysis beyond one level of indirection (roadmap non-goal).

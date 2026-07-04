# Roadmap — vite-plugin-shopify-inline-styles

Principle: features land when a real theme hits the ceiling, not before. Every backlog item names the trigger that justifies building it.

## v0.1 — MVP (current implementation plan)

- Build-mode snippet generation via `inline_asset_content` (inline `<style>` per component).
- Dev-mode delegation to `vite-tag` (HMR/tunnel untouched).
- `linkEntries` opt-out for repeat-rendered components.
- Build report (per-entry size + inline/link decision).
- Orphan warning (built but never rendered) and oversize warning (above Shopify's inline cap).
- Unit + integration tests, ≥80% coverage, ESM package built with tsc.

Plan: `docs/superpowers/plans/2026-07-03-inline-styles-plugin.md`

## Backlog — add when the trigger fires

| Feature | Trigger |
| --- | --- |
| Configurable dev delegation target (instead of hardcoded `vite-tag`) | A consuming theme customizes vite-plugin-shopify's `snippetFile`. |
| Per-call override (`inline: false` param on the render call) | `linkEntries` proves too coarse — same component used once-per-page in one template and in loops in another. |
| Preload hints for `linkEntries` assets | Waterfalls show late CSS for a linked above-the-fold component (e.g. product-card grid). |
| Size budgets that fail the build | Team wants CI to block CSS growth instead of warning. |
| Bare path entries (`sections/foo.css` without `@/`/`~/`) | A consuming theme doesn't use the alias convention. |
| Theme blocks CSS convention (`src/blocks/*.css`) | Lazer themes adopt Shopify theme blocks with their own CSS files (orphan scan already reads `blocks/`). |
| `media` attribute support (breakpoint/print-scoped output) | A component genuinely ships conditional CSS. |
| Automatic repeat detection | Probably never — Liquid render graphs are dynamic and unknowable at build time. Revisit only if maintaining `linkEntries` becomes a real burden. |
| Hard error (or `strict` option) when an inline entry exceeds 15KB | Shopify silently refuses to inline over-cap assets — a warning can be missed while production styles break; promote once a real theme hits it. |
| Build warning when a manifest `file` contains `/` (non-flat assetFileNames) | Standalone use without vite-plugin-shopify's flat asset output would emit asset paths `asset_url` cannot serve. |

## Non-goals (permanent, from the spec)

- Creating entrypoints (that's `vite-plugin-shopify`'s `additionalEntrypoints`).
- Minifying CSS (Vite's build already does).
- Handling JS entries (`vite-tag` remains for those).
- Critical-CSS extraction or media-query splitting.

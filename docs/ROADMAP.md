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

## v0.2 — First adoption (holts-theme)

- Migrate holts CSS render calls: `{% render 'vite-tag', ... %}` → `{% render 'vite-style', ... %}` (CSS entries only).
- Populate `linkEntries` from real usage: `l-button.css`, `l-product-card.css`, and any other snippet rendered in loops (check collection/search grids).
- Measure with unlighthouse (already configured in holts) on home, collection, and product pages — record before/after FCP, LCP, and the render-blocking-resources audit here.
- Publish `0.1.x` to npm.
- CI: install → `npm run build` → `npm run test:coverage` on every PR.

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

## Non-goals (permanent, from the spec)

- Creating entrypoints (that's `vite-plugin-shopify`'s `additionalEntrypoints`).
- Minifying CSS (Vite's build already does).
- Handling JS entries (`vite-tag` remains for those).
- Critical-CSS extraction or media-query splitting.

# Vendor CSS handling: docs recipe + inline-vendor warning

**Date:** 2026-07-10
**Status:** Approved

## Problem

UI libraries like Swiper ship large stylesheets. Users have three ways to pull that CSS
into a theme built with this plugin, and two of them are foot-guns:

| Path | Result |
| --- | --- |
| `@import 'swiper/css'` inside a component's inline entry | Vendor bytes inflate the entry past 15 KB → auto-split into inline parts, re-shipped on every page view, duplicated per `{% render %}` |
| `import 'swiper/css'` in a JS entry | CSS asset tied to deferred JS → arrives after first paint → layout shift |
| Dedicated vendor entry + `linkEntries` | One cached `<link>`, fetched once, reused across pages, loaded only where rendered |

The third path is the right one and the plugin already supports it with zero new code —
but nothing documents it, and nothing warns users off the first path.

## Deliverables

### 1. README section: "Vendor / UI-library CSS"

A short recipe section placed after "Inline vs. `<link>`: choosing per component":

- **The pattern:** a dedicated entry containing only vendor imports, listed in `linkEntries`:

  ```css
  /* src/snippets/l-vendor-swiper.css */
  @import 'swiper/css';
  @import 'swiper/css/navigation';
  ```

  ```js
  shopifyInlineStyles({ linkEntries: ['l-vendor-swiper.css'] })
  ```

  Rendered via `{% render 'vite-style', entry: '@/snippets/l-vendor-swiper.css' %}` in the
  section(s) that use the library, so it loads only on pages that need it.

- **Rule of thumb:** import per-module (`swiper/css`, `swiper/css/navigation`), never the
  bundle (`swiper-bundle.css` is ~18 KB; core + needed modules is often 3–6 KB). The biggest
  optimization is bytes you don't ship.

- **The anti-pattern:** `@import 'swiper/css'` inside a component's inline entry, and why
  (re-shipped every view, duplicated per render, forces auto-splitting).

### 2. Guardrail: vendor-import warning on inline entries

At build time, for each **inline-mode** CSS entry, scan the entry's source file for bare
`@import` specifiers — any specifier not starting with `.`, `/`, `@/`, or `~/`. If found,
emit a warning through the existing diagnostics path:

```
[vite-style] snippets/l-carousel.css inlines vendor CSS from 'swiper/css' —
vendor styles re-ship on every page view. Consider a dedicated entry in linkEntries.
```

Design decisions:

- **Warn, don't rewrite.** Silently forcing link mode would change output behind the user's
  back. The plugin's established philosophy is warn-and-explain (orphan warnings, split
  fallback warnings).
- **One level deep.** Scan only the entry file itself, not transitively through local
  `@import`s. Catches the common foot-gun; the ceiling is documented in a code comment with
  the upgrade path (recursive resolution of relative imports).
- **`linkEntries` entries are never scanned** — they're already doing the right thing.
- **No new options, no config.**

Specifier classification:

| Specifier | Classified as |
| --- | --- |
| `'swiper/css'`, `'swiper/css/navigation'` | bare → vendor → warn |
| `'./local.css'`, `'../shared.css'`, `'/abs.css'` | relative/absolute → ignore |
| `'@/snippets/x.css'`, `'~/snippets/x.css'` | alias → ignore |
| `url(...)` values, specifiers inside strings/comments | not `@import` specifiers → ignore |

## Testing

- Unit tests for the specifier classifier: bare vs relative vs absolute vs alias; `url()`
  and string/comment content ignored.
- One integration-level test: a vendor-importing inline entry produces the warning; the same
  entry listed in `linkEntries` does not.

## Out of scope

- Auto-forcing vendor entries to link mode (opt-out flag).
- Transitive `@import` resolution.
- PurgeCSS-style trimming of vendor CSS.

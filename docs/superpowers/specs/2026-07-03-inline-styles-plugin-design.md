# vite-plugin-shopify-inline-styles — Design

**Date:** 2026-07-03
**Status:** Approved

## Problem

Shopify themes built on `vite-plugin-shopify` (reference: holts-theme) give each section/snippet its own CSS entrypoint and load it with `{% render 'vite-tag', entry: '@/sections/section.foo.css' %}`. On production builds every component emits a `<link rel="stylesheet">`, so a page issues one render-blocking CSS request per component. Goal: ship each component's minified CSS inline in a `<style>` tag instead, eliminating the CSS request waterfall while keeping per-component style ownership.

## Decisions (with rationale)

1. **Standalone npm package** — reusable across Lazer themes, consumed alongside `vite-plugin-shopify` the same way `vite-plugin-shopify-theme-islands` is. Holts is the first consumer.
2. **New generated snippet (`vite-style`)**, not a rewrite of `vite-tag` output — explicit, and not coupled to `vite-plugin-shopify`'s internal generated-file format.
3. **Duplication guard = config opt-out list.** Liquid `{% render %}` is sandboxed, so a snippet rendered N times emits its `<style>` N times and no Liquid-side dedup is possible. Repeat-heavy entries (e.g. `l-product-card.css`, `l-button.css` — 10–13KB source each, rendered 24–50× on a collection page) are listed in config and keep a cached `<link>` tag instead. Developer knows which snippets repeat.
4. **Mechanism = Shopify's `inline_asset_content` filter** (Approach A). CSS stays as normal Vite-built assets; Shopify's server inlines file contents at render time. Rejected: baking CSS text into the generated snippet (256KB snippet ceiling, `{{`/`{%` escaping hazards, git churn — and Liquid `render` requires static names so all CSS would land in one file); marker injection into authored liquid files (churn/conflicts on source files).

## Non-goals

- Creating entrypoints (that's `vite-plugin-shopify`'s `additionalEntrypoints`).
- Minifying CSS (Vite's build already does).
- Handling JS entries (`vite-tag` remains for those).
- Critical-CSS extraction, media-query splitting, or automatic repeat detection.

## Architecture

A single Vite plugin whose only output is `snippets/<snippetName>.liquid` in the theme root.

### Dev (serve mode)

Generated snippet delegates entirely:

```liquid
{% render 'vite-tag', entry: entry %}
```

HMR, tunnel URLs, and dev-server behavior are inherited from `vite-plugin-shopify` untouched.

### Build mode

Hook: `closeBundle`. The plugin reads Vite's manifest from disk (path from resolved `config.build.manifest`; error with a clear message if the manifest is disabled). For every manifest entry whose **source** extension is one of `css|less|sass|scss|styl|stylus|pcss|postcss`, it emits a `case` branch mapping the entry's alias forms to the hashed output asset. Branches are sorted by entry key for deterministic output (stable git diffs).

Generated contract (example):

```liquid
{%- liquid
  case entry
    when '@/snippets/l-badge.css' or '~/snippets/l-badge.css'
      assign vs_asset = 'l-badge-Xk3D.css'
    when '@/snippets/l-button.css' or '~/snippets/l-button.css'
      assign vs_asset = 'l-button-D4k2.css'
      assign vs_link = true
  endcase
-%}
{%- if vs_asset == blank -%}
  <!-- vite-style: unknown entry '{{ entry }}' -->
{%- elsif vs_link -%}
  {{ vs_asset | asset_url | stylesheet_tag }}
{%- else -%}
  <style data-vite-style="{{ entry }}">{{ vs_asset | inline_asset_content }}</style>
{%- endif -%}
```

Both branches reference the **same built asset**; opting out is only a different tag. `data-vite-style` identifies the owning component in DevTools.

### Entry alias resolution

Users pass `@/<path>` or `~/<path>` where `<path>` is relative to `sourceCodeDir` (matching `vite-plugin-shopify` semantics). Manifest keys look like `src/snippets/l-badge.css`; the plugin strips the configured `sourceCodeDir` prefix to produce both alias forms in the `when` clause. Only these two alias forms are supported.

## Config

```ts
shopifyInlineStyles({
  linkEntries: ['l-button.css', '@/snippets/l-product-card.css'], // render as <link>; matched by basename or full alias path (a basename matches every entry sharing it)
  snippetName: 'vite-style',   // default
  themeRoot: './',             // default; where snippets/ lives — must match vite-plugin-shopify
  sourceCodeDir: 'src',        // default; must match vite-plugin-shopify
})
```

No thresholds, globs, or CSS options — YAGNI.

## Theme usage & holts migration

```liquid
{% render 'vite-style', entry: '@/snippets/l-badge.css' %}
```

Migration is a one-time find/replace of `render 'vite-tag'` → `render 'vite-style'` on CSS entries only. JS entries keep `vite-tag`.

## Error handling & known limits

- **Unknown entry** (typo, or a JS entry passed in) → `<!-- vite-style: unknown entry 'X' -->` in output; nothing breaks, debuggable in view-source.
- **Manifest missing/disabled** → build error instructing to enable `build.manifest` (required by `vite-plugin-shopify` anyway).
- **`inline_asset_content` size cap** — Shopify enforces a per-file limit; exact number to be verified against Shopify docs during implementation. Plugin logs a build warning for any inlined asset above the cap. Component CSS at holts scale (≤35KB source) is far below it.
- **Literal `</style>` inside CSS content** would terminate the block early — documented limitation; does not occur in real component CSS.
- **Caching trade-off** (documented in README): inlined CSS re-ships with every page view instead of hitting the browser cache; `linkEntries` is the knob when caching matters more than request elimination.

## Testing

- **Unit** (vitest): core pure function `generateSnippet(manifestEntries, options) → string` — inline branch, link opt-out by basename, link opt-out by full alias path, both alias forms in `when`, unknown-entry fallback block, deterministic ordering, dev-mode delegation content.
- **Integration**: run a real `vite build` on a fixture mini-theme (2 CSS entries, one opted out) and assert the generated snippet references the hashed assets correctly and assets exist.
- Coverage target: 80%+.

## Packaging

- TypeScript, ESM-only, compiled with `tsc` to `dist/` with `.d.ts`.
- `vite` as peer dependency (`>=5`).
- npm name: `vite-plugin-shopify-inline-styles`.
- Layout: `src/index.ts` (plugin wiring/hooks), `src/generate.ts` (pure snippet generation), `src/options.ts` (types + defaults), `tests/`.

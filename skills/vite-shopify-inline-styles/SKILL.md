---
name: vite-shopify-inline-styles
description: Configure and troubleshoot vite-plugin-shopify-inline-styles in a Shopify theme built with Vite and vite-plugin-shopify. Use when a theme renders `{% render 'vite-style' %}`, when deciding whether a component's CSS should be inlined or served as a `<link>`, when reading `[vite-style]` build output, or when inline CSS is missing, duplicated, or oversized.
---

# vite-plugin-shopify-inline-styles

Companion to `vite-plugin-shopify`. It generates `snippets/vite-style.liquid`, which renders a
CSS entry either as an inline `<style>` tag (via Shopify's server-side `inline_asset_content`
filter) or as a cached `<link rel="stylesheet">`. JS entries are untouched and keep using
`vite-tag`. This plugin only handles CSS.

Package: `vite-plugin-shopify-inline-styles` on npm. Source and full README:
https://github.com/cesareuseche/vite-shopify-styles-plugin

## Setup

1. Install: `npm i -D vite-plugin-shopify-inline-styles`
2. In `vite.config.js`, register it **after** `vite-plugin-shopify`, and expose component CSS as
   `additionalEntrypoints` on `vite-plugin-shopify`:

```js
import shopify from 'vite-plugin-shopify'
import shopifyInlineStyles from 'vite-plugin-shopify-inline-styles'

export default {
  plugins: [
    shopify({
      additionalEntrypoints: ['src/sections/section.*.css', 'src/snippets/*.css'],
    }),
    shopifyInlineStyles({
      linkEntries: ['l-button.css', 'l-product-card.css'],
    }),
  ],
  build: { manifest: 'manifest.json' },
}
```

3. In a section or snippet, render the entry's style:

```liquid
{% render 'vite-style', entry: '@/snippets/l-badge.css' %}
```

Only the `@/` and `~/` alias forms are supported for `entry`. `themeRoot` and `sourceCodeDir`
must match the values given to `vite-plugin-shopify`.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `linkEntries` | `[]` | Entries rendered as `<link>` instead of inline. Accepts a basename (`'l-button.css'`, matches every entry sharing it) or an alias path (`'@/snippets/l-button.css'`). Never inlined, never split. |
| `autoLinkEntries` | `false` | Build-time theme analysis promotes inline entries to `<link>` when inlining loses. Only promotes inline to link, never the reverse. Each promotion is logged with its reason. |
| `snippetName` | `'vite-style'` | Name of the generated snippet (without `.liquid`). |
| `themeRoot` | `'./'` | Theme root containing `snippets/`. Must match vite-plugin-shopify. |
| `sourceCodeDir` | `'src'` | Directory the `@/` and `~/` aliases resolve against. Must match vite-plugin-shopify. |

## Choosing inline vs. link

Inline is the default and the right choice for small CSS rendered once or twice per page.
Use `linkEntries` when:

- The component is rendered many times on one page (product card in a grid, button, badge in
  a loop). Liquid's `{% render %}` is sandboxed, so inline CSS duplicates per render and there
  is no way to dedupe it. A `<link>` ships once and is cached.
- The CSS is large and shared across many pages. A cached stylesheet beats re-shipping bytes
  on every page view.
- The entry is vendor or UI-library CSS (Swiper, etc.). Give it a dedicated entry that
  `@import`s per-module files (never the full bundle), list it in `linkEntries`, and render it
  only in the sections that use the library. Do not `@import` vendor CSS inside a component's
  inline entry.

`autoLinkEntries: true` makes these decisions from static analysis of the Liquid render graph,
`templates/*.json`, and section groups. It promotes an entry when it is rendered inside a loop,
reachable from two or more sections, present on every page (layout, header/footer section
group, or `{% section %}` in the layout), or placed on more than half of the JSON templates.
The analysis is build-time, so sections a merchant adds in the theme editor later are not seen.

## Oversized entries

Shopify's `inline_asset_content` refuses assets of 15 KB or more. Any inline entry at or above
that cap is split automatically into ordered part files (`name-p1.css`, `name-p2.css`, ...)
rendered as consecutive `<style>` tags. Cascade order is preserved, conditional groups
(`@media`, `@supports`, `@container`, `@layer`) are re-wrapped in each part, and `@charset` is
copied to every part. No configuration is needed.

If a single atomic block alone exceeds the cap (a huge data URI, a giant `@keyframes`), the
entry cannot be split safely and falls back to `<link>` with a build warning. Styles never
silently disappear.

## Reading build output

Every production build prints a per-entry report sorted by size:

```
[vite-style] generated snippet:
  snippets/l-mega.css                          17.4 KB  inline (2 parts)
  sections/section.hero.css                     4.1 KB  inline
  snippets/l-product-card.css                   3.8 KB  link
```

Warnings to act on:

- `'X' was built but is never rendered via 'vite-style'`: the entry is an orphan. Either add
  a `{% render 'vite-style', entry: ... %}` for it or remove it from `additionalEntrypoints`.
- `'X' is N bytes, above the inline_asset_content limit ... cannot be split; falling back to
  <link>`: an atomic block is too large. Break up the block or accept the `<link>`.
- `'X' inlines vendor CSS from ...`: move the vendor import into a dedicated `linkEntries`
  entry (see above).
- `auto-link: 'X' → <link rel="stylesheet"> (reason)`: informational. `autoLinkEntries`
  promoted the entry. Add it to `linkEntries` if you want the decision to be explicit.

## Troubleshooting

**CSS is not inlined, I still see `<link>` tags or dev-server stylesheets.** You are in dev
mode. There the snippet intentionally delegates to `vite-tag` so HMR keeps working, and a
startup log says so. Inline `<style>` tags exist only in a production build. Run the build
and inspect the generated `snippets/vite-style.liquid`.

**An entry shows `link` in the report but is not in `linkEntries`.** Either
`autoLinkEntries` promoted it (check for an `auto-link:` log line with the reason) or it was
too large to inline and could not be split (check for the size warning).

**A component's CSS appears many times in the page source.** The component is rendered
repeatedly and its entry is inline. Move it to `linkEntries` or enable `autoLinkEntries`.
Intra-page dedupe is impossible in Liquid because `{% render %}` sandboxes even
`{% increment %}` counters.

**The page shows `<!-- vite-style: unknown entry ... -->`.** The `entry` string does not
match any built CSS entry. Check the alias form (`@/` or `~/`), the path relative to
`sourceCodeDir`, and that the file is covered by `additionalEntrypoints`.

**Styles are missing after `vite-plugin-shopify` config changes.** `themeRoot` and
`sourceCodeDir` must be identical in both plugins.

## Migrating an existing theme

Find and replace on CSS entries only:

```
{% render 'vite-tag', entry: '@/sections/section.foo.css' %}
→ {% render 'vite-style', entry: '@/sections/section.foo.css' %}
```

Then add repeat-rendered components to `linkEntries` and measure home, collection, and
product pages with Lighthouse before and after.

## Limitations

- Only `@/` and `~/` entry alias forms are supported.
- Dev mode assumes vite-plugin-shopify's default `vite-tag` snippet name.
- A literal `</style>` inside CSS would end the inline block early.
- Unknown entries render an HTML comment instead of failing the page.

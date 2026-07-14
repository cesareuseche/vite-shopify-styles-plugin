# vite-plugin-shopify-inline-styles

[![npm](https://img.shields.io/npm/v/vite-plugin-shopify-inline-styles)](https://www.npmjs.com/package/vite-plugin-shopify-inline-styles)
[![CI](https://github.com/cesareuseche/vite-shopify-styles-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/cesareuseche/vite-shopify-styles-plugin/actions/workflows/ci.yml)

Make your Shopify theme show up faster by shipping each component's CSS **inside the page's
HTML** instead of as separate CSS files the browser has to download before it can paint.

Built for themes that use [`vite-plugin-shopify`](https://github.com/barrel/shopify-vite) —
same entrypoints, same manifest, same dev workflow. One line per component:

```liquid
{% render 'vite-style', entry: '@/snippets/l-badge.css' %}
```

That line prints the component's minified CSS straight into the page as a `<style>` tag.
Nothing extra to download, no flash of unstyled content.

## The problem, in plain words

A component-based theme has one small CSS file per section and snippet. `vite-plugin-shopify`
loads each one with a `<link rel="stylesheet">` tag wherever the component is used — in the
middle of the page body.

Every one of those tags is **render-blocking**: when the browser reaches it, it stops painting,
opens a connection to Shopify's CDN, downloads the file, and only then continues. Worse, it
can't prepare in advance — it discovers the tags one by one while reading down the page. A
product page with a dozen components pays that price a dozen times, at the worst possible
moment: right before the customer would see something.

## What this plugin does

At build time it generates one Liquid snippet — `snippets/vite-style.liquid` — that knows every
CSS file your build produced. When Shopify renders a page, that snippet prints each component's
CSS directly into the HTML (via Shopify's server-side
[`inline_asset_content`](https://shopify.dev/docs/api/liquid/filters/inline_asset_content)
filter), so the styles arrive **with the page itself** and there's nothing left to download.

- **Zero extra requests** for inlined CSS — no per-component CDN round trips.
- **Faster first paint** — no stylesheet downloads block rendering ([measured results below](#real-world-results)).
- **No flash of unstyled content** — styles always land before the markup they style.
- **Once per page, automatically** — a card rendered 24 times in a grid ships its CSS once
  ([deduplication](#once-per-page-deduplication)).
- **Handles Shopify's limits for you** — CSS over the 15 KB inline cap is
  [split automatically](#automatic-splitting-of-oversized-entries).
- **Dev mode untouched** — locally, CSS still loads from the Vite dev server with hot reload.
  JS entrypoints keep using `vite-tag` everywhere.

**The one trade-off:** inline CSS isn't cached by the browser — it re-ships with every page
view. That's a great deal for small component CSS and a bad one for big shared stylesheets,
so those can stay as classic cached `<link>`s via
[`linkEntries`](#inline-vs-link-choosing-per-component).

## Real-world results

The same production Shopify theme, measured **without** the plugin and **with** it — same
store, same content, same day. The only difference is CSS delivery:

- **Without the plugin**, every component drops a `<link rel="stylesheet">` into the page
  body — the product page ships **48 of them**, each a late-discovered, render-blocking CDN
  round trip.
- **With the plugin**, that CSS arrives inline in the first HTML response, and the handful of
  repeat-rendered grid components (product card, size selector, badge…) stay as cached links
  via [`linkEntries`](#inline-vs-link-choosing-per-component).

| Page       | Stylesheet requests | FCP             | LCP             | Performance score |
| ---------- | ------------------- | --------------- | --------------- | ----------------- |
| Collection | 23 → **12**         | 1.10 s → 1.03 s | 1.10 s → 1.07 s | 86 → **92**       |
| Page       | 19 → **9**          | 0.91 s → 0.84 s | 0.95 s → 0.88 s | 94 → 94           |
| Product    | 29 → **9**          | 0.94 s → 0.93 s | 0.98 s → 0.97 s | 92 → 92           |

Median of 3 desktop Lighthouse (v13, `--preset=desktop`) runs per page per theme: **half to
two-thirds of stylesheet requests eliminated**, faster first paint on every page, and a
six-point performance-score jump on the collection page — the page with the most components.

## Setup in 5 minutes

You need a theme that already builds with
[`vite-plugin-shopify`](https://github.com/barrel/shopify-vite) — this plugin plugs into its
setup. (New to that? Set it up first, then come back.)

### 1. Install

```bash
npm i -D vite-plugin-shopify-inline-styles
```

### 2. Add it to `vite.config.js`

Two things happen here: `additionalEntrypoints` tells Vite to build each component's CSS file
as its own output (an "entry"), and `shopifyInlineStyles()` — added **after** the shopify
plugin — generates the snippet that inlines them:

```js
import shopify from 'vite-plugin-shopify'
import shopifyInlineStyles from 'vite-plugin-shopify-inline-styles'

export default {
  plugins: [
    shopify({
      additionalEntrypoints: [
        'src/sections/section.*.css', // each section's CSS
        'src/snippets/*.css',         // each snippet's CSS
      ],
    }),
    shopifyInlineStyles(),
  ],
  build: { manifest: 'manifest.json' },
}
```

### 3. Render each component's style in Liquid

Put this line wherever the component lives — the top of its own snippet is the usual spot.
The `@/` prefix means "relative to your source dir" (`src/` by default):

```liquid
{% comment %} snippets/l-badge.liquid {% endcomment %}
{% render 'vite-style', entry: '@/snippets/l-badge.css' %}
<span class="badge">…</span>
```

Don't worry about a component rendering many times on a page — its CSS is emitted
[only once](#once-per-page-deduplication).

### 4. Build

```bash
npx vite build
```

The build log shows exactly what happened to every CSS file:

```
[vite-style] generated snippet:
  sections/section.hero.css                     4.1 KB  inline
  snippets/l-badge.css                          1.2 KB  inline
[vite-style] inline CSS per template:
  index                                         5.3 KB
```

### 5. Check it worked

Open your store (or theme preview) and **view the page source**: each component now has a
`<style data-vite-style="…">` block instead of a `<link rel="stylesheet">` tag. If you're
looking at your **local dev server** instead, you'll still see the dev-server stylesheets —
that's intentional; inlining only happens in production builds (see the [FAQ](#faq)).

A complete, runnable setup lives in [`examples/basic`](examples/basic).

## Claude Code skill

This repo doubles as a [Claude Code plugin](https://code.claude.com/docs/en/plugins) shipping a
skill that teaches Claude how to configure and troubleshoot this plugin. To install it:

```
/plugin marketplace add cesareuseche/vite-shopify-styles-plugin
/plugin install vite-shopify-inline-styles@cesareuseche
```

## How it works

The plugin generates a single `snippets/vite-style.liquid` file and keeps it in sync with your
build. Its behavior differs by mode:

- **Dev** — the snippet delegates to `vite-tag`, so CSS loads from the Vite dev server and HMR /
  tunnel behavior is unchanged. There are **no inline `<style>` tags in dev** (a startup log says
  so). This keeps the fast feedback loop intact.
- **Build** — the snippet maps each entry to its hashed asset from the manifest and emits either:
  - `<style>{{ asset | inline_asset_content }}</style>` for inline entries (the default), or
  - `{{ asset | asset_url | stylesheet_tag }}` for [`linkEntries`](#inline-vs-link-choosing-per-component).

JS entrypoints are untouched — they keep using `vite-tag`. This plugin only handles CSS.

### Once-per-page deduplication

Components usually render their own style right inside the snippet:

```liquid
{% comment %} snippets/l-product-card.liquid {% endcomment %}
{% render 'vite-style', entry: '@/snippets/l-product-card.css' %}
<l-product-card>…</l-product-card>
```

Render that card 24 times in a grid and `vite-style` runs 24 times — but the tag is emitted
**only on the first render**. Liquid's `{% render %}` is sandboxed, so snippets can't share
`assign`ed state, but `{% increment %}` counters *are* shared across render scopes. The
generated snippet bumps a per-entry counter and only emits when it reads `0`:

```liquid
capture vs_seen
  increment vite_style_once_3
endcapture
```

This applies to inline `<style>` and `<link>` entries alike, with no configuration and no
change to how you author components. The tag lands at the component's *first* render position,
which always precedes the markup it styles. (Sections fetched later via the Section Rendering
API — infinite scroll, filtering — are a fresh render context, so they re-include their styles
and stay self-contained.)

## Inline vs. `<link>`: choosing per component

Inlining is the right default, but not for every component. Thanks to
[once-per-page deduplication](#once-per-page-deduplication), how many times a component renders
on one page doesn't matter — the choice is purely about **cross-page caching**:

| Situation | Choose | Why |
| --- | --- | --- |
| Small component CSS (badge, card, hero, banner) | **inline** (default) | Removes a render-blocking request from the critical path; ships once per page regardless of render count. |
| Large, shared CSS reused across many pages | **`linkEntries`** | A cached stylesheet beats re-shipping the same bytes with every page view. |

An entry in `linkEntries` is never inlined and never [split](#automatic-splitting-of-oversized-entries).

### Automatic `linkEntries` (`autoLinkEntries: true`)

The table above can be decided by the build instead of by hand. With `autoLinkEntries: true`,
the plugin statically analyzes your theme — the Liquid render graph, `templates/*.json`, and
section groups — and promotes an entry from inline to `<link>` when inlining loses.

Entries smaller than `autoLinkMinBytes` (default 3 KB) are **never promoted**: below that
size, an extra render-blocking request costs more than re-shipping the bytes inline with the
HTML, no matter how widely the entry is used. Above the gate, an entry is promoted when it is:

- **Rendered inside a loop** (`{% for %}` or `{% render 'card' for products %}`), directly or
  via a snippet — grid components appear on many page views, so their CSS is worth caching.
- **Reachable from two or more sections** — shared CSS is worth caching.
- **Present on every page** — rendered from `layout/`, from a section placed in a section group
  (header/footer), or via `{% section %}` in the layout. A cached stylesheet ships once per
  session instead of re-shipping inline with every page view.
- **Placed on most templates** — the rendering sections appear in more than half of your JSON
  templates.

Every promotion is logged at build time with its reason, e.g.:

```
[vite-style] auto-link: 'snippets/l-card.css' → <link rel="stylesheet"> (rendered inside a loop — repeat-rendered component CSS is worth a cached <link>)
```

Manual `linkEntries` still works and is never overridden — auto-analysis only promotes inline
entries to links, never the reverse. Note the analysis is build-time: sections a merchant adds
in the theme editor after the build aren't seen, so their entries keep the inline default until
the next build.

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
   bundled into that entry, re-ship with every page view, and usually push the entry over the
   15 KB cap into auto-splitting. The build warns when it detects this.

## Automatic splitting of oversized entries

Shopify's `inline_asset_content` **won't inline an asset of 15 KB or more** — so a single large
CSS entry can't simply be dropped into a `<style>` tag. This plugin handles that for you, at build
time, with no configuration.

Any inline entry at or above the cap is split into ordered part files — `name-p1.css`,
`name-p2.css`, … — each strictly under 15 KB, and rendered as **consecutive `<style>` tags**:

```liquid
<style data-vite-style="@/snippets/l-mega.css">{{ 'l-mega-Ab12Cd34-p1.css' | inline_asset_content }}</style>
<style data-vite-style="@/snippets/l-mega.css">{{ 'l-mega-Ab12Cd34-p2.css' | inline_asset_content }}</style>
```

Because the parts are packed in source order and rendered back-to-back, the cascade is **identical**
to the unsplit file. Everything stays automatic:

- **Conditional groups** (`@media`, `@supports`, `@container`, `@layer`) that are themselves too big
  are split *inside* their bodies and each part is re-wrapped with the group's prelude, so the
  conditions still apply. Nested groups carry their full prelude chain.
- **`@charset`** at the top of the file is duplicated as the first bytes of every part.
- **Strings, comments, and `url()` / data-URI content** never affect where a split happens.

**Safety fallback:** if a single atomic block alone exceeds the cap (e.g. one enormous
data-URI declaration or a giant `@keyframes`), the entry can't be split without breaking it — so
the whole entry falls back to `<link rel="stylesheet">` with a build warning. **Styles never
silently disappear.**

The original unsplit asset is kept on disk (any other reference to it keeps working), and the
build report shows the part count for anything that was split.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `linkEntries` | `[]` | Entries rendered as `<link>` instead of inline. Basename (`'l-button.css'`) or alias path (`'@/snippets/l-button.css'`). A basename matches every entry sharing it. Use for large CSS reused across many pages. |
| `autoLinkEntries` | `false` | [Auto-promote entries to `<link>`](#automatic-linkentries-autolinkentries-true) when build-time theme analysis says inlining loses: rendered in a loop, shared by 2+ sections, or present on most pages. Logged with reasons. |
| `autoLinkMinBytes` | `3000` | Minimum built size for `autoLinkEntries` to promote an entry. Below it, the render-blocking request costs more than the re-shipped inline bytes, so small entries always stay inline. |
| `templateBudget` | — | Bytes of inline CSS a single template may ship before the build warns (e.g. `50_000`). The [per-template report](#build-diagnostics) always prints; the budget only adds warnings. |
| `snippetName` | `'vite-style'` | Name of the generated snippet file. |
| `themeRoot` | `'./'` | Theme root containing `snippets/`. Must match vite-plugin-shopify. |
| `sourceCodeDir` | `'src'` | Directory the `@/` and `~/` aliases resolve against. Must match vite-plugin-shopify. |

## Build diagnostics

Every build prints a per-entry report — asset, minified size, mode (inline / link), and part count
for split entries — sorted by size:

```
[vite-style] generated snippet:
  snippets/l-mega.css                          17.4 KB  inline (2 parts)
  sections/section.hero.css                     4.1 KB  inline
  snippets/l-product-card.css                   3.8 KB  link
```

It also prints how much inline CSS each JSON template ships in total — the bytes that
re-download with every page view, which is the number to keep an eye on:

```
[vite-style] inline CSS per template:
  product                                      34.2 KB
  collection                                   21.0 KB
  index                                        12.3 KB
```

The totals come from the same render-graph analysis as `autoLinkEntries`: an entry counts
toward every template whose sections render it, and entries reachable from `layout/` or a
section group count toward all templates. Set `templateBudget` (in bytes) to turn the report
into a guardrail — any template over the budget gets a build warning suggesting `linkEntries`.

It also warns when:

- a CSS entrypoint is built but never referenced via `render 'vite-style'` in any Liquid file (orphan);
- a template's total inline CSS exceeds [`templateBudget`](#options);
- an oversized entry can't be auto-split (an atomic block alone exceeds the 15 KB cap) and falls back to `<link>`; or
- an inline entry `@import`s vendor CSS (a bare specifier like `'swiper/css'`) — see
  [Vendor / UI-library CSS](#vendor--ui-library-css-swiper-etc).

## Migrating an existing vite-plugin-shopify theme

A one-time find/replace on CSS entries only:

```
{% render 'vite-tag', entry: '@/sections/section.foo.css' %}
→ {% render 'vite-style', entry: '@/sections/section.foo.css' %}
```

Then add any large cross-page CSS (vendor libraries, shared foundations) to `linkEntries`, and measure before/after with Lighthouse
(or [unlighthouse](https://unlighthouse.dev)) on your home, collection, and product pages.

## FAQ

**Do I need `vite-plugin-shopify` for this to work?** Yes. This plugin reads the entrypoints
and manifest that `vite-plugin-shopify` produces, and delegates to its `vite-tag` snippet in
dev mode. It adds CSS inlining on top of that setup; it doesn't replace it.

**I use a theme without Vite (e.g. stock Dawn) — can I use this?** Not directly. Your theme
needs a Vite build with `vite-plugin-shopify` first. If you're curious what the end result
looks like, Shopify's own [`inline_asset_content`](https://shopify.dev/docs/api/liquid/filters/inline_asset_content)
filter is the underlying mechanism — this plugin automates it for a Vite build.

**What exactly is an "entry"?** Every CSS file matched by your `additionalEntrypoints` globs
becomes one entry: a separate build output you can reference by its source path, like
`@/snippets/l-badge.css`. The [build report](#build-diagnostics) lists all of them.

**I added `render 'vite-style'` but the CSS isn't inlined.** You're almost certainly looking at dev
mode: there the snippet intentionally delegates to `vite-tag`, so CSS loads from the Vite dev server
(keeping HMR working), and a startup log says so. Inline `<style>` tags exist only in the **built**
theme — run a production build and inspect the generated `snippets/vite-style.liquid`.

**What happens if I typo the entry name?** The page keeps working — the snippet renders an
HTML comment (`<!-- vite-style: unknown entry ... -->`) instead of styles, so you can spot it
in view-source. The build also [warns](#build-diagnostics) about built entries that are never
rendered anywhere (the reverse mistake).

**An entry shows up as `link` in the report but I didn't add it to `linkEntries`.** It was too large
to inline and couldn't be safely split (see the [safety fallback](#automatic-splitting-of-oversized-entries)).
The build warning names the entry and its size.

**Which CSS should I *not* inline?** Big stylesheets reused on many pages — vendor/UI-library
CSS like Swiper is the textbook case. Put those in [`linkEntries`](#inline-vs-link-choosing-per-component)
so the browser downloads them once and caches them, or let
[`autoLinkEntries`](#automatic-linkentries-autolinkentries-true) decide from your theme's structure.

## Limitations

- Only the `@/` and `~/` entry alias forms are supported.
- Dev mode assumes vite-plugin-shopify's default `vite-tag` snippet name.
- A literal `</style>` inside CSS content would terminate the inline block early (does not occur in practice).
- Unknown entries render an HTML comment (`<!-- vite-style: unknown entry ... -->`) rather than failing the page.

## Contributing

Contributions are welcome — bug reports, fixes, and ideas alike.

```bash
git clone https://github.com/cesareuseche/vite-shopify-styles-plugin
cd vite-shopify-styles-plugin
npm install
npm test            # vitest; npm run test:coverage for the coverage report
```

Please include a test with any behavior change (the suite runs in CI), and open an
[issue](https://github.com/cesareuseche/vite-shopify-styles-plugin/issues) first for larger
features so we can agree on the approach.

## Releasing

Publishing is automated via GitHub Actions (npm Trusted Publishing — no tokens):

```bash
npm version patch   # or minor / major — bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
```

The `v*` tag triggers `.github/workflows/publish.yml`, which runs build + coverage (via
`prepublishOnly`) and publishes with provenance.

## License

[MIT](LICENSE)

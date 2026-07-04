# Outreach checklist

Drafts for growing adoption. Each item is posted manually — nothing here is automated.

## 1. shopify-vite issue comments

Targets (found 2026-07-04 via GitHub search):

- https://github.com/barrel/shopify-vite/issues/218 — "Critical CSS contribution
  idea validation": proposes exactly this (`inline_asset_content` inlining) as a
  shopify-vite feature; closed without shipping. Anyone finding it via search is
  our audience.
- https://github.com/barrel/shopify-vite/issues/100 — vite.liquid hitting the
  256 KB snippet limit from many component entries; adjacent problem, lighter fit.

Draft comment (adjust greeting per thread):

> In case it helps anyone landing here: I built a small companion plugin for
> vite-plugin-shopify that does this — it renders each section/snippet's built
> CSS as an inline `<style>` via Shopify's `inline_asset_content` filter instead
> of a render-blocking `<link>`, while dev mode/HMR still delegates to
> `vite-tag`. On a production theme (44 CSS entrypoints) it cut render-blocking
> stylesheets on the product page from 10 to 3 and FCP from 1.0 s to 0.66 s
> (desktop Lighthouse, median of 3). Repeat-rendered components can opt out per
> entry to keep a cached link, and the build warns when an asset exceeds the
> 15 KB inline cap.
> https://github.com/cesareuseche/vite-shopify-styles-plugin

## 2. Awesome-list PRs

- [ ] [vitejs/awesome-vite](https://github.com/vitejs/awesome-vite) — under
  Plugins → Framework-agnostic:
  `- [vite-plugin-shopify-inline-styles](https://github.com/cesareuseche/vite-shopify-styles-plugin) - Render Shopify section/snippet CSS as inline style tags via inline_asset_content.`
- [ ] [julionc/awesome-shopify](https://github.com/julionc/awesome-shopify) —
  development-tools section, same one-liner.

Follow each list's CONTRIBUTING.md (alphabetical order, description format)
before opening the PR.

## 3. GitHub repo topics

Run once (needs `gh` authenticated):

```bash
gh repo edit cesareuseche/vite-shopify-styles-plugin \
  --add-topic shopify --add-topic vite-plugin --add-topic shopify-theme \
  --add-topic performance --add-topic critical-css --add-topic inline-css
```

Or add the same six topics via the repo's About ⚙ on github.com.

## 4. Optional write-up

Short post (Shopify community forum or dev.to) reusing the README case study:
problem (render-blocking per-component CSS links) → approach
(`inline_asset_content` + build-time snippet) → numbers → link. Only worth
doing after 1 and 2.

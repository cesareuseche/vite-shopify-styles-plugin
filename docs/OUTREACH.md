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

Final comment for #218 (verified 2026-07-10, issue closed — comment lands for searchers):

> In case it helps anyone landing here: I built this idea as a standalone
> companion plugin for vite-plugin-shopify —
> https://github.com/cesareuseche/vite-shopify-styles-plugin
>
> It generates a `vite-style` snippet that renders each section/snippet's built
> CSS as an inline `<style>` via Shopify's `inline_asset_content` filter instead
> of a render-blocking body `<link>`, while dev mode/HMR still delegates to
> `vite-tag`. The sharp edges this thread anticipated are handled: CSS at or
> over the 15 KB `inline_asset_content` cap is auto-split into ordered sub-15 KB
> parts at build time (cascade preserved), repeat-rendered components keep a
> cached `<link>` via a `linkEntries` opt-out, and the build warns about vendor
> CSS `@import`ed into inline entries. On a production theme it cut stylesheet
> requests roughly in half to two-thirds per page (e.g. 29 → 9 on the product
> page) and lifted the collection page's Lighthouse performance score from 86
> to 92 (desktop, median of 3, same store/day). Measured results and the
> honest trade-offs are in the README.

Final comment for #100 (256 KB snippet limit — adjacent problem, lighter touch):

> Somewhat related, for anyone splitting CSS per component and landing here: I
> maintain a companion plugin that moves component CSS out of `<link>` tags
> entirely — it emits a compact generated snippet that maps each CSS entry to an
> inline `<style>` via `inline_asset_content` (one `when` branch per entry, so
> the snippet stays far from the 256 KB template limit even with dozens of
> entries), with a per-entry opt-out to keep cached links for repeat-rendered
> components. https://github.com/cesareuseche/vite-shopify-styles-plugin

One-click post commands (`gh` is authenticated on this machine):

```bash
gh issue comment 218 --repo barrel/shopify-vite --body-file docs/outreach/comment-218.md
gh issue comment 100 --repo barrel/shopify-vite --body-file docs/outreach/comment-100.md
```

## 2. Awesome-list PRs

- [ ] [vitejs/awesome-vite](https://github.com/vitejs/awesome-vite) — under the
  `### Shopify` category (README ~line 788), appended AFTER the existing
  `vite-plugin-shopify` entry. Verified against `.github/contributing.md`
  2026-07-10: entries go at the END of the list (first-come-first-serve, not
  alphabetical), description is one sentence ≤24 words, no emoji, and must not
  say "Vite plugin"/"for Vite" (implied). Ready-to-paste line:
  `- [vite-plugin-shopify-inline-styles](https://github.com/cesareuseche/vite-shopify-styles-plugin) - Render each section/snippet's built CSS as inline style tags via inline_asset_content instead of render-blocking links.`
- [ ] [julionc/awesome-shopify](https://github.com/julionc/awesome-shopify) —
  development-tools section; check that list's own format before opening.

Note: TanStack's showcase (tanstack.com/showcase) was evaluated 2026-07-10 and
is not applicable — it requires the project to use TanStack libraries.

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

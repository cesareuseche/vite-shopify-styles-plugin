# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] - 2026-07-14

### Changed

- **Rolled back to the 0.4.0 feature set.** The 0.5.x–0.7.x additions
  (once-per-page dedupe, per-template weight report/`templateBudget`,
  `autoLinkMinBytes`, repetition-based `autoLinkEntries` promotion) did not
  behave as documented and have been removed. 0.8.0 is functionally identical
  to 0.4.0. Versions 0.5.0–0.7.1 are deprecated on npm.

## [0.7.1] - 2026-07-14

### Fixed

- `autoLinkEntries` false positives that promoted inline entries to `<link>` on
  phantom repetition:
  - The 0.7.0 "rendered 2+ times by one file" detection is removed — it counted
    mutually exclusive `{% if %}/{% else %}` branches as repetition and poisoned
    every render of the affected snippet. Repetition now means loops only
    (`{% for %}` and `{% render 'x' for y %}`). A component genuinely rendered
    twice statically ships its CSS twice inline again (0.4.0 behavior).
  - Static analysis now strips `{% comment %}`, `{% raw %}`, `{% schema %}`,
    `{% # … %}`, and HTML comments before matching, so commented-out renders,
    alias mentions in comments, and `{% for %}` examples inside comments or
    schema JSON no longer count as real renders or open loops.

## [0.7.0] - 2026-07-14

### Removed

- **Once-per-page deduplication (0.5.0) — it never worked and has been removed.**
  Shopify's `{% render %}` sandbox isolates `{% increment %}` counters too (each
  render starts its own counter at 0), so the guard always read '0' and emitted
  every time. Verified against a production theme where per-render counters
  never advance. Repeat-rendered inline entries duplicate their CSS per render;
  the fix is `<link>` delivery, below.

### Changed

- `autoLinkEntries` promotes repeat-rendered entries (in a loop, or rendered
  2+ times by one file — a new detection) **regardless of `autoLinkMinBytes`**:
  duplication multiplies the inline cost per render, while repeated `<link>`
  tags cost ~150 bytes each and one cached download. The size gate now applies
  only to the caching-based promotions.

## [0.6.0] - 2026-07-14

### Added

- `autoLinkMinBytes` option (default 3000): `autoLinkEntries` never promotes an
  entry below this built size — under ~3 KB a render-blocking stylesheet
  request costs more than re-shipping the bytes inline, so small entries stay
  inline no matter how widely they're used. Makes `autoLinkEntries: true` safe
  to enable by default.

### Changed

- README rewritten for newcomers: plain-English intro and problem statement, a
  numbered 5-minute setup walkthrough with expected output, and beginner FAQ
  entries. All technical reference content unchanged.

## [0.5.0] - 2026-07-14

### Added

- Once-per-page deduplication: the generated snippet guards every entry with a
  Liquid `{% increment %}` counter (the one piece of state shared across
  `{% render %}` sandboxes), so each entry's `<style>`/`<link>` tag is emitted
  only on its first render per page — components can keep their
  `render 'vite-style'` call inside the snippet and repeat freely (grids,
  static repeats) without duplicating CSS. `autoLinkEntries` reasons were
  reworded: promotions are now purely about cross-page caching, since
  intra-page duplication no longer exists.

- Per-template inline CSS weight report: every build prints how many bytes of
  inline CSS each JSON template ships in total, from the same render-graph
  analysis as `autoLinkEntries`. New `templateBudget` option (bytes) warns when
  a template exceeds it and suggests `linkEntries`.

## [0.4.0] - 2026-07-10

### Added

- `autoLinkEntries` option: build-time static analysis of the theme (Liquid
  render graph, `templates/*.json`, section groups) that automatically promotes
  entries from inline to `<link rel="stylesheet">` when inlining loses —
  rendered inside a loop, reachable from 2+ sections, present on every page via
  layout/section groups, or placed on most templates. Each promotion is logged
  with its reason. Default off; manual `linkEntries` is never overridden.

## [0.3.0] - 2026-07-08

### Added

- CSS entries above Shopify's 15KB `inline_asset_content` cap are now split
  automatically at build time into ordered part files rendered as consecutive
  inline `<style>` tags — no config, cascade-equivalent. Conditional groups
  (`@media`, `@supports`, `@container`, `@layer`) are split inside their bodies
  and re-wrapped; a leading `@charset` is duplicated into every part.
- Entries that cannot be split (a single atomic block alone exceeds the cap)
  fall back to `<link rel="stylesheet">` with a build warning, so styles never
  silently disappear. The old oversize warning is replaced by this fallback.
- The build report shows the part count for split entries.

## [0.2.0] - 2026-07-04

### Added

- Dev-server startup log explaining that dev mode delegates to `vite-tag` and
  inline `<style>` tags are only generated on build, plus a README FAQ entry
  for the same confusion.
- Real-world before/after case study in the README: production theme with 44
  CSS entrypoints, desktop Lighthouse, with report screenshots.
- Runnable example theme in `examples/basic` (vite-plugin-shopify companion
  setup), built on every CI run.
- This CHANGELOG, shipped in the npm tarball.

### Changed

- CI now tests Node 20/22 × Vite 5/6/7.
- Broader npm keywords for discoverability.

## [0.1.0] - 2026-07-03

### Added

- Initial release: generated `vite-style` snippet rendering built CSS entrypoints
  as inline `<style>` via `inline_asset_content`, with `linkEntries` opt-out to
  keep a cached `<link>` for repeat-rendered components.
- Dev mode delegation to vite-plugin-shopify's `vite-tag` (HMR unchanged).
- Build diagnostics: per-entry size report, orphan-entry warning, 15KB
  `inline_asset_content` oversize warning.
- Options: `linkEntries`, `snippetName`, `themeRoot`, `sourceCodeDir`.

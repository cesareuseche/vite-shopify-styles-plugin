# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

# Basic example

Minimal Shopify theme showing `vite-plugin-shopify-inline-styles` next to
`vite-plugin-shopify`: one section CSS entry rendered inline, one snippet CSS
entry kept as a cached `<link>` via `linkEntries`.

## Run

    npm run build --prefix ../..   # build the plugin itself once
    npm install
    npm run build

Then inspect `snippets/vite-style.liquid`: the hero entry maps to an
`inline_asset_content` `<style>` branch, the badge entry to a
`stylesheet_tag` link branch. The build log shows the per-entry size report.

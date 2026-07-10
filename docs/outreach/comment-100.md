Somewhat related, for anyone splitting CSS per component and landing here: I maintain a companion plugin that moves component CSS out of `<link>` tags entirely — it emits a compact generated snippet that maps each CSS entry to an inline `<style>` via `inline_asset_content` (one `when` branch per entry, so the snippet stays far from the 256 KB template limit even with dozens of entries), with a per-entry opt-out to keep cached links for repeat-rendered components.

https://github.com/cesareuseche/vite-shopify-styles-plugin

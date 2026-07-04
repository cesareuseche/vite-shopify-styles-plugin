import shopify from 'vite-plugin-shopify'
import shopifyInlineStyles from 'vite-plugin-shopify-inline-styles'

export default {
  plugins: [
    shopify({
      themeRoot: './',
      sourceCodeDir: 'src',
      entrypointsDir: 'src/entrypoints',
      additionalEntrypoints: ['src/sections/*.css', 'src/snippets/*.css'],
    }),
    shopifyInlineStyles({
      // l-badge renders once per product card — keep it a cached <link>
      linkEntries: ['l-badge.css'],
    }),
  ],
  build: { manifest: 'manifest.json' },
}

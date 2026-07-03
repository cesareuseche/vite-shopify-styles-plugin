export interface Options {
  /** Entries rendered as <link> instead of inline <style>. Basename ('l-button.css') or alias path ('@/snippets/l-button.css'). A basename matches every entry sharing it. */
  linkEntries?: string[]
  /** Name of the generated snippet file (without .liquid). Default 'vite-style'. */
  snippetName?: string
  /** Theme root containing snippets/. Must match vite-plugin-shopify's themeRoot. Default './'. */
  themeRoot?: string
  /** Source dir that '@/' and '~/' aliases resolve against. Must match vite-plugin-shopify's sourceCodeDir. Default 'src'. */
  sourceCodeDir?: string
}

export interface ResolvedOptions {
  linkEntries: string[]
  snippetName: string
  themeRoot: string
  sourceCodeDir: string
}

export function normalizeOptions(options: Options = {}): ResolvedOptions {
  return {
    linkEntries: options.linkEntries ?? [],
    snippetName: options.snippetName ?? 'vite-style',
    themeRoot: options.themeRoot ?? './',
    sourceCodeDir: options.sourceCodeDir ?? 'src',
  }
}

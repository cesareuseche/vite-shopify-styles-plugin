export interface Options {
  /** Entries rendered as <link> instead of inline <style>. Basename ('l-button.css') or alias path ('@/snippets/l-button.css'). A basename matches every entry sharing it. */
  linkEntries?: string[]
  /** Auto-promote entries to <link> when build-time theme analysis says inlining loses: rendered in a loop, shared by 2+ sections, or present on most pages. Default false. */
  autoLinkEntries?: boolean
  /** Name of the generated snippet file (without .liquid). Default 'vite-style'. */
  snippetName?: string
  /** Theme root containing snippets/. Must match vite-plugin-shopify's themeRoot. Default './'. */
  themeRoot?: string
  /** Source dir that '@/' and '~/' aliases resolve against. Must match vite-plugin-shopify's sourceCodeDir. Default 'src'. */
  sourceCodeDir?: string
}

export interface ResolvedOptions {
  linkEntries: string[]
  autoLinkEntries: boolean
  snippetName: string
  themeRoot: string
  sourceCodeDir: string
}

export function normalizeOptions(options: Options = {}): ResolvedOptions {
  return {
    linkEntries: options.linkEntries ?? [],
    autoLinkEntries: options.autoLinkEntries ?? false,
    snippetName: options.snippetName ?? 'vite-style',
    themeRoot: options.themeRoot ?? './',
    sourceCodeDir: options.sourceCodeDir ?? 'src',
  }
}

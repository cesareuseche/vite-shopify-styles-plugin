import fs from 'node:fs'
import path from 'node:path'
import type { CssEntry } from './generate.js'

export interface LiquidFile {
  /** Path relative to themeRoot, posix separators, e.g. 'sections/hero.liquid' */
  path: string
  content: string
}

/** Build-time view of which sections appear where, from the theme's JSON files. */
export interface ThemeStructure {
  /** JSON template names, e.g. ['index', 'product', 'customers/account'] */
  templates: string[]
  /** Section type -> JSON template names that place it */
  sectionTemplates: Map<string, string[]>
  /** Section types placed in section groups (header/footer) — present on every page */
  groupSections: Set<string>
}

export interface AutoLinkDecision {
  aliasPath: string
  reason: string
}

const RENDER_RE = /\{%-?\s*(?:render|include)\s+['"]([\w./-]+)['"]([^%]*?)-?%\}/g
const FOR_RE = /\{%-?\s*(for|endfor)\b/g
const SECTION_TAG_RE = /\{%-?\s*section\s+['"]([\w.-]+)['"]/g

// Dead zones: Liquid the runtime never executes and analysis must not see.
// Unclosed blocks strip to end-of-file — conservative: analyzing less can only
// suppress a promotion, never fabricate one.
const DEAD_ZONE_RE = new RegExp(
  [
    '\\{%-?\\s*comment\\s*-?%\\}[\\s\\S]*?(?:\\{%-?\\s*endcomment\\s*-?%\\}|$)',
    '\\{%-?\\s*raw\\s*-?%\\}[\\s\\S]*?(?:\\{%-?\\s*endraw\\s*-?%\\}|$)',
    '\\{%-?\\s*schema\\s*-?%\\}[\\s\\S]*?(?:\\{%-?\\s*endschema\\s*-?%\\}|$)',
    '\\{%-?\\s*#[\\s\\S]*?(?:%\\}|$)',
    '<!--[\\s\\S]*?(?:-->|$)',
  ].join('|'),
  'g',
)

function stripDeadZones(files: LiquidFile[]): LiquidFile[] {
  return files.map((file) => ({ ...file, content: file.content.replace(DEAD_ZONE_RE, '') }))
}

/**
 * Decides which inline entries should ship as a cached <link> instead, from static
 * analysis of the theme. Loop-rendered entries are always promoted: Liquid's {% render %}
 * sandbox makes intra-page dedupe impossible, so inline CSS duplicates per render while a
 * <link> is fetched once however many tags repeat. The minBytes gate applies only to the
 * caching heuristics (every page / shared sections / most templates), where the trade is
 * cached bytes vs one render-blocking request.
 */
export function decideAutoLinks(
  entries: Array<CssEntry & { bytes: number }>,
  files: LiquidFile[],
  theme: ThemeStructure,
  minBytes = 0,
): AutoLinkDecision[] {
  const stripped = stripDeadZones(files)
  const renderers = buildSnippetRenderers(stripped)
  const everyPageSections = collectEveryPageSections(stripped, theme)

  return entries.flatMap((entry) => {
    if (entry.link) return []
    const { roots, repeated } = traceToRoots(entry, stripped, renderers)
    if (repeated) {
      return [
        {
          aliasPath: entry.aliasPath,
          reason: 'rendered repeatedly on a page — inline CSS would duplicate per render',
        },
      ]
    }
    if (roots.size === 0 || entry.bytes < minBytes) return []
    const reason = decide(roots, everyPageSections, theme)
    return reason ? [{ aliasPath: entry.aliasPath, reason }] : []
  })
}

function decide(
  roots: Set<string>,
  everyPageSections: Set<string>,
  theme: ThemeStructure,
): string | null {
  const everyPage = [...roots].some(
    (root) => root.startsWith('layout/') || everyPageSections.has(sectionType(root)),
  )
  if (everyPage) return 'rendered on every page — a cached <link> ships once per session'

  if (roots.size >= 2) {
    return `rendered from ${roots.size} sections — shared CSS is worth caching as a <link>`
  }

  const covered = new Set(
    [...roots].flatMap((root) => theme.sectionTemplates.get(sectionType(root)) ?? []),
  )
  if (theme.templates.length >= 2 && covered.size * 2 > theme.templates.length) {
    return `used on ${covered.size} of ${theme.templates.length} templates — a cached <link> beats re-shipping per view`
  }
  return null
}

export interface TemplateWeight {
  /** JSON template name, e.g. 'product' */
  template: string
  /** Total bytes of inline CSS the template ships */
  bytes: number
}

/**
 * Total inline CSS bytes each JSON template ships, from the same render-graph analysis
 * as decideAutoLinks. Entries reachable from layout/ or a section group count toward
 * every template. Sorted heaviest first.
 */
export function computeTemplateWeights(
  entries: Array<CssEntry & { bytes: number }>,
  files: LiquidFile[],
  theme: ThemeStructure,
): TemplateWeight[] {
  if (theme.templates.length === 0) return []
  const stripped = stripDeadZones(files)
  const renderers = buildSnippetRenderers(stripped)
  const everyPageSections = collectEveryPageSections(stripped, theme)
  const weights = new Map(theme.templates.map((template) => [template, 0]))

  // ponytail: each entry counts once per template — a repeat-rendered inline entry
  // actually ships N copies; weight per-render if the undercount misleads in practice.
  for (const entry of entries) {
    if (entry.link || entry.bytes === 0) continue
    const { roots } = traceToRoots(entry, stripped, renderers)
    for (const template of templatesForRoots(roots, everyPageSections, theme)) {
      weights.set(template, (weights.get(template) ?? 0) + entry.bytes)
    }
  }

  return [...weights]
    .map(([template, bytes]) => ({ template, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
}

function templatesForRoots(
  roots: Set<string>,
  everyPageSections: Set<string>,
  theme: ThemeStructure,
): Set<string> {
  const everyPage = [...roots].some(
    (root) => root.startsWith('layout/') || everyPageSections.has(sectionType(root)),
  )
  if (everyPage) return new Set(theme.templates)

  const templates = new Set<string>()
  for (const root of roots) {
    if (root.startsWith('templates/')) {
      templates.add(root.slice('templates/'.length).replace(/\.liquid$/, ''))
    }
    for (const name of theme.sectionTemplates.get(sectionType(root)) ?? []) templates.add(name)
  }
  return templates
}

/** Section types present on every page: section groups plus {% section %} tags in layout/. */
function collectEveryPageSections(files: LiquidFile[], theme: ThemeStructure): Set<string> {
  const sections = new Set(theme.groupSections)
  for (const file of files) {
    if (!file.path.startsWith('layout/')) continue
    for (const match of file.content.matchAll(SECTION_TAG_RE)) sections.add(match[1])
  }
  return sections
}

/**
 * Walks the render graph upward from the files that render this entry to root files
 * (anything outside snippets/), flagging whether any step sits inside a loop.
 */
function traceToRoots(
  entry: CssEntry,
  files: LiquidFile[],
  renderers: Map<string, Renderer[]>,
): { roots: Set<string>; repeated: boolean } {
  const roots = new Set<string>()
  const queue: string[] = []
  const visited = new Set<string>()
  let repeated = false

  const enqueue = (filePath: string, loop: boolean) => {
    repeated ||= loop
    if (!filePath.startsWith('snippets/')) {
      roots.add(filePath)
      return
    }
    const name = snippetName(filePath)
    if (visited.has(name)) return
    visited.add(name)
    queue.push(name)
  }

  for (const file of files) {
    for (const index of aliasOccurrences(file.content, entry.aliasPath)) {
      enqueue(file.path, insideForLoop(file.content, index))
    }
  }

  while (queue.length > 0) {
    const name = queue.shift() as string
    for (const renderer of renderers.get(name) ?? []) enqueue(renderer.path, renderer.loop)
  }

  return { roots, repeated }
}

interface Renderer {
  path: string
  loop: boolean
}

/** snippet name -> files that {% render %} it, with a flag for loop renders */
function buildSnippetRenderers(files: LiquidFile[]): Map<string, Renderer[]> {
  const renderers = new Map<string, Renderer[]>()
  for (const file of files) {
    for (const match of file.content.matchAll(RENDER_RE)) {
      const loop = /^\s+for\s/.test(match[2]) || insideForLoop(file.content, match.index)
      const existing = renderers.get(match[1]) ?? []
      renderers.set(match[1], [...existing, { path: file.path, loop }])
    }
  }
  return renderers
}

function aliasOccurrences(content: string, aliasPath: string): number[] {
  const indexes: number[] = []
  for (const needle of [`@/${aliasPath}`, `~/${aliasPath}`]) {
    let from = 0
    while (true) {
      const index = content.indexOf(needle, from)
      if (index === -1) break
      indexes.push(index)
      from = index + needle.length
    }
  }
  return indexes
}

// ponytail: counts {% for %} depth only — tablerow/paginate repetition isn't tracked;
// add their tag names to FOR_RE if real themes render entries inside them.
function insideForLoop(content: string, index: number): boolean {
  let depth = 0
  for (const match of content.matchAll(FOR_RE)) {
    if (match.index >= index) break
    depth += match[1] === 'for' ? 1 : -1
  }
  return depth > 0
}

function snippetName(filePath: string): string {
  return path.posix.basename(filePath, '.liquid')
}

function sectionType(filePath: string): string {
  return filePath.startsWith('sections/') ? snippetName(filePath) : ''
}

/** Reads templates/*.json and sections/*.json (groups) under themeRoot. Malformed or missing files are skipped. */
export function readThemeStructure(themeRoot: string): ThemeStructure {
  const templates: string[] = []
  const sectionTemplates = new Map<string, string[]>()
  const groupSections = new Set<string>()

  for (const file of listJsonFiles(path.resolve(themeRoot, 'templates'))) {
    const parsed = parseJsonSafe(file.abs)
    if (!parsed) continue
    const name = file.rel.replace(/\.json$/, '')
    templates.push(name)
    for (const type of sectionTypes(parsed)) {
      sectionTemplates.set(type, [...(sectionTemplates.get(type) ?? []), name])
    }
  }

  for (const file of listJsonFiles(path.resolve(themeRoot, 'sections'))) {
    const parsed = parseJsonSafe(file.abs)
    if (!parsed) continue
    for (const type of sectionTypes(parsed)) groupSections.add(type)
  }

  return { templates, sectionTemplates, groupSections }
}

function sectionTypes(parsed: Record<string, unknown>): string[] {
  const sections = parsed.sections
  if (typeof sections !== 'object' || sections === null) return []
  return Object.values(sections)
    .map((section) => (section as { type?: unknown }).type)
    .filter((type): type is string => typeof type === 'string')
}

function listJsonFiles(dir: string): Array<{ abs: string; rel: string }> {
  if (!fs.existsSync(dir)) return []
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter((name) => String(name).endsWith('.json'))
    .map((name) => ({
      abs: path.join(dir, String(name)),
      rel: String(name).split(path.sep).join('/'),
    }))
}

function parseJsonSafe(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  computeTemplateWeights,
  decideAutoLinks,
  readThemeStructure,
  type LiquidFile,
  type ThemeStructure,
} from '../src/autolink.js'
import type { CssEntry } from '../src/generate.js'

function entry(aliasPath: string, link = false): CssEntry & { bytes: number } {
  return {
    key: `src/${aliasPath}`,
    aliasPath,
    files: [path.posix.basename(aliasPath).replace('.css', '-X.css')],
    link,
    bytes: 5000,
  }
}

function theme(overrides: Partial<ThemeStructure> = {}): ThemeStructure {
  return {
    templates: [],
    sectionTemplates: new Map(),
    groupSections: new Set(),
    ...overrides,
  }
}

const render = (alias: string) => `{% render 'vite-style', entry: '@/${alias}' %}`

describe('decideAutoLinks: loop detection', () => {
  it('links an entry rendered inside a {% for %} loop', () => {
    const files: LiquidFile[] = [
      {
        path: 'sections/grid.liquid',
        content: `{% for product in collection.products %}\n${render('snippets/l-card.css')}\n{% endfor %}`,
      },
    ]
    const decisions = decideAutoLinks([entry('snippets/l-card.css')], files, theme())
    expect(decisions).toHaveLength(1)
    expect(decisions[0].aliasPath).toBe('snippets/l-card.css')
    expect(decisions[0].reason).toContain('duplicate per render')
  })

  it('does not link an entry rendered after a closed loop', () => {
    const files: LiquidFile[] = [
      {
        path: 'sections/grid.liquid',
        content: `{% for p in c %}x{% endfor %}\n${render('snippets/l-card.css')}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-card.css')], files, theme())).toEqual([])
  })

  it("links an entry whose snippet is rendered with the `render 'x' for` form", () => {
    const files: LiquidFile[] = [
      { path: 'snippets/card.liquid', content: render('snippets/l-card.css') },
      {
        path: 'sections/grid.liquid',
        content: `{% render 'card' for collection.products as card %}`,
      },
    ]
    const decisions = decideAutoLinks([entry('snippets/l-card.css')], files, theme())
    expect(decisions).toHaveLength(1)
    expect(decisions[0].reason).toContain('duplicate per render')
  })

  it('links an entry whose snippet is rendered inside a loop elsewhere', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/card.liquid', content: render('snippets/l-card.css') },
      {
        path: 'sections/grid.liquid',
        content: `{% for p in c %}{% render 'card', product: p %}{% endfor %}`,
      },
    ]
    const decisions = decideAutoLinks([entry('snippets/l-card.css')], files, theme())
    expect(decisions).toHaveLength(1)
    expect(decisions[0].reason).toContain('duplicate per render')
  })
})

describe('decideAutoLinks: shared across sections', () => {
  it('links an entry rendered directly from two sections', () => {
    const files: LiquidFile[] = [
      { path: 'sections/hero.liquid', content: render('snippets/l-button.css') },
      { path: 'sections/footer-cta.liquid', content: render('snippets/l-button.css') },
    ]
    const decisions = decideAutoLinks([entry('snippets/l-button.css')], files, theme())
    expect(decisions).toHaveLength(1)
    expect(decisions[0].reason).toContain('2 sections')
  })

  it('links an entry whose snippet is rendered from two sections (transitive)', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/l-button.liquid', content: render('snippets/l-button.css') },
      { path: 'sections/hero.liquid', content: `{% render 'l-button' %}` },
      { path: 'sections/newsletter.liquid', content: `{% render 'l-button' %}` },
    ]
    const decisions = decideAutoLinks([entry('snippets/l-button.css')], files, theme())
    expect(decisions).toHaveLength(1)
  })

  it('leaves an entry rendered from a single low-coverage section inline', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/l-badge.liquid', content: render('snippets/l-badge.css') },
      { path: 'sections/hero.liquid', content: `{% render 'l-badge' %}` },
    ]
    const structure = theme({
      templates: ['index', 'product', 'collection'],
      sectionTemplates: new Map([['hero', ['index']]]),
    })
    expect(decideAutoLinks([entry('snippets/l-badge.css')], files, structure)).toEqual([])
  })
})

describe('decideAutoLinks: page coverage', () => {
  it('links an entry rendered from the layout', () => {
    const files: LiquidFile[] = [
      { path: 'layout/theme.liquid', content: render('base.css') },
    ]
    const decisions = decideAutoLinks([entry('base.css')], files, theme())
    expect(decisions).toHaveLength(1)
    expect(decisions[0].reason).toContain('every page')
  })

  it('links an entry rendered from a section placed in a section group', () => {
    const files: LiquidFile[] = [
      { path: 'sections/header.liquid', content: render('sections/header.css') },
    ]
    const structure = theme({ groupSections: new Set(['header']) })
    const decisions = decideAutoLinks([entry('sections/header.css')], files, structure)
    expect(decisions).toHaveLength(1)
    expect(decisions[0].reason).toContain('every page')
  })

  it("links an entry rendered from a section statically placed via {% section %} in the layout", () => {
    const files: LiquidFile[] = [
      { path: 'layout/theme.liquid', content: `{% section 'announcement' %}` },
      { path: 'sections/announcement.liquid', content: render('sections/announcement.css') },
    ]
    const decisions = decideAutoLinks([entry('sections/announcement.css')], files, theme())
    expect(decisions).toHaveLength(1)
    expect(decisions[0].reason).toContain('every page')
  })

  it('links an entry whose sections cover more than half the templates', () => {
    const files: LiquidFile[] = [
      { path: 'sections/hero.liquid', content: render('sections/hero.css') },
    ]
    const structure = theme({
      templates: ['index', 'product', 'collection'],
      sectionTemplates: new Map([['hero', ['index', 'product']]]),
    })
    const decisions = decideAutoLinks([entry('sections/hero.css')], files, structure)
    expect(decisions).toHaveLength(1)
    expect(decisions[0].reason).toContain('2 of 3 templates')
  })

  it('does not apply the majority rule to a single-template theme', () => {
    const files: LiquidFile[] = [
      { path: 'sections/hero.liquid', content: render('sections/hero.css') },
    ]
    const structure = theme({
      templates: ['index'],
      sectionTemplates: new Map([['hero', ['index']]]),
    })
    expect(decideAutoLinks([entry('sections/hero.css')], files, structure)).toEqual([])
  })
})

describe('decideAutoLinks: edges', () => {
  it('skips entries that are already links', () => {
    const files: LiquidFile[] = [
      { path: 'layout/theme.liquid', content: render('base.css') },
    ]
    expect(decideAutoLinks([entry('base.css', true)], files, theme())).toEqual([])
  })

  it('skips entries never rendered anywhere', () => {
    expect(decideAutoLinks([entry('snippets/l-orphan.css')], [], theme())).toEqual([])
  })

  it('survives snippet render cycles', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/a.liquid', content: `{% render 'b' %}\n${render('snippets/l-x.css')}` },
      { path: 'snippets/b.liquid', content: `{% render 'a' %}` },
    ]
    expect(decideAutoLinks([entry('snippets/l-x.css')], files, theme())).toEqual([])
  })
})

describe('decideAutoLinks: static repetition is not repetition (loops only)', () => {
  it('leaves an entry rendered twice statically in the same file inline', () => {
    const files: LiquidFile[] = [
      {
        path: 'sections/featured.liquid',
        content: `${render('snippets/l-card.css')}\n${render('snippets/l-card.css')}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-card.css')], files, theme())).toEqual([])
  })

  it('leaves an entry whose snippet is rendered twice statically by the same file inline', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/card.liquid', content: render('snippets/l-card.css') },
      {
        path: 'sections/featured.liquid',
        content: `{% render 'card', product: a %}\n{% render 'card', product: b %}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-card.css')], files, theme())).toEqual([])
  })

  it('does not flag a snippet rendered in both arms of an if/else', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/card.liquid', content: render('snippets/l-card.css') },
      {
        path: 'sections/featured.liquid',
        content: `{% if compact %}{% render 'card', compact: true %}{% else %}{% render 'card' %}{% endif %}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-card.css')], files, theme())).toEqual([])
  })

  it('does not flag two different snippets rendered once each', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/card.liquid', content: render('snippets/l-card.css') },
      {
        path: 'sections/featured.liquid',
        content: `{% render 'card' %}\n{% render 'other' %}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-card.css')], files, theme())).toEqual([])
  })
})

describe('decideAutoLinks: size gate', () => {
  const files: LiquidFile[] = [{ path: 'layout/theme.liquid', content: render('base.css') }]

  it('never promotes a small entry via the caching heuristics', () => {
    const small = { ...entry('base.css'), bytes: 2999 }
    expect(decideAutoLinks([small], files, theme(), 3000)).toEqual([])
  })

  it('promotes an entry at or above minBytes', () => {
    const big = { ...entry('base.css'), bytes: 3000 }
    expect(decideAutoLinks([big], files, theme(), 3000)).toHaveLength(1)
  })

  it('repetition bypasses the gate — a tiny loop-rendered entry is still promoted', () => {
    const loopFiles: LiquidFile[] = [
      {
        path: 'sections/grid.liquid',
        content: `{% for p in c %}${render('snippets/l-card.css')}{% endfor %}`,
      },
    ]
    const tiny = { ...entry('snippets/l-card.css'), bytes: 300 }
    const decisions = decideAutoLinks([tiny], loopFiles, theme(), 3000)
    expect(decisions).toHaveLength(1)
    expect(decisions[0].reason).toContain('duplicate per render')
  })
})

describe('readThemeStructure', () => {
  function makeTheme(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-style-autolink-'))
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel)
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, content)
    }
    return root
  }

  it('collects template names and section types from JSON templates', () => {
    const root = makeTheme({
      'templates/index.json': JSON.stringify({
        sections: { main: { type: 'hero' }, grid: { type: 'featured-grid' } },
        order: ['main', 'grid'],
      }),
      'templates/product.json': JSON.stringify({
        sections: { main: { type: 'main-product' } },
        order: ['main'],
      }),
      'templates/customers/account.json': JSON.stringify({
        sections: { main: { type: 'main-account' } },
        order: ['main'],
      }),
    })
    const structure = readThemeStructure(root)
    expect(structure.templates.sort()).toEqual(['customers/account', 'index', 'product'])
    expect(structure.sectionTemplates.get('hero')).toEqual(['index'])
    expect(structure.sectionTemplates.get('main-product')).toEqual(['product'])
  })

  it('collects section types from section group JSON files', () => {
    const root = makeTheme({
      'sections/header-group.json': JSON.stringify({
        type: 'header',
        sections: { h: { type: 'header' }, a: { type: 'announcement-bar' } },
        order: ['h', 'a'],
      }),
    })
    const structure = readThemeStructure(root)
    expect(structure.groupSections).toEqual(new Set(['header', 'announcement-bar']))
  })

  it('returns an empty structure for a theme without JSON templates and skips malformed JSON', () => {
    const root = makeTheme({ 'templates/broken.json': '{not json' })
    const structure = readThemeStructure(root)
    expect(structure.templates).toEqual([])
    expect(structure.sectionTemplates.size).toBe(0)
    expect(structure.groupSections.size).toBe(0)
  })
})

describe('computeTemplateWeights', () => {
  const sized = (aliasPath: string, bytes: number, link = false) => ({
    ...entry(aliasPath, link),
    bytes,
  })

  it('sums entry bytes onto the templates that place the rendering section', () => {
    const files: LiquidFile[] = [
      { path: 'sections/hero.liquid', content: render('sections/section.hero.css') },
      { path: 'sections/faq.liquid', content: render('sections/section.faq.css') },
    ]
    const weights = computeTemplateWeights(
      [sized('sections/section.hero.css', 3000), sized('sections/section.faq.css', 1000)],
      files,
      theme({
        templates: ['index', 'product'],
        sectionTemplates: new Map([
          ['hero', ['index']],
          ['faq', ['index', 'product']],
        ]),
      }),
    )
    expect(weights).toEqual([
      { template: 'index', bytes: 4000 },
      { template: 'product', bytes: 1000 },
    ])
  })

  it('counts entries reachable from layout/ or section groups on every template', () => {
    const files: LiquidFile[] = [
      { path: 'layout/theme.liquid', content: render('snippets/l-base.css') },
    ]
    const weights = computeTemplateWeights(
      [sized('snippets/l-base.css', 2000)],
      files,
      theme({ templates: ['index', 'product'] }),
    )
    expect(weights).toEqual([
      { template: 'index', bytes: 2000 },
      { template: 'product', bytes: 2000 },
    ])
  })

  it('follows the render graph through snippets to the placing section', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/card.liquid', content: render('snippets/l-card.css') },
      { path: 'sections/grid.liquid', content: "{% render 'card' %}" },
    ]
    const weights = computeTemplateWeights(
      [sized('snippets/l-card.css', 500)],
      files,
      theme({ templates: ['index'], sectionTemplates: new Map([['grid', ['index']]]) }),
    )
    expect(weights).toEqual([{ template: 'index', bytes: 500 }])
  })

  it('excludes link entries and entries with unknown size', () => {
    const files: LiquidFile[] = [
      { path: 'layout/theme.liquid', content: render('snippets/l-a.css') + render('snippets/l-b.css') },
    ]
    const weights = computeTemplateWeights(
      [sized('snippets/l-a.css', 2000, true), sized('snippets/l-b.css', 0)],
      files,
      theme({ templates: ['index'] }),
    )
    expect(weights).toEqual([{ template: 'index', bytes: 0 }])
  })

  it('returns [] for a theme without JSON templates', () => {
    const files: LiquidFile[] = [
      { path: 'layout/theme.liquid', content: render('snippets/l-a.css') },
    ]
    expect(computeTemplateWeights([sized('snippets/l-a.css', 100)], files, theme())).toEqual([])
  })
})

describe('decideAutoLinks: dead zones are ignored', () => {
  it('a {% for %} inside {% comment %} does not mark a later render as looped', () => {
    const files: LiquidFile[] = [
      {
        path: 'sections/hero.liquid',
        content: `{% comment %} example: {% for p in c %} {% endcomment %}\n${render('snippets/l-hero.css')}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-hero.css')], files, theme())).toEqual([])
  })

  it('a {% for %} inside {% schema %} does not mark a later render as looped', () => {
    const files: LiquidFile[] = [
      {
        path: 'sections/hero.liquid',
        content: `${render('snippets/l-hero.css')}\n{% schema %}\n{ "settings": [{ "info": "use {% for %} here" }] }\n{% endschema %}`,
      },
      {
        path: 'sections/other.liquid',
        content: `{% schema %} {% for %} {% endschema %}\n${render('snippets/l-hero.css')}`,
      },
    ]
    const decisions = decideAutoLinks([entry('snippets/l-hero.css')], files, theme())
    expect(decisions.map((d) => d.reason).join()).not.toContain('duplicate per render')
  })

  it('a commented-out loop render of a snippet does not promote its entry', () => {
    const files: LiquidFile[] = [
      { path: 'snippets/card.liquid', content: render('snippets/l-card.css') },
      {
        path: 'sections/featured.liquid',
        content: `{% comment %}{% render 'card' for collection.products %}{% endcomment %}\n{% render 'card' %}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-card.css')], files, theme())).toEqual([])
  })

  it('an alias mentioned in a layout {% comment %} does not create an every-page root', () => {
    const files: LiquidFile[] = [
      {
        path: 'layout/theme.liquid',
        content: `{% comment %} moved to section: @/snippets/l-badge.css {% endcomment %}`,
      },
      { path: 'sections/hero.liquid', content: render('snippets/l-badge.css') },
    ]
    const structure = theme({
      templates: ['index', 'product', 'collection'],
      sectionTemplates: new Map([['hero', ['index']]]),
    })
    expect(decideAutoLinks([entry('snippets/l-badge.css')], files, structure)).toEqual([])
  })

  it('an alias mentioned in an HTML comment is ignored', () => {
    const files: LiquidFile[] = [
      {
        path: 'layout/theme.liquid',
        content: `<!-- {% render 'vite-style', entry: '@/snippets/l-badge.css' %} -->`,
      },
      { path: 'sections/hero.liquid', content: render('snippets/l-badge.css') },
    ]
    const structure = theme({
      templates: ['index', 'product', 'collection'],
      sectionTemplates: new Map([['hero', ['index']]]),
    })
    expect(decideAutoLinks([entry('snippets/l-badge.css')], files, structure)).toEqual([])
  })

  it('an alias mentioned in a {% # %} inline comment is ignored', () => {
    const files: LiquidFile[] = [
      {
        path: 'layout/theme.liquid',
        content: `{% # style moved: @/snippets/l-badge.css %}`,
      },
      { path: 'sections/hero.liquid', content: render('snippets/l-badge.css') },
    ]
    const structure = theme({
      templates: ['index', 'product', 'collection'],
      sectionTemplates: new Map([['hero', ['index']]]),
    })
    expect(decideAutoLinks([entry('snippets/l-badge.css')], files, structure)).toEqual([])
  })

  it('an unclosed {% comment %} strips to end of file (conservative)', () => {
    const files: LiquidFile[] = [
      {
        path: 'sections/hero.liquid',
        content: `{% comment %} {% for p in c %} forgot to close\n${render('snippets/l-hero.css')}`,
      },
    ]
    expect(decideAutoLinks([entry('snippets/l-hero.css')], files, theme())).toEqual([])
  })

  it('computeTemplateWeights ignores dead zones too', () => {
    const files: LiquidFile[] = [
      {
        path: 'layout/theme.liquid',
        content: `{% comment %} ${render('snippets/l-a.css')} {% endcomment %}`,
      },
    ]
    const weights = computeTemplateWeights(
      [{ ...entry('snippets/l-a.css'), bytes: 2000 }],
      files,
      theme({ templates: ['index'] }),
    )
    expect(weights).toEqual([{ template: 'index', bytes: 0 }])
  })
})

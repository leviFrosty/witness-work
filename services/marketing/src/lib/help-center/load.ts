import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import yaml from 'js-yaml'
import {
  DEFAULT_LOCALE,
  HELP_LOCALES,
  isHelpLocale,
  type HelpLocale,
} from './locales.ts'
import {
  AnswerMarkdownError,
  docToPlainText,
  markdownToDoc,
} from './markdown.ts'
import { helpPageUrl, SITE_URL } from './paths.ts'
import {
  HELP_PLATFORMS,
  type HelpEntry,
  type HelpPlatform,
  type RichTextDoc,
} from './types.ts'

/**
 * Content layout (see docs/help-center.md):
 *
 * Content/help/order.json category + question order
 * content/help/<locale>/categories.json category titles
 * content/help/<locale>/ui.json page chrome strings
 * content/help/<locale>/<category>/<slug>.mdx one question
 *
 * English files carry a question's metadata; translations carry only `id` and
 * `title`, so metadata can't drift between languages.
 */
export const HELP_CONTENT_DIR = 'content/help'

type Translation = {
  question: string
  markdown: string
  doc: RichTextDoc
  plainText: string
}

export type HelpQuestion = {
  id: string
  slug: string
  category: string
  platforms: HelpPlatform[]
  pinned: boolean
  related: number[]
  minAppVersion?: string
  translations: Partial<Record<HelpLocale, Translation>>
}

export type HelpCenter = {
  categories: string[]
  questions: HelpQuestion[]
  categoryTitles: Partial<Record<HelpLocale, Record<string, string>>>
  ui: Partial<Record<HelpLocale, Record<string, string>>>
}

export class HelpCenterError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(
      `Help Center content has ${problems.length} problem(s):\n` +
        problems.map((problem) => `  - ${problem}`).join('\n')
    )
    this.problems = problems
  }
}

/**
 * `timeRollover` → `time-rollover`, `iCloudSync` → `icloud-sync`. A single
 * lowercase letter before a capital (iCloud, iPad) stays one word.
 */
export function slugForId(id: string): string {
  return (
    id
      .replace(/^([a-z])(?=[A-Z][a-z])/, (letter) => letter + '\u0000')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      // The NUL marker from the first step, which ids can't contain.
      // oxlint-disable-next-line no-control-regex
      .replace(/\u0000-?/g, '')
      .toLowerCase()
  )
}

const ID_PATTERN = /^[a-z][a-zA-Z0-9]*$/
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/
const ENGLISH_KEYS = new Set([
  'id',
  'title',
  'category',
  'platforms',
  'pinned',
  'related',
  'minAppVersion',
])
const TRANSLATION_KEYS = new Set(['id', 'title'])

/** Page strings every locale falls back to, so English must have them all. */
export const UI_KEYS = [
  'helpCenter',
  'intro',
  'searchPlaceholder',
  'topQuestions',
  'allQuestions',
  'noMatches',
  'noResults',
  'searching',
  'clearSearch',
  'stillNeedHelp',
  'stillNeedHelpDescription',
  'emailUs',
  'bugReport',
  'featureRequest',
  'device',
  'language',
  'all',
  'copyLink',
  'web',
  'iosOnly',
  'androidOnly',
  'webOnly',
  'appsOnly',
  'notTranslated',
] as const

export type UiKey = (typeof UI_KEYS)[number]

function splitFrontMatter(raw: string): { data: unknown; body: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (!match) return null
  return { data: yaml.load(match[1]!), body: match[2]! }
}

async function readJson<T>(
  file: string,
  problems: string[]
): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch (error) {
    problems.push(`${file}: ${(error as Error).message}`)
    return undefined
  }
}

async function listMdx(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listMdx(full)))
    else if (entry.name.endsWith('.mdx')) out.push(full)
  }
  return out
}

type Parsed = {
  file: string
  locale: HelpLocale
  folder: string
  fileSlug: string
  data: Record<string, unknown>
  body: string
}

/** Reads and validates all Help Center content. Throws `HelpCenterError`. */
export async function loadHelpCenter(
  root: string = process.cwd()
): Promise<HelpCenter> {
  const base = path.join(root, HELP_CONTENT_DIR)
  const problems: string[] = []
  const rel = (file: string) => path.relative(root, file)

  const order = await readJson<{ categories: string[]; questions: string[] }>(
    path.join(base, 'order.json'),
    problems
  )
  const categories = order?.categories ?? []
  const categorySet = new Set(categories)

  const categoryTitles: HelpCenter['categoryTitles'] = {}
  const ui: HelpCenter['ui'] = {}
  const parsed: Parsed[] = []

  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (!isHelpLocale(entry.name)) {
      problems.push(
        `${HELP_CONTENT_DIR}/${entry.name}: not a locale (${HELP_LOCALES.join(', ')})`
      )
      continue
    }
    const locale = entry.name
    const dir = path.join(base, locale)
    const titles = await readJson<Record<string, string>>(
      path.join(dir, 'categories.json'),
      problems
    )
    if (titles) categoryTitles[locale] = titles
    const strings = await readJson<Record<string, string>>(
      path.join(dir, 'ui.json'),
      problems
    )
    if (strings) ui[locale] = strings

    for (const file of await listMdx(dir)) {
      const parts = path.relative(dir, file).split(path.sep)
      if (parts.length !== 2) {
        problems.push(
          `${rel(file)}: questions live at <locale>/<category>/<slug>.mdx`
        )
        continue
      }
      const split = splitFrontMatter(await readFile(file, 'utf8'))
      if (!split || typeof split.data !== 'object' || split.data === null) {
        problems.push(`${rel(file)}: missing front matter`)
        continue
      }
      parsed.push({
        file: rel(file),
        locale,
        folder: parts[0]!,
        fileSlug: parts[1]!.replace(/\.mdx$/, ''),
        data: split.data as Record<string, unknown>,
        body: split.body,
      })
    }
  }

  for (const key of UI_KEYS) {
    if (!ui[DEFAULT_LOCALE]?.[key]) {
      problems.push(
        `${HELP_CONTENT_DIR}/${DEFAULT_LOCALE}/ui.json: missing "${key}"`
      )
    }
  }

  const english = categoryTitles[DEFAULT_LOCALE] ?? {}
  for (const category of categories) {
    if (!english[category]) {
      problems.push(
        `${HELP_CONTENT_DIR}/${DEFAULT_LOCALE}/categories.json: no title for "${category}"`
      )
    }
  }

  const questions = new Map<string, HelpQuestion>()
  const slugs = new Map<string, string>()

  const translate = (item: Parsed): Translation | undefined => {
    const title = item.data.title
    if (typeof title !== 'string' || !title.trim()) {
      problems.push(`${item.file}: "title" (the question) is required`)
      return undefined
    }
    try {
      const doc = markdownToDoc(item.body, SITE_URL)
      return {
        question: title.trim(),
        markdown: item.body.trim(),
        doc,
        plainText: docToPlainText(doc),
      }
    } catch (error) {
      if (error instanceof AnswerMarkdownError) {
        problems.push(`${item.file}: ${error.message}`)
        return undefined
      }
      throw error
    }
  }

  // English first: it defines every question.
  for (const item of parsed.filter((p) => p.locale === DEFAULT_LOCALE)) {
    const { data, file } = item
    for (const key of Object.keys(data)) {
      if (!ENGLISH_KEYS.has(key))
        problems.push(`${file}: unknown front matter "${key}"`)
    }
    const id = data.id
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      problems.push(`${file}: "id" must be camelCase, like timeRollover`)
      continue
    }
    if (questions.has(id)) {
      problems.push(`${file}: duplicate id "${id}"`)
      continue
    }
    const slug = slugForId(id)
    if (item.fileSlug !== slug)
      problems.push(`${file}: file must be named ${slug}.mdx for id "${id}"`)
    if (slugs.has(slug))
      problems.push(
        `${file}: slug "${slug}" is also used by "${slugs.get(slug)}"`
      )
    slugs.set(slug, id)

    const category = data.category
    if (typeof category !== 'string' || !categorySet.has(category)) {
      problems.push(
        `${file}: unknown category "${String(category)}" (${categories.join(', ')})`
      )
      continue
    }
    if (item.folder !== category)
      problems.push(`${file}: belongs in ${DEFAULT_LOCALE}/${category}/`)

    let platforms: HelpPlatform[] = [...HELP_PLATFORMS]
    if (data.platforms !== undefined) {
      const value = data.platforms
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        new Set(value).size !== value.length ||
        !value.every((p) => HELP_PLATFORMS.includes(p as HelpPlatform))
      ) {
        problems.push(
          `${file}: "platforms" must be a list of ios, android and/or web`
        )
      } else {
        platforms = HELP_PLATFORMS.filter((p) => value.includes(p))
      }
    }
    if (data.pinned !== undefined && typeof data.pinned !== 'boolean') {
      problems.push(`${file}: "pinned" must be true or false`)
    }
    const related = data.related ?? []
    if (
      !Array.isArray(related) ||
      !related.every((n) => Number.isInteger(n) && n > 0)
    ) {
      problems.push(`${file}: "related" must be a list of GitHub issue numbers`)
    }
    const minAppVersion = data.minAppVersion
    if (
      minAppVersion !== undefined &&
      (typeof minAppVersion !== 'string' ||
        !VERSION_PATTERN.test(minAppVersion))
    ) {
      problems.push(
        `${file}: "minAppVersion" must look like 4.12.0 (quote it in YAML)`
      )
    }

    const translation = translate(item)
    questions.set(id, {
      id,
      slug,
      category,
      platforms,
      pinned: data.pinned === true,
      related: Array.isArray(related) ? (related as number[]) : [],
      ...(typeof minAppVersion === 'string' ? { minAppVersion } : {}),
      translations: translation ? { [DEFAULT_LOCALE]: translation } : {},
    })
  }

  for (const item of parsed.filter((p) => p.locale !== DEFAULT_LOCALE)) {
    const { data, file } = item
    for (const key of Object.keys(data)) {
      if (!TRANSLATION_KEYS.has(key)) {
        problems.push(
          `${file}: translations only set id and title; "${key}" comes from the English file`
        )
      }
    }
    const question =
      typeof data.id === 'string' ? questions.get(data.id) : undefined
    if (!question) {
      problems.push(`${file}: id "${String(data.id)}" has no English question`)
      continue
    }
    if (question.translations[item.locale]) {
      problems.push(`${file}: duplicate id "${question.id}" in ${item.locale}`)
      continue
    }
    if (item.folder !== question.category || item.fileSlug !== question.slug) {
      problems.push(
        `${file}: must be ${item.locale}/${question.category}/${question.slug}.mdx`
      )
    }
    const translation = translate(item)
    if (translation) question.translations[item.locale] = translation
  }

  const ordered: HelpQuestion[] = []
  const seen = new Set<string>()
  for (const id of order?.questions ?? []) {
    const question = questions.get(id)
    if (!question) {
      problems.push(
        `${HELP_CONTENT_DIR}/order.json: "${id}" has no English question`
      )
    } else if (seen.has(id)) {
      problems.push(`${HELP_CONTENT_DIR}/order.json: "${id}" is listed twice`)
    } else {
      seen.add(id)
      ordered.push(question)
    }
  }
  for (const id of questions.keys()) {
    if (!seen.has(id))
      problems.push(
        `${HELP_CONTENT_DIR}/order.json: add "${id}" to "questions"`
      )
  }

  if (problems.length) throw new HelpCenterError(problems)
  return { categories, questions: ordered, categoryTitles, ui }
}

/** A question in `locale`, falling back to English with `fallback: true`. */
export function entryFor(
  question: HelpQuestion,
  locale: HelpLocale
): HelpEntry {
  const own = question.translations[locale]
  const text = own ?? question.translations[DEFAULT_LOCALE]!
  return {
    id: question.id,
    slug: question.slug,
    category: question.category,
    platforms: question.platforms,
    pinned: question.pinned,
    related: question.related,
    ...(question.minAppVersion
      ? { minAppVersion: question.minAppVersion }
      : {}),
    question: text.question,
    doc: text.doc,
    plainText: text.plainText,
    url: new URL(
      helpPageUrl(locale, question.category, question.slug),
      SITE_URL
    ).href,
    ...(own ? {} : { fallback: true as const }),
  }
}

export function categoryTitle(
  center: HelpCenter,
  locale: HelpLocale,
  category: string
): string {
  return (
    center.categoryTitles[locale]?.[category] ??
    center.categoryTitles[DEFAULT_LOCALE]?.[category] ??
    category
  )
}

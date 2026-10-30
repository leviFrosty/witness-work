import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  categoryTitle,
  entryFor,
  loadHelpCenter,
  type HelpCenter,
} from './load.ts'
import { DEFAULT_LOCALE, HELP_LOCALES, type HelpLocale } from './locales.ts'
import { PRIVACY_PATH, supportPath, TERMS_PATH } from '../paths.ts'
import { SUPPORT_EMAIL, GITHUB_ISSUES } from '../links.ts'
import {
  bundlePath,
  bundleUrl,
  HELP_BASE,
  helpPageUrl,
  MANIFEST_PATH,
  SITE_URL,
} from './paths.ts'
import type { HelpBundle, HelpManifest } from './types.ts'

/**
 * Files the build writes into `public/` (gitignored), served as-is by the site:
 *
 * /help/bundle/manifest.json, <locale>.json /help/<…page>.md Markdown alternate
 * of each question /llms.txt, /llms-full.txt
 */
export const GENERATED_PATHS = [
  `public${HELP_BASE}`,
  'public/llms.txt',
  'public/llms-full.txt',
]

export function buildBundle(
  center: HelpCenter,
  locale: HelpLocale,
  generatedAt: string
): HelpBundle {
  const categories = center.categories.map((id) => ({
    id,
    title: categoryTitle(center, locale, id),
  }))
  const entries = center.questions.map((question) => entryFor(question, locale))
  const hash = createHash('sha256')
    .update(JSON.stringify({ categories, entries }))
    .digest('hex')
    .slice(0, 16)
  return { schemaVersion: 1, locale, hash, generatedAt, categories, entries }
}

function questionMarkdown(
  center: HelpCenter,
  locale: HelpLocale,
  index: number
) {
  const question = center.questions[index]!
  const own = question.translations[locale]
  const text = own ?? question.translations[DEFAULT_LOCALE]!
  const platforms =
    question.platforms.length === 1
      ? `\n\nApplies to: ${question.platforms[0] === 'ios' ? 'iOS (iPhone and iPad)' : 'Android'}`
      : ''
  return `# ${text.question}\n\n${text.markdown}${platforms}\n`
}

const overview = () => `# WitnessWork

> WitnessWork is a free field service assistant for Jehovah's Witnesses on iPhone, iPad, and Android. It helps publishers schedule service time toward their goals, track contacts and return visits, and see their progress without mental math.

- Platforms: iOS and iPadOS (App Store), Android (Google Play). Companion apps for Apple Watch and Wear OS. Some features, such as iCloud Sync, widgets, Live Activities, and Siri, are iOS-only; Android syncs with Google Drive instead of iCloud.
- Price: free, with no ads. An optional Supporter subscription funds development and adds extras such as Device Sync and custom accent colors; every core feature stays free.
- Privacy: records stay on the device by default. Cloud Sync is end-to-end encrypted; iCloud and Google Drive sync use the person's own storage. Some features use an anonymous account with no name, email, or phone number. Details: ${SITE_URL}${PRIVACY_PATH}
- Languages: 19 (Arabic, Bemba, Chinese Simplified and Traditional, Dutch, English, French, German, Italian, Japanese, Kinyarwanda, Korean, Portuguese Brazil and Portugal, Russian, Spanish, Swahili, Ukrainian, Vietnamese).
- Support: ${SITE_URL}${HELP_BASE} (Help Center), ${SUPPORT_EMAIL} (private support), ${GITHUB_ISSUES} (bugs and feature requests). All of it: ${SITE_URL}${supportPath('en-US')}

## Links

- [Website](${SITE_URL}/)
- [Help Center](${SITE_URL}${HELP_BASE}): answers to common questions, in 19 languages
- [All Help Center answers in one file](${SITE_URL}/llms-full.txt)
- [App Store](https://apps.apple.com/us/app/witnesswork/id6469723047)
- [Google Play](https://play.google.com/store/apps/details?id=com.leviwilkerson.jwtime)
- [Support](${SITE_URL}${supportPath('en-US')})
- [Privacy Policy](${SITE_URL}${PRIVACY_PATH})
- [Terms of Service](${SITE_URL}${TERMS_PATH})
- [Source code](https://github.com/leviFrosty/witness-work)
`

function llmsIndex(center: HelpCenter): string {
  const sections = center.categories.map((category) => {
    const lines = center.questions
      .filter((q) => q.category === category)
      .map((q) => {
        const text = q.translations[DEFAULT_LOCALE]!
        const scope =
          q.platforms.length === 1
            ? ` (${q.platforms[0] === 'ios' ? 'iOS' : 'Android'} only)`
            : ''
        return `- [${text.question}](${SITE_URL}${helpPageUrl(DEFAULT_LOCALE, q.category, q.slug)}.md)${scope}`
      })
    return `### ${categoryTitle(center, DEFAULT_LOCALE, category)}\n\n${lines.join('\n')}`
  })
  return `${overview()}\n## Help Center\n\nEach answer is also available as Markdown at its page URL plus \`.md\`. Pages in other languages live under ${SITE_URL}${HELP_BASE}/<locale>/ (for example \`/pt-BR/\`).\n\n${sections.join('\n\n')}\n`
}

function llmsFull(center: HelpCenter): string {
  const body = center.questions.map((q, index) => {
    const url = `${SITE_URL}${helpPageUrl(DEFAULT_LOCALE, q.category, q.slug)}`
    return questionMarkdown(center, DEFAULT_LOCALE, index).replace(
      /^# (.*)$/m,
      `## $1\n\nSource: ${url}`
    )
  })
  return `# WitnessWork Help Center\n\nAll answers from ${SITE_URL}${HELP_BASE}, in English.\n\n${body.join('\n')}`
}

async function write(file: string, contents: string) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, contents)
}

/** Validates the content and writes every generated Help Center file. */
export async function generateHelpCenterAssets(root: string = process.cwd()) {
  const center = await loadHelpCenter(root)
  const generatedAt = new Date().toISOString()
  const publicDir = path.join(root, 'public')
  for (const target of GENERATED_PATHS) {
    await rm(path.join(root, target), { recursive: true, force: true })
  }

  const manifest: HelpManifest = { schemaVersion: 1, generatedAt, locales: {} }
  for (const locale of HELP_LOCALES) {
    const bundle = buildBundle(center, locale, generatedAt)
    await write(
      path.join(publicDir, bundlePath(locale)),
      JSON.stringify(bundle)
    )
    manifest.locales[locale] = {
      hash: bundle.hash,
      count: bundle.entries.length,
      path: bundleUrl(locale),
    }
    for (const [index, q] of center.questions.entries()) {
      await write(
        path.join(publicDir, `${helpPageUrl(locale, q.category, q.slug)}.md`),
        questionMarkdown(center, locale, index)
      )
    }
  }
  await write(
    path.join(publicDir, MANIFEST_PATH),
    JSON.stringify(manifest, null, 2)
  )
  await write(path.join(publicDir, 'llms.txt'), llmsIndex(center))
  await write(path.join(publicDir, 'llms-full.txt'), llmsFull(center))
  return { center, manifest }
}

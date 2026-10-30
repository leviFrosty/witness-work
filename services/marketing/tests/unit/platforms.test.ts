import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  HelpCenterError,
  entryFor,
  loadHelpCenter,
} from '../../src/lib/help-center/load.ts'
import {
  platformAttr,
  platformNoteKey,
  platformScope,
  platformScopeShort,
} from '../../src/lib/help-center/platforms.ts'
import { HELP_PLATFORMS } from '../../src/lib/help-center/types.ts'

const FIXTURE = path.join(import.meta.dirname, 'fixtures/help')
const QUESTION = 'content/help/en-US/general/contact-support.mdx'

/** Loads the fixture with contact-support's `platforms` line replaced. */
async function load(platformsLine: string | null) {
  const root = await mkdtemp(path.join(tmpdir(), 'ww-help-platforms-'))
  await cp(FIXTURE, root, { recursive: true })
  const file = path.join(root, QUESTION)
  const source = (await readFile(file, 'utf8')).replace(
    /^platforms: .*\n/m,
    platformsLine === null ? '' : `${platformsLine}\n`
  )
  await writeFile(file, source)
  return loadHelpCenter(root)
}

const platformsOf = (center: Awaited<ReturnType<typeof load>>) =>
  center.questions.find((q) => q.id === 'contactSupport')!.platforms

describe('platforms front matter', () => {
  test('the platforms are iOS, Android and the web', () => {
    expect(HELP_PLATFORMS).toEqual(['ios', 'android', 'web'])
  })

  test('omitting platforms means every platform', async () => {
    expect(platformsOf(await load(null))).toEqual(['ios', 'android', 'web'])
  })

  test('accepts web alone and any subset, in a fixed order', async () => {
    expect(platformsOf(await load('platforms: [web]'))).toEqual(['web'])
    expect(platformsOf(await load('platforms: [web, ios]'))).toEqual([
      'ios',
      'web',
    ])
    expect(platformsOf(await load('platforms: [android, ios]'))).toEqual([
      'ios',
      'android',
    ])
    expect(platformsOf(await load('platforms: [web, android, ios]'))).toEqual([
      'ios',
      'android',
      'web',
    ])
  })

  test.each([
    ['an empty list', 'platforms: []'],
    ['an unknown platform', 'platforms: [ios, desktop]'],
    ['a repeated platform', 'platforms: [web, web]'],
    ['a bare string', 'platforms: web'],
  ])('rejects %s and names the valid values', async (_, line) => {
    const error = await load(line).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HelpCenterError)
    expect((error as HelpCenterError).message).toContain(
      '"platforms" must be a list of ios, android and/or web'
    )
  })

  test('the bundle entry always carries an explicit platforms array', async () => {
    const center = await load(null)
    const entry = entryFor(center.questions[0]!, 'en-US')
    expect(entry.platforms).toEqual(['ios', 'android', 'web'])
    const web = entryFor(
      (await load('platforms: [web]')).questions[1]!,
      'en-US'
    )
    expect(web.platforms).toEqual(['web'])
  })
})

describe('how an answer is scoped on the site', () => {
  test('the filter attribute lists the platforms, and is absent for all', () => {
    expect(platformAttr(['ios', 'android', 'web'])).toBeUndefined()
    expect(platformAttr(['web'])).toBe('web')
    expect(platformAttr(['ios', 'web'])).toBe('ios web')
  })

  test('the note under a question', () => {
    expect(platformNoteKey(['ios'])).toBe('iosOnly')
    expect(platformNoteKey(['android'])).toBe('androidOnly')
    expect(platformNoteKey(['web'])).toBe('webOnly')
    expect(platformNoteKey(['ios', 'android'])).toBe('appsOnly')
    expect(platformNoteKey(['ios', 'web'])).toBeNull()
    expect(platformNoteKey(['ios', 'android', 'web'])).toBeNull()
  })

  test('"Applies to" in the Markdown alternates', () => {
    expect(platformScope(['ios', 'android', 'web'])).toBeNull()
    expect(platformScope(['ios'])).toBe('iOS (iPhone and iPad)')
    expect(platformScope(['android'])).toBe('Android')
    expect(platformScope(['web'])).toBe('WitnessWork on the web')
    expect(platformScope(['ios', 'android'])).toBe('iOS and Android apps')
    expect(platformScope(['ios', 'web'])).toBe(
      'iOS (iPhone and iPad) and WitnessWork on the web'
    )
    expect(platformScope(['android', 'web'])).toBe(
      'Android and WitnessWork on the web'
    )
  })

  test('the scope after a link in llms.txt', () => {
    expect(platformScopeShort(['ios', 'android', 'web'])).toBeNull()
    expect(platformScopeShort(['ios'])).toBe('iOS only')
    expect(platformScopeShort(['android'])).toBe('Android only')
    expect(platformScopeShort(['web'])).toBe('web only')
    expect(platformScopeShort(['ios', 'android'])).toBe('iOS and Android only')
    expect(platformScopeShort(['android', 'web'])).toBe('Android and web only')
  })
})

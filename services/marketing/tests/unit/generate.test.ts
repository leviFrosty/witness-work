import { cp, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type {
  HelpBundle,
  HelpManifest,
} from '../../src/lib/help-center/types.ts'

const FIXTURE = path.join(import.meta.dirname, 'fixtures/help')

/** Generates the fixture's Help Center files for one site environment. */
async function generate(env?: string) {
  vi.resetModules()
  if (env) vi.stubEnv('WW_SITE_ENV', env)
  const root = await mkdtemp(path.join(tmpdir(), 'ww-help-'))
  await cp(FIXTURE, root, { recursive: true })
  const { generateHelpCenterAssets } = await import(
    '../../src/lib/help-center/generate.ts'
  )
  await generateHelpCenterAssets(root)
  const read = (file: string) =>
    readFile(path.join(root, 'public', file), 'utf8')
  const json = async <T>(file: string) => JSON.parse(await read(file)) as T
  return { read, json }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Help Center bundle', () => {
  test('the manifest lists every bundle by absolute URL', async () => {
    const { json } = await generate()
    const manifest = await json<HelpManifest>('help/bundle/manifest.json')
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.locales['en-US']).toMatchObject({
      count: 2,
      path: 'https://witnesswork.app/help/bundle/en-US.json',
    })
    expect(manifest.locales['de-DE']!.path).toBe(
      'https://witnesswork.app/help/bundle/de-DE.json'
    )
    expect(Object.keys(manifest.locales)).toHaveLength(19)
  })

  test('entries link to their pages under /help', async () => {
    const { json } = await generate()
    const english = await json<HelpBundle>('help/bundle/en-US.json')
    expect(english.entries.map((entry) => entry.url)).toEqual([
      'https://witnesswork.app/help/time/time-rollover',
      'https://witnesswork.app/help/general/contact-support',
    ])
    const german = await json<HelpBundle>('help/bundle/de-DE.json')
    expect(german.entries[0]).toMatchObject({
      question: 'Wird meine Zeit übertragen?',
      url: 'https://witnesswork.app/help/de-DE/time/time-rollover',
    })
    expect(german.entries[0]!.fallback).toBeUndefined()
    expect(german.entries[1]).toMatchObject({
      question: 'How do I contact support?',
      url: 'https://witnesswork.app/help/de-DE/general/contact-support',
      fallback: true,
    })
  })

  test('site paths in answers become absolute links on the site', async () => {
    const { json } = await generate()
    const english = await json<HelpBundle>('help/bundle/en-US.json')
    expect(english.entries[0]!.plainText).toBe(
      'Partial hours roll over. See the privacy policy (https://witnesswork.app/privacy) or the support page (https://witnesswork.app/support).'
    )
  })

  test('the staging build points everything at dev.witnesswork.app', async () => {
    const { json, read } = await generate('dev')
    const manifest = await json<HelpManifest>('help/bundle/manifest.json')
    expect(manifest.locales['ar']!.path).toBe(
      'https://dev.witnesswork.app/help/bundle/ar.json'
    )
    const english = await json<HelpBundle>('help/bundle/en-US.json')
    expect(english.entries[0]!.url).toBe(
      'https://dev.witnesswork.app/help/time/time-rollover'
    )
    expect(await read('llms.txt')).toContain(
      'https://dev.witnesswork.app/help/time/time-rollover.md'
    )
  })
})

describe('Markdown alternates and llms.txt', () => {
  test('each question has a .md alternate in every locale', async () => {
    const { read } = await generate()
    expect(await read('help/time/time-rollover.md')).toBe(
      '# Does my time roll over?\n\nPartial hours roll over. See the [privacy policy](/privacy) or\n[the support page](/support).\n'
    )
    expect(await read('help/de-DE/time/time-rollover.md')).toMatch(
      /^# Wird meine Zeit übertragen\?/
    )
    expect(await read('help/de-DE/general/contact-support.md')).toMatch(
      /^# How do I contact support\?[\s\S]*Applies to: Android\n$/
    )
  })

  test('llms.txt indexes the answers on the new site', async () => {
    const { read } = await generate()
    const index = await read('llms.txt')
    expect(index).toMatch(/^# WitnessWork\n/)
    expect(index).toContain(
      '- [Does my time roll over?](https://witnesswork.app/help/time/time-rollover.md)'
    )
    expect(index).toContain('support@witnesswork.app')
    expect(index).toContain('https://witnesswork.app/privacy')
    expect(index).not.toContain('leviwilkerson.com')
    const full = await read('llms-full.txt')
    expect(full).toContain(
      '## Does my time roll over?\n\nSource: https://witnesswork.app/help/time/time-rollover'
    )
  })
})

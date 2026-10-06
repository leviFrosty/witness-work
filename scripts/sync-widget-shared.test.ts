import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  l10nKeys,
  readLocales,
  shortcutCatalog,
  stringCatalog,
} from './sync-widget-shared.mjs'
import keys from '../src/app/watch/watchStringKeys.json'

type Catalog = {
  strings: Record<
    string,
    {
      localizations: Record<
        string,
        { stringUnit: { state: string; value: string } }
      >
    }
  >
}
const parse = (catalog: string) => JSON.parse(catalog) as Catalog

const swift = `
  AppShortcut(
    intent: AddServiceTimeIntent(),
    phrases: [
      "Add time in \\(.applicationName)",
      "Log time in \\(.applicationName)",
    ],
    shortTitle: "addTime",
    systemImageName: "plus.circle")
`
const english = {
  siriShortcutAddTime: 'Add time in ${applicationName}',
  siriShortcutLogTime: 'Log time in ${applicationName}',
}
const phraseKeys = Object.keys(english)
const problems = (translations: Record<string, string>) =>
  shortcutCatalog(
    { 'en-US': english, 'es-ES': translations },
    phraseKeys,
    swift
  ).problems

describe('stringCatalog', () => {
  it('uses English, marked for review, until a language has a translation', () => {
    const catalog = parse(
      stringCatalog(
        {
          'en-US': { timeAdded: 'Added Time', mileage: { car: 'Car' } },
          'es-ES': { timeAdded: 'Tiempo agregado', mileage: { car: ' ' } },
          'ja-JP': {},
        },
        ['timeAdded', 'mileage.car']
      )
    )

    expect(catalog.strings.timeAdded.localizations).toEqual({
      en: { stringUnit: { state: 'translated', value: 'Added Time' } },
      es: { stringUnit: { state: 'translated', value: 'Tiempo agregado' } },
      ja: { stringUnit: { state: 'needs_review', value: 'Added Time' } },
    })
    expect(catalog.strings['mileage.car'].localizations.es.stringUnit).toEqual({
      state: 'needs_review',
      value: 'Car',
    })
  })

  it('fails on a string English lacks', () => {
    expect(() => stringCatalog({ 'en-US': {} }, ['timeAdded'])).toThrow(
      'src/locales/en-US.json has no string "timeAdded"'
    )
  })

  it('gives every language text for every watch and Siri string', async () => {
    const locales = readLocales(path.join(__dirname, '../src/locales'))
    const catalog = parse(
      stringCatalog(locales, [...keys.strings, ...keys.intentStrings])
    )

    for (const { localizations } of Object.values(catalog.strings)) {
      expect(Object.keys(localizations)).toHaveLength(
        Object.keys(locales).length
      )
      for (const { stringUnit } of Object.values(localizations)) {
        expect(stringUnit.value.trim()).not.toBe('')
      }
    }
  })
})

describe('l10nKeys', () => {
  it('finds literal keys, including both sides of a choice', () => {
    expect([
      ...l10nKeys(`
        Text(L10n.t("month", snapshot))
        L10n.line("sharedTheGoodNews", nil)
        Button(L10n.t(running ? "timerPauseAction" : "timerStartAction", snapshot))
        L10n.t(model.alertKey ?? "", snapshot)
      `),
    ]).toEqual([
      'month',
      'sharedTheGoodNews',
      'timerPauseAction',
      'timerStartAction',
    ])
  })
})

describe('readLocales', () => {
  it('fails on a locale with no Apple language', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ww-locales-'))
    try {
      await writeFile(path.join(directory, 'en-US.json'), '{}')
      await writeFile(path.join(directory, 'xx-XX.json'), '{}')
      expect(() => readLocales(directory)).toThrow(
        'Add xx-XX to appleLanguages'
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('shortcutCatalog', () => {
  it('keys phrases by the English phrase and leaves out untranslated languages', () => {
    const { catalog, problems } = shortcutCatalog(
      {
        'en-US': english,
        'es-ES': { siriShortcutAddTime: 'Agrega tiempo en ${applicationName}' },
        'ja-JP': {},
      },
      phraseKeys,
      swift
    )

    expect(problems).toEqual([])
    expect(parse(catalog).strings).toEqual({
      'Add time in ${applicationName}': {
        extractionState: 'manual',
        localizations: {
          en: {
            stringUnit: {
              state: 'translated',
              value: english.siriShortcutAddTime,
            },
          },
          es: {
            stringUnit: {
              state: 'translated',
              value: 'Agrega tiempo en ${applicationName}',
            },
          },
        },
      },
      'Log time in ${applicationName}': {
        extractionState: 'manual',
        localizations: {
          en: {
            stringUnit: {
              state: 'translated',
              value: english.siriShortcutLogTime,
            },
          },
        },
      },
    })
  })

  it('reports translations Siri would reject', () => {
    expect(
      problems({ siriShortcutAddTime: 'Agrega tiempo en WitnessWork' })
    ).toEqual([
      'src/locales/es-ES.json "siriShortcutAddTime" needs ${applicationName} exactly once: "Agrega tiempo en WitnessWork"',
    ])
    expect(
      problems({
        siriShortcutAddTime: '${applicationName} ${applicationName}',
      })[0]
    ).toContain('needs ${applicationName} exactly once')
    expect(
      problems({ siriShortcutAddTime: 'Agrega %{n} en ${applicationName}' })[0]
    ).toContain('can only use the ${applicationName} placeholder')
    expect(
      problems({ siriShortcutAddTime: '${applicationName}で１時間追加' })[0]
    ).toContain("can't contain a number")
  })

  it('reports two actions sharing a phrase', () => {
    expect(
      problems({
        siriShortcutAddTime: 'Registra tiempo en ${applicationName}',
        siriShortcutLogTime: 'registra  tiempo en ${applicationName}',
      })
    ).toEqual([
      'src/locales/es-ES.json "siriShortcutLogTime" is the same as "siriShortcutAddTime": "registra  tiempo en ${applicationName}"',
    ])
  })

  it('reports phrases missing from Swift or from the strings', () => {
    expect(
      shortcutCatalog(
        {
          'en-US': {
            siriShortcutAddTime: 'Add time in ${applicationName}',
            siriShortcutStart: 'Start in ${applicationName}',
          },
        },
        ['siriShortcutAddTime', 'siriShortcutStart'],
        swift
      ).problems
    ).toEqual([
      'targets/intents/ServiceShortcuts.swift has no phrase "Start in \\(.applicationName)" (from en-US "siriShortcutStart")',
      'targets/intents/ServiceShortcuts.swift phrase "Log time in \\(.applicationName)" needs a siriShortcut* string in src/locales/en-US.json, listed under shortcutPhrases in src/app/watch/watchStringKeys.json',
    ])
  })
})

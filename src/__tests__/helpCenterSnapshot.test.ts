import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { helpLocales } from '@/features/updates/lib/helpCenter/locale'

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), warn: vi.fn() } }))

import {
  expandSnapshot,
  readSnapshot,
} from '@/features/updates/lib/helpCenter/snapshot'

const read = (locale: string) =>
  JSON.parse(
    fs.readFileSync(`src/assets/help-center/${locale}.json`, 'utf8')
  ) as Parameters<typeof expandSnapshot>[0]

describe('bundled Help Center snapshot', () => {
  const english = readSnapshot('en-US')

  it('ships every app language with every English entry', () => {
    for (const locale of Object.values(helpLocales)) {
      const bundle = readSnapshot(locale)
      expect(bundle.locale).toBe(locale)
      expect(bundle.entries.map((e) => e.id)).toEqual(
        english.entries.map((e) => e.id)
      )
      expect(bundle.categories.map((c) => c.id)).toEqual(
        english.categories.map((c) => c.id)
      )
    }
  })

  it('keeps the categories app code links to', () => {
    const ids = english.categories.map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining(['streaks', 'supporter']))
  })

  it('restores URLs by the contract pattern', () => {
    const entry = english.entries.find((e) => e.id === 'timeRollover')
    expect(entry?.url).toBe('https://witnesswork.app/help/time/time-rollover')
    expect(
      readSnapshot('pt-BR').entries.find((e) => e.id === 'timeRollover')?.url
    ).toBe('https://witnesswork.app/help/pt-BR/time/time-rollover')
  })

  it('fills untranslated entries from English, marked as fallback', () => {
    const snapshot = read('de-DE')
    // Drop German's translation of the first English entry.
    const entries = snapshot.entries.filter(
      (e) => e.id !== english.entries[0].id
    )
    const expanded = expandSnapshot(
      { ...snapshot, entries },
      read('en-US')
    ) as { entries: { id: string; fallback?: true; question: string }[] }
    expect(expanded.entries[0]).toMatchObject({
      id: english.entries[0].id,
      question: english.entries[0].question,
      fallback: true,
    })
    const translated = expanded.entries.find((e) => e.id === entries[0].id)
    expect(translated?.fallback).toBeUndefined()
  })

  it('stays compact: no derived fields or English copies', () => {
    for (const locale of Object.values(helpLocales)) {
      for (const entry of read(locale).entries) {
        expect(entry).not.toHaveProperty('plainText')
        expect(entry).not.toHaveProperty('url')
        if (locale !== 'en-US') expect(entry).not.toHaveProperty('fallback')
      }
    }
  })
})

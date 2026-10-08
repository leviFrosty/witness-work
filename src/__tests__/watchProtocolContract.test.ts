import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const units = vi.hoisted<Record<string, string>>(() => ({
  hoursCompact: 'h',
  minutesCompact: 'm',
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: { defaultValue?: string }) =>
      units[key] ?? options?.defaultValue ?? key,
  },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ timeDisplayFormat: 'decimal' }),
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false }],
}))

import {
  buildWatchSnapshot,
  BuildWatchSnapshotArgs,
} from '@/app/watch/buildWatchSnapshot'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { Contact } from '@/types/contact'

/**
 * The phone → watch contract. The fixture is a `PhoneContext` that the Kotlin
 * tests on both sides of the Wear OS connection decode
 * (`modules/watch-bridge/android/src/test`, `targets/wear-os/src/test`), and
 * whose snapshot has the shape the Apple Watch's `WatchSnapshot` decodes. A
 * field renamed, added or removed here has to be changed in both protocols
 * (`WatchProtocol.swift`, `WatchProtocol.kt`) and in this fixture.
 */
const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../modules/watch-bridge/android/src/test/resources/phone-context.json',
      import.meta.url
    ),
    'utf8'
  )
)

// Monday, October 5, 2026, 9:00 local.
const NOW = new Date(2026, 9, 5, 9, 0)
const at = (day: number, hour: number) => new Date(2026, 9, day, hour)

const maria: Contact = {
  id: 'maria',
  name: 'Maria González',
  createdAt: new Date(2026, 0, 1),
  address: { line1: '12 Oak St', city: 'Springfield' },
  coordinate: { latitude: 40, longitude: -75 },
}

const args = (
  platform: BuildWatchSnapshotArgs['platform']
): BuildWatchSnapshotArgs => ({
  platform,
  serviceReports: {
    2026: {
      9: [
        { id: 'e1', hours: 12, minutes: 30, date: at(2, 10) },
        {
          id: 'e2',
          hours: 4,
          minutes: 0,
          date: at(3, 10),
          categoryId: 'ldc',
          credit: true,
        },
      ],
    },
  },
  publisher: 'regularPioneer',
  publisherHours: {
    publisher: 0,
    regularAuxiliary: 30,
    regularPioneer: 50,
    circuitOverseer: 50,
    specialPioneer: 100,
    custom: 50,
  },
  monthlyGoalOverrides: {},
  overrideCreditLimit: false,
  customCreditLimitHours: 55,
  timeDisplayFormat: 'decimal',
  dayPlans: [
    {
      id: 'plan',
      date: normalizeDateForStorage(at(6, 12)),
      minutes: 120,
      startTimeInMinutes: 14 * 60,
      location: { name: 'Central Park', address: '5th Ave' },
    },
  ],
  recurringPlans: [],
  conversations: [
    {
      id: 'visit',
      contact: { id: 'maria' },
      date: at(1, 10),
      isBibleStudy: false,
      followUp: { date: at(5, 15), notifyMe: false, topic: 'Why we suffer' },
    },
  ],
  contacts: [maria],
  showsTimeEntry: true,
  nextMonth: { publisher: 'regularPioneer', showsTimeEntry: true },
  categories: [{ id: 'ldc', name: 'LDC', isCredit: true }],
  mileageTrackingEnabled: true,
  distanceUnit: 'mi',
  vehicles: [{ id: 'car', name: 'Corolla', createdAt: 1 }],
  trips: [],
})

type Shape = string | { [key: string]: Shape } | Shape[]

/**
 * Keys and JSON types, with arrays reduced to the union of their elements'
 * keys.
 */
function shape(value: unknown): Shape {
  if (Array.isArray(value)) {
    const merged: Record<string, Shape> = {}
    for (const element of value) {
      const elementShape = shape(element)
      if (typeof elementShape !== 'object' || Array.isArray(elementShape)) {
        return [elementShape]
      }
      Object.assign(merged, elementShape)
    }
    return [merged]
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'strings')
        .map(([key, child]) => [key, shape(child)])
    )
  }
  // A field that's `null` here may be set elsewhere; compare presence only.
  return value === null ? 'present' : 'present'
}

describe('watch protocol contract', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(['ios', 'android'] as const)(
    'builds the snapshot both watches decode (%s phone)',
    (platform) => {
      const snapshot = buildWatchSnapshot(args(platform))
      expect(shape(snapshot)).toEqual(shape(fixture.snapshot))
      expect(Object.keys(fixture.snapshot.strings).sort()).toEqual(
        expect.arrayContaining(Object.keys(snapshot.strings).sort())
      )
    }
  )
})

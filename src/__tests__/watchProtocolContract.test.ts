import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const units = vi.hoisted<Record<string, string>>(() => ({
  hoursCompact: 'h',
  minutesCompact: 'm',
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: { defaultValue?: string; count?: number }) =>
      key === 'hoursShort'
        ? `${options?.count} Hrs`
        : (units[key] ?? options?.defaultValue ?? key),
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
import {
  LDC_BUILTIN_CATEGORY_ID,
  makeLdcBuiltinCategory,
} from '@/constants/categories'
import type { Contact } from '@/types/contact'

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../modules/watch-bridge/android/src/test/resources/phone-context.json',
      import.meta.url
    ),
    'utf8'
  )
)

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
  nativeLocale: { rtl: false, numberLocale: 'en-us' },
})

type Shape = string | { [key: string]: Shape } | Shape[]

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

  it('sends what was logged and planned through each day', () => {
    const snapshot = buildWatchSnapshot(args('android'))
    expect(snapshot.plannedThroughDay).toEqual(
      fixture.snapshot.plannedThroughDay
    )

    expect(snapshot.loggedThroughDay).toEqual(fixture.snapshot.loggedThroughDay)
  })

  it('sends no logged time per day without Plans', () => {
    const snapshot = buildWatchSnapshot({ ...args('ios'), dayPlans: [] })
    expect(snapshot.plannedThroughDay).toBeNull()
    expect(snapshot.loggedThroughDay).toBeNull()
  })

  it('sends the month total with its unit, as the phone shows it', () => {
    expect(buildWatchSnapshot(args('ios')).monthFormatted).toBe('16.5 Hrs')
  })

  it('names the LDC Type in the app’s language, as the phone does', () => {
    const snapshot = buildWatchSnapshot({
      ...args('android'),
      categories: [makeLdcBuiltinCategory(0)],
    })

    expect(snapshot.categories).toEqual([
      { id: LDC_BUILTIN_CATEGORY_ID, name: 'ldc', isCredit: true },
    ])
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))

import { hashBuffer, type PixelBuffer } from '@/lib/pixelArt'
import { DEFAULT_ROOM, type PetRecord, type PetRoomRecord } from '@/types/pet'
import { DEMO_SIGN_DATA } from '@/features/pet/art'
import { addDays } from '@/features/pet/lib/dayKeys'
import { buildSignData } from '@/features/pet/lib/signData'
import {
  buildPetWidget,
  createPetImageCache,
  petLampDaysLabel,
  petSignLine,
  petWidgetScene,
  petWidgetTimeline,
  localMidnight,
  PET_TIMELINE_HOURS,
  PET_TIMELINE_MAX_ENTRIES,
  PetWidgetRenderError,
  planPetWidget,
  renderPetWidget,
  timelineChangePoints,
  type PetWidgetInput,
} from '@/app/widgets/petWidget'

const at = (day: number, hour = 0, month = 9) =>
  new Date(2026, month, day, hour, 0, 0, 0)

const daysFrom = (from: string, to: string): Set<string> => {
  const days = new Set<string>()
  for (let key = from; key <= to; key = addDays(key, 1)) days.add(key)
  return days
}

const pet = (patch: Partial<PetRecord> = {}): PetRecord => ({
  id: 'companion',
  species: 'lion',
  coat: 'default',
  name: 'Biscuit',
  adoptedOn: '2026-10-01',
  wakes: [],
  keepsakes: [],
  updatedAt: 1,
  ...patch,
})

const room = (window: PetRoomRecord['window']): PetRoomRecord => ({
  ...DEFAULT_ROOM,
  id: 'room',
  window,
  updatedAt: 1,
})

const FIXED_DAY = room({ time: 'day', season: 'autumn' })

const input = (patch: Partial<PetWidgetInput> = {}): PetWidgetInput => ({
  pet: pet(),
  room: null,
  roomDefaults: DEFAULT_ROOM,
  activeDays: daysFrom('2026-10-01', '2026-10-18'),
  heartsPace: () => 'daily',
  streakAt: () => ({ kind: 'plans', count: 4 }),
  showStreaks: true,
  signAt: () => ({ sign: DEMO_SIGN_DATA, nextPlanDate: null }),
  regionCode: 'US',
  ...patch,
})

const fakeEncoder = () =>
  vi.fn((buffer: PixelBuffer) => `png-${hashBuffer(buffer)}`)

const dense = <T extends { date: number }>(entries: T[], now: Date) =>
  entries.filter((e) => e.date < now.getTime() + PET_TIMELINE_HOURS * 3_600_000)

describe('timelineChangePoints', () => {
  it('starts at today and lists each midnight for 48 hours', () => {
    expect(timelineChangePoints(at(18, 10), false)).toEqual([
      at(18),
      at(19),
      at(20),
    ])
  })

  it('adds the Live window boundaries and starts at the current period', () => {
    const points = timelineChangePoints(at(18, 10), true).map((d) =>
      d.getTime()
    )
    expect(points[0]).toBe(at(18, 9).getTime())
    expect(points).toEqual(
      [
        at(18, 9),
        at(18, 17),
        at(18, 20),
        at(19),
        at(19, 6),
        at(19, 9),
        at(19, 17),
        at(19, 20),
        at(20),
        at(20, 6),
        at(20, 9),
      ].map((d) => d.getTime())
    )
  })
})

describe('petWidgetTimeline', () => {
  it('is empty without a pet', () => {
    expect(petWidgetTimeline(input({ pet: null }), at(18, 10))).toEqual([])
  })

  it('drops half a heart at midnight on quiet day 10, and again on day 13', () => {
    const entries = petWidgetTimeline(
      input({
        pet: pet({ adoptedOn: '2026-09-25' }),
        room: FIXED_DAY,
        activeDays: daysFrom('2026-09-25', '2026-10-09'),
      }),
      at(18, 10)
    )
    expect(
      dense(entries, at(18, 10)).map((e) => [e.date, e.state.hearts])
    ).toEqual([
      [at(18).getTime(), 5],
      [at(19).getTime(), 4.5],
    ])

    const later = petWidgetTimeline(
      input({
        pet: pet({ adoptedOn: '2026-09-25' }),
        room: FIXED_DAY,
        activeDays: daysFrom('2026-09-25', '2026-10-06'),
      }),
      at(18, 10)
    )
    expect(
      dense(later, at(18, 10)).map((e) => [e.date, e.state.hearts])
    ).toEqual([
      [at(18).getTime(), 4.5],
      [at(19).getTime(), 4],
    ])
  })

  it('shows the pet dying at midnight on quiet day 60', () => {
    const entries = petWidgetTimeline(
      input({
        pet: pet({ adoptedOn: '2026-08-01' }),
        room: FIXED_DAY,
        activeDays: daysFrom('2026-08-01', '2026-08-20'),
      }),
      at(18, 10)
    )
    expect(entries).toHaveLength(2)
    expect(entries[0].state).toMatchObject({
      hearts: 0.5,
      asleep: true,
      dead: false,
      mood: 'nap',
    })
    expect(entries[1].date).toBe(at(19).getTime())
    expect(entries[1].state).toMatchObject({
      hearts: 0,
      dead: true,
      asleep: false,
      mood: 'dead',
    })
  })

  it('reaches past the monthly hold to the fading and the end', () => {
    const entries = petWidgetTimeline(
      input({
        room: FIXED_DAY,
        activeDays: new Set(['2026-10-01']),
        heartsPace: () => 'monthly',
      }),
      at(18, 10)
    )
    expect(entries[0].state).toMatchObject({ hearts: 5, dead: false })
    const firstFade = entries.find((e) => e.state.hearts < 5)
    expect(firstFade?.date).toBe(new Date(2026, 11, 10).getTime())
    expect(entries.at(-1)?.date).toBe(new Date(2027, 0, 29).getTime())
    expect(entries.at(-1)?.state).toMatchObject({ dead: true, hearts: 0 })
  })

  it('changes at each Live window boundary and merges unchanged midnights', () => {
    const entries = dense(petWidgetTimeline(input(), at(18, 10)), at(18, 10))
    expect(
      entries.map((e) => [new Date(e.date).getHours(), e.state.time])
    ).toEqual([
      [9, 'day'],
      [17, 'dusk'],
      [20, 'night'],
      [6, 'dawn'],
      [9, 'day'],
      [17, 'dusk'],
      [20, 'night'],
      [6, 'dawn'],
      [9, 'day'],
    ])
    expect(entries.every((e) => e.state.hearts === 5)).toBe(true)
  })

  it('is one entry for the 48 hours when nothing changes in them', () => {
    const entries = dense(
      petWidgetTimeline(input({ room: FIXED_DAY }), at(18, 10)),
      at(18, 10)
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].date).toBe(at(18).getTime())
  })

  it('changes the Live season at the month boundary', () => {
    const entries = petWidgetTimeline(
      input({
        pet: pet({ adoptedOn: '2026-11-01' }),
        activeDays: daysFrom('2026-11-01', '2026-11-30'),
        room: room({ time: 'night', season: 'live' }),
      }),
      at(30, 22, 10)
    )

    expect(entries.slice(0, 2).map((e) => e.state.season)).toEqual([
      'autumn',
      'winter',
    ])
    expect(entries[1].date).toBe(new Date(2026, 11, 1).getTime())
  })

  it('flips the Live season south of the equator', () => {
    const [entry] = petWidgetTimeline(
      input({ room: FIXED_DAY, regionCode: 'AU' }),
      at(18, 10)
    )
    expect(entry.state.season).toBe('autumn')
    const [south] = petWidgetTimeline(
      input({ room: room({ time: 'day', season: 'live' }), regionCode: 'AU' }),
      at(18, 10)
    )
    expect(south.state.season).toBe('spring')
  })

  it('never has more than the entry cap', () => {
    const entries = petWidgetTimeline(input(), at(18, 0))
    expect(entries.length).toBeLessThanOrEqual(PET_TIMELINE_MAX_ENTRIES)
  })
})

describe('petWidgetTimeline after the 48 hours', () => {
  it('lists each midnight hearts change on until the pet would die', () => {
    const now = at(18, 10)
    const entries = petWidgetTimeline(input({ room: FIXED_DAY }), now)
    expect(
      entries.map((e) => [
        new Date(e.date).toDateString(),
        e.state.hearts,
        e.state.dead,
      ])
    ).toEqual(
      [
        [at(18), 5, false],

        [at(28), 4.5, false],
        [at(31), 4, false],
        [at(3, 0, 10), 3.5, false],
        [at(6, 0, 10), 3, false],
        [at(9, 0, 10), 2.5, false],
        [at(12, 0, 10), 2, false],
        [at(15, 0, 10), 1.5, false],
        [at(18, 0, 10), 1, false],
        [at(21, 0, 10), 0.5, false],

        [at(17, 0, 11), 0, true],
      ].map(([day, hearts, dead]) => [
        (day as Date).toDateString(),
        hearts,
        dead,
      ])
    )
    for (const entry of entries.slice(1))
      expect(entry.date).toBe(localMidnight(new Date(entry.date)).getTime())
  })

  it('keeps the 48 hours, then the later changes that matter most', () => {
    const now = at(18, 10)
    const entries = petWidgetTimeline(input(), now)
    expect(entries).toHaveLength(PET_TIMELINE_MAX_ENTRIES)
    const later = entries.slice(dense(entries, now).length)

    expect(later.map((e) => [e.state.hearts, e.state.dead])).toEqual([
      [4, false],
      [0.5, false],
      [0, true],
    ])

    expect(later.every((e) => e.state.time === 'day')).toBe(true)
  })

  it('shows the 1st of the month with its own sign and lamp', () => {
    const now = at(25, 10)

    const entries = petWidgetTimeline(
      input({
        pet: pet({ adoptedOn: '2026-08-01' }),
        room: FIXED_DAY,
        activeDays: daysFrom('2026-08-01', '2026-08-20'),
        streakAt: (day) => ({
          kind: 'plans',
          count: day.getTime() < at(27).getTime() ? 4 : 0,
        }),
        signAt: (day) => ({
          sign: {
            ...DEMO_SIGN_DATA,
            monthMinutes: day.getMonth() === 9 ? 870 : 0,
          },
          nextPlanDate: null,
        }),
      }),
      now
    )
    expect(
      entries.map((e) => [
        e.date,
        e.state.lampLevel,
        e.sign?.sign.monthMinutes,
        e.state.dead,
      ])
    ).toEqual([
      [at(25).getTime(), 0, 870, true],
      [at(27).getTime(), 0, 870, true],
      [at(1, 0, 10).getTime(), 0, 0, true],
    ])
  })
})

describe('timelineChangePoints across DST', () => {
  const originalTZ = process.env.TZ
  afterEach(() => {
    process.env.TZ = originalTZ
  })

  it('keeps every later midnight at 00:00 when today started at 01:00', () => {
    process.env.TZ = 'America/Sao_Paulo'
    const now = new Date(2018, 10, 4, 10)
    expect(localMidnight(now).getHours()).toBe(1)
    const points = timelineChangePoints(now, false)
    expect(points.map((d) => [d.getDate(), d.getHours()])).toEqual([
      [4, 1],
      [5, 0],
      [6, 0],
    ])
    const live = timelineChangePoints(now, true)
    expect(live[0].getHours()).toBe(9)
    expect(
      live.filter((d) => d.getDate() === 5).map((d) => d.getHours())
    ).toEqual([0, 6, 9, 17, 20])
  })

  it('replays the right day for each entry across the change', () => {
    process.env.TZ = 'America/Sao_Paulo'
    const now = new Date(2018, 10, 4, 10)
    const entries = petWidgetTimeline(
      input({
        pet: pet({ adoptedOn: '2018-10-01' }),
        room: FIXED_DAY,
        activeDays: daysFrom('2018-10-01', '2018-10-25'),
      }),
      now
    )

    expect(entries[0]).toMatchObject({ state: { hearts: 4.5 } })
    expect(entries[1].date).toBe(new Date(2018, 10, 7).getTime())
    expect(entries[1].state.hearts).toBe(4)
  })
})

describe('planPetWidget', () => {
  it('hashes the inputs, so unchanged ones need no drawing', () => {
    const now = at(18, 10)
    const first = planPetWidget(input(), now)!
    expect(planPetWidget(input(), at(18, 11))!.hash).toBe(first.hash)
    const signed = planPetWidget(
      input({
        signAt: () => ({
          sign: { ...DEMO_SIGN_DATA, monthMinutes: 900 },
          nextPlanDate: null,
        }),
      }),
      now
    )!
    expect(signed.hash).not.toBe(first.hash)

    const yearOnly = planPetWidget(
      input({
        signAt: () => ({
          sign: { ...DEMO_SIGN_DATA, yearMinutes: 59940 },
          nextPlanDate: null,
        }),
      }),
      now
    )!
    expect(yearOnly.hash).toBe(first.hash)

    const keys = new Set(first.entries.map((e) => e.imageKey))
    expect(keys.size).toBeLessThan(first.entries.length)
  })

  it('carries each entry its own lamp, sign line and label', () => {
    const plan = planPetWidget(input({ room: FIXED_DAY }), at(18, 10))!
    const [now, later] = plan.entries

    expect(now.entry.status).toEqual({
      lampLevel: 5,
      lampDaysLabel: '4 days kept',
      signLine: '14.5h of 30h',
      accessibilityLabel: expect.stringMatching(/, 5 of 5 hearts$/),
    })
    expect(later.entry.status.accessibilityLabel).toMatch(/, 4\.5 of 5 hearts$/)
  })

  it('draws an image key once', () => {
    const plan = planPetWidget(input(), at(18, 10))!
    const cache = createPetImageCache()
    const encode = fakeEncoder()
    const first = renderPetWidget(plan, encode, cache)
    const keys = new Set(plan.entries.map((e) => e.imageKey))
    expect(encode).toHaveBeenCalledTimes(2 * keys.size)
    const again = fakeEncoder()
    expect(renderPetWidget(plan, again, cache)).toEqual(first)
    expect(again).not.toHaveBeenCalled()
    expect(first.hash).toBe(plan.hash)
  })
})

describe('buildPetWidget', () => {
  it('is null without a pet, with nothing to write', () => {
    const encode = fakeEncoder()
    expect(buildPetWidget(input({ pet: null }), at(18, 10), encode)).toEqual({
      snapshot: null,
      files: [],
      hash: null,
    })
    expect(encode).not.toHaveBeenCalled()
  })

  it('names images by their pixels and lists every file it names', () => {
    const encode = fakeEncoder()
    const { snapshot, files } = buildPetWidget(
      input(),
      at(18, 10),
      encode,
      createPetImageCache()
    )
    expect(snapshot).not.toBeNull()
    const entries = snapshot!.entries
    expect(entries).toHaveLength(PET_TIMELINE_MAX_ENTRIES)
    expect(dense(entries, at(18, 10))).toHaveLength(9)
    for (const entry of entries) {
      expect(entry.small).toMatch(/^pet-[0-9a-f]{8}\.png$/)
      expect(entry.large).toMatch(/^pet-[0-9a-f]{8}\.png$/)
      expect(entry.medium).toBe(entry.small)
      expect(entry.large).not.toBe(entry.small)
    }

    const named = new Set(entries.flatMap((e) => [e.small, e.large]))
    expect(new Set(files.map((f) => f.name))).toEqual(named)

    expect(named.size).toBe(14)
    expect(files.every((f) => f.base64.startsWith('png-'))).toBe(true)
    expect(encode.mock.calls.length).toBeLessThanOrEqual(
      2 * PET_TIMELINE_MAX_ENTRIES
    )
  })

  it('reuses rendered images and keeps names stable', () => {
    const cache = createPetImageCache()
    const first = buildPetWidget(input(), at(18, 10), fakeEncoder(), cache)
    const encode = fakeEncoder()
    const again = buildPetWidget(input(), at(18, 11), encode, cache)
    expect(encode).not.toHaveBeenCalled()
    expect(again.snapshot!.entries).toEqual(first.snapshot!.entries)

    const fresh = buildPetWidget(
      input(),
      at(18, 10),
      fakeEncoder(),
      createPetImageCache()
    )
    expect(fresh.files.map((f) => f.name)).toEqual(
      first.files.map((f) => f.name)
    )
  })

  it('renders different images for a sleeping pet and one that died', () => {
    const { snapshot } = buildPetWidget(
      input({
        pet: pet({ adoptedOn: '2026-08-01' }),
        room: FIXED_DAY,
        activeDays: daysFrom('2026-08-01', '2026-08-20'),
      }),
      at(18, 10),
      fakeEncoder(),
      createPetImageCache()
    )
    const [asleep, died] = snapshot!.entries
    expect(asleep).toMatchObject({ hearts: 0.5, dead: false })
    expect(died).toMatchObject({ hearts: 0, dead: true })
    expect(died.small).not.toBe(asleep.small)
    expect(snapshot).toMatchObject({ hearts: 0.5, dead: false, gold: false })
  })

  it('turns gold after a year at five hearts, with sparkles in the image', () => {
    const goldInput = input({
      pet: pet({ adoptedOn: '2025-09-01' }),
      room: FIXED_DAY,
      activeDays: daysFrom('2025-09-01', '2026-10-18'),
    })
    const [entry] = petWidgetTimeline(goldInput, at(18, 10))
    expect(entry.state).toMatchObject({ hearts: 5, gold: true })
    const plain = petWidgetScene(goldInput.pet!, DEFAULT_ROOM, DEMO_SIGN_DATA, {
      ...entry.state,
      gold: false,
    })
    const gold = petWidgetScene(
      goldInput.pet!,
      DEFAULT_ROOM,
      DEMO_SIGN_DATA,
      entry.state
    )
    expect(hashBuffer(gold)).not.toBe(hashBuffer(plain))
    const { snapshot } = buildPetWidget(
      goldInput,
      at(18, 10),
      fakeEncoder(),
      createPetImageCache()
    )
    expect(snapshot).toMatchObject({ gold: true })
    expect(snapshot!.entries[0].gold).toBe(true)
  })

  it('fills the localized fields', () => {
    const { snapshot } = buildPetWidget(
      input({ room: FIXED_DAY }),
      at(18, 10),
      fakeEncoder(),
      createPetImageCache()
    )
    expect(snapshot).toMatchObject({
      name: 'Biscuit',
      hearts: 5,
      lampLevel: 5,
      lampDaysLabel: '4 days kept',
      signLine: '14.5h of 30h',
    })
    expect(snapshot!.accessibilityLabel).toMatch(/^Biscuit, .+, 5 of 5 hearts$/)
  })

  it('fails the whole build when an image fails to encode', () => {
    expect(() =>
      buildPetWidget(
        input({ room: FIXED_DAY }),
        at(18, 10),
        () => null,
        createPetImageCache()
      )
    ).toThrow(PetWidgetRenderError)
  })
})

describe('petLampDaysLabel', () => {
  it('counts days for plan streaks and months for month streaks', () => {
    expect(petLampDaysLabel({ kind: 'plans', count: 1 }, true)).toBe(
      '1 day kept'
    )
    expect(petLampDaysLabel({ kind: 'plans', count: 12 }, true)).toBe(
      '12 days kept'
    )
    expect(petLampDaysLabel({ kind: 'months', count: 1 }, true)).toBe(
      '1 month kept'
    )
    expect(petLampDaysLabel({ kind: 'months', count: 3 }, true)).toBe(
      '3 months kept'
    )
  })

  it('is null with streaks hidden or no streak', () => {
    expect(petLampDaysLabel({ kind: 'plans', count: 12 }, false)).toBeNull()
    expect(petLampDaysLabel({ kind: 'plans', count: 0 }, true)).toBeNull()
  })
})

describe('petSignLine', () => {
  const sign = DEMO_SIGN_DATA

  it('describes each sign in one line', () => {
    expect(petSignLine('none', sign, null)).toBeNull()
    expect(petSignLine('month', sign, null)).toBe('14.5h of 30h')
    expect(petSignLine('month', { ...sign, monthGoal: 0 }, null)).toBe(
      '14.5h this month'
    )
    expect(petSignLine('month', { ...sign, monthMinutes: 0 }, null)).toBe(
      '0h of 30h'
    )
    expect(petSignLine('year', sign, null)).toBe('312h this service year')
    expect(petSignLine('shared', sign, null)).toBe('Shared in 2 of 12 months')
    expect(petSignLine('plan', sign, at(21))).toBe('Next plan: Oct 21, 2.5h')
    expect(petSignLine('plan', { ...sign, planMinutes: null }, null)).toBe(
      'No plans ahead'
    )
    expect(petSignLine('convos', sign, null)).toBe(
      '8 conversations · 3 return visits'
    )
    expect(
      petSignLine(
        'convos',
        { ...sign, conversations: 1, returnVisits: 1 },
        null
      )
    ).toBe('1 conversation · 1 return visit')
  })

  it('keeps the minutes of short durations', () => {
    const today = new Date(2026, 9, 18, 10)
    const lines = [10, 25, 50].map((minutes) => {
      const built = buildSignData({
        today,
        serviceReports: {
          2026: { 9: [{ id: 'a', date: today, hours: 0, minutes }] },
        },
        dayPlans: [{ id: 'p', date: today, minutes }],
        recurringPlans: [],
        visits: [],
        publisher: 'regularPioneer',
        creditLimit: { enabled: false, customLimitHours: 55 },
        monthGoalHours: 0,
        digits: 'latn',
      })
      return [
        petSignLine('month', built, null),
        petSignLine('year', built, null),
        petSignLine('plan', built, today),
      ]
    })
    expect(lines).toEqual([
      ['10m this month', '10m this service year', 'Next plan: Oct 18, 10m'],
      ['25m this month', '25m this service year', 'Next plan: Oct 18, 25m'],
      ['50m this month', '50m this service year', 'Next plan: Oct 18, 50m'],
    ])
  })
})

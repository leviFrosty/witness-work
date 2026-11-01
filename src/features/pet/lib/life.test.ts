import { afterEach, describe, expect, it } from 'vitest'
import { addDays, daysBetween, localDayKey } from '@/features/pet/lib/dayKeys'
import {
  moodOf,
  simulateLife,
  type HeartsPace,
  type PetLife,
} from '@/features/pet/lib/life'

const ADOPTED = '2026-01-01'

function lifeOn(
  day: number,
  {
    active = [],
    wakes = [],
    adoptedOn = ADOPTED,
    paceOf,
  }: {
    active?: number[]
    wakes?: number[]
    adoptedOn?: string
    paceOf?: (month: string) => HeartsPace
  } = {}
): PetLife {
  return simulateLife({
    adoptedOn,
    activeDays: new Set(active.map((d) => addDays(adoptedOn, d))),
    wakes: wakes.map((d) => addDays(adoptedOn, d)),
    today: addDays(adoptedOn, day),
    paceOf,
  })
}

const monthly = (): HeartsPace => 'monthly'

const on = (key: string) => daysBetween(ADOPTED, key)

const range = (from: number, to: number, step = 1) =>
  Array.from(
    { length: Math.floor((to - from) / step) + 1 },
    (_, i) => from + i * step
  )

describe('simulateLife', () => {
  it('starts at 3 hearts on the adoption day', () => {
    expect(lifeOn(0)).toMatchObject({
      hearts: 3,
      dead: false,
      mood: 'ok',
      asleep: false,
      quietDays: 0,
    })
  })

  it('adds one heart per active day, up to 5', () => {
    expect(lifeOn(0, { active: [0] }).hearts).toBe(4)
    expect(lifeOn(1, { active: [0, 1] }).hearts).toBe(5)
    expect(lifeOn(5, { active: range(0, 5) }).hearts).toBe(5)
  })

  it.each([
    [0, 5, 'happy'],
    [9, 5, 'happy'],
    [10, 4.5, 'happy'],
    [12, 4.5, 'happy'],
    [13, 4, 'content'],
    [16, 3.5, 'content'],
    [18, 3.5, 'content'],
    [19, 3, 'ok'],
    [24, 2.5, 'ok'],
    [25, 2, 'low'],
    [30, 1.5, 'low'],
    [31, 1, 'weak'],
    [33, 1, 'weak'],
    [34, 0.5, 'nap'],
    [59, 0.5, 'nap'],
    [60, 0, 'dead'],
    [400, 0, 'dead'],
  ])(
    'from five hearts, quiet day %i shows %f hearts (%s)',
    (quiet, hearts, mood) => {
      const life = lifeOn(1 + quiet, { active: [0, 1] })
      expect(life.hearts).toBe(hearts)
      expect(life.mood).toBe(mood)
      expect(life.quietDays).toBe(quiet)
      expect(life.asleep).toBe(mood === 'nap')
      expect(life.dead).toBe(mood === 'dead')
    }
  )

  it('fades on quiet days 10, 13, 16, … and never below ½', () => {
    const hearts = range(0, 59).map((day) => lifeOn(day).hearts)
    const drops = hearts
      .map((h, day) => (day > 0 && h < hearts[day - 1] ? day : null))
      .filter((day) => day !== null)
    expect(drops).toEqual([10, 13, 16, 19, 22])
    expect(Math.min(...hearts)).toBe(0.5)
    expect(lifeOn(59)).toMatchObject({ hearts: 0.5, asleep: true })
  })

  it('dies on exactly the 60th quiet day', () => {
    expect(lifeOn(59).dead).toBe(false)
    expect(lifeOn(60)).toMatchObject({ dead: true, hearts: 0, mood: 'dead' })
    expect(lifeOn(60).asleep).toBe(false)
  })

  it('keeps a weekly publisher at five hearts for good', () => {
    const active = range(0, 735, 7)
    expect(lifeOn(1, { active: [0, 1] }).hearts).toBe(5)
    for (const day of range(14, 730))
      expect(lifeOn(day, { active: [1, ...active] }).hearts).toBe(5)
  })

  describe('at the monthly pace', () => {
    it('fills all five hearts on an active day', () => {
      expect(lifeOn(0, { active: [0], paceOf: monthly }).hearts).toBe(5)
    })

    it('keeps a once-a-month publisher at five hearts, and turns them gold', () => {
      const active = range(0, 24).map((i) =>
        on(
          `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-20`
        )
      )
      for (const day of range(on('2026-01-20'), on('2027-01-19')))
        expect(lifeOn(day, { active, paceOf: monthly }).hearts).toBe(5)
      expect(
        lifeOn(on('2027-01-19'), { active, paceOf: monthly })
      ).toMatchObject({ gold: true, goldStartedToday: true })
    })

    it('holds through the next month, then fades from day 10 after it', () => {
      const life = (key: string) =>
        lifeOn(on(key), { active: [on('2026-01-05')], paceOf: monthly })

      expect(life('2026-02-28')).toMatchObject({ hearts: 5, quietDays: 0 })
      expect(life('2026-03-09')).toMatchObject({ hearts: 5, quietDays: 9 })
      expect(life('2026-03-10').hearts).toBe(4.5)
      expect(life('2026-04-06')).toMatchObject({ hearts: 0.5, asleep: true })
      expect(life('2026-04-28').dead).toBe(false)
      expect(life('2026-04-29')).toMatchObject({ dead: true, hearts: 0 })
    })

    it('brings a sleeping pet back to five hearts, with a rainbow', () => {
      const active = [on('2026-01-05'), on('2026-05-02')]
      expect(lifeOn(on('2026-05-01'), { active, paceOf: monthly }).asleep).toBe(
        false
      )
      expect(lifeOn(on('2026-05-01'), { active, paceOf: monthly }).dead).toBe(
        true
      )
      expect(
        lifeOn(on('2026-05-02'), { active, paceOf: monthly })
      ).toMatchObject({ hearts: 5, dead: false, rainbowToday: true })
    })

    it('follows each month’s own pace when the role changes', () => {
      const paceOf = (month: string): HeartsPace =>
        month === '2026-01' ? 'monthly' : 'daily'
      const active = [on('2026-01-05'), on('2026-03-02')]

      expect(lifeOn(on('2026-03-01'), { active, paceOf }).hearts).toBe(5)

      expect(lifeOn(on('2026-03-11'), { active, paceOf }).hearts).toBe(5)
      expect(lifeOn(on('2026-03-12'), { active, paceOf }).hearts).toBe(4.5)

      const later = [on('2026-01-05'), on('2026-03-20')]
      expect(lifeOn(on('2026-03-19'), { active: later, paceOf }).hearts).toBe(3)
      expect(lifeOn(on('2026-03-20'), { active: later, paceOf }).hearts).toBe(4)
    })
  })

  it('wakes a sleeping pet to 1 heart and restarts the quiet count', () => {
    const woken = { wakes: [40] }
    expect(lifeOn(40, woken)).toMatchObject({
      hearts: 1,
      mood: 'weak',
      asleep: false,
      quietDays: 0,
    })
    expect(lifeOn(49, woken).hearts).toBe(1)
    expect(lifeOn(50, woken)).toMatchObject({ hearts: 0.5, asleep: true })

    expect(lifeOn(99, woken).dead).toBe(false)
    expect(lifeOn(100, woken).dead).toBe(true)
  })

  it('wakes a pet that died, losing nothing else', () => {
    expect(lifeOn(70, { wakes: [70] })).toMatchObject({
      hearts: 1,
      dead: false,
      mood: 'weak',
    })

    expect(lifeOn(3, { active: [0, 1, 2], wakes: [3] }).hearts).toBe(5)
  })

  it('revives a pet that died at 1 heart on an active day', () => {
    expect(lifeOn(70, { active: [70] })).toMatchObject({
      hearts: 1,
      dead: false,
    })
    expect(lifeOn(71, { active: [70, 71] }).hearts).toBe(2)

    expect(lifeOn(70, { active: [70], wakes: [70] }).hearts).toBe(2)
  })

  it('turns gold after 365 days in a row at five, and starts over below five', () => {
    const daily = { active: range(0, 800) }

    expect(lifeOn(364, daily)).toMatchObject({
      gold: false,
      fullRunDays: 364,
      goldRunDays: 0,
    })
    expect(lifeOn(365, daily)).toMatchObject({
      gold: true,
      goldStartedToday: true,
      goldRunDays: 1,
    })
    expect(lifeOn(366, daily)).toMatchObject({
      gold: true,
      goldStartedToday: false,
      goldRunDays: 2,
    })

    const lapse = { active: [...range(0, 400), ...range(411, 900)] }

    expect(lifeOn(409, lapse).gold).toBe(true)
    expect(lifeOn(410, lapse)).toMatchObject({ gold: false, fullRunDays: 0 })
    expect(lifeOn(411, lapse)).toMatchObject({ gold: false, fullRunDays: 1 })
    expect(lifeOn(775, lapse)).toMatchObject({
      gold: true,
      goldStartedToday: true,
    })
  })

  it('has a rainbow day when hearts reach five after being asleep', () => {
    const back = { active: range(30, 40) }
    expect(lifeOn(33, back).hearts).toBe(4.5)
    expect(lifeOn(34, back)).toMatchObject({ hearts: 5, rainbowToday: true })
    expect(lifeOn(35, back).rainbowToday).toBe(false)
  })

  it('has a rainbow day when hearts reach five after the pet died', () => {
    const back = { active: range(70, 80) }

    expect(lifeOn(74, back)).toMatchObject({ hearts: 5, rainbowToday: true })
  })

  it('has no rainbow for a dip that never reached sleep', () => {
    const dip = { active: [0, 1, 15, 16] }
    expect(lifeOn(14, dip).hearts).toBe(4)
    expect(lifeOn(15, dip).hearts).toBe(5)
    expect(lifeOn(15, dip).rainbowToday).toBe(false)
  })

  it('reads a future or unreadable adoption day as today', () => {
    expect(
      simulateLife({
        adoptedOn: '2027-01-01',
        activeDays: new Set(),
        wakes: [],
        today: '2026-06-01',
      })
    ).toMatchObject({ hearts: 3, quietDays: 0 })
    expect(
      simulateLife({
        adoptedOn: 'soon',
        activeDays: new Set(),
        wakes: [],
        today: '2026-06-01',
      }).hearts
    ).toBe(3)
  })

  it('counts days across DST changes and year ends exactly', () => {
    const life = (adoptedOn: string, today: string) =>
      simulateLife({ adoptedOn, activeDays: new Set(), wakes: [], today })
    expect(life('2026-02-26', '2026-03-08').hearts).toBe(2.5)
    expect(life('2026-10-22', '2026-11-01').hearts).toBe(2.5)
    expect(life('2026-12-22', '2027-01-01').hearts).toBe(2.5)
    expect(life('2026-12-22', '2026-12-31').hearts).toBe(3)
  })

  it('returns the same result for the same inputs', () => {
    const activeDays = new Set(['2026-01-02'])
    const wakes: string[] = []
    const input = { adoptedOn: ADOPTED, activeDays, wakes, today: '2026-02-01' }
    expect(simulateLife(input)).toBe(simulateLife({ ...input }))
    expect(simulateLife(input)).not.toBe(
      simulateLife({ ...input, today: '2026-02-02' })
    )
  })

  it("keeps Home's result while the widget replays other days", () => {
    const activeDays = new Set(['2026-01-02'])
    const wakes: string[] = []
    const home = { adoptedOn: ADOPTED, activeDays, wakes, today: '2026-02-01' }
    const first = simulateLife(home)
    for (let day = 2; day <= 8; day++)
      simulateLife({ ...home, today: `2026-02-0${day}` })
    expect(simulateLife({ ...home })).toBe(first)
  })
})

const originalTZ = process.env.TZ

const dayIn = (zone: string, ms: number) => {
  process.env.TZ = zone
  return localDayKey(ms)
}
const HOUR_MS = 3_600_000

describe.each(['Pacific/Auckland', 'Pacific/Honolulu', 'Europe/London'])(
  'simulateLife around adoption, on a device in %s',
  (zone) => {
    afterEach(() => {
      process.env.TZ = originalTZ
    })

    const heartsAt = (
      moments: number[],
      input: Omit<Parameters<typeof simulateLife>[0], 'today'>
    ) =>
      moments.map(
        (ms) => simulateLife({ ...input, today: dayIn(zone, ms) }).hearts
      )

    it('holds five hearts for a month already shared in before adoption', () => {
      process.env.TZ = zone

      const input = {
        adoptedOn: '2026-10-20',
        activeDays: new Set(['2026-10-03']),
        wakes: [],
        paceOf: monthly,
      }
      const life = (today: string) => simulateLife({ ...input, today })
      expect(life('2026-10-20')).toMatchObject({ hearts: 5, quietDays: 0 })

      expect(life('2026-11-30')).toMatchObject({ hearts: 5, quietDays: 0 })
      expect(life('2026-12-09').hearts).toBe(5)
      expect(life('2026-12-10').hearts).toBe(4.5)
      expect(life('2026-12-10').hearts).toBe(
        simulateLife({ ...input, adoptedOn: '2026-10-02', today: '2026-12-10' })
          .hearts
      )

      expect(
        simulateLife({
          ...input,
          activeDays: new Set(['2026-09-30']),
          today: '2026-10-20',
        }).hearts
      ).toBe(3)
      expect(
        simulateLife({ ...input, paceOf: undefined, today: '2026-10-20' })
          .hearts
      ).toBe(3)
    })

    it('counts a synced day the adoption ran ahead of', () => {
      const adoption = Date.UTC(2026, 9, 20, 20)
      const shared = Date.UTC(2026, 9, 20, 22)
      const input = {
        adoptedOn: dayIn('Pacific/Auckland', adoption),
        activeDays: new Set([dayIn('Pacific/Honolulu', shared)]),
        wakes: [],
      }
      expect(input.adoptedOn).toBe('2026-10-21')
      expect([...input.activeDays]).toEqual(['2026-10-20'])

      const moments = Array.from(
        { length: 13 },
        (_, i) => shared + i * 6 * HOUR_MS
      )
      expect(new Set(heartsAt(moments, input))).toEqual(new Set([4]))
    })
  }
)

describe('moodOf', () => {
  it.each([
    [5, false, 'happy'],
    [4.5, false, 'happy'],
    [4, false, 'content'],
    [3.5, false, 'content'],
    [3, false, 'ok'],
    [2.5, false, 'ok'],
    [2, false, 'low'],
    [1.5, false, 'low'],
    [1, false, 'weak'],
    [0.5, false, 'nap'],
    [0, true, 'dead'],
    [5, true, 'dead'],
  ] as const)('%f hearts (dead: %s) is %s', (hearts, dead, mood) => {
    expect(moodOf(hearts, dead)).toBe(mood)
  })
})

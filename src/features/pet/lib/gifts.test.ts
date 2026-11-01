import { describe, expect, it } from 'vitest'
import { addDays } from '@/features/pet/lib/dayKeys'
import {
  GIFT_AFTER_FULL_DAYS,
  GIFT_MIN_SPACING_DAYS,
  giftHash,
  giftKindAt,
  isGiftCandidate,
  pendingGift,
  petGiftSeed,
} from '@/features/pet/lib/gifts'
import { simulateLife, simulateLifeAhead } from '@/features/pet/lib/life'
import { dayNumber } from '@/features/pet/lib/dayKeys'
import { GIFT_KINDS } from '@/types/pet'

const ADOPTED = '2026-01-01'
const SEED = petGiftSeed({ seed: 'k3x9q2', adoptedOn: ADOPTED })

function dailyLives(days: number, giftSeed = SEED) {
  const activeDays = new Set(
    Array.from({ length: days + 1 }, (_, d) => addDays(ADOPTED, d))
  )
  return Array.from({ length: days + 1 }, (_, d) =>
    simulateLife({
      adoptedOn: ADOPTED,
      activeDays,
      wakes: [],
      today: addDays(ADOPTED, d),
      giftSeed,
    })
  )
}

const giftDaysOf = (lives: ReturnType<typeof dailyLives>) => [
  ...new Map(
    lives.flatMap((life) => (life.gift ? [[life.gift.on, life.gift]] : []))
  ).values(),
]

describe('gifts', () => {
  it('hashes the same way every time', () => {
    expect(giftHash('companion:2026-03-01')).toBe(
      giftHash('companion:2026-03-01')
    )
    expect(giftHash('a')).not.toBe(giftHash('b'))
  })

  it('makes about one day in ten a candidate', () => {
    let hits = 0
    for (let d = 0; d < 10_000; d++)
      if (isGiftCandidate(SEED, addDays(ADOPTED, d))) hits++
    expect(hits / 10_000).toBeGreaterThan(0.08)
    expect(hits / 10_000).toBeLessThan(0.12)
  })

  it('cycles the kinds', () => {
    expect(Array.from({ length: 7 }, (_, i) => giftKindAt(i))).toEqual([
      ...GIFT_KINDS,
      'olive',
      'fig',
    ])
  })

  it('leaves gifts only after 30 days at five, at least 7 days apart', () => {
    const lives = dailyLives(500)
    const gifts = giftDaysOf(lives)
    expect(gifts.length).toBeGreaterThan(20)
    for (const gift of gifts) {
      const life = lives[dayNumber(gift.on) - dayNumber(ADOPTED)]
      expect(life.fullRunDays).toBeGreaterThanOrEqual(GIFT_AFTER_FULL_DAYS)
      expect(isGiftCandidate(SEED, gift.on)).toBe(true)
    }
    for (let i = 1; i < gifts.length; i++)
      expect(
        dayNumber(gifts[i].on) - dayNumber(gifts[i - 1].on)
      ).toBeGreaterThanOrEqual(GIFT_MIN_SPACING_DAYS)
    expect(gifts.map((gift) => gift.kind)).toEqual(
      gifts.map((_, i) => GIFT_KINDS[i % GIFT_KINDS.length])
    )
  })

  it('is the same on every device and differs between pets', () => {
    expect(giftDaysOf(dailyLives(200))).toEqual(giftDaysOf(dailyLives(200)))
    const other = petGiftSeed({ seed: 'p0m4ze', adoptedOn: ADOPTED })
    expect(giftDaysOf(dailyLives(200, other))).not.toEqual(
      giftDaysOf(dailyLives(200))
    )
  })

  it('seeds from the record, or its adoption day without a seed', () => {
    expect(petGiftSeed({ seed: 'abc', adoptedOn: ADOPTED })).toBe('seed:abc')
    expect(petGiftSeed({ adoptedOn: ADOPTED })).toBe(`adopted:${ADOPTED}`)
    expect(petGiftSeed({ adoptedOn: '2026-01-02' })).not.toBe(
      petGiftSeed({ adoptedOn: ADOPTED })
    )

    const activeDays = new Set(
      Array.from({ length: 300 }, (_, d) => addDays(ADOPTED, d))
    )
    const byId = simulateLife({
      adoptedOn: ADOPTED,
      activeDays,
      wakes: [],
      today: addDays(ADOPTED, 299),
      petId: 'companion',
    })
    const bySeed = simulateLife({
      adoptedOn: ADOPTED,
      activeDays,
      wakes: [],
      today: addDays(ADOPTED, 299),
      giftSeed: petGiftSeed({ adoptedOn: ADOPTED }),
    })
    expect(byId.gift).not.toBeNull()
    expect(byId.gift).toEqual(bySeed.gift)
  })

  it('replays the days ahead the same as one day at a time', () => {
    const lives = dailyLives(400)
    const activeDays = new Set(
      Array.from({ length: 401 }, (_, d) => addDays(ADOPTED, d))
    )
    const ahead = simulateLifeAhead(
      {
        adoptedOn: ADOPTED,
        activeDays,
        wakes: [],
        today: addDays(ADOPTED, 300),
        giftSeed: SEED,
      },
      100
    )
    expect(ahead).toHaveLength(101)
    expect(ahead).toEqual(lives.slice(300))

    const input = {
      adoptedOn: ADOPTED,
      activeDays,
      wakes: [] as string[],
      today: addDays(ADOPTED, 300),
      giftSeed: SEED,
    }
    const once = simulateLifeAhead(input, 10)
    expect(simulateLifeAhead({ ...input }, 10)).toBe(once)
    expect(simulateLifeAhead(input, 11)).not.toBe(once)
  })

  it('waits on the rug until kept', () => {
    const lives = dailyLives(300)
    const [first] = giftDaysOf(lives)
    const index = dayNumber(first.on) - dayNumber(ADOPTED)
    const today = lives[index]
    expect(pendingGift({ life: today, keepsakes: [] })).toEqual(first)

    expect(pendingGift({ life: lives[index + 1], keepsakes: [] })).toEqual(
      first
    )
    expect(
      pendingGift({
        life: today,
        keepsakes: [{ kind: first.kind, on: first.on }],
      })
    ).toBeNull()
    expect(pendingGift({ life: null, keepsakes: [] })).toBeNull()

    expect(pendingGift({ life: lives[20], keepsakes: [] })).toBeNull()
  })

  it('takes the gift away when hearts drop below five', () => {
    const activeDays = new Set(
      Array.from({ length: 200 }, (_, d) => addDays(ADOPTED, d))
    )
    const life = (day: number) =>
      simulateLife({
        adoptedOn: ADOPTED,
        activeDays,
        wakes: [],
        today: addDays(ADOPTED, day),
        giftSeed: SEED,
      })
    expect(life(199).gift).not.toBeNull()

    expect(life(209).gift).toBeNull()
  })

  it('needs the gift seed', () => {
    const activeDays = new Set(
      Array.from({ length: 200 }, (_, d) => addDays(ADOPTED, d))
    )
    expect(
      simulateLife({
        adoptedOn: ADOPTED,
        activeDays,
        wakes: [],
        today: addDays(ADOPTED, 199),
      }).gift
    ).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { buildTerritoryFixture } from '@/app/dev-fixtures/territories'
import { territoryInsights } from '@/features/territories/lib/insights'
import {
  addPastVisits,
  EMPTY_TALLY,
  MIN_INSIGHT_VISITS,
  tallyDoors,
} from '@/features/territories/lib/visitTally'

const NOW = new Date(2026, 10, 13, 12)

const tallyFixture = (few: boolean) => {
  const { territories, pastVisits } = buildTerritoryFixture({ now: NOW, few })
  return territories.reduce(
    (tally, territory) =>
      pastVisits[territory.id]
        ? addPastVisits(
            tally,
            { id: territory.id, title: territory.number },
            pastVisits[territory.id],
            0
          )
        : tally,
    tallyDoors(EMPTY_TALLY, territories, {
      now: 0,
      title: (territory) => territory.number,
      keepGone: true,
    })
  )
}

const tallied = (few: boolean) =>
  territoryInsights(Object.values(tallyFixture(few).territories), {
    now: NOW.getTime(),
  })

describe('buildTerritoryFixture', () => {
  it('has enough visits for insights, best on Saturday mornings', () => {
    const insights = tallied(false)
    expect(insights.ready).toBe(true)
    expect(insights.bestDay).toBe(6)
    expect(insights.bestSlot?.day).toBe(6)
  })

  it('keeps the few-doors sample short of insights', () => {
    const insights = tallied(true)
    expect(insights.total).toBeGreaterThan(0)
    expect(insights.total).toBeLessThan(MIN_INSIGHT_VISITS)
  })

  it('keeps each territory on its own, with last year in the mix', () => {
    const tally = tallyFixture(false)
    expect(Object.keys(tally.territories)).toHaveLength(4)
    expect(Object.keys(tally.territories)).toContain('dev-territory-pine-ridge')
  })

  it('records nothing in the future and clears returned territories', () => {
    const { territories } = buildTerritoryFixture({ now: NOW })
    const doors = territories.flatMap((t) => t.streets.flatMap((s) => s.doors))
    expect(doors.every((door) => door.at <= NOW.getTime())).toBe(true)
    const returned = territories.filter((t) => t.finishedAt !== undefined)
    expect(returned).toHaveLength(2)
    expect(returned[0].streets.every((s) => s.doors.length === 0)).toBe(true)
  })
})

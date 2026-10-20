import { describe, expect, it } from 'vitest'
import {
  addProgressCard,
  defaultProgressCards,
  describeProgressCardChange,
  getEffectiveProgressCards,
  keepUnknownProgressCards,
  moveProgressCard,
  removeProgressCard,
  resizeProgressCard,
  sameProgressCards,
  stepProgressCard,
  type ProgressCardLayoutItem,
} from '@/lib/progressCards'

const withGoal = { hasMonthlyGoal: true }

describe('progress cards', () => {
  it('starts from the role default until customized', () => {
    expect(getEffectiveProgressCards(null, withGoal)).toEqual(
      defaultProgressCards(withGoal)
    )
    expect(
      getEffectiveProgressCards(undefined, { hasMonthlyGoal: false }).map(
        (c) => c.id
      )
    ).toEqual(['serviceDays', 'studies', 'days'])
  })

  it('keeps an emptied layout empty', () => {
    expect(getEffectiveProgressCards([], withGoal)).toEqual([])
  })

  it('drops unknown cards and repeats, and fixes sizes', () => {
    expect(
      getEffectiveProgressCards(
        [
          { id: 'fromTheFuture', size: 'small' },
          { id: 'studies', size: 'wide' },
          { id: 'studies', size: 'small' },
          { id: 'projected', size: 'small' },
          { id: 'days', size: 'huge' },
          null,
        ],
        withGoal
      )
    ).toEqual([
      { id: 'studies', size: 'wide' },
      { id: 'projected', size: 'wide' },
      { id: 'days', size: 'full' },
    ])
  })

  const layout: ProgressCardLayoutItem[] = [
    { id: 'dailyPace', size: 'small' },
    { id: 'studies', size: 'small' },
    { id: 'projected', size: 'wide' },
    { id: 'days', size: 'full' },
  ]

  it('adds first at the first size, once', () => {
    const added = addProgressCard(layout, 'weeks')
    expect(added[0]).toEqual({ id: 'weeks', size: 'wide' })
    expect(addProgressCard(added, 'weeks')).toBe(added)
  })

  it('removes and resizes', () => {
    expect(removeProgressCard(layout, 'studies').map((c) => c.id)).toEqual([
      'dailyPace',
      'projected',
      'days',
    ])
    expect(resizeProgressCard(layout, 'days', 'compact')[3]).toEqual({
      id: 'days',
      size: 'compact',
    })
    // A size the card doesn't come in is ignored.
    expect(resizeProgressCard(layout, 'projected', 'small')).toEqual(layout)
  })

  it('moves a card to another card’s place', () => {
    expect(
      moveProgressCard(layout, 'days', 'dailyPace').map((c) => c.id)
    ).toEqual(['days', 'dailyPace', 'studies', 'projected'])
    expect(
      moveProgressCard(layout, 'dailyPace', 'projected').map((c) => c.id)
    ).toEqual(['studies', 'projected', 'dailyPace', 'days'])
  })

  it('steps over hidden cards, keeping them in place', () => {
    // `projected` is hidden (e.g. no goal this month).
    const shown = ['dailyPace', 'studies', 'days'] as const
    expect(
      stepProgressCard(layout, [...shown], 'days', -1).map((c) => c.id)
    ).toEqual(['dailyPace', 'days', 'studies', 'projected'])
    expect(stepProgressCard(layout, [...shown], 'dailyPace', -1)).toBe(layout)
  })

  it('compares layouts', () => {
    expect(sameProgressCards(layout, [...layout])).toBe(true)
    expect(
      sameProgressCards(layout, resizeProgressCard(layout, 'days', 'compact'))
    ).toBe(false)
  })

  it('describes a change for analytics', () => {
    const after: ProgressCardLayoutItem[] = [
      { id: 'weeks', size: 'wide' },
      { id: 'studies', size: 'small' },
      { id: 'dailyPace', size: 'wide' },
      { id: 'days', size: 'compact' },
    ]
    expect(describeProgressCardChange(layout, after)).toEqual({
      cards: 'weeks:wide,studies:small,dailyPace:wide,days:compact',
      card_count: 4,
      added: 1,
      removed: 1,
      resized: 2,
      moved: true,
    })
    expect(describeProgressCardChange(layout, layout).moved).toBe(false)
  })

  it('keeps cards from a newer version when writing an edit', () => {
    const stored = [
      { id: 'studies', size: 'small' },
      { id: 'fromTheFuture', size: 'small' },
    ]
    const edited = removeProgressCard(
      getEffectiveProgressCards(stored, withGoal),
      'studies'
    )
    expect(keepUnknownProgressCards(stored, edited)).toEqual([
      { id: 'fromTheFuture', size: 'small' },
    ])
    expect(keepUnknownProgressCards(null, edited)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import {
  ALL_TIME_CARDS,
  addProgressCard,
  defaultAllTimeProgressCards,
  defaultYearProgressCards,
  defaultProgressCards,
  describeProgressCardChange,
  getEffectiveProgressCards,
  keepUnknownProgressCards,
  MONTH_CARDS,
  moveProgressCard,
  removeProgressCard,
  resizeProgressCard,
  sameProgressCards,
  stepProgressCard,
  type ProgressCardLayoutItem,
  YEAR_CARDS,
} from '@/lib/progressCards'

const withGoal = { hasMonthlyGoal: true }

describe('progress cards', () => {
  it('starts from the role default until customized', () => {
    expect(
      getEffectiveProgressCards(
        MONTH_CARDS,
        null,
        defaultProgressCards(withGoal)
      )
    ).toEqual(defaultProgressCards(withGoal))
    expect(
      getEffectiveProgressCards(
        MONTH_CARDS,
        undefined,
        defaultProgressCards({ hasMonthlyGoal: false })
      ).map((c) => c.id)
    ).toEqual(['serviceDays', 'studies', 'days'])
  })

  it('keeps an emptied layout empty', () => {
    expect(
      getEffectiveProgressCards(MONTH_CARDS, [], defaultProgressCards(withGoal))
    ).toEqual([])
  })

  it('drops unknown cards and repeats, and fixes sizes', () => {
    expect(
      getEffectiveProgressCards(
        MONTH_CARDS,
        [
          { id: 'fromTheFuture', size: 'small' },
          { id: 'studies', size: 'wide' },
          { id: 'studies', size: 'small' },
          { id: 'projected', size: 'small' },
          { id: 'days', size: 'huge' },
          null,
        ],
        defaultProgressCards(withGoal)
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
    const added = addProgressCard(MONTH_CARDS, layout, 'weeks')
    expect(added[0]).toEqual({ id: 'weeks', size: 'wide' })
    expect(addProgressCard(MONTH_CARDS, added, 'weeks')).toBe(added)
  })

  it('removes and resizes', () => {
    expect(removeProgressCard(layout, 'studies').map((c) => c.id)).toEqual([
      'dailyPace',
      'projected',
      'days',
    ])
    expect(
      resizeProgressCard(MONTH_CARDS, layout, 'days', 'compact')[3]
    ).toEqual({
      id: 'days',
      size: 'compact',
    })

    expect(
      resizeProgressCard(MONTH_CARDS, layout, 'projected', 'small')
    ).toEqual(layout)
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
    const shown = ['dailyPace', 'studies', 'days'] as const
    expect(
      stepProgressCard(layout, [...shown], 'days', -1).map((c) => c.id)
    ).toEqual(['dailyPace', 'days', 'studies', 'projected'])
    expect(stepProgressCard(layout, [...shown], 'dailyPace', -1)).toBe(layout)
  })

  it('compares layouts', () => {
    expect(sameProgressCards(layout, [...layout])).toBe(true)
    expect(
      sameProgressCards(
        layout,
        resizeProgressCard(MONTH_CARDS, layout, 'days', 'compact')
      )
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
      getEffectiveProgressCards(
        MONTH_CARDS,
        stored,
        defaultProgressCards(withGoal)
      ),
      'studies'
    )
    expect(keepUnknownProgressCards(MONTH_CARDS, stored, edited)).toEqual([
      { id: 'fromTheFuture', size: 'small' },
    ])
    expect(keepUnknownProgressCards(MONTH_CARDS, null, edited)).toEqual([])
  })
})

describe('year and all time cards', () => {
  it('start from the role default, the pace chart first with an annual goal', () => {
    expect(
      defaultYearProgressCards({ hasAnnualGoal: true, showsTimeEntry: true })
    ).toEqual([
      { id: 'pace', size: 'wide' },
      { id: 'monthlyAverage', size: 'small' },
      { id: 'studies', size: 'small' },
    ])
    expect(
      defaultYearProgressCards({ hasAnnualGoal: false, showsTimeEntry: false })
    ).toEqual([
      { id: 'monthsShared', size: 'small' },
      { id: 'studies', size: 'small' },
    ])
    expect(defaultAllTimeProgressCards().map((c) => c.id)).toEqual([
      'bestYear',
      'yearlyAverage',
    ])
  })

  it("keep to their own tab's cards", () => {
    expect(
      getEffectiveProgressCards(
        YEAR_CARDS,
        [
          { id: 'dailyPace', size: 'small' },
          { id: 'pace', size: 'small' },
          { id: 'bestMonth', size: 'wide' },
        ],
        []
      )
    ).toEqual([
      { id: 'pace', size: 'wide' },
      { id: 'bestMonth', size: 'wide' },
    ])
    expect(
      addProgressCard(
        ALL_TIME_CARDS,
        defaultAllTimeProgressCards(),
        'studies'
      )[0]
    ).toEqual({ id: 'studies', size: 'small' })
  })
})

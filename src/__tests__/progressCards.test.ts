import { describe, expect, it } from 'vitest'
import {
  ALL_TIME_CARDS,
  addProgressCard,
  defaultAllTimeProgressCards,
  defaultYearProgressCards,
  defaultProgressCards,
  describeProgressCardChange,
  getEffectiveProgressCards,
  hiddenProgressCards,
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
      { id: 'days', size: 'compact' },
    ])
  })

  it('opens Days as the short list by default', () => {
    for (const hasMonthlyGoal of [true, false])
      expect(
        defaultProgressCards({ hasMonthlyGoal }).find((c) => c.id === 'days')
      ).toEqual({ id: 'days', size: 'compact' })
    expect(addProgressCard(MONTH_CARDS, [], 'days')).toEqual([
      { id: 'days', size: 'compact' },
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
      { id: 'milestones', size: 'wide' },
      { id: 'pace', size: 'wide' },
      { id: 'monthlyAverage', size: 'small' },
      { id: 'studies', size: 'small' },
      { id: 'months', size: 'compact' },
    ])
    expect(
      defaultYearProgressCards({ hasAnnualGoal: false, showsTimeEntry: false })
    ).toEqual([
      { id: 'monthsShared', size: 'small' },
      { id: 'studies', size: 'small' },
      { id: 'months', size: 'compact' },
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
      { id: 'milestones', size: 'wide' },
      { id: 'pace', size: 'wide' },
      { id: 'bestMonth', size: 'wide' },
      { id: 'months', size: 'compact' },
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

describe('year sections: milestones and months', () => {
  const pioneer = { hasAnnualGoal: true, showsTimeEntry: true }
  const publisher = { hasAnnualGoal: false, showsTimeEntry: false }
  const ids = (layout: ProgressCardLayoutItem<string>[]) =>
    layout.map((c) => c.id)

  const save = (
    stored: unknown,
    layout: ProgressCardLayoutItem<(typeof YEAR_CARDS.ids)[number]>[]
  ) => [
    ...keepUnknownProgressCards(YEAR_CARDS, stored, layout),
    ...hiddenProgressCards(YEAR_CARDS, layout),
  ]
  const read = (stored: unknown, role = pioneer) =>
    getEffectiveProgressCards(
      YEAR_CARDS,
      stored,
      defaultYearProgressCards(role)
    )

  it('gives a layout saved before they existed milestones first and months last', () => {
    const saved = [
      { id: 'studies', size: 'wide' },
      { id: 'pace', size: 'wide' },
    ]
    expect(read(saved)).toEqual([
      { id: 'milestones', size: 'wide' },
      { id: 'studies', size: 'wide' },
      { id: 'pace', size: 'wide' },
      { id: 'months', size: 'compact' },
    ])

    expect(ids(read([]))).toEqual(['milestones', 'months'])
  })

  it('keeps them where the User put them, at the size chosen', () => {
    const moved = moveProgressCard(read(null), 'months', 'milestones')
    const long = resizeProgressCard(YEAR_CARDS, moved, 'months', 'full')
    const stored = save(null, long)
    expect(stored.some((c) => 'hidden' in c)).toBe(false)
    expect(read(stored)[0]).toEqual({ id: 'months', size: 'full' })
    expect(ids(read(stored))).toEqual([
      'months',
      'milestones',
      'pace',
      'monthlyAverage',
      'studies',
    ])
  })

  it('keeps a removed one removed, and adds it back first', () => {
    const stored = save(null, removeProgressCard(read(null), 'months'))
    expect(stored.at(-1)).toEqual({
      id: 'months',
      size: 'compact',
      hidden: true,
    })
    expect(ids(read(stored))).not.toContain('months')

    const again = save(stored, removeProgressCard(read(stored), 'pace'))
    expect(ids(read(again))).toEqual([
      'milestones',
      'monthlyAverage',
      'studies',
    ])

    const back = save(again, addProgressCard(YEAR_CARDS, read(again), 'months'))
    expect(back.some((c) => 'hidden' in c)).toBe(false)
    expect(read(back)[0]).toEqual({ id: 'months', size: 'compact' })
  })

  it('survives an older version editing the synced layout', () => {
    const OLD = {
      ...YEAR_CARDS,
      ids: YEAR_CARDS.ids.filter(
        (id) => id !== 'months' && id !== 'milestones'
      ),
      implicit: undefined,
    }
    const stored = save(null, removeProgressCard(read(null), 'milestones'))
    const onOld = getEffectiveProgressCards(OLD, stored, [])
    expect(ids(onOld)).toEqual(['pace', 'monthlyAverage', 'studies'])
    const fromOld = keepUnknownProgressCards(
      OLD,
      stored,
      removeProgressCard(onOld, 'studies')
    )
    expect(ids(read(fromOld))).toEqual(['pace', 'monthlyAverage', 'months'])

    expect(ids(read([{ id: 'studies', size: 'small' }]))).toEqual([
      'milestones',
      'studies',
      'months',
    ])
  })

  it('keeps one arrangement across a role change', () => {
    const stored = save(
      null,
      moveProgressCard(
        moveProgressCard(read(null), 'months', 'milestones'),
        'milestones',
        'pace'
      )
    )
    expect(ids(read(stored))).toEqual([
      'months',
      'pace',
      'milestones',
      'monthlyAverage',
      'studies',
    ])

    const available = (id: string) => id !== 'milestones' && id !== 'pace'
    const asPublisher = read(stored, publisher)
    expect(ids(asPublisher.filter((c) => available(c.id)))).toEqual([
      'months',
      'monthlyAverage',
      'studies',
    ])

    const edited = save(
      stored,
      stepProgressCard(
        asPublisher,
        ['months', 'monthlyAverage', 'studies'],
        'months',
        1
      )
    )
    expect(ids(read(edited, pioneer))).toEqual([
      'pace',
      'milestones',
      'monthlyAverage',
      'months',
      'studies',
    ])
  })

  it('gives a role that gains an annual goal its milestones', () => {
    const stored = [
      { id: 'monthsShared', size: 'wide' },
      { id: 'studies', size: 'small' },
    ]
    expect(ids(read(stored, pioneer))).toEqual([
      'milestones',
      'monthsShared',
      'studies',
      'months',
    ])

    expect(ids(read(null, publisher))).toEqual([
      'monthsShared',
      'studies',
      'months',
    ])
  })

  it('reports the months size and a move for analytics', () => {
    const before = read(null)
    const after = resizeProgressCard(
      YEAR_CARDS,
      moveProgressCard(before, 'months', 'pace'),
      'months',
      'full'
    )
    expect(describeProgressCardChange(before, after)).toMatchObject({
      cards:
        'milestones:wide,months:full,pace:wide,monthlyAverage:small,studies:small',
      resized: 1,
      moved: true,
      removed: 0,
    })
  })
})

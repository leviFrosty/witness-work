/**
 * Progress Cards — the cards the User arranges on each Progress tab, under the
 * tab's own summary: the month's report on Month, the Service Year's total on
 * Year, and the lifetime total on All Time. That summary is always shown and
 * isn't one of them.
 *
 * Each tab has its own catalog, since a figure that means something for a month
 * (this month's Bible Studies) means something else over a year or a lifetime.
 * The layout is a list in reading order. A `small` card takes one of the grid's
 * two columns and a `wide` card both; `compact` and `full` are the Days list's
 * heights (a few days that scroll inside the card, or every day). Each tab's
 * layout is stored in its own preference, `null` until the User changes it so
 * they keep getting the default for their role.
 */

export type ProgressCardScope = 'month' | 'year' | 'allTime'

export const PROGRESS_CARD_IDS = [
  'dailyPace',
  'studies',
  'serviceDays',
  'visits',
  'credit',
  'weeks',
  'projected',
  'serviceYear',
  'yearPace',
  'streak',
  'lifetime',
  'mileage',
  'days',
] as const

/** A card on Progress → Month. */
export type ProgressCardId = (typeof PROGRESS_CARD_IDS)[number]

export const YEAR_CARD_IDS = [
  'pace',
  'needed',
  'monthlyAverage',
  'bestMonth',
  'lastYear',
  'monthsShared',
  'studies',
  'visits',
  'serviceDays',
  'mileage',
] as const

/** A card on Progress → Year, about the Service Year shown. */
export type YearCardId = (typeof YEAR_CARD_IDS)[number]

export const ALL_TIME_CARD_IDS = [
  'bestYear',
  'yearlyAverage',
  'bestMonth',
  'monthsShared',
  'studies',
  'visits',
  'serviceDays',
  'mileage',
] as const

/** A card on Progress → All Time. */
export type AllTimeCardId = (typeof ALL_TIME_CARD_IDS)[number]

export type ProgressCardSize = 'small' | 'wide' | 'compact' | 'full'

export type ProgressCardLayoutItem<Id extends string = ProgressCardId> = {
  id: Id
  size: ProgressCardSize
}

/** One tab's cards: which there are, and the sizes each comes in. */
export type ProgressCardCatalog<Id extends string> = {
  scope: ProgressCardScope
  ids: readonly Id[]
  /** The sizes each card comes in; the first is the size it's added at. */
  sizes: Record<Id, readonly ProgressCardSize[]>
}

/** The sizes each Month card comes in; the first is the size it's added at. */
export const PROGRESS_CARD_SIZES: Record<
  ProgressCardId,
  readonly ProgressCardSize[]
> = {
  dailyPace: ['small', 'wide'],
  studies: ['small', 'wide'],
  serviceDays: ['small', 'wide'],
  visits: ['small', 'wide'],
  credit: ['small', 'wide'],
  weeks: ['wide', 'small'],
  projected: ['wide'],
  serviceYear: ['wide', 'small'],
  yearPace: ['small', 'wide'],
  streak: ['small', 'wide'],
  lifetime: ['small', 'wide'],
  mileage: ['small', 'wide'],
  days: ['full', 'compact'],
}

export const MONTH_CARDS: ProgressCardCatalog<ProgressCardId> = {
  scope: 'month',
  ids: PROGRESS_CARD_IDS,
  sizes: PROGRESS_CARD_SIZES,
}

export const YEAR_CARDS: ProgressCardCatalog<YearCardId> = {
  scope: 'year',
  ids: YEAR_CARD_IDS,
  sizes: {
    pace: ['wide'],
    needed: ['small', 'wide'],
    monthlyAverage: ['small', 'wide'],
    bestMonth: ['small', 'wide'],
    lastYear: ['small', 'wide'],
    monthsShared: ['small', 'wide'],
    studies: ['small', 'wide'],
    visits: ['small', 'wide'],
    serviceDays: ['small', 'wide'],
    mileage: ['small', 'wide'],
  },
}

export const ALL_TIME_CARDS: ProgressCardCatalog<AllTimeCardId> = {
  scope: 'allTime',
  ids: ALL_TIME_CARD_IDS,
  sizes: {
    bestYear: ['small', 'wide'],
    yearlyAverage: ['small', 'wide'],
    bestMonth: ['small', 'wide'],
    monthsShared: ['small', 'wide'],
    studies: ['small', 'wide'],
    visits: ['small', 'wide'],
    serviceDays: ['small', 'wide'],
    mileage: ['small', 'wide'],
  },
}

/** The preference each tab's layout is stored in. */
export const PROGRESS_CARD_PREFERENCE = {
  month: 'progressCards',
  year: 'yearProgressCards',
  allTime: 'allTimeProgressCards',
} as const satisfies Record<ProgressCardScope, string>

const isCardId = <Id extends string>(
  catalog: ProgressCardCatalog<Id>,
  id: unknown
): id is Id =>
  typeof id === 'string' && (catalog.ids as readonly string[]).includes(id)

/** Whether a card spans both columns at this size. */
export const spansBothColumns = (size: ProgressCardSize) => size !== 'small'

export type ProgressCardDefaultsInput = {
  /** The month has a Monthly Goal to pace against. */
  hasMonthlyGoal: boolean
}

/**
 * The Month layout a User starts with: what Progress has always shown (the
 * projected total and every day), plus the daily pace to the goal and the
 * month's Bible Studies above them. Without a goal there's nothing to pace or
 * project, so days in service take the pace's place.
 */
export const defaultProgressCards = ({
  hasMonthlyGoal,
}: ProgressCardDefaultsInput): ProgressCardLayoutItem[] =>
  hasMonthlyGoal
    ? [
        { id: 'dailyPace', size: 'small' },
        { id: 'studies', size: 'small' },
        { id: 'projected', size: 'wide' },
        { id: 'days', size: 'full' },
      ]
    : [
        { id: 'serviceDays', size: 'small' },
        { id: 'studies', size: 'small' },
        { id: 'days', size: 'full' },
      ]

export type YearCardDefaultsInput = {
  hasAnnualGoal: boolean
  /** The User logs hours (`showsTimeEntry`), not just whether they shared. */
  showsTimeEntry: boolean
}

/**
 * The Year layout a User starts with. The pace chart the Year tab has always
 * shown stays first for a role with an Annual Goal. Hours give a monthly
 * average to read; without them, the months shared in ministry are what the
 * year comes to.
 */
export const defaultYearProgressCards = ({
  hasAnnualGoal,
  showsTimeEntry,
}: YearCardDefaultsInput): ProgressCardLayoutItem<YearCardId>[] => [
  ...(hasAnnualGoal ? [{ id: 'pace' as const, size: 'wide' as const }] : []),
  showsTimeEntry
    ? { id: 'monthlyAverage', size: 'small' }
    : { id: 'monthsShared', size: 'small' },
  { id: 'studies', size: 'small' },
]

/** The All Time layout a User starts with: their best year and a usual one. */
export const defaultAllTimeProgressCards =
  (): ProgressCardLayoutItem<AllTimeCardId>[] => [
    { id: 'bestYear', size: 'small' },
    { id: 'yearlyAverage', size: 'small' },
  ]

/**
 * The stored layout, cleaned up: unknown cards (from a newer app version on a
 * synced device) and repeats are dropped, and a size the card doesn't come in
 * falls back to its first size. `null` (never customized) gives the defaults.
 */
export const getEffectiveProgressCards = <Id extends string>(
  catalog: ProgressCardCatalog<Id>,
  stored: unknown,
  defaults: ProgressCardLayoutItem<Id>[]
): ProgressCardLayoutItem<Id>[] => {
  if (!Array.isArray(stored)) return defaults
  const seen = new Set<Id>()
  const out: ProgressCardLayoutItem<Id>[] = []
  for (const item of stored) {
    const id = (item as Partial<ProgressCardLayoutItem<string>> | null)?.id
    if (!isCardId(catalog, id) || seen.has(id)) continue
    seen.add(id)
    const size = (item as Partial<ProgressCardLayoutItem<Id>>).size
    const sizes = catalog.sizes[id]
    out.push({
      id,
      size: size && sizes.includes(size) ? size : sizes[0],
    })
  }
  return out
}

/**
 * `next` with the stored cards this version doesn't know (added on a newer
 * version and synced here) kept at the end, so editing here doesn't drop them
 * from that device.
 */
export const keepUnknownProgressCards = <Id extends string>(
  catalog: ProgressCardCatalog<Id>,
  stored: unknown,
  next: ProgressCardLayoutItem<Id>[]
): ProgressCardLayoutItem<Id>[] =>
  Array.isArray(stored)
    ? [
        ...next,
        // Typed as cards only to be stored; they're dropped when read.
        ...(stored.filter(
          (item) =>
            !isCardId(
              catalog,
              (item as Partial<ProgressCardLayoutItem<string>> | null)?.id
            )
        ) as ProgressCardLayoutItem<Id>[]),
      ]
    : next

/**
 * Adds a card at its first size, first, right under Add Cards where the User
 * added it. A card already shown stays put.
 */
export const addProgressCard = <Id extends string>(
  catalog: ProgressCardCatalog<Id>,
  layout: ProgressCardLayoutItem<Id>[],
  id: Id
): ProgressCardLayoutItem<Id>[] =>
  layout.some((item) => item.id === id)
    ? layout
    : [{ id, size: catalog.sizes[id][0] }, ...layout]

export const removeProgressCard = <Id extends string>(
  layout: ProgressCardLayoutItem<Id>[],
  id: Id
): ProgressCardLayoutItem<Id>[] => layout.filter((item) => item.id !== id)

export const resizeProgressCard = <Id extends string>(
  catalog: ProgressCardCatalog<Id>,
  layout: ProgressCardLayoutItem<Id>[],
  id: Id,
  size: ProgressCardSize
): ProgressCardLayoutItem<Id>[] =>
  layout.map((item) =>
    item.id === id && catalog.sizes[id].includes(size)
      ? { ...item, size }
      : item
  )

/**
 * Moves `id` to where `target` is in the full layout, shifting the cards
 * between them. Cards hidden for the User's role keep their place relative to
 * their neighbors, since only shown cards can be targets.
 */
export const moveProgressCard = <Id extends string>(
  layout: ProgressCardLayoutItem<Id>[],
  id: Id,
  target: Id
): ProgressCardLayoutItem<Id>[] => {
  const from = layout.findIndex((item) => item.id === id)
  const to = layout.findIndex((item) => item.id === target)
  if (from < 0 || to < 0 || from === to) return layout
  const next = [...layout]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Moves a shown card one place earlier or later among the shown cards (for
 * VoiceOver and TalkBack, which can't drag).
 */
export const stepProgressCard = <Id extends string>(
  layout: ProgressCardLayoutItem<Id>[],
  shown: Id[],
  id: Id,
  direction: -1 | 1
): ProgressCardLayoutItem<Id>[] => {
  const at = shown.indexOf(id)
  const target = shown[at + direction]
  if (at < 0 || target === undefined) return layout
  return moveProgressCard(layout, id, target)
}

export const sameProgressCards = <Id extends string>(
  a: ProgressCardLayoutItem<Id>[],
  b: ProgressCardLayoutItem<Id>[]
) =>
  a.length === b.length &&
  a.every((item, i) => item.id === b[i].id && item.size === b[i].size)

/**
 * What changed between two layouts, for `progress_cards_customized`: counts
 * only, plus whether the cards both had kept their order.
 */
export const describeProgressCardChange = <Id extends string>(
  before: ProgressCardLayoutItem<Id>[],
  after: ProgressCardLayoutItem<Id>[]
) => {
  const beforeIds = before.map((item) => item.id)
  const afterIds = after.map((item) => item.id)
  const kept = afterIds.filter((id) => beforeIds.includes(id))
  return {
    cards: after.map((item) => `${item.id}:${item.size}`).join(','),
    card_count: after.length,
    added: afterIds.filter((id) => !beforeIds.includes(id)).length,
    removed: beforeIds.filter((id) => !afterIds.includes(id)).length,
    resized: after.filter((item) =>
      before.some((b) => b.id === item.id && b.size !== item.size)
    ).length,
    moved: kept.join() !== beforeIds.filter((id) => kept.includes(id)).join(),
  }
}

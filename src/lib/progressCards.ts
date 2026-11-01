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

export type AllTimeCardId = (typeof ALL_TIME_CARD_IDS)[number]

export type ProgressCardSize = 'small' | 'wide' | 'compact' | 'full'

export type ProgressCardLayoutItem<Id extends string = ProgressCardId> = {
  id: Id
  size: ProgressCardSize
}

export type ProgressCardCatalog<Id extends string> = {
  scope: ProgressCardScope
  ids: readonly Id[]

  sizes: Record<Id, readonly ProgressCardSize[]>
}

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

export const spansBothColumns = (size: ProgressCardSize) => size !== 'small'

export type ProgressCardDefaultsInput = {
  hasMonthlyGoal: boolean
}

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

  showsTimeEntry: boolean
}

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

export const defaultAllTimeProgressCards =
  (): ProgressCardLayoutItem<AllTimeCardId>[] => [
    { id: 'bestYear', size: 'small' },
    { id: 'yearlyAverage', size: 'small' },
  ]

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

export const keepUnknownProgressCards = <Id extends string>(
  catalog: ProgressCardCatalog<Id>,
  stored: unknown,
  next: ProgressCardLayoutItem<Id>[]
): ProgressCardLayoutItem<Id>[] =>
  Array.isArray(stored)
    ? [
        ...next,

        ...(stored.filter(
          (item) =>
            !isCardId(
              catalog,
              (item as Partial<ProgressCardLayoutItem<string>> | null)?.id
            )
        ) as ProgressCardLayoutItem<Id>[]),
      ]
    : next

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

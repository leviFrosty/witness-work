/**
 * Progress Cards — the cards the User arranges under the month's report on
 * Progress → Month. The report card itself (Publisher status, Monthly Goal and
 * the month's total) is always shown and isn't one of them.
 *
 * The layout is a list in reading order. A `small` card takes one of the grid's
 * two columns and a `wide` card both; `compact` and `full` are the Days list's
 * heights (a few days that scroll inside the card, or every day). The layout is
 * stored in the `progressCards` preference, `null` until the User changes it so
 * they keep getting the default for their role.
 */

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

export type ProgressCardSize = 'small' | 'wide' | 'compact' | 'full'

export type ProgressCardLayoutItem = {
  id: ProgressCardId
  size: ProgressCardSize
}

/** The sizes each card comes in; the first is the size it's added at. */
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

const isCardId = (id: unknown): id is ProgressCardId =>
  typeof id === 'string' &&
  (PROGRESS_CARD_IDS as readonly string[]).includes(id)

/** Whether a card spans both columns at this size. */
export const spansBothColumns = (size: ProgressCardSize) => size !== 'small'

/** The size after `size` in the card's list, wrapping around. */
export const nextProgressCardSize = (
  id: ProgressCardId,
  size: ProgressCardSize
): ProgressCardSize => {
  const sizes = PROGRESS_CARD_SIZES[id]
  const at = sizes.indexOf(size)
  return sizes[(at + 1) % sizes.length]
}

export type ProgressCardDefaultsInput = {
  /** The month has a Monthly Goal to pace against. */
  hasMonthlyGoal: boolean
}

/**
 * The layout a User starts with: what Progress has always shown (the projected
 * total and every day), plus the daily pace to the goal and the month's Bible
 * Studies above them. Without a goal there's nothing to pace or project, so
 * days in service take the pace's place.
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

/**
 * The stored layout, cleaned up: unknown cards (from a newer app version on a
 * synced device) and repeats are dropped, and a size the card doesn't come in
 * falls back to its first size. `null` (never customized) gives the defaults.
 */
export const getEffectiveProgressCards = (
  stored: unknown,
  defaults: ProgressCardDefaultsInput
): ProgressCardLayoutItem[] => {
  if (!Array.isArray(stored)) return defaultProgressCards(defaults)
  const seen = new Set<ProgressCardId>()
  const out: ProgressCardLayoutItem[] = []
  for (const item of stored) {
    const id = (item as Partial<ProgressCardLayoutItem> | null)?.id
    if (!isCardId(id) || seen.has(id)) continue
    seen.add(id)
    const size = (item as Partial<ProgressCardLayoutItem>).size
    const sizes = PROGRESS_CARD_SIZES[id]
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
export const keepUnknownProgressCards = (
  stored: unknown,
  next: ProgressCardLayoutItem[]
): ProgressCardLayoutItem[] =>
  Array.isArray(stored)
    ? [
        ...next,
        // Typed as cards only to be stored; they're dropped when read.
        ...(stored.filter(
          (item) =>
            !isCardId((item as Partial<ProgressCardLayoutItem> | null)?.id)
        ) as ProgressCardLayoutItem[]),
      ]
    : next

/**
 * Adds a card at its first size, first, right under Add Cards where the User
 * added it. A card already shown stays put.
 */
export const addProgressCard = (
  layout: ProgressCardLayoutItem[],
  id: ProgressCardId
): ProgressCardLayoutItem[] =>
  layout.some((item) => item.id === id)
    ? layout
    : [{ id, size: PROGRESS_CARD_SIZES[id][0] }, ...layout]

export const removeProgressCard = (
  layout: ProgressCardLayoutItem[],
  id: ProgressCardId
): ProgressCardLayoutItem[] => layout.filter((item) => item.id !== id)

export const resizeProgressCard = (
  layout: ProgressCardLayoutItem[],
  id: ProgressCardId,
  size: ProgressCardSize
): ProgressCardLayoutItem[] =>
  layout.map((item) =>
    item.id === id && PROGRESS_CARD_SIZES[id].includes(size)
      ? { ...item, size }
      : item
  )

/**
 * Moves `id` to where `target` is in the full layout, shifting the cards
 * between them. Cards hidden for the User's role keep their place relative to
 * their neighbors, since only shown cards can be targets.
 */
export const moveProgressCard = (
  layout: ProgressCardLayoutItem[],
  id: ProgressCardId,
  target: ProgressCardId
): ProgressCardLayoutItem[] => {
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
export const stepProgressCard = (
  layout: ProgressCardLayoutItem[],
  shown: ProgressCardId[],
  id: ProgressCardId,
  direction: -1 | 1
): ProgressCardLayoutItem[] => {
  const at = shown.indexOf(id)
  const target = shown[at + direction]
  if (at < 0 || target === undefined) return layout
  return moveProgressCard(layout, id, target)
}

export const sameProgressCards = (
  a: ProgressCardLayoutItem[],
  b: ProgressCardLayoutItem[]
) =>
  a.length === b.length &&
  a.every((item, i) => item.id === b[i].id && item.size === b[i].size)

/**
 * What changed between two layouts, for `progress_cards_customized`: counts
 * only, plus whether the cards both had kept their order.
 */
export const describeProgressCardChange = (
  before: ProgressCardLayoutItem[],
  after: ProgressCardLayoutItem[]
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

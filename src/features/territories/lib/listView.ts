import {
  dueDate,
  isOverdue,
  territoryCounts,
  workingStreets,
} from '@/features/territories/lib/doors'
import type { Territory } from '@/features/territories/types/territory'

export const TERRITORY_SORTS = [
  'recent',
  'returnBy',
  'number',
  'progress',
] as const
export type TerritorySort = (typeof TERRITORY_SORTS)[number]

export const TERRITORY_FILTERS = ['overdue', 'notHome', 'streetsLeft'] as const
export type TerritoryFilter = (typeof TERRITORY_FILTERS)[number]

export type TerritorySortDirection = 'asc' | 'desc'

export type TerritoriesQuery = {
  sort: TerritorySort
  direction: TerritorySortDirection
  filters: TerritoryFilter[]
}

export const DEFAULT_TERRITORIES_QUERY: TerritoriesQuery = {
  sort: 'recent',
  direction: 'desc',
  filters: [],
}

const FILTERS: Record<
  TerritoryFilter,
  (territory: Territory, now: number) => boolean
> = {
  overdue: isOverdue,
  notHome: (territory) => territoryCounts(territory).notHome > 0,
  streetsLeft: (territory) =>
    territory.finishedAt === undefined &&
    workingStreets(territory).some((street) => street.workedAt === undefined),
}

export const matchesTerritoryFilters = (
  territory: Territory,
  filters: readonly TerritoryFilter[],
  now: number
) => filters.every((filter) => FILTERS[filter](territory, now))

const worked = (territory: Territory) => {
  const { streets, streetsWorked } = territoryCounts(territory)
  return streets === 0 ? 0 : streetsWorked / streets
}

const ORDER: Record<
  Exclude<TerritorySort, 'recent'>,
  (left: Territory, right: Territory) => number
> = {
  returnBy: (left, right) => dueDate(left).getTime() - dueDate(right).getTime(),
  number: (left, right) =>
    left.number.localeCompare(right.number, undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  progress: (left, right) => worked(left) - worked(right),
}

export const sortTerritories = (
  territories: readonly Territory[],
  { sort, direction }: Pick<TerritoriesQuery, 'sort' | 'direction'>,
  recency: (territory: Territory) => number
): Territory[] => {
  const order =
    sort === 'recent'
      ? (left: Territory, right: Territory) => recency(left) - recency(right)
      : ORDER[sort]
  const sign = direction === 'asc' ? 1 : -1
  return [...territories].sort(
    (left, right) => sign * order(left, right) || recency(right) - recency(left)
  )
}

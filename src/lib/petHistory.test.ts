import { describe, expect, it } from 'vitest'
import {
  keptKeepsakes,
  keptPurchases,
  keptRoomItems,
  keptWakes,
} from '@/lib/petHistory'
import { PET_KEEPSAKES_KEPT, PET_WAKES_KEPT, UNLOCK_ORDER } from '@/types/pet'

const day = (n: number) =>
  new Date(Date.UTC(2020, 0, 1) + n * 86_400_000).toISOString().slice(0, 10)

describe('keptWakes', () => {
  it('sorts, dedupes and drops unreadable days', () => {
    expect(
      keptWakes(['2026-02-01', 'soon', '2026-01-01', '2026-02-01'])
    ).toEqual(['2026-01-01', '2026-02-01'])
  })

  it('keeps every wake within 400 days of the newest, even past the cap', () => {
    const wakes = Array.from({ length: PET_WAKES_KEPT + 30 }, (_, n) =>
      day(n * 2)
    )

    expect(keptWakes(wakes)).toHaveLength(wakes.length)
  })

  it('drops the oldest past the cap once they are over 400 days old', () => {
    const wakes = Array.from({ length: PET_WAKES_KEPT + 10 }, (_, n) =>
      day(n * 10)
    )
    const kept = keptWakes(wakes)
    expect(kept).toHaveLength(PET_WAKES_KEPT)
    expect(kept[0]).toBe(day(100))
  })
})

describe('keptKeepsakes', () => {
  it('keeps one per day, the first seen, the newest 20', () => {
    const keepsakes = [
      { kind: 'fig' as const, on: day(1) },
      { kind: 'olive' as const, on: day(1) },
      ...Array.from({ length: 25 }, (_, n) => ({
        kind: 'lily' as const,
        on: day(n + 2),
      })),
    ]
    const kept = keptKeepsakes(keepsakes)
    expect(kept).toHaveLength(PET_KEEPSAKES_KEPT)
    expect(kept[0].on).toBe(day(7))
    expect(keptKeepsakes(keepsakes.slice(0, 2))).toEqual([
      { kind: 'fig', on: day(1) },
    ])
  })
})

describe('keptRoomItems', () => {
  it('keeps each item once, in unlock order, and newer ids after, sorted', () => {
    expect(
      keptRoomItems([
        UNLOCK_ORDER[3],
        'floor:marble',
        UNLOCK_ORDER[0],
        UNLOCK_ORDER[3],
        'bed:hammock',
        '',
      ])
    ).toEqual([UNLOCK_ORDER[0], UNLOCK_ORDER[3], 'bed:hammock', 'floor:marble'])
    expect(keptRoomItems([])).toEqual([])
  })
})

describe('keptPurchases', () => {
  const bought = (item: string, on: string, price = 5) => ({
    item,
    price,
    on,
  })

  it('keeps each item once: the first bought, then the cheaper', () => {
    expect(
      keptPurchases([
        bought('hat:cap', '2026-10-05', 6),
        bought('hat:cap', '2026-10-03', 9),
        bought('hat:bow', '2026-10-04', 5),
        bought('hat:bow', '2026-10-04', 4),
      ])
    ).toEqual([
      bought('hat:cap', '2026-10-03', 9),
      bought('hat:bow', '2026-10-04', 4),
    ])
  })

  it('keeps items and fields from a newer build, and drops what it can’t read', () => {
    expect(
      keptPurchases([
        null,
        'hat:bow',
        bought('', '2026-10-01'),
        bought('hat:bow', 'soon'),
        bought('hat:bow', '2026-10-01', -1),
        bought('hat:bow', '2026-10-01', 2.5),
        bought('hat:bow', '2026-10-01', 1e9),
        bought('hat:crown', '2026-10-02'),
        { ...bought('hat:cap', '2026-10-03'), note: 'gift' },
      ])
    ).toEqual([
      bought('hat:crown', '2026-10-02'),
      { ...bought('hat:cap', '2026-10-03'), note: 'gift' },
    ])
  })

  it('gives the same list whatever order the copies arrive in', () => {
    const list = [
      bought('hat:cap', '2026-10-05', 6),
      bought('floor:stone', '2026-10-05', 7),
      { ...bought('hat:cap', '2026-10-05', 6), note: 'c' },
      bought('bed:hay', '2026-10-01', 5),
      { ...bought('bed:hay', '2026-10-01', 5), note: 'b' },
      { ...bought('bed:hay', '2026-10-01', 5), note: 'a' },
    ]
    expect(keptPurchases([...list].reverse())).toEqual(keptPurchases(list))
  })
})

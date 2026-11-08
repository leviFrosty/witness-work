import { describe, expect, it } from 'vitest'

import { figGrowth, figStageOf } from '@/features/pet/lib/hatLife'

describe('the little fig tree', () => {
  it('grows through six stages by days out', () => {
    expect(
      [0, 2, 3, 7, 8, 15, 16, 29, 30, 49, 50, 500].map(figStageOf)
    ).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
  })

  it('counts only days out since it was bought', () => {
    const days = new Set([
      '2026-01-01',
      '2026-02-01',
      '2026-02-02',
      '2026-02-03',
      '2026-02-04',
    ])
    const bought = [{ item: 'hat:fig', price: 320, on: '2026-02-02' }]
    expect(figGrowth(bought, days)).toBe(1)
    expect(figGrowth(bought, new Set())).toBe(0)
  })

  it('has no growth of its own before it’s bought', () => {
    expect(
      figGrowth([{ item: 'hat:cap', price: 12, on: '2026-01-01' }], new Set())
    ).toBeUndefined()
  })
})

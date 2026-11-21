import { describe, expect, it } from 'vitest'
import { untoldPriceDrop } from '@/features/pet/lib/priceDrop'
import { PRICE_CUT } from '@/features/pet/lib/prices'

const paidBefore = {
  purchases: [
    { item: 'hat:bow', price: 10, on: '2026-11-01' },
    { item: 'floor:grass', price: 78, on: '2026-11-18' },
  ],
}

describe('the price drop tray item', () => {
  it('tells someone who paid the old prices what came back', () => {
    expect(untoldPriceDrop(paidBefore, null)).toBe(100 - 30 + (780 - 230))
  })

  it('stays quiet once this device has told them', () => {
    expect(untoldPriceDrop(paidBefore, PRICE_CUT)).toBe(0)
  })

  it('tells them again about a later cut', () => {
    expect(untoldPriceDrop(paidBefore, '2026-01')).toBeGreaterThan(0)
  })

  it('leaves out anyone who never paid more than today', () => {
    expect(untoldPriceDrop(null, null)).toBe(0)
    expect(untoldPriceDrop({}, null)).toBe(0)
    expect(
      untoldPriceDrop(
        { purchases: [{ item: 'hat:bow', price: 3, on: '2026-11-22' }] },
        null
      )
    ).toBe(0)
  })
})

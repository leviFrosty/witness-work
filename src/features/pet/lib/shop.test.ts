import { describe, expect, it } from 'vitest'
import {
  HAT_UNLOCK_ORDER,
  SECRET_ROOM_ITEMS,
  STARTER_ROOM_ITEMS,
  STUDY_UNLOCK_ORDER,
  UNLOCK_ORDER,
} from '@/types/pet'
import { ROOM_TABS } from '@/features/pet/lib/roomOptions'
import { FAKE_WALLETS } from '@/features/pet/lib/fakeWallet'
import { isRareItem, ITEM_PRICES, priceOf } from '@/features/pet/lib/prices'
import {
  shopItemState,
  SHOP_TABS,
  shortBy,
  tabGap,
} from '@/features/pet/lib/shop'

describe('Shop prices', () => {
  it('prices every regular item and hat, and no starter or secret', () => {
    for (const item of [
      ...UNLOCK_ORDER,
      ...STUDY_UNLOCK_ORDER,
      ...HAT_UNLOCK_ORDER,
    ])
      expect(priceOf(item)).not.toBeNull()
    for (const item of [...STARTER_ROOM_ITEMS, ...SECRET_ROOM_ITEMS])
      expect(priceOf(item)).toBeNull()
    expect(Object.keys(ITEM_PRICES).sort()).toEqual(
      [...UNLOCK_ORDER, ...STUDY_UNLOCK_ORDER, ...HAT_UNLOCK_ORDER].sort()
    )
  })

  it('asks 100 to 3,200 coins, whole in the old units, rare hats on top', () => {
    const prices = Object.values(ITEM_PRICES)
    for (const price of prices) {
      expect(price).toBeGreaterThanOrEqual(100)
      expect(price).toBeLessThanOrEqual(3200)
      expect(price % 10).toBe(0)
    }
    expect(priceOf('hat:fig')).toBe(Math.max(...prices))
    expect(priceOf('study:armchair')).toBe(360)
    expect(priceOf('floor:tile')).toBeGreaterThan(priceOf('floor:brick')!)

    expect(prices.reduce((sum, price) => sum + price, 0)).toBe(
      5720 + 1480 + 23430
    )
  })

  it('keeps a fake wallet that covers the whole Shop', () => {
    const shop = Object.values(ITEM_PRICES).reduce((sum, p) => sum + p, 0)
    expect(Math.max(...FAKE_WALLETS)).toBeGreaterThanOrEqual(shop)
  })

  it('lists hats cheapest first, and only the top five are rare', () => {
    const hats = HAT_UNLOCK_ORDER.map((item) => priceOf(item)!)
    expect(hats).toEqual([...hats].sort((a, b) => a - b))
    expect(HAT_UNLOCK_ORDER.filter(isRareItem)).toEqual(
      HAT_UNLOCK_ORDER.slice(-5)
    )
    expect(priceOf(HAT_UNLOCK_ORDER.at(-5)!)).toBe(1200)
    expect(isRareItem('hat:tophat')).toBe(false)
    expect(isRareItem('floor:tile')).toBe(false)
  })

  it('sells the study corner, with nothing in it to start', () => {
    expect(STARTER_ROOM_ITEMS).toContain('study:none')
    expect(STUDY_UNLOCK_ORDER.map(priceOf)).toEqual([
      100, 120, 160, 200, 240, 300, 360,
    ])
  })

  it('says how much more a price needs than the wallet holds', () => {
    expect(shortBy(8, 3)).toBe(5)
    expect(shortBy(8, 8)).toBe(0)
    expect(shortBy(8, 30)).toBe(0)
  })

  it('tells current, owned, for sale, short and secret apart', () => {
    const wallet = 120
    const state = (item: string, owned = false, current = false) =>
      shopItemState({ item, owned, current, wallet })
    expect(state('hat:bow', true, true)).toBe('current')
    expect(state('hat:bow', true)).toBe('owned')
    expect(state('hat:bow')).toBe('forSale')
    expect(state('hat:beanie')).toBe('short')
    expect(state('hat:tophat')).toBe('short')
    expect(state('hat:duck')).toBe('secret')

    expect(state('hat:duck', true)).toBe('owned')
  })
})

describe('Shop categories', () => {
  it('are the Decorate Room tabs that sell something', () => {
    for (const tab of SHOP_TABS) expect(ROOM_TABS).toContain(tab)
    expect(SHOP_TABS).not.toContain('sign')
    expect(SHOP_TABS).not.toContain('window')
  })

  it('keep the least gap when every tab fits', () => {
    expect(tabGap(1000, 60, 4)).toBe(4)
    expect(tabGap(0, 60, 4)).toBe(4)
  })

  it('cut the last tab in view about in half when they don’t all fit', () => {
    for (const room of [200, 260, 333, 361]) {
      const tab = 60
      const gap = tabGap(room, tab, 4)
      expect(gap).toBeGreaterThanOrEqual(4)
      const whole = Math.floor((room - tab / 2) / (tab + 4))
      expect(room - whole * (tab + gap)).toBeCloseTo(tab / 2)
    }
  })
})

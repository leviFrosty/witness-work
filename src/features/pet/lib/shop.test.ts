import { describe, expect, it } from 'vitest'
import {
  HAT_UNLOCK_ORDER,
  RARE_ROOM_ITEMS,
  SECRET_ROOM_ITEMS,
  STARTER_ROOM_ITEMS,
  STUDY_UNLOCK_ORDER,
  UNCOMMON_ROOM_ITEMS,
  UNLOCK_ORDER,
} from '@/types/pet'
import { ROOM_TABS } from '@/features/pet/lib/roomOptions'
import { FAKE_WALLETS } from '@/features/pet/lib/fakeWallet'
import { itemRarity, ITEM_PRICES, priceOf } from '@/features/pet/lib/prices'
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
      34820 + 6240 + 23430
    )
  })

  it('keeps a fake wallet that covers the whole Shop', () => {
    const shop = Object.values(ITEM_PRICES).reduce((sum, p) => sum + p, 0)
    expect(Math.max(...FAKE_WALLETS)).toBeGreaterThanOrEqual(shop)
  })

  it('lists hats cheapest first, and only the top five are rare', () => {
    const hats = HAT_UNLOCK_ORDER.map((item) => priceOf(item)!)
    expect(hats).toEqual([...hats].sort((a, b) => a - b))
    const rare = (item: string) => itemRarity(item) === 'rare'
    expect(HAT_UNLOCK_ORDER.filter(rare)).toEqual(HAT_UNLOCK_ORDER.slice(-5))
    expect(priceOf(HAT_UNLOCK_ORDER.at(-5)!)).toBe(1200)
    expect(itemRarity('hat:tophat')).toBe('common')
    expect(itemRarity('floor:tile')).toBe('common')
  })

  it('makes the eleven moving hats just below the rare ones uncommon', () => {
    const uncommon = HAT_UNLOCK_ORDER.filter(
      (item) => itemRarity(item) === 'uncommon'
    )
    expect(uncommon).toEqual(HAT_UNLOCK_ORDER.slice(-16, -5))
    expect(uncommon[0]).toBe('hat:propeller')
    expect(uncommon.at(-1)).toBe('hat:balloon')
  })

  it('sells the study corner, with nothing in it to start', () => {
    expect(STARTER_ROOM_ITEMS).toContain('study:none')
    expect(STUDY_UNLOCK_ORDER.map(priceOf)).toEqual([
      100, 120, 160, 200, 240, 300, 360, 700, 760, 1400, 1900,
    ])
  })

  it('prices uncommon and rare room items like the hats of their tier', () => {
    const priced = (items: readonly string[]) =>
      items.map((item) => priceOf(item)!)
    const hats = (items: readonly string[]) =>
      priced(items.filter((item) => item.startsWith('hat:')))
    const room = (items: readonly string[]) =>
      items.filter((item) => !item.startsWith('hat:'))
    for (const item of room(UNCOMMON_ROOM_ITEMS)) {
      expect(itemRarity(item)).toBe('uncommon')
      expect(priceOf(item)).toBeGreaterThanOrEqual(
        Math.min(...hats(UNCOMMON_ROOM_ITEMS))
      )
      expect(priceOf(item)).toBeLessThanOrEqual(
        Math.max(...hats(UNCOMMON_ROOM_ITEMS))
      )
    }
    for (const item of room(RARE_ROOM_ITEMS)) {
      expect(itemRarity(item)).toBe('rare')
      expect(priceOf(item)).toBeGreaterThanOrEqual(
        Math.min(...hats(RARE_ROOM_ITEMS))
      )
      expect(priceOf(item)).toBeLessThanOrEqual(
        Math.max(...hats(RARE_ROOM_ITEMS))
      )
    }
  })

  it('lists each part cheapest first, uncommon then rare', () => {
    for (const order of [UNLOCK_ORDER, STUDY_UNLOCK_ORDER]) {
      const byPart = new Map<string, number[]>()
      for (const item of order) {
        const part = item.split(':')[0]
        byPart.set(part, [...(byPart.get(part) ?? []), priceOf(item)!])
      }
      for (const prices of byPart.values())
        expect(prices).toEqual([...prices].sort((a, b) => a - b))
    }
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

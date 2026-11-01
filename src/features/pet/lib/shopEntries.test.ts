import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM } from '@/types/pet'
import { SCENE_H, SCENE_W } from '@/features/pet/art'
import { ROOM_THUMB_VIEWS } from '@/features/pet/lib/roomOptions'
import {
  isForSale,
  isOwned,
  pickedEntry,
  shopEntries,
  shopPreviewView,
  shopThumbView,
} from '@/features/pet/lib/shopEntries'
import { SHOP_TABS } from '@/features/pet/lib/shop'
import { unlockedRoomItems } from '@/features/pet/lib/unlocks'

describe('shopEntries', () => {
  it('lists each part of a category with its state and price', () => {
    const room = { ...DEFAULT_ROOM, hat: 'bow' as const }
    const unlocked = unlockedRoomItems(['hat:bow', 'hat:duck'], [])
    const [hats] = shopEntries('hat', room, unlocked, 12)
    expect(hats.part).toBe('hat')
    const byItem = new Map(hats.entries.map((entry) => [entry.item, entry]))

    expect(byItem.has('hat:none')).toBe(false)
    expect(byItem.get('hat:bow')).toMatchObject({
      state: 'current',
      price: 10,
    })
    expect(byItem.get('hat:cap')?.state).toBe('forSale')
    expect(byItem.get('hat:fedora')?.state).toBe('short')
    expect(byItem.get('hat:duck')).toMatchObject({
      state: 'owned',
      price: null,
    })
    expect(byItem.get('hat:teapot')).toMatchObject({
      state: 'secret',
      price: null,
    })
  })

  it('splits the wall into its colour and its pattern', () => {
    const sections = shopEntries(
      'wall',
      DEFAULT_ROOM,
      unlockedRoomItems([], []),
      0
    )
    expect(sections.map((section) => section.part)).toEqual([
      'wallColor',
      'wallPattern',
    ])
  })
})

describe('isForSale', () => {
  it('is what has a price and isn’t owned, whatever the wallet', () => {
    const [hats] = shopEntries(
      'hat',
      DEFAULT_ROOM,
      unlockedRoomItems(['hat:bow'], []),
      12
    )
    const forSale = hats.entries.filter(isForSale).map((entry) => entry.item)
    expect(forSale).toContain('hat:cap')
    expect(forSale).toContain('hat:tophat')
    expect(forSale).not.toContain('hat:bow')
    expect(forSale).not.toContain('hat:teapot')
  })
})

describe('pickedEntry', () => {
  const hats = (owned: string[]) =>
    shopEntries(
      'hat',
      { ...DEFAULT_ROOM, hat: 'bow' },
      unlockedRoomItems(owned, []),
      12
    )[0].entries

  it('opens on the first item still for sale, past what’s owned', () => {
    const entries = hats(['hat:bow', 'hat:cap'])
    expect(entries.slice(0, 3).map((entry) => entry.item)).toEqual([
      'hat:bow',
      'hat:cap',
      'hat:beanie',
    ])
    expect(pickedEntry(entries, null)?.item).toBe('hat:beanie')
  })

  it('keeps what was asked for, even once it’s bought', () => {
    expect(pickedEntry(hats(['hat:bow']), 'hat:fedora')?.item).toBe(
      'hat:fedora'
    )

    expect(pickedEntry(hats(['hat:bow']), 'hat:bow')?.item).toBe('hat:bow')
  })

  it('falls to a secret, then nothing, once all is owned', () => {
    const entries = hats([])
    const sold = entries.filter(isForSale).map((entry) => entry.item)
    const secrets = entries
      .filter((entry) => entry.state === 'secret')
      .map((entry) => entry.item)
    expect(pickedEntry(hats(sold), null)?.state).toBe('secret')
    const all = hats([...sold, ...secrets])
    expect(all.every(isOwned)).toBe(true)
    expect(pickedEntry(all, null)).toBeUndefined()
  })
})

describe('Shop views', () => {
  it('re-cuts a part’s thumbnail around its middle, inside the scene', () => {
    for (const part of Object.keys(ROOM_THUMB_VIEWS) as Array<
      keyof typeof ROOM_THUMB_VIEWS
    >) {
      for (const [w, h] of [
        [40, 24],
        [90, 54],
        [400, 400],
      ]) {
        const [x, y, vw, vh] = shopThumbView(part, w, h)
        expect(vw).toBe(Math.min(SCENE_W, w))
        expect(vh).toBe(Math.min(SCENE_H, h))
        expect(x).toBeGreaterThanOrEqual(0)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(x + vw).toBeLessThanOrEqual(SCENE_W)
        expect(y + vh).toBeLessThanOrEqual(SCENE_H)
      }
    }
  })

  it('shows a strip of the room inside the scene for every category', () => {
    for (const tab of SHOP_TABS) {
      const [x, y, w, h] = shopPreviewView(tab)
      expect(x + w).toBeLessThanOrEqual(SCENE_W)
      expect(y + h).toBeLessThanOrEqual(SCENE_H)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM } from '@/types/pet'
import {
  sharedRoomSettings,
  sharedRoomWindow,
} from '@/features/pet/lib/sharedRoom'

const kitten = { species: 'cat', coat: 'grey', name: 'Pip' } as const

describe('a buddy’s shared room', () => {
  it('is the default room when the buddy’s app shares no room', () => {
    expect(sharedRoomSettings(kitten)).toEqual({
      ...DEFAULT_ROOM,
      sign: 'none',
    })
    expect(sharedRoomWindow(kitten)).toEqual({ time: 'live', season: 'live' })
  })

  it('keeps the parts and window the buddy chose', () => {
    const room = sharedRoomSettings({
      ...kitten,
      hat: 'beret',
      room: { floor: 'stone', lamp: 'lantern', study: 'desk', time: 'night' },
    })
    expect(room).toMatchObject({
      floor: 'stone',
      lamp: 'lantern',
      study: 'desk',
      hat: 'beret',
      wallColor: DEFAULT_ROOM.wallColor,
      window: { time: 'night', season: 'live' },
    })
  })

  it('never shows the buddy’s sign, and leaves off a hat it doesn’t know', () => {
    const room = sharedRoomSettings({ ...kitten, hat: 'jetpack' })
    expect(room.sign).toBe('none')
    expect(room.hat).toBe('none')
  })
})

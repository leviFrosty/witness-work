import { beforeEach, describe, expect, it, vi } from 'vitest'

const disk = vi.hoisted(() => new Map<string, string | ArrayBuffer>())

vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    getString(key: string) {
      const value = disk.get(key)
      return typeof value === 'string' ? value : undefined
    }
    getBuffer(key: string) {
      const value = disk.get(key)
      return value instanceof ArrayBuffer ? value : undefined
    }
    set(key: string, value: string | ArrayBuffer) {
      disk.set(key, value)
    }
    delete(key: string) {
      disk.delete(key)
    }
    getAllKeys() {
      return [...disk.keys()]
    }
    clearAll() {
      disk.clear()
    }
  },
}))

import { slotStore } from '@/lib/syncTransport/server/slotStore'

const ACCOUNT = 'A'.repeat(22)
const bytes = (...values: number[]) => new Uint8Array(values)

describe('slotStore', () => {
  beforeEach(() => disk.clear())

  it('returns what it stored for the same account', () => {
    slotStore.write(ACCOUNT, 'slot-1', 'etag-1', bytes(1, 2, 3))
    expect(slotStore.read(ACCOUNT, 'slot-1')).toEqual({
      etag: 'etag-1',
      blob: bytes(1, 2, 3),
    })
    expect(slotStore.read('B'.repeat(22), 'slot-1')).toBeNull()
    expect(slotStore.read(ACCOUNT, 'slot-2')).toBeNull()
  })

  it('stores only the bytes of a view into a larger buffer', () => {
    const whole = bytes(9, 9, 1, 2, 3, 9)
    slotStore.write(ACCOUNT, 'slot-1', 'etag-1', whole.subarray(2, 5))
    expect(slotStore.read(ACCOUNT, 'slot-1')?.blob).toEqual(bytes(1, 2, 3))
  })

  it('replaces a slot’s copy', () => {
    slotStore.write(ACCOUNT, 'slot-1', 'etag-1', bytes(1))
    slotStore.write(ACCOUNT, 'slot-1', 'etag-2', bytes(2))
    expect(slotStore.read(ACCOUNT, 'slot-1')).toEqual({
      etag: 'etag-2',
      blob: bytes(2),
    })
  })

  it('reads nothing from half a record', () => {
    slotStore.write(ACCOUNT, 'slot-1', 'etag-1', bytes(1))
    disk.delete('m:slot-1')
    expect(slotStore.read(ACCOUNT, 'slot-1')).toBeNull()

    slotStore.write(ACCOUNT, 'slot-2', 'etag-1', bytes(1))
    disk.delete('b:slot-2')
    expect(slotStore.read(ACCOUNT, 'slot-2')).toBeNull()

    disk.set('m:slot-3', 'not json')
    disk.set('b:slot-3', bytes(1).buffer)
    expect(slotStore.read(ACCOUNT, 'slot-3')).toBeNull()
  })

  it('prunes slots that left the account or belong to another', () => {
    slotStore.write(ACCOUNT, 'slot-1', 'etag-1', bytes(1))
    slotStore.write(ACCOUNT, 'slot-2', 'etag-1', bytes(2))
    slotStore.write('B'.repeat(22), 'slot-3', 'etag-1', bytes(3))
    disk.set('b:slot-4', bytes(4).buffer)

    slotStore.prune(ACCOUNT, new Set(['slot-1', 'slot-3', 'slot-4']))
    expect([...disk.keys()].sort()).toEqual(['b:slot-1', 'm:slot-1'])
  })

  it('removes one slot, or all of them', () => {
    slotStore.write(ACCOUNT, 'slot-1', 'etag-1', bytes(1))
    slotStore.write(ACCOUNT, 'slot-2', 'etag-1', bytes(2))
    slotStore.remove('slot-1')
    expect(slotStore.read(ACCOUNT, 'slot-1')).toBeNull()
    expect(slotStore.read(ACCOUNT, 'slot-2')).not.toBeNull()
    slotStore.clear()
    expect(disk.size).toBe(0)
  })
})

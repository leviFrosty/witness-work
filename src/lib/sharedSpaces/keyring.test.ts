import { describe, expect, it } from 'vitest'
import { toB64u } from '@/lib/bytes'
import {
  createSpaceKeyring,
  memoryKeyringStorage,
  type SpaceKeyringStorage,
} from '@/lib/sharedSpaces/keyring'

const key = (fill: number) => new Uint8Array(32).fill(fill)

function lockedStorage(stored: string | null) {
  let locked = true
  const writes: (string | null)[] = []
  const storage: SpaceKeyringStorage = {
    read: async () => {
      if (locked) throw new Error('locked')
      return stored
    },
    write: (value) => {
      stored = value
      writes.push(value)
    },
  }
  return {
    storage,
    writes,
    unlock: () => {
      locked = false
    },
    stored: () => stored,
  }
}

describe('the space keyring', () => {
  it('trusts a key once and never replaces it', async () => {
    const keyring = createSpaceKeyring(memoryKeyringStorage())
    await keyring.ready()
    expect(keyring.trust('space', 1, key(1))).toBe('new')
    expect(keyring.trust('space', 1, key(1))).toBe('same')
    expect(keyring.trust('space', 1, key(2))).toBe('mismatch')
    expect(keyring.key('space', 1)).toEqual(key(1))
  })

  it('keeps a stored key over one trusted before storage was read', async () => {
    const storage = memoryKeyringStorage()
    storage.write(JSON.stringify({ space: { 1: toB64u(key(1)) } }))
    const keyring = createSpaceKeyring({
      ...storage,
      read: async () => storage.read(),
    })
    keyring.trust('space', 1, key(9))
    keyring.trust('space', 2, key(2))
    await keyring.ready()
    expect(keyring.key('space', 1)).toEqual(key(1))
    expect(keyring.key('space', 2)).toEqual(key(2))
  })

  it('writes nothing back after a failed read, and reads again before it does', async () => {
    const errors: unknown[] = []
    const locked = lockedStorage(
      JSON.stringify({ old: { 1: toB64u(key(1)), 2: toB64u(key(2)) } })
    )
    const keyring = createSpaceKeyring(locked.storage, {
      onError: (error) => errors.push(error),
    })
    await keyring.ready()
    expect(errors).toHaveLength(1)
    keyring.trust('new', 1, key(3))
    await keyring.flushed()

    expect(locked.writes).toEqual([])
    expect(keyring.key('new', 1)).toEqual(key(3))

    locked.unlock()
    await keyring.ready()
    await keyring.flushed()
    expect(keyring.epochs('old')).toEqual([2, 1])
    expect(JSON.parse(locked.stored()!)).toEqual({
      old: { 1: toB64u(key(1)), 2: toB64u(key(2)) },
      new: { 1: toB64u(key(3)) },
    })
  })

  it('forgets a space before storage was read, and keeps the others', async () => {
    const locked = lockedStorage(
      JSON.stringify({
        gone: { 1: toB64u(key(1)) },
        kept: { 1: toB64u(key(2)) },
      })
    )
    const keyring = createSpaceKeyring(locked.storage)
    await keyring.ready()
    keyring.forget('gone')
    await keyring.flushed()
    expect(locked.writes).toEqual([])
    locked.unlock()
    await keyring.ready()
    await keyring.flushed()
    expect(keyring.epochs('gone')).toEqual([])
    expect(JSON.parse(locked.stored()!)).toEqual({
      kept: { 1: toB64u(key(2)) },
    })
  })

  it('writes over storage at once when a reset forgets everything, even before a read worked', async () => {
    const locked = lockedStorage(
      JSON.stringify({ space: { 1: toB64u(key(1)) } })
    )
    const keyring = createSpaceKeyring(locked.storage)
    await keyring.ready()
    keyring.forgetAll()
    await keyring.flushed()
    expect(locked.writes).toEqual([null])
    expect(locked.stored()).toBeNull()

    keyring.trust('next', 1, key(5))
    await keyring.flushed()
    locked.unlock()
    await keyring.ready()
    await keyring.flushed()
    expect(keyring.epochs('space')).toEqual([])
    expect(JSON.parse(locked.stored()!)).toEqual({
      next: { 1: toB64u(key(5)) },
    })
  })
})

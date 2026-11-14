import { describe, expect, it } from 'vitest'
import { fromB64u, utf8 } from '@/lib/bytes'
import {
  CHANGE_BLOCK_BYTES,
  ChangeOpenError,
  changeAad,
  newChangeId,
  openChange,
  resealChange,
  sealChange,
} from '@/lib/syncTransport/server/changeCrypto'
import { deriveSyncKey } from '@/lib/syncTransport/server/syncCrypto'

const KEY = deriveSyncKey(new Uint8Array(32).fill(1))
const OLDER = deriveSyncKey(new Uint8Array(32).fill(2))
const ADDRESS = {
  accountId: 'A'.repeat(22),
  slotId: 'slot-aaaaaaaa',
  changeId: 'c'.repeat(22),
}
const NONCE = new Uint8Array(24).fill(5)

const problemOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return error instanceof ChangeOpenError ? error.problem : 'other'
  }
  return null
}

describe('a sealed change', () => {
  it('opens to what was sealed', () => {
    const change = { v: 1, leaves: { writtenAt: 5 } }
    const blob = sealChange(KEY, change, ADDRESS, NONCE)
    expect(openChange(KEY, blob, ADDRESS)).toEqual(change)
  })

  it('is always a whole number of 256-byte blocks', () => {
    for (const size of [0, 1, 100, 200, 400, 5_000, 70_000]) {
      const change = {
        v: 1,
        leaves: {
          text: Array.from({ length: size }, (_, i) => (i * 7919) % 97).join(),
        },
      }
      const blob = sealChange(KEY, change, ADDRESS, NONCE)
      expect(blob.length % CHANGE_BLOCK_BYTES).toBe(0)
      expect(openChange(KEY, blob, ADDRESS)).toEqual(change)
    }
  })

  it('hides which small record changed: both are one block', () => {
    const visit = { v: 1, records: { visits: [{ id: 'v1', note: 'Came by' }] } }
    const time = { v: 1, records: { time: [{ id: 't1', minutes: 90 }] } }
    expect(sealChange(KEY, visit, ADDRESS, NONCE)).toHaveLength(256)
    expect(sealChange(KEY, time, ADDRESS, NONCE)).toHaveLength(256)
  })

  it('names the account, the slot and the change it belongs to', () => {
    expect(changeAad(ADDRESS)).toEqual(
      utf8(
        `ww-account/v1/sync-change\n${ADDRESS.accountId}\n${ADDRESS.slotId}\n${ADDRESS.changeId}`
      )
    )
    const blob = sealChange(KEY, { v: 1 }, ADDRESS, NONCE)
    for (const other of [
      { ...ADDRESS, accountId: 'B'.repeat(22) },
      { ...ADDRESS, slotId: 'slot-bbbbbbbb' },
      { ...ADDRESS, changeId: 'd'.repeat(22) },
    ])
      expect(problemOf(() => openChange(KEY, blob, other))).toBe('decrypt')
  })

  it('opens under an older key from the key history', () => {
    const blob = sealChange(OLDER, { v: 1 }, ADDRESS, NONCE)
    expect(problemOf(() => openChange(KEY, blob, ADDRESS))).toBe('decrypt')
    expect(openChange(KEY, blob, ADDRESS, [OLDER])).toEqual({ v: 1 })
  })

  it('refuses a blob of the wrong shape', () => {
    const blob = sealChange(KEY, { v: 1 }, ADDRESS, NONCE)
    expect(problemOf(() => openChange(KEY, blob.slice(0, 255), ADDRESS))).toBe(
      'format'
    )
    const versioned = blob.slice()
    versioned[0] = 2
    expect(problemOf(() => openChange(KEY, versioned, ADDRESS))).toBe('format')
    const damaged = blob.slice()
    damaged[40] ^= 1
    expect(problemOf(() => openChange(KEY, damaged, ADDRESS))).toBe('decrypt')
  })

  it('moves to a new key unread, and says when it is already there', () => {
    const blob = sealChange(OLDER, { v: 1, leaves: { a: 1 } }, ADDRESS, NONCE)
    const keys = { from: [OLDER], to: KEY, nonce: new Uint8Array(24).fill(6) }
    const moved = resealChange(blob, ADDRESS, keys)
    if (moved.outcome !== 'resealed') throw new Error(moved.outcome)
    expect(moved.blob).toHaveLength(blob.length)
    expect(openChange(KEY, moved.blob, ADDRESS)).toEqual({
      v: 1,
      leaves: { a: 1 },
    })
    expect(resealChange(moved.blob, ADDRESS, keys).outcome).toBe('current')
    expect(
      resealChange(blob, ADDRESS, { ...keys, from: [new Uint8Array(32)] })
        .outcome
    ).toBe('unopened')
  })

  it('makes ids the server accepts', () => {
    const id = newChangeId((length) => new Uint8Array(length).fill(255))
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(fromB64u(id)).toHaveLength(16)
  })
})

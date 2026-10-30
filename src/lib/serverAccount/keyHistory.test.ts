import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { describe, expect, it } from 'vitest'
import { fromB64u, fromUtf8, toB64u, utf8 } from '@/lib/bytes'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  appendKeyHistory,
  fitKeyHistory,
  historyKeys,
  historyLabelKeys,
  KEY_HISTORY_SEALED_MAX,
  KeyHistoryError,
  keyHistoryEntry,
  openKeyHistory,
  sealKeyHistory,
} from '@/lib/serverAccount/keyHistory'

const K1 = new Uint8Array(32).fill(1)
const K2 = new Uint8Array(32).fill(2)
const K3 = new Uint8Array(32).fill(3)
const ACCOUNT = 'A'.repeat(22)
const nonce = new Uint8Array(24).fill(9)

/** The contract's derivation, written out: `HKDF-SHA256(K, "", label, 32)`. */
const derived = (key: Uint8Array, label: string) =>
  toB64u(hkdf(sha256, key, new Uint8Array(0), utf8(label), 32))

describe('key history', () => {
  it('holds the old key’s derived keys, never the key itself', () => {
    const entry = keyHistoryEntry(K1, 0, 1_767_225_600_000)
    expect(entry).toEqual({
      keyEpoch: 0,
      retiredAt: 1_767_225_600_000,
      accountPub: deriveAccountSigningKey(K1).publicKey,
      backup: derived(K1, 'ww-account/v1/backup'),
      backupFile: derived(K1, 'ww-account/v1/backup-file'),
      sync: derived(K1, 'ww-account/v1/sync'),
      syncPhoto: derived(K1, 'ww-account/v1/sync-photo'),
      syncPhotoName: derived(K1, 'ww-account/v1/sync-photo-name'),
      device: derived(K1, 'ww-account/v1/device'),
    })
    expect(JSON.stringify(entry)).not.toContain(toB64u(K1))
  })

  it('seals under the new key’s history key, bound to the account and epoch', () => {
    const history = appendKeyHistory(null, keyHistoryEntry(K1, 0, 5))
    const sealed = sealKeyHistory(K2, ACCOUNT, 1, history, nonce)

    // Opened by hand as the contract describes it.
    const bytes = fromB64u(sealed)
    expect(bytes[0]).toBe(1)
    const plaintext = xchacha20poly1305(
      fromB64u(derived(K2, 'ww-account/v1/key-history')),
      bytes.subarray(1, 25),
      utf8(`ww-account/v1/key-history\n${ACCOUNT}\n1`)
    ).decrypt(bytes.subarray(25))
    expect(JSON.parse(fromUtf8(plaintext))).toEqual(history)

    expect(openKeyHistory(K2, ACCOUNT, 1, sealed)).toEqual(history)
  })

  it('doesn’t open under another key, account or epoch', () => {
    const sealed = sealKeyHistory(
      K2,
      ACCOUNT,
      1,
      appendKeyHistory(null, keyHistoryEntry(K1, 0, 5)),
      nonce
    )
    expect(() => openKeyHistory(K1, ACCOUNT, 1, sealed)).toThrow(
      KeyHistoryError
    )
    expect(() => openKeyHistory(K2, 'B'.repeat(22), 1, sealed)).toThrow(
      KeyHistoryError
    )
    expect(() => openKeyHistory(K2, ACCOUNT, 2, sealed)).toThrow(
      KeyHistoryError
    )
    expect(() => openKeyHistory(K2, ACCOUNT, 1, 'not-a-blob')).toThrow(
      KeyHistoryError
    )
  })

  it('keeps every entry, newest last', () => {
    let history = appendKeyHistory(null, keyHistoryEntry(K1, 0, 0))
    for (let epoch = 1; epoch <= 24; epoch++)
      history = appendKeyHistory(
        history,
        keyHistoryEntry(new Uint8Array(32).fill(epoch), epoch, epoch)
      )
    expect(history.entries).toHaveLength(25)
    expect(history.entries[0].keyEpoch).toBe(0)
    expect(history.entries.at(-1)!.keyEpoch).toBe(24)
    expect(
      openKeyHistory(
        K2,
        ACCOUNT,
        25,
        sealKeyHistory(K2, ACCOUNT, 25, history, nonce)
      )
    ).toEqual(history)
  })

  it('past the size limit, keeps only the oldest entries’ file keys', () => {
    let history = appendKeyHistory(null, keyHistoryEntry(K1, 0, 0))
    for (let epoch = 1; epoch < 200; epoch++)
      history = appendKeyHistory(
        history,
        keyHistoryEntry(new Uint8Array(32).fill(epoch), epoch, epoch)
      )
    const sealed = sealKeyHistory(K2, ACCOUNT, 200, history, nonce)
    expect(sealed.length).toBeLessThanOrEqual(KEY_HISTORY_SEALED_MAX)
    const opened = openKeyHistory(K2, ACCOUNT, 200, sealed)
    expect(opened.entries).toHaveLength(200)
    // Old "My Account" files still open with every key the account had.
    expect(historyKeys(opened, 'backupFile').at(-1)).toEqual(
      fromB64u(derived(K1, 'ww-account/v1/backup-file'))
    )
    expect(historyKeys(opened, 'backupFile')).toHaveLength(200)
    expect(opened.entries[0]).toEqual({
      keyEpoch: 0,
      retiredAt: 0,
      backupFile: derived(K1, 'ww-account/v1/backup-file'),
    })
    // The newest stay whole, oldest trimmed first.
    expect(opened.entries.at(-1)).toEqual(history.entries.at(-1))
    const whole = opened.entries.filter((entry) => 'sync' in entry)
    expect(whole.length).toBeGreaterThan(0)
    expect(historyKeys(opened, 'sync')).toHaveLength(whole.length)
    expect(opened.entries.slice(-whole.length)).toEqual(whole)
  })

  it('fits a history as it seals it, and refuses one that can’t fit', () => {
    let history = appendKeyHistory(null, keyHistoryEntry(K1, 0, 0))
    for (let epoch = 1; epoch < 200; epoch++)
      history = appendKeyHistory(
        history,
        keyHistoryEntry(new Uint8Array(32).fill(epoch), epoch, epoch)
      )
    const fitted = fitKeyHistory(history)
    expect(
      openKeyHistory(
        K2,
        ACCOUNT,
        200,
        sealKeyHistory(K2, ACCOUNT, 200, history, nonce)
      )
    ).toEqual(fitted)
    expect(fitKeyHistory(fitted)).toEqual(fitted)

    const trimmedOnly = {
      v: 1 as const,
      entries: Array.from({ length: 700 }, (_, keyEpoch) => ({
        keyEpoch,
        retiredAt: keyEpoch,
        backupFile: 'B'.repeat(43),
      })),
    }
    expect(() => fitKeyHistory(trimmedOnly)).toThrow(KeyHistoryError)
  })

  it('lists one kind’s keys newest first', () => {
    const history = appendKeyHistory(
      appendKeyHistory(null, keyHistoryEntry(K1, 0, 1)),
      keyHistoryEntry(K3, 1, 2)
    )
    expect(historyKeys(history, 'backupFile').map(toB64u)).toEqual([
      derived(K3, 'ww-account/v1/backup-file'),
      derived(K1, 'ww-account/v1/backup-file'),
    ])
    expect(historyKeys(null, 'sync')).toEqual([])
    expect(historyLabelKeys(history)).toEqual([
      {
        accountPub: deriveAccountSigningKey(K3).publicKey,
        key: fromB64u(derived(K3, 'ww-account/v1/device')),
      },
      {
        accountPub: deriveAccountSigningKey(K1).publicKey,
        key: fromB64u(derived(K1, 'ww-account/v1/device')),
      },
    ])
  })

  it('refuses a history that isn’t one', () => {
    const seal = (value: unknown) =>
      sealKeyHistory(K2, ACCOUNT, 1, value as never, nonce)
    expect(() =>
      openKeyHistory(K2, ACCOUNT, 1, seal({ v: 2, entries: [] }))
    ).toThrow(KeyHistoryError)
    expect(() =>
      openKeyHistory(
        K2,
        ACCOUNT,
        1,
        seal({ v: 1, entries: [{ keyEpoch: 0, backup: 'x' }] })
      )
    ).toThrow(KeyHistoryError)
  })
})

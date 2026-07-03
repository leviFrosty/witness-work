import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_FILENAME,
  AccountFile,
  decideAccountAction,
  isAccountFilename,
  parseAccountFile,
} from '@/lib/accountFile'

const file = (overrides: Partial<AccountFile> = {}): AccountFile => ({
  v: 1,
  accountId: 'aaaa-1111',
  entitled: false,
  updatedAt: 1_700_000_000_000,
  ...overrides,
})

describe('lib/accountFile', () => {
  describe('isAccountFilename', () => {
    it('matches the canonical filename', () => {
      expect(isAccountFilename(ACCOUNT_FILENAME)).toBe(true)
    })

    it('matches iCloud conflict duplicates', () => {
      expect(isAccountFilename('witness-work-account 2.json')).toBe(true)
    })

    it('does not match per-device sync files or legacy names', () => {
      expect(isAccountFilename('witness-work-abc123.json')).toBe(false)
      expect(isAccountFilename('witness-work.json')).toBe(false)
      expect(isAccountFilename('witness-work 2.json')).toBe(false)
    })
  })

  describe('parseAccountFile', () => {
    it('round-trips a valid payload', () => {
      const payload = file({ deviceName: 'iPhone 17 Pro' })
      expect(parseAccountFile(JSON.stringify(payload))).toEqual(payload)
    })

    it.each([
      ['not json', 'not-json{'],
      ['null', 'null'],
      ['wrong version', JSON.stringify({ ...file(), v: 2 })],
      [
        'missing accountId',
        JSON.stringify({ ...file(), accountId: undefined }),
      ],
      ['empty accountId', JSON.stringify(file({ accountId: '' }))],
      ['non-boolean entitled', JSON.stringify({ ...file(), entitled: 'yes' })],
      ['missing updatedAt', JSON.stringify({ ...file(), updatedAt: 'now' })],
    ])('rejects %s', (_label, json) => {
      expect(parseAccountFile(json)).toBeNull()
    })
  })

  describe('decideAccountAction', () => {
    const mine = 'bbbb-2222'
    const theirs = 'aaaa-1111'

    it('claims when no file exists', () => {
      expect(
        decideAccountAction({ accountId: mine, entitled: false, file: null })
      ).toEqual({ type: 'claim' })
      expect(
        decideAccountAction({ accountId: mine, entitled: true, file: null })
      ).toEqual({ type: 'claim' })
    })

    it('does nothing when the file is ours and the flag agrees', () => {
      expect(
        decideAccountAction({
          accountId: mine,
          entitled: true,
          file: file({ accountId: mine, entitled: true }),
        })
      ).toEqual({ type: 'none' })
    })

    it('refreshes (not rewrites) when the file is ours but the flag disagrees — the file may be ahead of our cached CustomerInfo', () => {
      expect(
        decideAccountAction({
          accountId: mine,
          entitled: false,
          file: file({ accountId: mine, entitled: true }),
        })
      ).toEqual({ type: 'refresh' })
      expect(
        decideAccountAction({
          accountId: mine,
          entitled: true,
          file: file({ accountId: mine, entitled: false }),
        })
      ).toEqual({ type: 'refresh' })
    })

    it('adopts a foreign claim when not entitled — this is the second-device migration path', () => {
      expect(
        decideAccountAction({
          accountId: mine,
          entitled: false,
          file: file({ accountId: theirs, entitled: true }),
        })
      ).toEqual({ type: 'adopt', accountId: theirs })
      // Even an un-entitled foreign claim is adopted, so a non-supporter
      // household converges on one id before any purchase happens.
      expect(
        decideAccountAction({
          accountId: mine,
          entitled: false,
          file: file({ accountId: theirs, entitled: false }),
        })
      ).toEqual({ type: 'adopt', accountId: theirs })
    })

    it('claims over an un-entitled foreign claim when entitled — the entitlement holder always wins', () => {
      expect(
        decideAccountAction({
          accountId: mine,
          entitled: true,
          file: file({ accountId: theirs, entitled: false }),
        })
      ).toEqual({ type: 'claim' })
    })

    it('leaves an entitled foreign claim alone when also entitled — never adopt away from a live entitlement, never ping-pong writes', () => {
      expect(
        decideAccountAction({
          accountId: mine,
          entitled: true,
          file: file({ accountId: theirs, entitled: true }),
        })
      ).toEqual({ type: 'none' })
    })

    it('converges the production migration scenario regardless of claim order', () => {
      const supporterId = 'supporter-device'
      const otherId = 'other-device'

      // Order 1: supporter claims first; other device adopts.
      expect(
        decideAccountAction({
          accountId: otherId,
          entitled: false,
          file: file({ accountId: supporterId, entitled: true }),
        })
      ).toEqual({ type: 'adopt', accountId: supporterId })

      // Order 2: other device claims first; supporter overwrites…
      expect(
        decideAccountAction({
          accountId: supporterId,
          entitled: true,
          file: file({ accountId: otherId, entitled: false }),
        })
      ).toEqual({ type: 'claim' })
      // …then the other device sees the new claim and adopts (Order 1).
    })
  })
})

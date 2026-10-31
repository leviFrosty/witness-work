import { describe, expect, it } from 'vitest'
import type { AccountFile } from '@/lib/accountFile'
import {
  type AccountClaim,
  accountFileClaim,
  decideAccountReconcile,
  parseAccountClaim,
  pickWinningClaim,
} from '@/lib/accountClaim'

const ID_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const ID_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const ID_C = 'cccccccc-0000-4000-8000-000000000003'
/** Server accounts, as `accountFingerprint`. */
const ACCT_A = 'a'.repeat(64)
const ACCT_B = 'b'.repeat(64)

const claim = (
  appUserId: string,
  claimedAt: number,
  entitled = false
): AccountClaim => ({ appUserId, claimedAt, entitled })

const file = (
  accountId: string,
  updatedAt: number,
  entitled = false,
  claimedAt?: number
): AccountFile => ({
  v: 1,
  accountId,
  entitled,
  updatedAt,
  ...(claimedAt !== undefined ? { claimedAt } : {}),
})

describe('parseAccountClaim', () => {
  it('reads a claim', () => {
    expect(parseAccountClaim(claim(ID_A, 5, true))).toEqual(
      claim(ID_A, 5, true)
    )
  })

  it.each([
    ['missing', undefined],
    ['not an object', 'abc'],
    ['an anonymous id', claim('$RCAnonymousID:abc123', 5)],
    ['too short an id', claim('abc', 5)],
    ['no time', { appUserId: ID_A, entitled: false }],
    ['a bad time', { appUserId: ID_A, entitled: false, claimedAt: -1 }],
    ['no flag', { appUserId: ID_A, claimedAt: 5 }],
  ])('drops a claim that is %s', (_, value) => {
    expect(parseAccountClaim(value)).toBeNull()
  })

  it('keeps only the known fields', () => {
    expect(parseAccountClaim({ ...claim(ID_A, 5), extra: 'x' })).toEqual(
      claim(ID_A, 5)
    )
  })

  it('reads the server account it was made under', () => {
    expect(parseAccountClaim({ ...claim(ID_A, 5), account: ACCT_A })).toEqual({
      ...claim(ID_A, 5),
      account: ACCT_A,
    })
  })

  it("drops a claim whose account can't be read", () => {
    expect(parseAccountClaim({ ...claim(ID_A, 5), account: 'x' })).toBeNull()
  })
})

describe('accountFileClaim', () => {
  it("uses the file's claim time", () => {
    expect(accountFileClaim(file(ID_A, 9, true, 3))).toEqual(
      claim(ID_A, 3, true)
    )
  })

  it('falls back to when an older version wrote it', () => {
    expect(accountFileClaim(file(ID_A, 9))).toEqual(claim(ID_A, 9))
  })

  it('keeps the server account it was made under', () => {
    expect(accountFileClaim({ ...file(ID_A, 9), account: ACCT_A })).toEqual({
      ...claim(ID_A, 9),
      account: ACCT_A,
    })
  })
})

describe('pickWinningClaim', () => {
  it('has no winner without claims', () => {
    expect(pickWinningClaim([])).toBeNull()
  })

  it('prefers an entitled claim to an earlier one', () => {
    expect(
      pickWinningClaim([claim(ID_A, 1), claim(ID_B, 2, true)])?.appUserId
    ).toBe(ID_B)
  })

  it('prefers the earliest claim', () => {
    expect(pickWinningClaim([claim(ID_B, 2), claim(ID_A, 1)])?.appUserId).toBe(
      ID_A
    )
  })

  it('breaks a tie with the smaller id', () => {
    expect(pickWinningClaim([claim(ID_B, 1), claim(ID_A, 1)])?.appUserId).toBe(
      ID_A
    )
  })

  it('picks the earliest of two entitled claims', () => {
    expect(
      pickWinningClaim([claim(ID_B, 2, true), claim(ID_A, 3, true)])?.appUserId
    ).toBe(ID_B)
  })

  it('counts an id as entitled when any of its claims is', () => {
    expect(
      pickWinningClaim([claim(ID_A, 1), claim(ID_B, 3), claim(ID_B, 4, true)])
    ).toEqual(claim(ID_B, 3, true))
  })

  it("gives an id its earliest claim's time", () => {
    expect(
      pickWinningClaim([claim(ID_A, 5), claim(ID_B, 4), claim(ID_A, 2)])
    ).toEqual(claim(ID_A, 2))
  })

  it("doesn't depend on the order it sees claims in", () => {
    const claims = [claim(ID_C, 1), claim(ID_A, 2, true), claim(ID_B, 2, true)]
    const winners = [claims, [...claims].reverse(), [claims[1], claims[2]]].map(
      (c) => pickWinningClaim(c)?.appUserId
    )
    expect(new Set(winners)).toEqual(new Set([ID_A]))
  })
})

describe('decideAccountReconcile', () => {
  const own = (id: string, claimedAt: number, entitled = false) =>
    claim(id, claimedAt, entitled)

  describe('sync claims', () => {
    it("adopts a peer's earlier claim", () => {
      expect(
        decideAccountReconcile({
          own: own(ID_B, 2),
          file: null,
          fileRead: false,
          peers: [claim(ID_A, 1)],
        })
      ).toEqual({
        type: 'adopt',
        accountId: ID_A,
        claimedAt: 1,
        source: 'sync',
        account: null,
      })
    })

    it('keeps its own claim when it is the earliest', () => {
      expect(
        decideAccountReconcile({
          own: own(ID_A, 1),
          file: null,
          fileRead: false,
          peers: [claim(ID_B, 2)],
        })
      ).toEqual({ type: 'none' })
    })

    it("adopts an entitled peer's later claim", () => {
      expect(
        decideAccountReconcile({
          own: own(ID_A, 1),
          file: null,
          fileRead: false,
          peers: [claim(ID_B, 5, true)],
        })
      ).toMatchObject({ type: 'adopt', accountId: ID_B, claimedAt: 5 })
    })

    it('never gives up an entitled id', () => {
      expect(
        decideAccountReconcile({
          own: own(ID_B, 5, true),
          file: null,
          fileRead: false,
          peers: [claim(ID_A, 1), claim(ID_C, 2, true)],
        })
      ).toEqual({ type: 'none' })
    })

    it("keeps an adopted claim's time", () => {
      // Every device on the id shows the time of the claim they adopted.
      expect(
        decideAccountReconcile({
          own: own(ID_C, 3),
          file: null,
          fileRead: false,
          peers: [claim(ID_A, 1), claim(ID_A, 1)],
        })
      ).toMatchObject({ type: 'adopt', accountId: ID_A, claimedAt: 1 })
    })

    it('stays when a peer is on the same id', () => {
      expect(
        decideAccountReconcile({
          own: own(ID_A, 1),
          file: null,
          fileRead: false,
          peers: [claim(ID_A, 1, true)],
        })
      ).toEqual({ type: 'none' })
    })
  })

  describe('the account file', () => {
    it('claims a missing file', () => {
      expect(
        decideAccountReconcile({
          own: own(ID_A, 1),
          file: null,
          fileRead: true,
          peers: [],
        })
      ).toEqual({ type: 'claim' })
    })

    it("adopts the file's earlier claim", () => {
      expect(
        decideAccountReconcile({
          own: own(ID_B, 10),
          file: file(ID_A, 9),
          fileRead: true,
          peers: [],
        })
      ).toEqual({
        type: 'adopt',
        accountId: ID_A,
        claimedAt: 9,
        source: 'account_file',
        account: null,
      })
    })

    it('adopts an earlier sync claim over the file', () => {
      expect(
        decideAccountReconcile({
          own: own(ID_C, 5),
          file: file(ID_B, 4),
          fileRead: true,
          peers: [claim(ID_A, 1)],
        })
      ).toMatchObject({ type: 'adopt', accountId: ID_A, source: 'sync' })
    })

    it('takes over a file its earlier claim beats', () => {
      // So devices that read only the file (older versions) follow it.
      expect(
        decideAccountReconcile({
          own: own(ID_A, 1),
          file: file(ID_B, 4),
          fileRead: true,
          peers: [],
        })
      ).toEqual({ type: 'claim' })
    })

    it('leaves an entitled file alone, keeping its own entitled id', () => {
      expect(
        decideAccountReconcile({
          own: own(ID_A, 1, true),
          file: file(ID_B, 4, true),
          fileRead: true,
          peers: [],
        })
      ).toEqual({ type: 'none' })
    })

    it("claims over an un-entitled file when it's entitled", () => {
      expect(
        decideAccountReconcile({
          own: own(ID_B, 5, true),
          file: file(ID_A, 1),
          fileRead: true,
          peers: [],
        })
      ).toEqual({ type: 'claim' })
    })

    it('refreshes when its own file disagrees about the entitlement', () => {
      expect(
        decideAccountReconcile({
          own: own(ID_A, 1),
          file: file(ID_A, 4, true),
          fileRead: true,
          peers: [],
        })
      ).toEqual({ type: 'refresh' })
    })

    it('adopts a foreign entitled file over its earlier claim', () => {
      expect(
        decideAccountReconcile({
          own: own(ID_A, 1),
          file: file(ID_B, 4, true),
          fileRead: true,
          peers: [],
        })
      ).toMatchObject({ type: 'adopt', accountId: ID_B })
    })
  })

  describe('claims made under another server account', () => {
    const tagged = (c: AccountClaim, account: string): AccountClaim => ({
      ...c,
      account,
    })

    it("ignores a peer's claim from another account", () => {
      expect(
        decideAccountReconcile({
          own: own(ID_B, 2),
          file: null,
          fileRead: false,
          peers: [tagged(claim(ID_A, 1, true), ACCT_A)],
          account: ACCT_B,
        })
      ).toEqual({ type: 'none' })
    })

    it("adopts a peer's claim from this account, keeping the account", () => {
      expect(
        decideAccountReconcile({
          own: own(ID_B, 2),
          file: null,
          fileRead: false,
          peers: [tagged(claim(ID_A, 1, true), ACCT_B)],
          account: ACCT_B,
        })
      ).toMatchObject({ type: 'adopt', accountId: ID_A, account: ACCT_B })
    })

    it("leaves another account's file alone: no adopting, no claiming", () => {
      expect(
        decideAccountReconcile({
          own: own(ID_B, 2),
          file: { ...file(ID_A, 1, true), account: ACCT_A },
          fileRead: true,
          peers: [],
          account: ACCT_B,
        })
      ).toEqual({ type: 'none' })
      // Entitled, it would otherwise claim over an un-entitled file.
      expect(
        decideAccountReconcile({
          own: own(ID_B, 2, true),
          file: { ...file(ID_A, 1), account: ACCT_A },
          fileRead: true,
          peers: [],
          account: ACCT_B,
        })
      ).toEqual({ type: 'none' })
    })

    it("adopts this account's file", () => {
      expect(
        decideAccountReconcile({
          own: own(ID_B, 2),
          file: { ...file(ID_A, 1, true), account: ACCT_B },
          fileRead: true,
          peers: [],
          account: ACCT_B,
        })
      ).toMatchObject({
        type: 'adopt',
        accountId: ID_A,
        source: 'account_file',
        account: ACCT_B,
      })
    })

    it('takes an untagged file as before', () => {
      expect(
        decideAccountReconcile({
          own: own(ID_B, 2),
          file: file(ID_A, 1, true),
          fileRead: true,
          peers: [],
          account: ACCT_B,
        })
      ).toMatchObject({ type: 'adopt', accountId: ID_A, account: ACCT_B })
    })

    it("without an account, adopts a tagged claim as that account's", () => {
      // The id stays that account's: another account signing in drops it.
      expect(
        decideAccountReconcile({
          own: own(ID_B, 2),
          file: { ...file(ID_A, 1, true), account: ACCT_A },
          fileRead: true,
          peers: [],
          account: null,
        })
      ).toMatchObject({ type: 'adopt', accountId: ID_A, account: ACCT_A })
    })
  })
})

/**
 * Devices on one account, each publishing its claim in its sync payload and
 * reading the others' (and the account file, when they share one). A customer
 * is entitled or not in RevenueCat, so a device is entitled when its id is.
 */
type Device = { id: string; claimedAt: number; readsFile: boolean }

function simulate(options: {
  devices: Device[]
  entitled: Set<string>
  file?: AccountFile | null
  rounds: number
}) {
  const devices = options.devices.map((d) => ({ ...d }))
  let file = options.file ?? null
  let clock = 1_000
  const ownClaim = (d: Device) =>
    claim(d.id, d.claimedAt, options.entitled.has(d.id))
  const history: string[][] = []
  for (let round = 0; round < options.rounds; round++) {
    for (const device of devices) {
      const action = decideAccountReconcile({
        own: ownClaim(device),
        file: device.readsFile ? file : null,
        fileRead: device.readsFile,
        peers: devices.filter((d) => d !== device).map(ownClaim),
      })
      clock++
      if (action.type === 'adopt') {
        device.id = action.accountId
        device.claimedAt = action.claimedAt
      } else if (action.type === 'claim' || action.type === 'refresh') {
        file = {
          v: 1,
          accountId: device.id,
          entitled: options.entitled.has(device.id),
          updatedAt: clock,
          claimedAt: device.claimedAt,
        }
      }
    }
    history.push(devices.map((d) => d.id))
  }
  return { ids: devices.map((d) => d.id), history, file }
}

describe('convergence', () => {
  const settles = (history: string[][]) =>
    history.slice(-2).every((ids) => ids.join() === history.at(-1)!.join())

  it('two devices settle on the earliest claim', () => {
    const { ids, history } = simulate({
      devices: [
        { id: ID_B, claimedAt: 20, readsFile: false },
        { id: ID_A, claimedAt: 10, readsFile: false },
      ],
      entitled: new Set(),
      rounds: 4,
    })
    expect(ids).toEqual([ID_A, ID_A])
    expect(settles(history)).toBe(true)
  })

  it('two devices settle on the entitled one', () => {
    const { ids, history } = simulate({
      devices: [
        { id: ID_A, claimedAt: 10, readsFile: false },
        { id: ID_B, claimedAt: 20, readsFile: false },
      ],
      entitled: new Set([ID_B]),
      rounds: 4,
    })
    expect(ids).toEqual([ID_B, ID_B])
    expect(settles(history)).toBe(true)
  })

  it('three devices, some sharing a file, settle on one id', () => {
    const { ids, history, file } = simulate({
      devices: [
        { id: ID_C, claimedAt: 30, readsFile: true },
        { id: ID_B, claimedAt: 20, readsFile: true },
        { id: ID_A, claimedAt: 40, readsFile: false },
      ],
      entitled: new Set(),
      file: { v: 1, accountId: ID_C, entitled: false, updatedAt: 30 },
      rounds: 5,
    })
    expect(new Set(ids)).toEqual(new Set([ID_B]))
    expect(file?.accountId).toBe(ID_B)
    expect(settles(history)).toBe(true)
  })

  it('two entitled devices keep their ids; the third joins the earlier', () => {
    const { ids, history } = simulate({
      devices: [
        { id: ID_A, claimedAt: 30, readsFile: true },
        { id: ID_B, claimedAt: 20, readsFile: true },
        { id: ID_C, claimedAt: 10, readsFile: false },
      ],
      entitled: new Set([ID_A, ID_B]),
      rounds: 5,
    })
    expect(ids).toEqual([ID_A, ID_B, ID_B])
    expect(settles(history)).toBe(true)
  })

  it('a device signing in later adopts the account it joins', () => {
    // A web-only account created its id first; the phone joins afterwards
    // with its own (later) install id.
    const { ids } = simulate({
      devices: [
        { id: ID_B, claimedAt: 10, readsFile: false },
        { id: ID_A, claimedAt: 50, readsFile: true },
      ],
      entitled: new Set(),
      rounds: 3,
    })
    expect(ids).toEqual([ID_B, ID_B])
  })

  it('a device that becomes entitled pulls the others onto its id', () => {
    const devices: Device[] = [
      { id: ID_A, claimedAt: 10, readsFile: false },
      { id: ID_A, claimedAt: 10, readsFile: false },
      { id: ID_C, claimedAt: 30, readsFile: false },
    ]
    // Before the third device adopted, it bought under its own id.
    const { ids, history } = simulate({
      devices,
      entitled: new Set([ID_C]),
      rounds: 4,
    })
    expect(ids).toEqual([ID_C, ID_C, ID_C])
    expect(settles(history)).toBe(true)
  })
})

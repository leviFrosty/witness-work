import { describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import type { KeyChangeRecord } from '@/lib/accountKey/keyChangeRecord'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import type { ResumeResult } from './engine'
import { createKeyRetiredHandler } from './retired'

const K1 = new Uint8Array(32).fill(1)
const K2 = new Uint8Array(32).fill(2)
const pub = (key: Uint8Array) => deriveAccountSigningKey(key).publicKey
const ACCOUNT = 'A'.repeat(22)

function setup(
  options: {
    record?: KeyChangeRecord | null
    stored?: Uint8Array | null
    resume?: ResumeResult
    connects?: boolean
    lastAccountId?: string | null
  } = {}
) {
  const deps = {
    record: vi.fn(async () => options.record ?? null),
    resume: vi.fn(async () => options.resume ?? ({ state: 'none' } as const)),
    discard: vi.fn(async () => undefined),
    lastAccountId: () =>
      options.lastAccountId === undefined ? ACCOUNT : options.lastAccountId,
    storedKey: vi.fn(async () =>
      options.stored === null ? null : toB64u(options.stored ?? K1)
    ),
    isRetired: (accountPub: string) => accountPub === pub(K1),
    connect: vi.fn(async () => {
      if (options.connects === false) throw new Error('key_retired')
    }),
    forgetRetired: vi.fn(async () => undefined),
    signOut: vi.fn(),
  }
  return { deps, handle: createKeyRetiredHandler(deps) }
}

const record = (stage: KeyChangeRecord['stage']): KeyChangeRecord => ({
  v: 1,
  accountId: ACCOUNT,
  oldKey: toB64u(K1),
  newKey: toB64u(K2),
  oldKeyEpoch: 0,
  stage,
  startedAt: 0,
})

describe('a retired key', () => {
  it('signs this device out, keeping its account to rejoin', async () => {
    const { deps, handle } = setup()
    expect(await handle(pub(K1), 77)).toBe('signedOut')
    expect(deps.forgetRetired).toHaveBeenCalledWith(pub(K1))
    expect(deps.signOut).toHaveBeenCalledWith(ACCOUNT, 77)
    expect(deps.connect).not.toHaveBeenCalled()
  })

  it('rejoins with a new key the store already holds (iCloud Keychain)', async () => {
    const { deps, handle } = setup({ stored: K2 })
    expect(await handle(pub(K1), 77)).toBe('rejoined')
    expect(deps.connect).toHaveBeenCalledWith(K2, ACCOUNT)
    expect(deps.forgetRetired).not.toHaveBeenCalled()
    expect(deps.signOut).not.toHaveBeenCalled()
  })

  it('never opens a session without knowing the account: it signs out', async () => {
    const { deps, handle } = setup({ stored: K2, lastAccountId: null })
    expect(await handle(pub(K1), 3)).toBe('signedOut')
    expect(deps.connect).not.toHaveBeenCalled()
    expect(deps.signOut).toHaveBeenCalledWith(null, 3)
  })

  it('leaves its own change to resolve later, signed in, when the server can’t say yet', async () => {
    for (const resume of [
      { state: 'unresolved' },
      { state: 'awaiting', stage: 'confirmed' },
    ] as const) {
      const { deps, handle } = setup({ record: record('confirmed'), resume })
      expect(await handle(pub(K1), 1)).toBe('unresolved')
      expect(deps.signOut).not.toHaveBeenCalled()
      expect(deps.forgetRetired).not.toHaveBeenCalled()
      expect(deps.discard).not.toHaveBeenCalled()
    }
  })

  it('signs out when the stored key opens no session either', async () => {
    const { deps, handle } = setup({ stored: K2, connects: false })
    expect(await handle(pub(K1), null)).toBe('signedOut')
    expect(deps.signOut).toHaveBeenCalledWith(ACCOUNT, null)
  })

  it('is this device’s own change once it committed', async () => {
    for (const stage of ['committed', 'stored', 'buddies-reset'] as const) {
      const { deps, handle } = setup({ record: record(stage) })
      expect(await handle(pub(K1), 1)).toBe('ownChange')
      expect(deps.signOut).not.toHaveBeenCalled()
      expect(deps.forgetRetired).not.toHaveBeenCalled()
    }
  })

  it('resolves a confirmed change first, which may have committed', async () => {
    const { deps, handle } = setup({
      record: record('confirmed'),
      resume: { state: 'done' },
    })
    expect(await handle(pub(K1), 1)).toBe('ownChange')
    expect(deps.resume).toHaveBeenCalledTimes(1)
    expect(deps.signOut).not.toHaveBeenCalled()
  })

  it('discards a pending change another device beat, then signs out', async () => {
    const { deps, handle } = setup({ record: record('pending') })
    expect(await handle(pub(K1), 1)).toBe('signedOut')
    expect(deps.discard).toHaveBeenCalledTimes(1)
    expect(deps.signOut).toHaveBeenCalled()
  })

  it('ignores a change record for another key', async () => {
    const { deps, handle } = setup({ record: record('committed') })
    const other = pub(new Uint8Array(32).fill(5))
    expect(await handle(other, 1)).toBe('signedOut')
    expect(deps.forgetRetired).toHaveBeenCalledWith(other)
  })
})

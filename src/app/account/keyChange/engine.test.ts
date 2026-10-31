import { describe, expect, it, vi } from 'vitest'
import { fromB64u, toB64u } from '@/lib/bytes'
import {
  type KeyChangeRecord,
  memoryKeyChangeRecordStore,
} from '@/lib/accountKey/keyChangeRecord'
import { HttpError } from '@/lib/http/request'
import { AccountSessionError } from '@/lib/serverAccount/session'
import type {
  RekeyRequest,
  RekeyResult,
} from '@/lib/serverAccount/keyChangeClient'
import {
  appendKeyHistory,
  historyKeys,
  keyHistoryEntry,
  openKeyHistory,
  sealKeyHistory,
} from '@/lib/serverAccount/keyHistory'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  createKeyChangeEngine,
  KeyChangeError,
  type KeyChangeEngineDeps,
} from './engine'
import type { KeyChangeStep } from './steps'

const ACCOUNT = 'A'.repeat(22)
const K0 = new Uint8Array(32).fill(7)
const K1 = new Uint8Array(32).fill(1)
const pub = (key: Uint8Array) => deriveAccountSigningKey(key).publicKey

/** Ww-api's side: the account's key, epoch and history, and sessions. */
function fakeServer() {
  const server = {
    accountPub: pub(K1),
    keyEpoch: 1,
    // K0 was the account's key before K1.
    history: sealKeyHistory(
      K1,
      ACCOUNT,
      1,
      appendKeyHistory(null, keyHistoryEntry(K0, 0, 1)),
      new Uint8Array(24)
    ) as string | null,
    retired: new Set([pub(K0)]),
    /** This device still holds a session. */
    session: true,
    requests: [] as RekeyRequest[],
    /** The next rekey commits, but its answer is lost. */
    loseAnswer: false,
    /** Another device changes the key first. */
    beatenBy: null as Uint8Array | null,
  }
  const rekey = vi.fn(async (request: RekeyRequest): Promise<RekeyResult> => {
    server.requests.push(request)
    if (server.beatenBy) {
      server.retired.add(server.accountPub)
      server.accountPub = pub(server.beatenBy)
      server.keyEpoch++
      server.session = false
      server.beatenBy = null
    }
    if (pub(request.oldKey) !== server.accountPub)
      return server.retired.has(pub(request.oldKey))
        ? { outcome: 'keyRetired', changedAt: 99 }
        : { outcome: 'conflict', keyEpoch: server.keyEpoch }
    if (request.keyEpoch !== server.keyEpoch)
      return { outcome: 'conflict', keyEpoch: server.keyEpoch }
    server.retired.add(server.accountPub)
    server.accountPub = pub(request.newKey)
    server.keyEpoch++
    server.history = request.history
    if (server.loseAnswer) {
      server.loseAnswer = false
      throw new HttpError('offline', null, null)
    }
    return {
      outcome: 'committed',
      keyEpoch: server.keyEpoch,
      accessToken: 'at-new',
      accessExpiresAt: 5,
    }
  })
  const deps = {
    readAccount: vi.fn(async (key: Uint8Array) => {
      if (!server.session) throw new HttpError('client', 401, 'unauthorized')
      void key
      return {
        accountId: ACCOUNT,
        accountPub: server.accountPub,
        keyEpoch: server.keyEpoch,
      }
    }),
    readHistory: vi.fn(async () => ({
      keyEpoch: server.keyEpoch,
      history: server.history,
    })),
    rekey,
    hasSession: vi.fn(async () => server.session),
    openInto: vi.fn(async (key: Uint8Array, accountId: string) => {
      expect(accountId).toBe(ACCOUNT)
      if (server.retired.has(pub(key))) return 'keyRetired' as const
      if (server.accountPub !== pub(key)) return 'unknownAccount' as const
      server.session = true
      return 'opened' as const
    }),
  }
  return { server, deps }
}

function setup(
  options: {
    server?: ReturnType<typeof fakeServer>
    records?: ReturnType<typeof memoryKeyChangeRecordStore>
    steps?: Partial<Record<'reseal' | 'buddies-reset', KeyChangeStep>>
    online?: boolean
  } = {}
) {
  const fake = options.server ?? fakeServer()
  const records = options.records ?? memoryKeyChangeRecordStore()
  const stages: string[] = []
  const written = {
    write: async (record: KeyChangeRecord) => {
      stages.push(record.stage)
      await records.write(record)
    },
    read: records.read,
    remove: async () => {
      stages.push('removed')
      await records.remove()
    },
  }
  const events: [string, Record<string, unknown>][] = []
  let nonce = 10
  const steps = {
    reseal: options.steps?.reseal ?? vi.fn(async () => undefined),
    'buddies-reset':
      options.steps?.['buddies-reset'] ?? vi.fn(async () => undefined),
  }
  const deps: KeyChangeEngineDeps = {
    records: written,
    now: () => 1_000,
    randomBytes: (length) => {
      nonce++
      return new Uint8Array(length).fill(nonce % 250)
    },
    platform: 'ios',
    deviceKey: async () => K1,
    isOnline: () => options.online ?? true,
    server: { ...fake.deps, sealLabel: () => 'sealed-label' },
    prepare: vi.fn(async () => undefined),
    adopt: vi.fn(async () => undefined),
    saveHistory: vi.fn(async () => undefined),
    step: (name) => steps[name],
    track: (event, props) => events.push([event, props]),
  }
  const engine = createKeyChangeEngine(deps)
  return { engine, deps, fake, records, stages, steps, events }
}

const newKeyOf = async (
  records: ReturnType<typeof memoryKeyChangeRecordStore>
) => fromB64u((await records.read())!.newKey)

describe('key change engine', () => {
  it('prepares, then keeps the new key as pending', async () => {
    const { engine, deps, records, events } = setup()
    const { newKey } = await engine.start()
    expect(deps.prepare).toHaveBeenCalledTimes(1)
    expect(newKey).toHaveLength(32)
    expect(await records.read()).toEqual({
      v: 1,
      accountId: ACCOUNT,
      oldKey: toB64u(K1),
      newKey: toB64u(newKey),
      oldKeyEpoch: 1,
      stage: 'pending',
      startedAt: 1_000,
    })
    expect(events).toEqual([
      ['account_key_change_started', { platform: 'ios' }],
    ])
  })

  it('doesn’t start offline, or when the server’s key isn’t this device’s', async () => {
    const offline = setup({ online: false })
    await expect(offline.engine.start()).rejects.toMatchObject({
      reason: 'offline',
    })
    const elsewhere = fakeServer()
    elsewhere.server.accountPub = pub(new Uint8Array(32).fill(9))
    const mismatch = setup({ server: elsewhere })
    await expect(mismatch.engine.start()).rejects.toMatchObject({
      reason: 'account_mismatch',
    })
    expect(await mismatch.records.read()).toBeNull()
    expect(mismatch.deps.prepare).not.toHaveBeenCalled()
  })

  it('discards a confirmed change only once the server says it didn’t commit', async () => {
    const { engine, records, fake } = setup()
    await engine.start()
    await engine.confirm()
    await engine.discard()
    expect(await records.read()).toBeNull()
    expect(fake.deps.readAccount).toHaveBeenCalled()
  })

  it('won’t discard a confirmed change that committed, or can’t be checked', async () => {
    const committed = setup()
    await committed.engine.start()
    await committed.engine.confirm()
    committed.fake.server.accountPub = pub(await newKeyOf(committed.records))
    await expect(committed.engine.discard()).rejects.toMatchObject({
      reason: 'committed',
    })
    expect((await committed.records.read())?.stage).toBe('committed')

    const offline = setup()
    await offline.engine.start()
    await offline.engine.confirm()
    offline.fake.deps.readAccount.mockRejectedValueOnce(
      new HttpError('offline', null, null)
    )
    await expect(offline.engine.discard()).rejects.toMatchObject({
      reason: 'unresolved',
    })
    expect((await offline.records.read())?.stage).toBe('confirmed')
  })

  it('checks the account before sending, so an earlier send that committed isn’t sent again', async () => {
    const { engine, deps, fake, records } = setup()
    await engine.start()
    await engine.confirm()
    const newKey = await newKeyOf(records)
    fake.server.accountPub = pub(newKey)
    expect(await engine.commit()).toEqual({ outcome: 'done' })
    expect(fake.deps.rekey).not.toHaveBeenCalled()
    expect(deps.adopt).toHaveBeenCalledWith(K1, newKey, { accountId: ACCOUNT })
  })

  it('checks the account after a 401 from the rekey, never sending it again', async () => {
    const { engine, fake } = setup()
    await engine.start()
    await engine.confirm()
    fake.deps.rekey.mockImplementationOnce(async (request) => {
      fake.server.retired.add(fake.server.accountPub)
      fake.server.accountPub = pub(request.newKey)
      fake.server.keyEpoch++
      throw new HttpError('client', 401, 'unauthorized')
    })
    expect(await engine.commit()).toEqual({ outcome: 'done' })
    expect(fake.deps.rekey).toHaveBeenCalledTimes(1)
  })

  it('loses the race when checking finds its session revoked', async () => {
    const { engine, records, fake } = setup()
    await engine.start()
    await engine.confirm()
    fake.deps.rekey.mockRejectedValueOnce(new HttpError('offline', null, null))
    fake.deps.readAccount
      .mockResolvedValueOnce({
        accountId: ACCOUNT,
        accountPub: pub(K1),
        keyEpoch: 1,
      })
      .mockRejectedValueOnce(
        new AccountSessionError('server', { status: 401, ended: 'revoked' })
      )
    expect(await engine.commit()).toEqual({ outcome: 'lostRace' })
    expect(await records.read()).toBeNull()
  })

  it('caches the history it sealed only for the epoch it sealed it for', async () => {
    const { engine, deps, fake } = setup()
    await engine.start()
    await engine.confirm()
    fake.deps.rekey.mockImplementationOnce(async () => ({
      outcome: 'committed',
      keyEpoch: 7,
      accessToken: 'at',
      accessExpiresAt: 1,
    }))
    expect(await engine.commit()).toEqual({ outcome: 'done' })
    expect(deps.saveHistory).not.toHaveBeenCalled()
  })

  it('doesn’t start when the history can’t take another entry', async () => {
    const fake = fakeServer()
    fake.server.history = sealKeyHistory(
      K1,
      ACCOUNT,
      1,
      {
        v: 1,
        entries: Array.from({ length: 546 }, (_, keyEpoch) => ({
          keyEpoch,
          retiredAt: 0,
          backupFile: 'B'.repeat(43),
        })),
      },
      new Uint8Array(24)
    )
    const { engine, records } = setup({ server: fake })
    await expect(engine.start()).rejects.toMatchObject({ reason: 'history' })
    expect(await records.read()).toBeNull()
  })

  it('needs “I’ve saved it” before it commits; discarding leaves nothing', async () => {
    const { engine, records, fake } = setup()
    await engine.start()
    await expect(engine.commit()).rejects.toBeInstanceOf(KeyChangeError)
    expect(fake.deps.rekey).not.toHaveBeenCalled()
    await engine.discard()
    expect(await records.read()).toBeNull()
  })

  it('commits, stores the key, runs each step, and deletes the record', async () => {
    const order: string[] = []
    const { engine, deps, fake, records, stages, steps, events } = setup({
      steps: {
        reseal: vi.fn(async () => {
          order.push('reseal')
        }),
        'buddies-reset': vi.fn(async () => {
          order.push('buddies-reset')
        }),
      },
    })
    await engine.start()
    const newKey = await newKeyOf(records)
    await engine.confirm()
    expect(await engine.commit()).toEqual({ outcome: 'done' })

    // The server got a history sealed under K2 for the new epoch, with K1's
    // entry after K0's, and the label sealed under K2.
    const [request] = fake.server.requests
    expect(request).toMatchObject({
      oldKey: K1,
      newKey,
      keyEpoch: 1,
      device: 'sealed-label',
    })
    const history = openKeyHistory(newKey, ACCOUNT, 2, request.history)
    expect(history.entries.map((entry) => entry.keyEpoch)).toEqual([0, 1])
    expect(historyKeys(history, 'backupFile')[0]).toEqual(
      historyKeys(
        appendKeyHistory(null, keyHistoryEntry(K1, 1, 0)),
        'backupFile'
      )[0]
    )
    expect(deps.saveHistory).toHaveBeenCalledWith(ACCOUNT, history)

    expect(deps.adopt).toHaveBeenCalledWith(K1, newKey, {
      accountId: ACCOUNT,
      tokens: { accessToken: 'at-new', accessExpiresAt: 5 },
    })
    expect(order).toEqual(['reseal', 'buddies-reset'])
    expect(steps.reseal).toHaveBeenCalledWith(
      expect.objectContaining({ oldKey: K1, newKey, accountId: ACCOUNT })
    )
    expect(stages).toEqual([
      'pending',
      'confirmed',
      'committed',
      'stored',
      'resealed',
      'buddies-reset',
      'removed',
    ])
    expect(await records.read()).toBeNull()
    expect(events.map(([event]) => event)).toEqual([
      'account_key_change_started',
      'account_key_change_completed',
    ])
  })

  it('discards its key when another device changed the key first', async () => {
    const { engine, deps, fake, records, events } = setup()
    await engine.start()
    await engine.confirm()
    fake.server.beatenBy = new Uint8Array(32).fill(4)
    expect(await engine.commit()).toEqual({ outcome: 'lostRace' })
    expect(deps.adopt).not.toHaveBeenCalled()
    expect(await records.read()).toBeNull()
    expect(events.at(-1)).toEqual([
      'account_key_change_failed',
      { platform: 'ios', stage: 'confirmed', reason: 'key_retired' },
    ])
  })

  it('reads a lost answer from the account, never sending the envelope again', async () => {
    const { engine, deps, fake } = setup()
    await engine.start()
    await engine.confirm()
    fake.server.loseAnswer = true
    expect(await engine.commit()).toEqual({ outcome: 'done' })
    expect(fake.deps.rekey).toHaveBeenCalledTimes(1)
    expect(deps.adopt).toHaveBeenCalledWith(K1, expect.any(Uint8Array), {
      accountId: ACCOUNT,
    })
  })

  it('sends a new envelope when the lost request never arrived', async () => {
    const { engine, fake } = setup()
    await engine.start()
    await engine.confirm()
    fake.deps.rekey.mockRejectedValueOnce(new HttpError('offline', null, null))
    expect(await engine.commit()).toEqual({ outcome: 'done' })
    expect(fake.deps.rekey).toHaveBeenCalledTimes(2)
    const [first, second] = fake.deps.rekey.mock.calls.map(
      ([request]) => request
    )
    expect(first.history).not.toBe(second.history)
  })

  it('checks the account after 401 key_changed, as after a lost answer', async () => {
    const { engine, deps, fake, records } = setup()
    await engine.start()
    await engine.confirm()
    const newKey = await newKeyOf(records)
    // Its own earlier request committed; this one's token is from before.
    fake.deps.rekey.mockImplementationOnce(async (request) => {
      fake.server.retired.add(fake.server.accountPub)
      fake.server.accountPub = pub(request.newKey)
      fake.server.keyEpoch++
      return { outcome: 'keyChanged' }
    })
    expect(await engine.commit()).toEqual({ outcome: 'done' })
    expect(fake.deps.rekey).toHaveBeenCalledTimes(1)
    expect(deps.adopt).toHaveBeenCalledWith(K1, newKey, { accountId: ACCOUNT })
  })

  it('loses the race when checking finds its old key retired', async () => {
    const { engine, deps, fake, records } = setup()
    await engine.start()
    await engine.confirm()
    fake.deps.rekey.mockResolvedValueOnce({ outcome: 'keyChanged' })
    // Signed out by the winner: the refresh fails, and K1 reopens as retired.
    fake.deps.readAccount
      .mockResolvedValueOnce({
        accountId: ACCOUNT,
        accountPub: pub(K1),
        keyEpoch: 1,
      })
      .mockRejectedValueOnce(
        new AccountSessionError('keyRetired', {
          status: 403,
          serverCode: 'key_retired',
          changedAt: 5,
        })
      )
    expect(await engine.commit()).toEqual({ outcome: 'lostRace' })
    expect(deps.adopt).not.toHaveBeenCalled()
    expect(await records.read()).toBeNull()
  })

  it('keeps the change where it was when the answer can’t be read', async () => {
    const { engine, fake, records } = setup()
    await engine.start()
    await engine.confirm()
    fake.deps.rekey.mockRejectedValueOnce(new HttpError('offline', null, null))
    fake.deps.readAccount.mockRejectedValueOnce(
      new HttpError('offline', null, null)
    )
    await expect(engine.commit()).rejects.toMatchObject({ reason: 'offline' })
    expect((await records.read())?.stage).toBe('confirmed')
  })

  it('passes the web’s refusals back, keeping the confirmed key', async () => {
    const { engine, fake, records } = setup()
    await engine.start()
    await engine.confirm()
    fake.deps.rekey.mockResolvedValueOnce({ outcome: 'stepUpRequired' })
    expect(await engine.commit()).toEqual({ outcome: 'stepUpRequired' })
    expect((await records.read())?.stage).toBe('confirmed')
  })

  it('stops at a failing step, and resumes there', async () => {
    let fail = true
    const reseal = vi.fn(async () => {
      if (fail) throw new Error('offline')
    })
    const { engine, records, deps, events } = setup({ steps: { reseal } })
    await engine.start()
    await engine.confirm()
    await expect(engine.commit()).rejects.toThrow('offline')
    expect((await records.read())?.stage).toBe('stored')
    expect(events.at(-1)).toEqual([
      'account_key_change_failed',
      { platform: 'ios', stage: 'stored', reason: 'step' },
    ])

    fail = false
    const next = setup({ records })
    next.steps.reseal = reseal
    expect(await next.engine.resume()).toEqual({ state: 'done' })
    expect(next.deps.adopt).not.toHaveBeenCalled()
    expect(await records.read()).toBeNull()
    expect(next.events.map(([event]) => event)).toEqual([
      'account_key_change_resumed',
      'account_key_change_completed',
    ])
    void deps
  })

  it('stores the key again when it crashed right after the commit', async () => {
    const records = memoryKeyChangeRecordStore()
    const first = setup({ records })
    await first.engine.start()
    await first.engine.confirm()
    first.deps.adopt = vi.fn(async () => {
      throw new Error('keychain')
    })
    const crashed = createKeyChangeEngine(first.deps)
    await expect(crashed.commit()).rejects.toThrow('keychain')
    expect((await records.read())?.stage).toBe('committed')

    const next = setup({ records, server: first.fake })
    expect(await next.engine.resume()).toEqual({ state: 'done' })
    expect(next.deps.adopt).toHaveBeenCalledTimes(1)
  })
})

describe('key change engine, for the screens', () => {
  it('gives back the new key of a change not yet confirmed, and only that', async () => {
    const { engine } = setup()
    expect(await engine.pendingKey()).toBeNull()
    const { newKey } = await engine.start()
    expect(await engine.pendingKey()).toEqual(newKey)
    await engine.confirm()
    expect(await engine.pendingKey()).toBeNull()
  })

  it('tells listeners each stage it records, then null once it’s done', async () => {
    const { engine } = setup()
    const seen: (string | null)[] = []
    engine.onStage((stage) => seen.push(stage))
    await engine.start()
    await engine.confirm()
    await engine.commit()
    expect(seen).toEqual([
      'pending',
      'confirmed',
      'committed',
      'stored',
      'resealed',
      'buddies-reset',
      null,
    ])
    const other = setup()
    const after: unknown[] = []
    other.engine.onStage((stage) => after.push(stage))()
    await other.engine.start()
    expect(after).toEqual([])
  })

  it('tells listeners when a change is discarded', async () => {
    const { engine } = setup()
    const seen: (string | null)[] = []
    engine.onStage((stage) => seen.push(stage))
    await engine.start()
    await engine.discard()
    expect(seen).toEqual(['pending', null])
  })
})

describe('key change engine at launch', () => {
  const recordAt = async (
    stage: KeyChangeRecord['stage'],
    server = fakeServer()
  ) => {
    const records = memoryKeyChangeRecordStore()
    const first = setup({ records, server })
    await first.engine.start()
    if (stage !== 'pending') await first.engine.confirm()
    return { records, server, newKey: await newKeyOf(records) }
  }

  it('offers a change nobody committed', async () => {
    for (const stage of ['pending', 'confirmed'] as const) {
      const { records, server } = await recordAt(stage)
      const { engine, fake } = setup({ records, server })
      expect(await engine.resume()).toEqual({ state: 'awaiting', stage })
      expect(fake.deps.rekey).not.toHaveBeenCalled()
      expect((await records.read())?.stage).toBe(stage)
    }
  })

  it('finds a change that committed through its live session', async () => {
    const { records, server, newKey } = await recordAt('confirmed')
    server.server.accountPub = pub(newKey)
    const { engine, deps } = setup({ records, server })
    expect(await engine.resume()).toEqual({ state: 'done' })
    expect(deps.adopt).toHaveBeenCalledWith(K1, newKey, { accountId: ACCOUNT })
  })

  it('without a session, opens with the new key into the account', async () => {
    const { records, server, newKey } = await recordAt('confirmed')
    server.server.accountPub = pub(newKey)
    server.server.session = false
    const { engine, fake } = setup({ records, server })
    expect(await engine.resume()).toEqual({ state: 'done' })
    expect(fake.deps.openInto).toHaveBeenCalledWith(newKey, ACCOUNT)
  })

  it('without a session, finds the old key still the account’s', async () => {
    const { records, server, newKey } = await recordAt('confirmed')
    server.server.session = false
    const { engine, fake } = setup({ records, server })
    expect(await engine.resume()).toEqual({
      state: 'awaiting',
      stage: 'confirmed',
    })
    expect(fake.deps.openInto.mock.calls).toEqual([
      [newKey, ACCOUNT],
      [K1, ACCOUNT],
    ])
  })

  it('without a session, finds another device changed the key', async () => {
    const { records, server } = await recordAt('confirmed')
    server.server.retired.add(pub(K1))
    server.server.accountPub = pub(new Uint8Array(32).fill(4))
    server.server.session = false
    const { engine, events } = setup({ records, server })
    expect(await engine.resume()).toEqual({ state: 'lostRace' })
    expect(await records.read()).toBeNull()
    expect(events.at(-1)?.[0]).toBe('account_key_change_failed')
  })

  it('leaves an unresolved change for later when offline', async () => {
    const { records, server } = await recordAt('confirmed')
    server.deps.readAccount.mockRejectedValueOnce(
      new HttpError('offline', null, null)
    )
    const { engine } = setup({ records, server })
    expect(await engine.resume()).toEqual({ state: 'unresolved' })
    expect((await records.read())?.stage).toBe('confirmed')
  })

  it('has nothing to do without a record', async () => {
    const { engine } = setup()
    expect(await engine.resume()).toEqual({ state: 'none' })
  })
})

describe('key change engine on the web', () => {
  it('refuses to start when the browser can’t change the key yet', async () => {
    for (const reason of ['session_too_new', 'no_passkey'] as const) {
      const { deps, records, events } = setup()
      deps.precheck = vi.fn(async () => {
        throw new KeyChangeError(reason)
      })
      const refused = createKeyChangeEngine(deps)
      await expect(refused.start()).rejects.toMatchObject({ reason })
      expect(deps.precheck).toHaveBeenCalledWith(K1)
      expect(deps.prepare).not.toHaveBeenCalled()
      expect(await records.read()).toBeNull()
      expect(events).toEqual([
        ['account_key_change_failed', { platform: 'ios', reason }],
      ])
    }
  })

  it('reads a check that fails to answer as offline or a server problem', async () => {
    const { deps } = setup()
    deps.precheck = vi.fn(async () => {
      throw new HttpError('offline', null, null)
    })
    await expect(createKeyChangeEngine(deps).start()).rejects.toMatchObject({
      reason: 'offline',
    })
    deps.precheck = vi.fn(async () => {
      throw new HttpError('server', 500, 'internal')
    })
    await expect(createKeyChangeEngine(deps).start()).rejects.toMatchObject({
      reason: 'server',
    })
  })

  it('steps up for the new epoch, and sends the passkey’s wrap with the change', async () => {
    const { deps, fake, records } = setup()
    const wrap = {
      credentialId: 'cred',
      wrapId: 'wrap-id',
      wrap: 'w'.repeat(98),
    }
    deps.stepUp = vi.fn(async () => ({ passkeyWrap: wrap }))
    const engine = createKeyChangeEngine(deps)
    await engine.start()
    const newKey = await newKeyOf(records)
    await engine.confirm()
    expect(deps.stepUp).not.toHaveBeenCalled()
    expect(await engine.commit()).toEqual({ outcome: 'done' })
    expect(deps.stepUp).toHaveBeenCalledWith({
      newKey,
      accountId: ACCOUNT,
      keyEpoch: 2,
    })
    expect(fake.server.requests[0].passkeyWrap).toEqual(wrap)
  })

  it('keeps the change confirmed when the step-up doesn’t pass', async () => {
    const { deps, fake, records, events } = setup()
    deps.stepUp = vi.fn(async () => {
      throw new KeyChangeError('step_up')
    })
    const engine = createKeyChangeEngine(deps)
    await engine.start()
    await engine.confirm()
    await expect(engine.commit()).rejects.toMatchObject({ reason: 'step_up' })
    expect(fake.deps.rekey).not.toHaveBeenCalled()
    expect((await records.read())?.stage).toBe('confirmed')
    expect(events.at(-1)).toEqual([
      'account_key_change_failed',
      { platform: 'ios', stage: 'confirmed', reason: 'step_up' },
    ])

    // Try Again asks again.
    deps.stepUp = vi.fn(async () => ({}))
    expect(await createKeyChangeEngine(deps).commit()).toEqual({
      outcome: 'done',
    })
  })

  it('reads a step-up that can’t reach the server as offline', async () => {
    const { deps, records } = setup()
    deps.stepUp = vi.fn(async () => {
      throw new HttpError('offline', null, null)
    })
    const engine = createKeyChangeEngine(deps)
    await engine.start()
    await engine.confirm()
    await expect(engine.commit()).rejects.toMatchObject({ reason: 'offline' })
    expect((await records.read())?.stage).toBe('confirmed')
  })

  it('tracks the server’s web refusals', async () => {
    const { engine, fake, events } = setup()
    await engine.start()
    await engine.confirm()
    fake.deps.rekey.mockResolvedValueOnce({ outcome: 'sessionTooNew' })
    expect(await engine.commit()).toEqual({ outcome: 'sessionTooNew' })
    fake.deps.rekey.mockResolvedValueOnce({ outcome: 'stepUpRequired' })
    expect(await engine.commit()).toEqual({ outcome: 'stepUpRequired' })
    expect(events.slice(-2)).toEqual([
      [
        'account_key_change_failed',
        { platform: 'ios', stage: 'confirmed', reason: 'session_too_new' },
      ],
      [
        'account_key_change_failed',
        { platform: 'ios', stage: 'confirmed', reason: 'step_up' },
      ],
    ])
  })
})

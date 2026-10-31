import { describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import { PasskeyError } from '@/lib/passkeys/errors'
import type { AccountDevice } from '@/lib/serverAccount/activityClient'
import type { PasskeyAssertion } from '@/lib/passkeys/types'
import type { Passkey } from '@/lib/serverAccount/passkeyClient'
import { openPasskeyWraps } from '@/lib/serverAccount/passkeys'
import { accountPubOf } from '@/lib/serverAccount/keys'
import {
  createWebStepUp,
  type SensitiveAction,
  type StepUpResult,
} from '@/lib/serverAccount/stepUp'
import { TAP_FRESH_MS } from '@/lib/serverAccount/stepUpCreate'
import { KeyChangeError } from './engine'
import {
  createWebKeyChange,
  KEY_CHANGE_ADD_PASSKEY_MS,
  KEY_CHANGE_SESSION_AGE_MS,
} from './web'

const ACCOUNT = 'A'.repeat(22)
const NOW = 1_800_000_000_000
const K2 = new Uint8Array(32).fill(2)
const PRF = new Uint8Array(32).fill(9)
const CREDENTIAL = toB64u(new Uint8Array(16).fill(4))

const device = (overrides: Partial<AccountDevice>): AccountDevice => ({
  sessionId: 's',
  platform: 'web',
  device: null,
  appVersion: '1.47.0',
  current: false,
  createdAt: NOW - 10 * KEY_CHANGE_SESSION_AGE_MS,
  lastActiveAt: NOW,
  expiresAt: NOW + 1,
  ...overrides,
})

const passkey: Passkey = {
  credentialId: CREDENTIAL,
  canUnlock: true,
  createdAt: 1,
  createdPlatform: 'web',
  backedUp: true,
} as Passkey

const response = {
  id: CREDENTIAL,
  rawId: CREDENTIAL,
} as PasskeyAssertion['response']

function setup() {
  let nonce = 0
  /** The page's clock, which the step-up and Add a Passkey's window read. */
  const clock = { now: 0, wall: NOW }
  const deps = {
    now: () => NOW,
    elapsed: () => clock.now,
    wallNow: () => clock.wall,
    randomBytes: (length: number) => new Uint8Array(length).fill(++nonce),
    devices: vi.fn(async () => [
      device({ sessionId: 'phone', platform: 'ios' }),
      device({ sessionId: 'me', current: true }),
    ]),
    passkeys: vi.fn(async () => ({ passkeys: [passkey] })),
    canLockTabs: () => true,
    startStepUp: vi.fn(async () => ({
      challengeToken: 'challenge-token',
      options: { challenge: 'c', allowCredentials: [{ id: CREDENTIAL }] },
    })),
    getPasskey: vi.fn(
      async (_options: unknown): Promise<PasskeyAssertion> => ({
        response,
        prf: PRF,
      })
    ),
    finishStepUp: vi.fn(async (_args: unknown) => ({
      credentialId: CREDENTIAL,
      stepUpAt: NOW,
    })),
    requestContinue: vi.fn(
      async (_action: SensitiveAction, _until: number) => 'continue' as const
    ),
  }
  // The server's window after signing in: open, unless a test closes it.
  const sessionWindow = vi.fn(async () => ({
    now: NOW,
    stepUpUntil: (NOW + 60_000) as number | null,
  }))
  // The web's shared step-up, on the same server and browser.
  const stepUp = createWebStepUp({
    online: () => true,
    challenge: () => deps.startStepUp(),
    get: (options) => deps.getPasskey(options),
    assert: (args) => deps.finishStepUp(args),
    sessionWindow,
    elapsed: deps.elapsed,
  })
  // The sheet (`requestStepUp`): the challenge as it opens, the get from its
  // tap, and how it ended.
  const requestStepUp = vi.fn(
    async (action: SensitiveAction): Promise<StepUpResult> => {
      const prepared = await stepUp.prepare(action)
      if (prepared.status === 'session')
        return { status: 'confirmed', via: 'session', until: prepared.until }
      if (prepared.status !== 'ready') return prepared
      return stepUp.complete(prepared)
    }
  )
  const all = {
    ...deps,
    prepare: stepUp.prepare,
    requestStepUp,
    sessionWindow,
  }
  return {
    deps: all,
    clock,
    stepUp,
    web: createWebKeyChange(all),
  }
}

describe('changing the key in a browser', () => {
  it('refuses a browser that can’t keep its tabs from changing it at once', async () => {
    const { deps } = setup()
    const web = createWebKeyChange({ ...deps, canLockTabs: () => false })
    await expect(web.precheck()).rejects.toMatchObject({
      reason: 'unsupported',
    })
    expect(deps.devices).not.toHaveBeenCalled()
  })

  it('says whether a passkey unlocks the account after the change', async () => {
    const { deps, web } = setup()
    expect(await web.passkeyUnlocks()).toBe(true)
    // The step-up's passkey gave no PRF output, so none wraps the new key.
    deps.passkeys.mockResolvedValue({
      passkeys: [{ ...passkey, canUnlock: false }],
    })
    expect(await web.passkeyUnlocks()).toBe(false)
  })

  it('lets a session a day old with a passkey change the key', async () => {
    const { web } = setup()
    await expect(web.precheck()).resolves.toBeUndefined()
  })

  it('refuses a session younger than a day, saying from when it may', async () => {
    const { deps, web } = setup()
    const createdAt = NOW - KEY_CHANGE_SESSION_AGE_MS + 60_000
    deps.devices.mockResolvedValue([device({ current: true, createdAt })])
    const error = await web.precheck().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(KeyChangeError)
    expect(error).toMatchObject({
      reason: 'session_too_new',
      availableAt: createdAt + KEY_CHANGE_SESSION_AGE_MS,
    })
  })

  it('refuses an account without a passkey to confirm with', async () => {
    const { deps, web } = setup()
    deps.startStepUp.mockResolvedValueOnce({
      challengeToken: 'challenge-token',
      options: { challenge: 'c', allowCredentials: [] },
    })
    await expect(web.precheck()).rejects.toMatchObject({
      reason: 'no_passkey',
    })
  })

  it('refuses an account whose passkeys are all for another site', async () => {
    const { deps, web } = setup()
    // `GET /passkeys` lists one, but this page's RP ID has none: the step-up
    // couldn't use it.
    deps.passkeys.mockResolvedValue({ passkeys: [passkey] })
    deps.startStepUp.mockResolvedValueOnce({
      challengeToken: 'challenge-token',
      options: { challenge: 'c', allowCredentials: [] },
    })
    await expect(web.precheck()).rejects.toMatchObject({
      reason: 'no_passkey',
    })
    // Nothing tapped: the precheck only asks which passkeys this page has.
    expect(deps.getPasskey).not.toHaveBeenCalled()
  })

  it('says offline or the server’s failure when it can’t ask which passkeys this page has', async () => {
    const { deps, web } = setup()
    deps.startStepUp.mockRejectedValueOnce(new HttpError('offline', null, null))
    await expect(web.precheck()).rejects.toMatchObject({ reason: 'offline' })
    deps.startStepUp.mockRejectedValueOnce(new HttpError('server', 503, null))
    await expect(web.precheck()).rejects.toMatchObject({ reason: 'server' })
  })

  it('steps up through the sheet, and wraps the new key for the new epoch with the passkey’s PRF', async () => {
    const { deps, web } = setup()
    const { passkeyWrap } = await web.stepUp({
      newKey: K2,
      accountId: ACCOUNT,
      keyEpoch: 4,
    })
    // The sheet records the check and tells App Lock and Passkeys of it.
    expect(deps.requestStepUp).toHaveBeenCalledExactlyOnceWith(
      'change_account_key'
    )
    expect(deps.getPasskey).toHaveBeenCalledWith({
      challenge: 'c',
      allowCredentials: [{ id: CREDENTIAL }],
    })
    expect(deps.finishStepUp).toHaveBeenCalledWith({
      challengeToken: 'challenge-token',
      response,
    })
    expect(passkeyWrap).toMatchObject({ credentialId: CREDENTIAL })
    expect(passkeyWrap!.wrapId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    const opened = openPasskeyWraps({
      prfOutput: PRF,
      accountId: ACCOUNT,
      accountPub: accountPubOf(K2),
      credentialId: CREDENTIAL,
      keyEpoch: 4,
      wraps: [{ ...passkeyWrap!, keyEpoch: 4 }],
    })
    expect(opened).toMatchObject({ ok: true, accountKey: K2 })
    // Bound to the epoch: it doesn't open as the old one's.
    expect(
      openPasskeyWraps({
        prfOutput: PRF,
        accountId: ACCOUNT,
        accountPub: accountPubOf(K2),
        credentialId: CREDENTIAL,
        keyEpoch: 3,
        wraps: [{ ...passkeyWrap!, keyEpoch: 3 }],
      })
    ).toMatchObject({ ok: false })
  })

  it('sends no wrap for a passkey without PRF', async () => {
    const { deps, web } = setup()
    deps.getPasskey.mockResolvedValue({ response, prf: null })
    expect(
      await web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).toEqual({})
  })

  it('sends no wrap unless the server verified the passkey that gave the PRF output', async () => {
    const { deps, web } = setup()
    deps.finishStepUp.mockResolvedValueOnce({
      credentialId: toB64u(new Uint8Array(16).fill(5)),
      stepUpAt: NOW,
    })
    expect(
      await web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).toEqual({})
  })

  it('never wraps on a step-up without a passkey tap', async () => {
    const { deps, web } = setup()
    deps.requestStepUp.mockResolvedValueOnce({
      status: 'confirmed',
      via: 'session',
      until: 60_000,
    })
    await expect(
      web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).rejects.toMatchObject({ reason: 'step_up' })
  })

  it('reads a cancelled or refused passkey check as a step-up that didn’t pass', async () => {
    const { deps, web } = setup()
    deps.getPasskey.mockRejectedValueOnce(new PasskeyError('cancelled'))
    await expect(
      web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).rejects.toMatchObject({ reason: 'step_up' })
    deps.finishStepUp.mockRejectedValueOnce(
      new HttpError('client', 403, 'passkey_failed')
    )
    await expect(
      web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).rejects.toMatchObject({ reason: 'step_up' })
  })

  it('reads the browser’s own passkey failures as a step-up that didn’t pass, not the server’s', async () => {
    for (const code of ['failed', 'timeout', 'not_supported'] as const) {
      const { deps, web } = setup()
      deps.getPasskey.mockRejectedValueOnce(new PasskeyError(code))
      await expect(
        web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
      ).rejects.toMatchObject({ reason: 'step_up' })
    }
  })

  it('reads connection failures as offline, and the server’s as its own', async () => {
    const { deps, web } = setup()
    deps.startStepUp.mockRejectedValueOnce(new HttpError('offline', null, null))
    await expect(
      web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).rejects.toMatchObject({ reason: 'offline' })
    deps.finishStepUp.mockRejectedValueOnce(
      new HttpError('rateLimited', 429, 'rate_limited')
    )
    await expect(
      web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).rejects.toMatchObject({ reason: 'server' })
    // A bare failure reads as the browser's: the sheet says the same for both,
    // and already showed it.
    deps.finishStepUp.mockRejectedValueOnce(new HttpError('server', 500, null))
    await expect(
      web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).rejects.toMatchObject({ reason: 'step_up' })
  })

  it('always asks for the passkey, even inside the server’s window', async () => {
    const { deps, web } = setup()
    await web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    expect(deps.getPasskey).toHaveBeenCalledTimes(1)
    expect(deps.finishStepUp).toHaveBeenCalledTimes(1)
  })

  it('never runs a passkey prompt that could offer other accounts’ passkeys', async () => {
    const { deps, web } = setup()
    deps.startStepUp.mockResolvedValueOnce({
      challengeToken: 'challenge-token',
      options: { challenge: 'c', allowCredentials: [] },
    })
    await expect(
      web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).rejects.toMatchObject({ reason: 'step_up' })
    expect(deps.getPasskey).not.toHaveBeenCalled()
  })
})

describe('Add a Passkey after a change in a browser', () => {
  /** A change's step-up, then Add a Passkey's step-up and gate. */
  async function changed() {
    const set = setup()
    await set.web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    set.deps.requestStepUp.mockClear()
    return set
  }

  it('starts on the change’s step-up while it holds, from the Add a Passkey tap itself', async () => {
    const { deps, web, clock } = await changed()
    clock.now += KEY_CHANGE_ADD_PASSKEY_MS - 1
    clock.wall += KEY_CHANGE_ADD_PASSKEY_MS - 1
    const stepUp = web.addPasskeyStepUp()
    expect(await stepUp.confirm()).toBe('confirmed')
    // No sheet, no second passkey tap.
    expect(deps.requestStepUp).not.toHaveBeenCalled()
    expect(deps.getPasskey).toHaveBeenCalledTimes(1)
    expect(stepUp.holds()).toBe(true)
    // The tap was the User's own, not a get's: the create runs from it,
    // capped to what the server's window has left.
    const gate = await stepUp.beforeCreate!()
    expect(gate).toMatchObject({ status: 'go' })
    expect(deps.requestContinue).not.toHaveBeenCalled()
    if (gate.status !== 'go') throw new Error('no go')
    expect(gate.timeoutMs).toBeGreaterThan(0)
    expect(gate.timeoutMs).toBeLessThanOrEqual(60_000)
  })

  it('asks for a second tap when the registration options took longer than the tap lasts', async () => {
    const { deps, web, clock } = await changed()
    const stepUp = web.addPasskeyStepUp()
    await stepUp.confirm()
    clock.now += TAP_FRESH_MS + 1
    expect(await stepUp.beforeCreate!()).toMatchObject({ status: 'go' })
    expect(deps.requestContinue).toHaveBeenCalledWith(
      'add_passkey',
      expect.any(Number)
    )
  })

  it('asks for a step-up of its own once the change’s has run out, and a second tap before the create', async () => {
    const { deps, web, clock } = await changed()
    clock.now += KEY_CHANGE_ADD_PASSKEY_MS
    clock.wall += KEY_CHANGE_ADD_PASSKEY_MS
    deps.sessionWindow.mockResolvedValue({ now: NOW, stepUpUntil: null })
    expect(web.stepUpHolds()).toBe(false)
    const stepUp = web.addPasskeyStepUp()
    expect(await stepUp.confirm()).toBe('confirmed')
    expect(deps.requestStepUp).toHaveBeenCalledExactlyOnceWith('add_passkey')
    expect(deps.finishStepUp).toHaveBeenCalledTimes(2)
    // Its get used the tap: Safari makes the passkey only from another.
    const gate = await stepUp.beforeCreate!()
    expect(gate).toMatchObject({ status: 'go' })
    expect(deps.requestContinue).toHaveBeenCalledWith(
      'add_passkey',
      expect.any(Number)
    )
  })

  it('takes the server’s window as the owner check, with its end', async () => {
    const { deps, web, clock } = await changed()
    clock.now += KEY_CHANGE_ADD_PASSKEY_MS
    deps.requestStepUp.mockResolvedValueOnce({
      status: 'confirmed',
      via: 'session',
      until: clock.now + 1_000,
    })
    const stepUp = web.addPasskeyStepUp()
    expect(await stepUp.confirm()).toBe('confirmed')
    expect(stepUp.holds()).toBe(true)
    clock.now += 1_000
    expect(stepUp.holds()).toBe(false)
    expect(await stepUp.beforeCreate!()).toEqual({ status: 'expired' })
  })

  it('doesn’t hold once the wall clock moved 4 minutes, though the page’s paused', async () => {
    const { deps, web, clock } = await changed()
    // The computer slept: `performance.now()` stood still.
    clock.wall += KEY_CHANGE_ADD_PASSKEY_MS
    expect(web.stepUpHolds()).toBe(false)
    const stepUp = web.addPasskeyStepUp()
    await stepUp.confirm()
    expect(deps.requestStepUp).toHaveBeenCalledWith('add_passkey')
  })

  it('doesn’t hold when the wall clock went back', async () => {
    const { web, clock } = await changed()
    clock.wall -= 1
    expect(web.stepUpHolds()).toBe(false)
  })

  it('never holds before a change stepped up', () => {
    const { web } = setup()
    expect(web.stepUpHolds()).toBe(false)
  })

  it('reads a cancelled or refused tap as such, and creates nothing', async () => {
    const { deps, web } = setup()
    deps.sessionWindow.mockResolvedValue({ now: NOW, stepUpUntil: null })
    deps.getPasskey.mockRejectedValueOnce(new PasskeyError('cancelled'))
    const cancelled = web.addPasskeyStepUp()
    expect(await cancelled.confirm()).toBe('cancelled')
    expect(cancelled.holds()).toBe(false)
    expect(await cancelled.beforeCreate!()).toEqual({ status: 'expired' })
    deps.finishStepUp.mockRejectedValueOnce(
      new HttpError('client', 403, 'passkey_failed')
    )
    expect(await web.addPasskeyStepUp().confirm()).toBe('failed')
    expect(web.stepUpHolds()).toBe(false)
  })

  it('says offline, not failed, when the server couldn’t be asked for the tap', async () => {
    for (const result of [
      { status: 'offline' },
      { status: 'failed', reason: 'rate_limited' },
      { status: 'failed', reason: 'unavailable' },
    ] as const) {
      const { deps, web } = setup()
      deps.requestStepUp.mockResolvedValueOnce(result)
      expect(await web.addPasskeyStepUp().confirm()).toBe('offline')
    }
  })
})

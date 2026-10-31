import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http/request'
import { PasskeyError } from '@/lib/passkeys/errors'
import type { PasskeyAssertion } from '@/lib/passkeys/types'
import {
  createWebStepUp,
  SESSION_STEP_UP_MARGIN_MS,
  STEP_UP_WINDOW_MS,
  type StepUpReady,
  type WebStepUpDeps,
} from '@/lib/serverAccount/stepUp'

const NOW = 1_800_000_000_000
/** The page's monotonic clock (`performance.now()`), nothing like the wall's. */
const T0 = 42_000
const RP_ID = 'app.witnesswork.app'
const CREDENTIAL = 'Y3JlZA'

const assertion: PasskeyAssertion = {
  response: {
    id: CREDENTIAL,
    rawId: CREDENTIAL,
    type: 'public-key',
    response: {
      clientDataJSON: 'e30',
      authenticatorData: 'YXV0aA',
      signature: 'c2ln',
    },
    clientExtensionResults: {},
  },
  prf: null,
}

const challenge = (ids: string[] = [CREDENTIAL]) => ({
  challengeToken: 'token',
  options: {
    challenge: 'Y2hhbGxlbmdl',
    rpId: RP_ID,
    allowCredentials: ids.map((id) => ({ id, type: 'public-key' })),
    userVerification: 'required',
  },
})

function setup(overrides: Partial<WebStepUpDeps> = {}) {
  const deps = {
    online: vi.fn(() => true),
    challenge: vi.fn(async () => challenge()),
    get: vi.fn(async () => assertion),
    assert: vi.fn(async () => ({ credentialId: CREDENTIAL, stepUpAt: NOW })),
    // Signed in an hour ago: the window is long over.
    sessionWindow: vi.fn(async () => ({
      now: NOW,
      stepUpUntil: NOW - 55 * 60_000,
    })),
    elapsed: vi.fn(() => T0),
    ...overrides,
  } satisfies WebStepUpDeps
  return { deps, stepUp: createWebStepUp(deps) }
}

async function ready(
  stepUp: ReturnType<typeof setup>['stepUp'],
  action: Parameters<
    ReturnType<typeof setup>['stepUp']['prepare']
  >[0] = 'recovery_key'
) {
  const prepared = await stepUp.prepare(action)
  expect(prepared.status).toBe('ready')
  return prepared as StepUpReady
}

describe('createWebStepUp', () => {
  it('asks for the challenge, then the get for the account’s passkeys, then the server’s check', async () => {
    const { deps, stepUp } = setup()
    const prepared = await ready(stepUp)
    expect(prepared).toMatchObject({
      rpId: RP_ID,
      credentialIds: [CREDENTIAL],
      challengeToken: 'token',
    })
    expect(deps.get).not.toHaveBeenCalled()

    const result = await stepUp.complete(prepared)
    expect(deps.get).toHaveBeenCalledWith(prepared.options)
    expect(deps.assert).toHaveBeenCalledWith({
      challengeToken: 'token',
      response: assertion.response,
    })
    expect(result).toEqual({
      status: 'confirmed',
      via: 'passkey',
      rpId: RP_ID,
      credentialIds: [CREDENTIAL],
      credentialId: CREDENTIAL,
      assertion,
      challenge: 'Y2hhbGxlbmdl',
      // On the page's own clock, from just before the server's check.
      until: T0 + STEP_UP_WINDOW_MS - SESSION_STEP_UP_MARGIN_MS,
    })
  })

  it('counts a challenge stale before the server’s 5 minutes for it end', async () => {
    const elapsed = vi.fn(() => T0)
    const { stepUp } = setup({ elapsed })
    const prepared = await ready(stepUp)
    expect(prepared.staleAt).toBe(
      T0 + STEP_UP_WINDOW_MS - SESSION_STEP_UP_MARGIN_MS
    )
    expect(stepUp.isStale(prepared)).toBe(false)
    elapsed.mockReturnValue(prepared.staleAt)
    expect(stepUp.isStale(prepared)).toBe(true)
  })

  it('is cancelled when the User closes the passkey prompt, and never asks the server', async () => {
    const { deps, stepUp } = setup({
      get: vi.fn(async () => {
        throw new PasskeyError('cancelled')
      }),
    })
    expect(await stepUp.complete(await ready(stepUp))).toEqual({
      status: 'cancelled',
    })
    expect(deps.assert).not.toHaveBeenCalled()
  })

  it('waits while the browser is offline: no request at all', async () => {
    const { deps, stepUp } = setup({ online: () => false })
    expect(await stepUp.prepare('recovery_key')).toEqual({ status: 'offline' })
    expect(deps.challenge).not.toHaveBeenCalled()
    expect(deps.sessionWindow).not.toHaveBeenCalled()
  })

  it('is offline when the challenge or the check can’t reach the server', async () => {
    const offline = new HttpError('offline')
    const noChallenge = setup({
      challenge: vi.fn(async () => {
        throw offline
      }),
    })
    expect(await noChallenge.stepUp.prepare('recovery_key')).toEqual({
      status: 'offline',
    })

    const noAssert = setup({
      assert: vi.fn(async () => {
        throw offline
      }),
    })
    expect(
      await noAssert.stepUp.complete(await ready(noAssert.stepUp))
    ).toEqual({ status: 'offline' })
  })

  it('is offline when the connection dropped during the tap', async () => {
    const online = vi.fn(() => true)
    const { deps, stepUp } = setup({ online })
    const prepared = await ready(stepUp)
    online.mockReturnValue(false)
    expect(await stepUp.complete(prepared)).toEqual({ status: 'offline' })
    expect(deps.assert).not.toHaveBeenCalled()
  })

  it('refuses when the server doesn’t verify the passkey', async () => {
    const { stepUp } = setup({
      assert: vi.fn(async () => {
        throw new HttpError('client', 403, 'passkey_failed', null, undefined, {
          reason: 'signature',
        })
      }),
    })
    expect(await stepUp.complete(await ready(stepUp))).toEqual({
      status: 'failed',
      reason: 'refused',
    })
  })

  it('says when none of the account’s passkeys is here', async () => {
    const { stepUp } = setup({
      get: vi.fn(async () => {
        throw new PasskeyError('no_credentials')
      }),
    })
    expect(await stepUp.complete(await ready(stepUp))).toEqual({
      status: 'failed',
      reason: 'no_credentials',
    })
  })

  it('passes a server failure on', async () => {
    const { stepUp } = setup({
      challenge: vi.fn(async () => {
        throw new HttpError('rateLimited', 429, 'rate_limited')
      }),
    })
    expect(await stepUp.prepare('recovery_key')).toEqual({
      status: 'failed',
      reason: 'rate_limited',
    })
  })

  describe('the server’s window', () => {
    const withWindow = (
      stepUpUntil: number | null,
      overrides: Partial<WebStepUpDeps> = {}
    ) =>
      setup({
        sessionWindow: vi.fn(async () => ({ now: NOW, stepUpUntil })),
        ...overrides,
      })

    it('goes ahead with no passkey tap while the server still counts the sign-in, for any account', async () => {
      for (const ids of [[CREDENTIAL], []]) {
        const { deps, stepUp } = withWindow(NOW + 3 * 60_000, {
          challenge: vi.fn(async () => challenge(ids)),
        })
        expect(await stepUp.prepare('add_passkey')).toEqual({
          status: 'session',
          // The server's minutes left, on the page's clock, less the margin.
          until: T0 + 3 * 60_000 - SESSION_STEP_UP_MARGIN_MS,
        })
        expect(deps.challenge).not.toHaveBeenCalled()
        expect(deps.get).not.toHaveBeenCalled()
      }
    })

    it('stops the margin before the server’s window ends', async () => {
      const edge = NOW + SESSION_STEP_UP_MARGIN_MS
      expect(
        (await withWindow(edge).stepUp.prepare('recovery_key')).status
      ).toBe('ready')
      expect(
        (await withWindow(edge + 1).stepUp.prepare('recovery_key')).status
      ).toBe('session')
    })

    it('ignores the device’s clock entirely', async () => {
      const dateNow = vi.spyOn(Date, 'now')
      for (const clock of [0, NOW - 365 * 24 * 60 * 60_000, NOW * 2]) {
        dateNow.mockReturnValue(clock)
        expect(
          (await withWindow(NOW - 60_000).stepUp.prepare('recovery_key')).status
        ).toBe('ready')
        expect(
          (await withWindow(NOW + 60_000).stepUp.prepare('recovery_key')).status
        ).toBe('session')
      }
      dateNow.mockRestore()
    })

    it('counts from when it asked, so a slow answer never stretches it', async () => {
      const elapsed = vi.fn(() => T0)
      const { stepUp } = withWindow(NOW + 60_000, {
        sessionWindow: vi.fn(async () => {
          elapsed.mockReturnValue(T0 + 20_000)
          return { now: NOW, stepUpUntil: NOW + 60_000 }
        }),
        elapsed,
      })
      expect(await stepUp.prepare('recovery_key')).toEqual({
        status: 'session',
        until: T0 + 60_000 - SESSION_STEP_UP_MARGIN_MS,
      })
    })

    it('treats a missing or unreadable window as over', async () => {
      for (const window of [
        { now: NOW, stepUpUntil: null },
        { now: Number.NaN, stepUpUntil: NOW + 60_000 },
        { now: NOW, stepUpUntil: Number.POSITIVE_INFINITY },
      ])
        expect(
          (
            await setup({
              sessionWindow: vi.fn(async () => window),
            }).stepUp.prepare('recovery_key')
          ).status
        ).toBe('ready')
    })

    it('is offline or failed, never no passkey, when the window can’t be read', async () => {
      const offline = setup({
        sessionWindow: vi.fn(async () => {
          throw new HttpError('offline')
        }),
        challenge: vi.fn(async () => challenge([])),
      })
      expect(await offline.stepUp.prepare('recovery_key')).toEqual({
        status: 'offline',
      })
      const broken = setup({
        sessionWindow: vi.fn(async () => {
          throw new HttpError('server', 500)
        }),
        challenge: vi.fn(async () => challenge([])),
      })
      expect(await broken.stepUp.prepare('recovery_key')).toEqual({
        status: 'failed',
        reason: 'failed',
      })
      expect(broken.deps.challenge).not.toHaveBeenCalled()
    })

    it('always asks for the passkey to turn App Lock on, whose get it keeps', async () => {
      const { deps, stepUp } = withWindow(NOW + 3 * 60_000)
      expect((await stepUp.prepare('app_lock')).status).toBe('ready')
      expect(deps.sessionWindow).not.toHaveBeenCalled()
    })

    it('always asks for the passkey to change the account key, whose PRF wraps the new key', async () => {
      const { deps, stepUp } = withWindow(NOW + 3 * 60_000)
      expect((await stepUp.prepare('change_account_key')).status).toBe('ready')
      expect(deps.sessionWindow).not.toHaveBeenCalled()
    })
  })

  describe('an account with no passkey, past the window', () => {
    it('can’t step up, and never runs a discoverable get', async () => {
      const { deps, stepUp } = setup({
        challenge: vi.fn(async () => challenge([])),
      })
      expect(await stepUp.prepare('recovery_key')).toEqual({
        status: 'noPasskey',
      })
      expect(deps.get).not.toHaveBeenCalled()
    })
  })
})

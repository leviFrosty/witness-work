import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http/request'
import { PasskeyError } from '@/lib/passkeys/errors'
import type { CreatedPasskey } from '@/lib/passkeys/types'
import { addWebPasskey } from '@/lib/serverAccount/webPasskeyAdd'

const CREDENTIAL = 'Y3JlZA'

function setup(
  check: 'confirmed' | 'cancelled' | 'failed' | 'offline' = 'confirmed'
) {
  let holds = true
  const server = {
    registrationOptions: vi.fn(async () => ({
      challengeToken: 'token',
      userHandle: 'AAEC',
      options: { challenge: 'Y2hhbGxlbmdl' },
    })),
    add: vi.fn(async () => ({ credentialId: CREDENTIAL })),
    wrap: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    account: vi.fn(async () => ({
      accountId: 'A'.repeat(22),
      accountPub: 'pub',
      keyEpoch: 1,
    })),
  }
  const create = vi.fn(
    async (): Promise<CreatedPasskey> => ({
      response: { id: CREDENTIAL, rawId: CREDENTIAL } as never,

      prf: { enabled: false, first: null },
    })
  )
  const stepUp = {
    holds: vi.fn(() => holds),
    confirm: vi.fn(async () => check),
  }
  const track = { started: vi.fn(), finished: vi.fn() }
  const add = () =>
    addWebPasskey(
      {
        server,
        ceremonies: { create, get: vi.fn() },
        accountKey: new Uint8Array(32).fill(7),
        randomBytes: (length) => new Uint8Array(length),
      },
      { stepUp, source: 'key_change', track }
    )
  return { add, server, create, stepUp, track, expire: () => (holds = false) }
}

describe('Add a Passkey in a browser', () => {
  it('adds on the step-up it was given, and says where it came from', async () => {
    const { add, create, stepUp, track } = setup()
    const result = await add()
    expect(result).toMatchObject({ status: 'added', canUnlock: false })
    expect(stepUp.confirm).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
    expect(track.started).toHaveBeenCalledWith('key_change')
    expect(track.finished).toHaveBeenCalledWith('key_change', result)
  })

  it('never starts the authenticator once the step-up has run out', async () => {
    const { add, create, server, expire } = setup()
    server.registrationOptions.mockImplementationOnce(async () => {
      expire()
      return {
        challengeToken: 'token',
        userHandle: 'AAEC',
        options: { challenge: 'Y2hhbGxlbmdl' },
      }
    })
    expect(await add()).toMatchObject({ status: 'failed', step: 'create' })
    expect(create).not.toHaveBeenCalled()
    expect(server.add).not.toHaveBeenCalled()
  })

  it('says offline, cancelled or failed for the owner check, asking the server nothing', async () => {
    for (const [check, result] of [
      ['offline', { status: 'failed', step: 'owner', reason: 'offline' }],
      ['cancelled', { status: 'cancelled', step: 'owner' }],
      ['failed', { status: 'failed', step: 'owner', reason: 'owner_failed' }],
    ] as const) {
      const { add, server } = setup(check)
      expect(await add()).toEqual(result)
      expect(server.registrationOptions).not.toHaveBeenCalled()
    }
  })

  it('runs the create only once its gate says go, capped to the time left', async () => {
    const { add, create, server, stepUp } = setup()
    const order: string[] = []
    server.registrationOptions.mockImplementationOnce(async () => {
      order.push('options')
      return {
        challengeToken: 'token',
        userHandle: 'AAEC',
        options: { challenge: 'Y2hhbGxlbmdl', timeout: 300_000 } as never,
      }
    })
    const beforeCreate = vi.fn(async () => {
      order.push('gate')
      return { status: 'go', timeoutMs: 42_000 } as const
    })
    Object.assign(stepUp, { beforeCreate })
    expect(await add()).toMatchObject({ status: 'added' })
    expect(order).toEqual(['options', 'gate'])
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 42_000 })
    )
  })

  it('creates nothing when the gate ran out or the User closed its second tap', async () => {
    for (const [gate, result] of [
      [
        { status: 'expired' },
        { status: 'failed', step: 'create', reason: 'step_up_expired' },
      ],
      [{ status: 'cancelled' }, { status: 'cancelled', step: 'create' }],
    ] as const) {
      const { add, create, stepUp } = setup()
      Object.assign(stepUp, { beforeCreate: vi.fn(async () => gate) })
      expect(await add()).toEqual(result)
      expect(create).not.toHaveBeenCalled()
    }
  })

  it('shows a create the browser stopped after the gate, never closing without a word', async () => {
    const { add, create, stepUp } = setup()
    Object.assign(stepUp, {
      beforeCreate: vi.fn(async () => ({ status: 'go', timeoutMs: 1_000 })),
    })
    create.mockRejectedValueOnce(new PasskeyError('cancelled'))
    expect(await add()).toEqual({
      status: 'failed',
      step: 'create',
      reason: 'not_created',
    })
  })

  it('shows a create the browser stopped with no gate, as on the Approved by screen', async () => {
    const { add, create, server, track } = setup()
    create.mockRejectedValueOnce(new PasskeyError('cancelled'))
    const result = await add()
    expect(result).toEqual({
      status: 'failed',
      step: 'create',
      reason: 'not_created',
    })
    expect(server.add).not.toHaveBeenCalled()
    expect(track.finished).toHaveBeenCalledWith('key_change', result)
  })

  it('reads a check that throws as failed', async () => {
    const { add, stepUp } = setup()
    stepUp.confirm.mockRejectedValueOnce(new HttpError('server', 500, null))
    expect(await add()).toMatchObject({ reason: 'owner_failed' })
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { DeviceOwnerCheck } from '@/lib/deviceOwner'
import { HttpError } from '@/lib/http/request'
import {
  createSensitiveCheck,
  StepUpNotConfirmedError,
  stopsQuietly,
} from '@/lib/sensitiveCheck'
import type { StepUpResult } from '@/lib/serverAccount/stepUp'

const stepUpRequired = () => new HttpError('client', 403, 'step_up_required')

const passkey: StepUpResult = {
  status: 'confirmed',
  via: 'passkey',
  rpId: 'app.witnesswork.app',
  credentialIds: ['Y3JlZA'],
  credentialId: 'Y3JlZA',
  assertion: {
    response: {
      id: 'Y3JlZA',
      rawId: 'Y3JlZA',
      type: 'public-key',
      response: { clientDataJSON: '', authenticatorData: '', signature: '' },
      clientExtensionResults: {},
    },
    prf: null,
  },
  challenge: 'Y2g',
  until: 1,
}

describe('stopsQuietly', () => {
  it('stops without a word on cancelled, offline and no passkey only', () => {
    expect(
      (
        [
          'confirmed',
          'noLock',
          'cancelled',
          'failed',
          'offline',
          'noPasskey',
        ] as const
      ).filter(stopsQuietly)
    ).toEqual(['cancelled', 'offline', 'noPasskey'])
  })
})

describe('the shared check on phones', () => {
  const phone = (answer: DeviceOwnerCheck) => {
    const confirmDeviceOwner = vi.fn(async () => answer)
    return {
      confirmDeviceOwner,
      check: createSensitiveCheck({ web: null, confirmDeviceOwner }),
    }
  }

  it.each<DeviceOwnerCheck>(['confirmed', 'noLock', 'cancelled', 'failed'])(
    'asks Face ID, Touch ID or the passcode as before (%s)',
    async (answer) => {
      const { check, confirmDeviceOwner } = phone(answer)
      expect(
        await check.confirm('recovery_key', 'Show your recovery key')
      ).toBe(answer)
      expect(confirmDeviceOwner).toHaveBeenCalledExactlyOnceWith(
        'Show your recovery key'
      )
      expect(
        await check.confirmStepUp('recovery_key', 'Show your recovery key')
      ).toEqual({ check: answer, stepUp: null })
    }
  )

  it('runs server-gated requests once, with no check: phone sessions are exempt', async () => {
    const { check, confirmDeviceOwner } = phone('confirmed')
    const op = vi.fn(async () => 'deleted')
    expect(await check.withStepUp('delete_data', op)).toBe('deleted')
    expect(op).toHaveBeenCalledOnce()

    const refused = vi.fn(async () => {
      throw stepUpRequired()
    })
    await expect(check.withStepUp('delete_data', refused)).rejects.toThrow(
      HttpError
    )
    expect(refused).toHaveBeenCalledOnce()
    expect(confirmDeviceOwner).not.toHaveBeenCalled()
  })
})

describe('the shared check on the web', () => {
  const web = (...answers: StepUpResult[]) => {
    const stepUp = vi.fn<(action: string) => Promise<StepUpResult>>()
    for (const answer of answers) stepUp.mockResolvedValueOnce(answer)
    const confirmDeviceOwner = vi.fn(async () => 'confirmed' as const)
    return {
      stepUp,
      confirmDeviceOwner,
      check: createSensitiveCheck({ web: stepUp, confirmDeviceOwner }),
    }
  }

  it('steps up instead of asking the device', async () => {
    const { check, stepUp, confirmDeviceOwner } = web(passkey)
    expect(await check.confirm('recovery_key', 'unused')).toBe('confirmed')
    expect(stepUp).toHaveBeenCalledExactlyOnceWith('recovery_key')
    expect(confirmDeviceOwner).not.toHaveBeenCalled()
  })

  it('names how the web’s check passed, for analytics and the create', async () => {
    const session = { status: 'confirmed', via: 'session', until: 1 } as const
    expect(await web(session).check.confirmStepUp('recovery_key', '')).toEqual({
      check: 'confirmed',
      stepUp: session,
    })
  })

  it.each([
    [{ status: 'confirmed', via: 'session', until: 1 }, 'confirmed'],
    [{ status: 'cancelled' }, 'cancelled'],
    [{ status: 'offline' }, 'offline'],
    [{ status: 'noPasskey' }, 'noPasskey'],
    [{ status: 'failed', reason: 'refused' }, 'failed'],
  ] as const)('answers %j as %s', async (result, expected) => {
    expect(await web(result).check.confirm('add_passkey', '')).toBe(expected)
  })

  describe('withStepUp', () => {
    it('runs the request once when the server takes it', async () => {
      const { check, stepUp } = web()
      const op = vi.fn(async () => 'ok')
      expect(await check.withStepUp('remove_passkey', op)).toBe('ok')
      expect(op).toHaveBeenCalledOnce()
      expect(stepUp).not.toHaveBeenCalled()
    })

    it('steps up on 403 step_up_required and retries once', async () => {
      const { check, stepUp } = web(passkey)
      const op = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(stepUpRequired())
        .mockResolvedValueOnce('removed')
      expect(await check.withStepUp('remove_passkey', op)).toBe('removed')
      expect(stepUp).toHaveBeenCalledExactlyOnceWith('remove_passkey')
      expect(op).toHaveBeenCalledTimes(2)
    })

    it('retries only once', async () => {
      const { check, stepUp } = web(passkey, passkey)
      const op = vi.fn(async () => {
        throw stepUpRequired()
      })
      await expect(check.withStepUp('add_passkey', op)).rejects.toMatchObject({
        serverCode: 'step_up_required',
      })
      expect(op).toHaveBeenCalledTimes(2)
      expect(stepUp).toHaveBeenCalledOnce()
    })

    it.each([
      [{ status: 'cancelled' }, 'cancelled'],
      [{ status: 'offline' }, 'offline'],
      [{ status: 'noPasskey' }, 'noPasskey'],
    ] as const)(
      'doesn’t retry when the step-up ends %j',
      async (result, check) => {
        const service = web(result)
        const op = vi.fn(async () => {
          throw stepUpRequired()
        })
        const error = await service.check
          .withStepUp('delete_data', op)
          .catch((thrown: unknown) => thrown)
        expect(error).toBeInstanceOf(StepUpNotConfirmedError)
        expect((error as StepUpNotConfirmedError).check).toBe(check)
        expect(op).toHaveBeenCalledOnce()
      }
    )

    it('passes any other failure on without a step-up', async () => {
      const { check, stepUp } = web()
      const op = vi.fn(async () => {
        throw new HttpError('client', 403, 'passkey_failed')
      })
      await expect(check.withStepUp('add_passkey', op)).rejects.toMatchObject({
        serverCode: 'passkey_failed',
      })
      expect(stepUp).not.toHaveBeenCalled()
    })
  })
})

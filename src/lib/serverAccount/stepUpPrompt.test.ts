import { beforeEach, describe, expect, it, vi } from 'vitest'

const analytics = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics }))
vi.mock('@/lib/passkeys', () => ({ getPasskey: vi.fn() }))
vi.mock('@/lib/serverAccount', () => ({ bearerOptions: vi.fn() }))
vi.mock('@/lib/serverAccount/accountDevices', () => ({
  activityOptions: vi.fn(),
}))
vi.mock('@/lib/serverAccount/webRuntime', () => ({ webRuntime: null }))

const {
  finishContinue,
  finishStepUp,
  onPasskeyStepUp,
  requestContinue,
  requestStepUp,
  useStepUpPrompt,
} = await import('@/lib/serverAccount/stepUpPrompt')

const open = () => {
  const request = useStepUpPrompt.getState().request
  if (!request) throw new Error('No step-up is open')
  return request
}

beforeEach(() => {
  vi.clearAllMocks()
  useStepUpPrompt.setState({ request: null })
})

describe('the step-up sheet’s requests', () => {
  it('opens for the action and answers once the sheet ends', async () => {
    const pending = requestStepUp('recovery_key')
    const { id, action } = open()
    expect(action).toBe('recovery_key')
    finishStepUp(id, { status: 'offline' })
    expect(await pending).toEqual({ status: 'offline' })
    expect(useStepUpPrompt.getState().request).toBeNull()
    expect(analytics.capture).toHaveBeenCalledExactlyOnceWith('web_step_up', {
      action: 'recovery_key',
      result: 'offline',
    })
  })

  it('one at a time: another while it’s open is cancelled', async () => {
    void requestStepUp('add_passkey')
    expect(await requestStepUp('remove_passkey')).toEqual({
      status: 'cancelled',
    })
    expect(open().action).toBe('add_passkey')
  })

  it('ignores a stale end', async () => {
    const pending = requestStepUp('delete_data')
    const { id } = open()
    finishStepUp(id + 1, { status: 'cancelled' })
    expect(useStepUpPrompt.getState().request).not.toBeNull()
    finishStepUp(id, { status: 'noPasskey' })
    expect(await pending).toEqual({ status: 'noPasskey' })
    expect(analytics.capture).toHaveBeenCalledExactlyOnceWith('web_step_up', {
      action: 'delete_data',
      result: 'no_passkey',
    })
  })

  it('records how it ended, without who or which passkey', async () => {
    const listener = vi.fn()
    const stop = onPasskeyStepUp(listener)
    const passkey = {
      status: 'confirmed',
      via: 'passkey',
      rpId: 'app.witnesswork.app',
      credentialIds: ['Y3JlZA'],
      assertion: { response: {}, prf: null },
      challenge: 'Y2g',
    } as never
    for (const [result, name] of [
      [passkey, 'passkey'],
      [{ status: 'confirmed', via: 'session', until: 1 }, 'session'],
      [{ status: 'failed', reason: 'refused' }, 'refused'],
      [{ status: 'cancelled' }, 'cancelled'],
    ] as const) {
      void requestStepUp('app_lock')
      finishStepUp(open().id, result)
      expect(analytics.capture).toHaveBeenLastCalledWith('web_step_up', {
        action: 'app_lock',
        result: name,
      })
    }
    expect(listener).toHaveBeenCalledExactlyOnceWith(passkey)
    stop()
  })

  describe('the second tap', () => {
    it('answers continue straight from the tap, recording nothing', async () => {
      const pending = requestContinue('add_passkey', performance.now() + 60_000)
      const request = open()
      expect(request).toMatchObject({ kind: 'continue', action: 'add_passkey' })

      finishStepUp(request.id, { status: 'cancelled' })
      expect(useStepUpPrompt.getState().request).not.toBeNull()
      finishContinue(request.id, 'continue')
      expect(useStepUpPrompt.getState().request).toBeNull()
      expect(await pending).toBe('continue')
      expect(analytics.capture).not.toHaveBeenCalled()
    })

    it('is expired at once past the step-up’s end, and cancelled behind another', async () => {
      expect(await requestContinue('add_passkey', performance.now() - 1)).toBe(
        'expired'
      )
      void requestStepUp('remove_passkey')
      expect(
        await requestContinue('add_passkey', performance.now() + 60_000)
      ).toBe('cancelled')
    })
  })
})

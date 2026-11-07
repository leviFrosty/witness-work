import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http/request'

const runtime = vi.hoisted(() => ({ platform: 'ios' }))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
}))
const deviceOwner = vi.hoisted(() => ({ confirmDeviceOwner: vi.fn() }))
vi.mock('@/lib/deviceOwner', () => deviceOwner)
const prompt = vi.hoisted(() => ({ requestStepUp: vi.fn() }))
vi.mock('@/lib/serverAccount/stepUpPrompt', () => prompt)

const load = () => import('@/lib/confirmSensitive')

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe.each(['ios', 'android'])('on %s', (platform) => {
  beforeEach(() => {
    runtime.platform = platform
    deviceOwner.confirmDeviceOwner.mockResolvedValue('confirmed')
  })

  it('asks Face ID, Touch ID or the passcode with the same prompt, never a step-up', async () => {
    const { confirmSensitiveAction } = await load()
    expect(
      await confirmSensitiveAction('recovery_key', 'Show your recovery key')
    ).toBe('confirmed')
    expect(deviceOwner.confirmDeviceOwner).toHaveBeenCalledExactlyOnceWith(
      'Show your recovery key'
    )
    expect(prompt.requestStepUp).not.toHaveBeenCalled()
  })

  it('sends gated requests once, as before', async () => {
    const { withStepUp } = await load()
    const op = vi.fn(async () => {
      throw new HttpError('client', 403, 'step_up_required')
    })
    await expect(withStepUp('delete_data', op)).rejects.toThrow(HttpError)
    expect(op).toHaveBeenCalledOnce()
    expect(prompt.requestStepUp).not.toHaveBeenCalled()
  })
})

describe('on the web', () => {
  beforeEach(() => {
    runtime.platform = 'web'
  })

  it('opens the step-up sheet for the action instead', async () => {
    prompt.requestStepUp.mockResolvedValue({ status: 'offline' })
    const { confirmSensitiveAction } = await load()
    expect(await confirmSensitiveAction('add_passkey', 'unused')).toBe(
      'offline'
    )
    expect(prompt.requestStepUp).toHaveBeenCalledExactlyOnceWith('add_passkey')
    expect(deviceOwner.confirmDeviceOwner).not.toHaveBeenCalled()
  })

  it('steps up and retries once on step_up_required', async () => {
    prompt.requestStepUp.mockResolvedValue({
      status: 'confirmed',
      via: 'session',
    })
    const { withStepUp } = await load()

    const { HttpError: Fresh } = await import('@/lib/http/request')
    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Fresh('client', 403, 'step_up_required'))
      .mockResolvedValueOnce('ok')
    expect(await withStepUp('remove_passkey', op)).toBe('ok')
    expect(prompt.requestStepUp).toHaveBeenCalledExactlyOnceWith(
      'remove_passkey'
    )
  })
})

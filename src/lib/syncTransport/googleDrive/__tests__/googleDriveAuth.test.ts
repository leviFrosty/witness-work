import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeGoogleDrive } from './driveTestKit'

// Which Google Account Android sync uses: connecting, silent token refresh,
// tokens bound to the account an operation started under, noticing a silent
// account switch, losing consent, and disconnecting.

const native = vi.hoisted(() => ({
  account: 'acct-a',
  authorize: vi.fn(),
  clearToken: vi.fn(async (_token: string) => {}),
  appState: [] as Array<(state: string) => void>,
}))
const drive = vi.hoisted(() => ({
  current: null as ReturnType<typeof createFakeGoogleDrive> | null,
}))

vi.mock('../../../../../modules/google-drive-auth', () => ({
  authorize: native.authorize,
  clearToken: native.clearToken,
  isSupported: () => true,
}))
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      native.appState.push(listener)
      return { remove: () => {} }
    },
  },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { PHONE: 1, TABLET: 2 },
  deviceType: 1,
  modelName: 'Pixel 9',
  osName: 'Android',
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

const load = async () => {
  const auth = await import('@/lib/syncTransport/googleDrive/googleDriveAuth')
  const { usePreferences } = await import('@/stores/preferences')
  const { analytics } = await import('@/lib/analytics')
  return { ...auth, usePreferences, analytics }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  native.account = 'acct-a'
  native.appState = []
  native.authorize.mockImplementation(async () => `fake:${native.account}`)
  drive.current = createFakeGoogleDrive()
  vi.stubGlobal('fetch', drive.current.fetch)
})

describe('connectGoogleDrive', () => {
  it('stores a hash of the chosen account, never the account itself', async () => {
    const { connectGoogleDrive, usePreferences, hashGoogleDriveAccount } =
      await load()
    expect(await connectGoogleDrive()).toBe('connected')
    expect(native.authorize).toHaveBeenCalledWith({
      interactive: true,
      selectAccount: false,
    })
    const stored = usePreferences.getState().googleDriveAccountId
    expect(stored).toBe(hashGoogleDriveAccount('acct-a'))
    expect(stored).not.toContain('acct-a')
  })

  it('reports a cancelled or misconfigured consent without connecting', async () => {
    const { connectGoogleDrive, usePreferences } = await load()
    native.authorize.mockRejectedValueOnce({
      code: 'GOOGLE_DRIVE_AUTH_CANCELED',
    })
    expect(await connectGoogleDrive()).toBe('canceled')
    native.authorize.mockRejectedValueOnce(
      new Error(
        'Google Drive authorization failed (GOOGLE_DRIVE_AUTH_MISCONFIGURED)'
      )
    )
    expect(await connectGoogleDrive()).toBe('misconfigured')
    expect(usePreferences.getState().googleDriveAccountId).toBeNull()
  })

  it('tells availability listeners', async () => {
    const { connectGoogleDrive, addGoogleDriveAvailabilityListener } =
      await load()
    const listener = vi.fn()
    addGoogleDriveAvailabilityListener(listener)
    await connectGoogleDrive()
    expect(listener).toHaveBeenLastCalledWith({ available: true })
  })
})

describe('googleDriveAccessToken', () => {
  it('reuses a token until Drive rejects it', async () => {
    const { connectGoogleDrive, googleDriveAccessToken } = await load()
    await connectGoogleDrive()
    await googleDriveAccessToken({ refresh: false })
    await googleDriveAccessToken({ refresh: false })
    expect(native.authorize).toHaveBeenCalledTimes(1)

    await googleDriveAccessToken({ refresh: true })
    expect(native.clearToken).toHaveBeenCalledWith('fake:acct-a')
    expect(native.authorize).toHaveBeenLastCalledWith({ interactive: false })
  })

  it('refuses a token for an account that silently replaced the connected one', async () => {
    const {
      connectGoogleDrive,
      googleDriveAccessToken,
      usePreferences,
      hashGoogleDriveAccount,
    } = await load()
    await connectGoogleDrive()
    // The connected account was removed from the phone; Google now answers
    // silently for another one.
    native.account = 'acct-b'
    await expect(
      googleDriveAccessToken({ refresh: true })
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(usePreferences.getState().googleDriveAccountId).toBe(
      hashGoogleDriveAccount('acct-b')
    )
  })

  it('asks the user to reconnect when consent is gone', async () => {
    const {
      connectGoogleDrive,
      googleDriveAccessToken,
      isGoogleDriveConnected,
      usePreferences,
      analytics,
    } = await load()
    await connectGoogleDrive()
    native.authorize.mockRejectedValue({
      code: 'GOOGLE_DRIVE_AUTH_CONSENT_REQUIRED',
    })
    await expect(
      googleDriveAccessToken({ refresh: true })
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(usePreferences.getState().googleDriveNeedsReconnect).toBe(true)
    expect(isGoogleDriveConnected()).toBe(false)
    expect(analytics.capture).toHaveBeenCalledWith('google_drive_access_lost')
  })

  it('keeps an offline failure retryable', async () => {
    const { connectGoogleDrive, googleDriveAccessToken, usePreferences } =
      await load()
    await connectGoogleDrive()
    native.authorize.mockRejectedValueOnce({
      code: 'GOOGLE_DRIVE_AUTH_NETWORK',
    })
    await expect(
      googleDriveAccessToken({ refresh: true })
    ).rejects.toMatchObject({ code: 'network' })
    expect(usePreferences.getState().googleDriveNeedsReconnect).toBe(false)
  })

  it.each([
    ['userRateLimitExceeded', 'rate-limited'],
    ['dailyLimitExceeded', 'rate-limited'],
    [undefined, 'network'],
  ])(
    'never asks to reconnect over a 403 %s from the account check',
    async (reason, code) => {
      const { connectGoogleDrive, googleDriveAccessToken, usePreferences } =
        await load()
      await connectGoogleDrive()
      // Both the first check and the retry with a fresh token.
      for (let i = 0; i < 2; i++)
        drive.current!.failNext(
          (r) => r.url.includes('/drive/v3/about'),
          403,
          reason
        )
      await expect(
        googleDriveAccessToken({ refresh: true })
      ).rejects.toMatchObject({ code })
      expect(usePreferences.getState().googleDriveNeedsReconnect).toBe(false)
    }
  )

  it('still asks to reconnect when Drive refuses the token itself', async () => {
    const { connectGoogleDrive, googleDriveAccessToken, usePreferences } =
      await load()
    await connectGoogleDrive()
    for (let i = 0; i < 2; i++)
      drive.current!.failNext(
        (r) => r.url.includes('/drive/v3/about'),
        403,
        'insufficientPermissions'
      )
    await expect(
      googleDriveAccessToken({ refresh: true })
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(usePreferences.getState().googleDriveNeedsReconnect).toBe(true)
  })

  it('refuses without a connected account', async () => {
    const { googleDriveAccessToken } = await load()
    await expect(
      googleDriveAccessToken({ refresh: false })
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(native.authorize).not.toHaveBeenCalled()
  })
})

describe('disconnectGoogleDrive', () => {
  it('forgets the account here without revoking the shared grant', async () => {
    const { connectGoogleDrive, disconnectGoogleDrive, usePreferences } =
      await load()
    await connectGoogleDrive()
    const requests: string[] = []
    vi.stubGlobal(
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(String(input))
        return drive.current!.fetch(input, init)
      }
    )
    await disconnectGoogleDrive()
    // Revoking would cut off the user's other devices on that account.
    expect(requests.some((url) => url.includes('oauth2'))).toBe(false)
    expect(native.clearToken).toHaveBeenCalledWith('fake:acct-a')
    expect(usePreferences.getState().googleDriveAccountId).toBeNull()
  })

  it('discards a token request that finishes after the disconnect', async () => {
    const {
      connectGoogleDrive,
      disconnectGoogleDrive,
      googleDriveAccessToken,
      usePreferences,
    } = await load()
    await connectGoogleDrive()
    let finish!: (token: string) => void
    native.authorize.mockImplementationOnce(
      () => new Promise<string>((resolve) => (finish = resolve))
    )
    const late = googleDriveAccessToken({ refresh: true })
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 0))
    await disconnectGoogleDrive()
    finish('fake:acct-a')
    await expect(late).rejects.toMatchObject({ code: 'unauthorized' })
    expect(usePreferences.getState().googleDriveAccountId).toBeNull()
  })
})

describe('late refusals', () => {
  it('do not ask to reconnect an account that was disconnected meanwhile', async () => {
    const {
      connectGoogleDrive,
      disconnectGoogleDrive,
      googleDriveAccessToken,
      usePreferences,
    } = await load()
    await connectGoogleDrive()
    let refuse!: (reason: unknown) => void
    native.authorize.mockImplementationOnce(
      () => new Promise<string>((_, reject) => (refuse = reject))
    )
    const late = googleDriveAccessToken({ refresh: true })
    while (!refuse) await new Promise((resolve) => setTimeout(resolve, 0))
    await disconnectGoogleDrive()
    refuse({ code: 'GOOGLE_DRIVE_AUTH_CONSENT_REQUIRED' })
    await expect(late).rejects.toMatchObject({ code: 'unauthorized' })
    expect(usePreferences.getState().googleDriveNeedsReconnect).toBe(false)
  })
})

describe('account binding', () => {
  it('refuses a token for an operation that began under another account', async () => {
    const {
      connectGoogleDrive,
      googleDriveAccessToken,
      hashGoogleDriveAccount,
    } = await load()
    await connectGoogleDrive()
    const accountA = hashGoogleDriveAccount('acct-a')
    expect(
      await googleDriveAccessToken({ refresh: false, account: accountA })
    ).toBe('fake:acct-a')
    // The user switches to another account while A's push is queued.
    native.account = 'acct-b'
    await connectGoogleDrive({ selectAccount: true })
    await expect(
      googleDriveAccessToken({ refresh: false, account: accountA })
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(
      await googleDriveAccessToken({
        refresh: false,
        account: hashGoogleDriveAccount('acct-b'),
      })
    ).toBe('fake:acct-b')
  })

  it('retries once with a fresh token when Play services hands back a revoked one', async () => {
    const { connectGoogleDrive, googleDriveAccessToken, usePreferences } =
      await load()
    await connectGoogleDrive()
    let revoked = true
    native.authorize.mockImplementation(async () =>
      revoked ? 'fake:revoked' : `fake:${native.account}`
    )
    native.clearToken.mockImplementation(async (token: string) => {
      if (token === 'fake:revoked') revoked = false
    })
    drive.current!.revoke('revoked')
    expect(await googleDriveAccessToken({ refresh: true })).toBe('fake:acct-a')
    expect(native.clearToken).toHaveBeenCalledWith('fake:revoked')
    expect(usePreferences.getState().googleDriveNeedsReconnect).toBe(false)
  })

  it('shares one refresh between parallel requests Drive rejected', async () => {
    const { connectGoogleDrive, googleDriveAccessToken } = await load()
    let issued = 0
    native.authorize.mockImplementation(
      async () => `fake:${native.account}#${++issued}`
    )
    await connectGoogleDrive()
    // Four downloads all got 401 for the first token.
    const tokens = await Promise.all(
      [0, 1, 2, 3].map(() =>
        googleDriveAccessToken({ refresh: true, rejected: 'fake:acct-a#1' })
      )
    )
    expect(tokens).toEqual(Array(4).fill('fake:acct-a#2'))
    expect(native.authorize).toHaveBeenCalledTimes(2)
    expect(native.clearToken).toHaveBeenCalledTimes(1)
    expect(native.clearToken).toHaveBeenCalledWith('fake:acct-a#1')
  })
})

describe('consent screen', () => {
  it('counts a screen that closed without a result as cancelled', async () => {
    vi.useFakeTimers()
    try {
      const { connectGoogleDrive } = await load()
      native.authorize.mockImplementationOnce(() => new Promise(() => {}))
      const outcome = connectGoogleDrive()
      await vi.advanceTimersByTimeAsync(0)
      native.appState.forEach((listener) => listener('background'))
      native.appState.forEach((listener) => listener('active'))
      await vi.advanceTimersByTimeAsync(3_000)
      expect(await outcome).toBe('canceled')
    } finally {
      vi.useRealTimers()
    }
  })
})

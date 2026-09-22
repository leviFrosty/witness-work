import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: { extra: {} as Record<string, string> },
  capture: vi.fn(),
  screen: vi.fn(),
  getSessionId: vi.fn(),
  reset: vi.fn(),
  debug: vi.fn(),
  construct: vi.fn(),
}))
vi.mock('expo-constants', () => ({ default: { expoConfig: mocks.config } }))
vi.mock('posthog-react-native', () => ({
  default: class {
    constructor(...args: unknown[]) {
      mocks.construct(...args)
    }
    capture = mocks.capture
    screen = mocks.screen
    getSessionId = mocks.getSessionId
    reset = mocks.reset
    debug = mocks.debug
  },
}))

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  const { setAnalyticsEventsAllowed } = await import('./analyticsPolicy')
  setAnalyticsEventsAllowed(true)
  mocks.config.extra = {
    posthogProjectToken: 'test-token',
    posthogHost: 'https://example.com',
  }
})

describe('analytics boundary', () => {
  it('is safe to call without analytics configuration', async () => {
    mocks.config.extra = {}
    const { analytics } = await import('./analytics')
    analytics.capture('action')
    analytics.screen('Home')
    analytics.reset()
    expect(mocks.construct).not.toHaveBeenCalled()
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('configures the provider for anonymous events only', async () => {
    await import('./analytics')
    const options = mocks.construct.mock.calls[0][1] as Record<string, unknown>
    expect(options.personProfiles).toBe('never')
    expect(options.disableGeoip).toBeUndefined()
  })

  it('drops usage events, but not crash or survey events, when analytics are off', async () => {
    // Fresh modules: the gate starts closed until the choice is published.
    vi.resetModules()
    const { setAnalyticsEventsAllowed } = await import('./analyticsPolicy')
    await import('./analytics')
    const options = mocks.construct.mock.calls[0][1] as {
      before_send: (event: {
        event: string
        properties: Record<string, unknown>
      }) => unknown
    }
    const send = (event: string) =>
      options.before_send({ event, properties: {} })

    expect(send('contact_created')).toBeNull()
    expect(send('$exception')).not.toBeNull()

    setAnalyticsEventsAllowed(false)
    expect(send('contact_created')).toBeNull()
    expect(send('Application Opened')).toBeNull()
    expect(send('$screen')).toBeNull()
    expect(send('survey sent')).not.toBeNull()
    expect(send('survey dismissed')).not.toBeNull()
    expect(send('$exception')).not.toBeNull()

    setAnalyticsEventsAllowed(true)
    expect(send('contact_created')).not.toBeNull()
  })

  it('tags every event before sending', async () => {
    mocks.config.extra.appVariant = 'development'
    await import('./analytics')
    const options = mocks.construct.mock.calls[0][1] as {
      before_send: (event: {
        event: string
        properties: Record<string, unknown>
      }) => {
        properties: Record<string, unknown>
      }
    }
    const result = options.before_send({
      event: 'Application Opened',
      properties: {
        count: 0,
      },
    })
    expect(result.properties).toEqual({
      app_variant: 'development',
      development_mode: false,
      count: 0,
    })
  })

  it('omits undefined properties while preserving false, zero and null', async () => {
    const { analytics } = await import('./analytics')
    analytics.capture('action', {
      missing: undefined,
      enabled: false,
      count: 0,
      value: null,
    })
    expect(mocks.capture).toHaveBeenCalledWith('action', {
      enabled: false,
      count: 0,
      value: null,
    })
    analytics.screen('Home', { previous_screen: undefined })
    expect(mocks.screen).toHaveBeenCalledWith('Home', {})
  })

  it('drops lifecycle backgrounded events before sending', async () => {
    await import('./analytics')
    const options = mocks.construct.mock.calls[0][1] as {
      before_send: (event: { event: string; properties: object }) => unknown
    }
    expect(
      options.before_send({ event: 'Application Backgrounded', properties: {} })
    ).toBeNull()
  })

  it('sends each screen once per session', async () => {
    mocks.getSessionId.mockReturnValue('session-1')
    const { analytics } = await import('./analytics')
    analytics.screen('Dashboard')
    analytics.screen('Schedule', { previous_screen: 'Dashboard' })
    analytics.screen('Dashboard', { previous_screen: 'Schedule' })
    expect(mocks.screen.mock.calls).toEqual([
      ['Dashboard', undefined],
      ['Schedule', { previous_screen: 'Dashboard' }],
    ])

    mocks.getSessionId.mockReturnValue('session-2')
    analytics.screen('Dashboard')
    expect(mocks.screen).toHaveBeenLastCalledWith('Dashboard', undefined)
    expect(mocks.screen).toHaveBeenCalledTimes(3)
  })

  it('does not break app startup when the provider cannot initialize', async () => {
    mocks.construct.mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    const { analytics } = await import('./analytics')
    expect(() => analytics.capture('action')).not.toThrow()
  })

  it('isolates synchronous and asynchronous provider failures from user actions', async () => {
    mocks.capture.mockImplementation(() => {
      throw new Error('provider failure')
    })
    mocks.screen.mockRejectedValue(new Error('screen failure'))
    mocks.reset.mockImplementation(() => {
      throw new Error('reset failure')
    })
    const { analytics } = await import('./analytics')
    expect(() => analytics.capture('action')).not.toThrow()
    expect(() => analytics.screen('Home')).not.toThrow()
    expect(() => analytics.reset()).not.toThrow()
    await Promise.resolve()
  })
})

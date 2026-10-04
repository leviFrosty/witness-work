import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostHogPersistedProperty as P } from '@posthog/core'
import type { PostHog } from 'posthog-react-native'

const mocks = vi.hoisted(() => ({
  stored: new Map<string, string>(),
  fetch: vi.fn(),
  read: vi.fn(),
  retryCount: 0,
  frequency: new Map<string, string>(),
  platform: 'ios',
  launchUrl: null as string | null,
  variant: 'production',
}))

vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    getString = (key: string) => mocks.frequency.get(key)
    set = (key: string, value: string) => mocks.frequency.set(key, value)
    delete = (key: string) => mocks.frequency.delete(key)
  },
}))
vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        posthogProjectToken: 'test-token',
        posthogHost: 'https://example.com',
        get appVariant() {
          return mocks.variant
        },
      },
    },
  },
}))

vi.mock('posthog-react-native', async () => {
  const { createRequire } = await import('node:module')
  const { readFileSync } = await import('node:fs')
  const { dirname, join } = await import('node:path')
  const { runInThisContext } = await import('node:vm')
  const require = createRequire(import.meta.url)
  const filename = join(
    dirname(require.resolve('posthog-react-native')),
    'posthog-rn.js'
  )
  const sdkRequire = createRequire(filename)
  const nativeModules: Record<string, unknown> = {
    'react-native': {
      AppState: { currentState: 'active', addEventListener: vi.fn() },
      Linking: { getInitialURL: async () => mocks.launchUrl },
      Platform: {
        get OS() {
          return mocks.platform
        },
      },
      Dimensions: { get: () => ({ width: 390, height: 844 }) },
    },
    './native-deps': {
      getAppProperties: () => ({ $app_build: '1', $app_version: '1.0.0' }),
      buildOptimisticAsyncStorage: () => ({
        getItem: (key: string) => mocks.read(key),
        setItem: (key: string, value: string) => mocks.stored.set(key, value),
      }),
    },
    './optional/OptionalPlugin': {},
    './frameworks/wix-navigation': {},
    './logs-defaults': {
      resolveLogsConfig: () => ({
        flushIntervalMs: 0,
        terminationFlushBudgetMs: 2000,
      }),
    },
    './utils': {
      isWeb: () => false,
      isMacOS: () => false,
      isHermes: () => false,
    },
    './error-tracking': {
      ErrorTracking: class {
        onRemoteConfig() {}
        clearExceptionSteps() {}
      },
    },
  }
  // Execute the installed RN SDK, replacing only native dependencies. Its
  // initialization, persistence, identity, reset and delivery code stay real.
  const sdk = { exports: {} as { PostHog: typeof PostHog } }
  runInThisContext(
    `(function(require, module, exports) {${readFileSync(filename, 'utf8')}\n})`
  )((id: string) => nativeModules[id] ?? sdkRequire(id), sdk, sdk.exports)
  return {
    default: class extends sdk.exports.PostHog {
      constructor(
        token: string,
        options: ConstructorParameters<typeof PostHog>[1]
      ) {
        super(token, {
          ...options,
          flushAt: 100,
          flushInterval: 0,
          disableCompression: true,
          fetchRetryCount: mocks.retryCount,
          fetchRetryDelay: 1,
        })
      }
      fetch(...args: Parameters<PostHog['fetch']>) {
        return mocks.fetch(...args)
      }
    },
  }
})

let client: PostHog | null

beforeEach(() => {
  vi.resetModules()
  mocks.retryCount = 0
  mocks.stored.clear()
  mocks.frequency.clear()
  mocks.platform = 'ios'
  mocks.launchUrl = null
  mocks.variant = 'production'
  mocks.read.mockImplementation(
    async (key: string) => mocks.stored.get(key) ?? null
  )
  mocks.fetch.mockReset().mockResolvedValue({
    status: 200,
    json: async () => ({}),
    text: async () => '',
  })
})

afterEach(async () => {
  await client?.shutdown()
  client = null
})

function seed(properties: Record<string, unknown>) {
  mocks.stored.set(
    '.posthog-rn.json',
    JSON.stringify({ version: 'v1', content: properties })
  )
}

async function start(allowed = true) {
  const policy = await import('./analyticsPolicy')
  policy.setAnalyticsEventsAllowed(allowed)
  client = (await import('./posthogClient')).posthogClient
  expect(client).not.toBeNull()
  await client!.ready()
  return client!
}

function sentEvents() {
  return mocks.fetch.mock.calls.flatMap(([url, options]) =>
    url.includes('/batch/') ? JSON.parse(options.body).batch : []
  )
}

describe('PostHog consent with persisted SDK state', () => {
  it.each([false, true])(
    'rechecks consent on network retries, including re-opt-in=%s',
    async (reoptIn) => {
      mocks.retryCount = 1
      const sdk = await start()
      const { analytics } = await import('./analytics')
      const { setAnalyticsEventsAllowed } = await import('./analyticsPolicy')
      sdk.capture('contact_created')
      sdk.capture('$exception')
      sdk.capture('survey sent')
      let failAttempt!: (error: Error) => void
      mocks.fetch.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failAttempt = reject
          })
      )
      const flushing = sdk.flush()
      await vi.waitFor(() => expect(failAttempt).toBeTypeOf('function'))
      setAnalyticsEventsAllowed(false)
      analytics.reset()
      setAnalyticsEventsAllowed(reoptIn)
      mocks.fetch.mockClear()
      failAttempt(new Error('offline'))
      await flushing
      expect(
        sentEvents().map((event: { event: string }) => event.event)
      ).toEqual(['$exception', 'survey sent'])
    }
  )
  it.each(['sync', 'async'])(
    'migrates identified installations with %s storage before startup requests or queued delivery',
    async (storage) => {
      if (storage === 'sync')
        mocks.read.mockImplementation(
          (key: string) => mocks.stored.get(key) ?? null
        )
      seed({
        [P.DistinctId]: 'existing-account-id',
        [P.AnonymousId]: 'previous-linked-id',
        [P.DeviceId]: 'previous-linked-device',
        [P.PersonMode]: 'identified',
        [P.PersonProperties]: { account: 'existing-account-id' },
        [P.Props]: { $groups: { account: 'existing-account-id' } },
        [P.Queue]: [
          {
            message: {
              event: 'legacy_usage',
              distinct_id: 'existing-account-id',
              properties: {},
            },
          },
        ],
        [P.SurveysSeen]: [{ surveyId: 'completed-survey' }],
      })
      const sdk = await start()
      sdk.capture('time_entry_created')
      await sdk.reloadFeatureFlagsAsync()
      await sdk.flush()
      expect(sdk.getDistinctId()).not.toBe('existing-account-id')
      expect(sdk.getAnonymousId()).not.toBe('previous-linked-id')
      expect(JSON.stringify(mocks.fetch.mock.calls)).not.toContain(
        'existing-account-id'
      )
      expect(JSON.stringify(mocks.fetch.mock.calls)).not.toContain(
        'previous-linked-id'
      )
      expect(JSON.stringify(mocks.fetch.mock.calls)).not.toContain(
        'previous-linked-device'
      )
      expect(
        sentEvents().map((event: { event: string }) => event.event)
      ).toContain('time_entry_created')
      expect(sdk.getPersistedProperty(P.SurveysSeen)).toEqual([
        { surveyId: 'completed-survey' },
      ])
      const migratedId = sdk.getDistinctId()
      await sdk.shutdown()
      vi.resetModules()
      const restarted = await start()
      expect(restarted.getDistinctId()).toBe(migratedId)
    }
  )

  it('removes queued offline usage on opt-out, keeping crashes and survey responses', async () => {
    const sdk = await start()
    sdk.capture('plan_created')
    sdk.capture('$exception')
    sdk.capture('survey sent')
    sdk.capture('survey dismissed')
    mocks.fetch.mockRejectedValueOnce(new Error('offline'))
    await expect(sdk.flush()).rejects.toThrow()
    const { setAnalyticsEventsAllowed } = await import('./analyticsPolicy')
    setAnalyticsEventsAllowed(false)
    const { analytics } = await import('./analytics')
    analytics.reset()
    mocks.fetch.mockClear()
    await sdk.flush()
    expect(sentEvents().map((event: { event: string }) => event.event)).toEqual(
      ['$exception', 'survey sent', 'survey dismissed']
    )
    // A later opt-in must not resurrect the discarded queue.
    setAnalyticsEventsAllowed(true)
    await sdk.flush()
    expect(
      sentEvents().some(
        (event: { event: string }) => event.event === 'plan_created'
      )
    ).toBe(false)
  })

  it('preserves survey history and the SDK default retained properties on reset', async () => {
    const sdk = await start()
    const { analytics } = await import('./analytics')
    const retained = {
      [P.SurveysSeen]: [{ surveyId: 'completed-survey' }],
      [P.SurveyLastSeenDate]: '2026-09-22T00:00:00.000Z',
      [P.InstalledAppBuild]: '1',
      [P.InstalledAppVersion]: '1.0.0',
      [P.DeviceId]: 'device-id',
      [P.Surveys]: [{ id: 'survey' }],
      [P.RemoteConfig]: { surveys: true },
    }
    for (const [key, value] of Object.entries(retained))
      sdk.setPersistedProperty(key as P, value)
    const previousId = sdk.getDistinctId()
    analytics.reset()
    expect(sdk.getDistinctId()).not.toBe(previousId)
    for (const [key, value] of Object.entries(retained))
      expect(sdk.getPersistedProperty(key as P)).toEqual(value)
  })

  it('keeps an anonymous installation identity stable on subsequent launches', async () => {
    seed({
      [P.AnonymousId]: 'anonymous-installation',
      [P.DeviceId]: 'anonymous-device',
    })
    const sdk = await start()
    await sdk.reloadFeatureFlagsAsync()
    expect(sdk.getDistinctId()).toBe('anonymous-installation')
    expect(sdk.getPersistedProperty(P.DeviceId)).toBe('anonymous-device')
  })

  it('prunes a restored offline queue before consent is known without losing diagnostics', async () => {
    seed({
      [P.AnonymousId]: 'anonymous-installation',
      [P.Queue]: ['contact_created', '$exception', 'survey sent'].map(
        (event) => ({
          message: {
            event,
            distinct_id: 'anonymous-installation',
            properties: {},
          },
        })
      ),
    })
    const sdk = await start(false)
    const { setAnalyticsEventsAllowed } = await import('./analyticsPolicy')
    setAnalyticsEventsAllowed(true)
    await sdk.flush()
    expect(sentEvents().map((event: { event: string }) => event.event)).toEqual(
      ['$exception', 'survey sent']
    )
  })

  it('honors withdrawal before SDK storage finishes loading even after immediate re-opt-in', async () => {
    let finishRead!: (value: string) => void
    mocks.read.mockImplementation((key: string) =>
      key === '.posthog-rn.json'
        ? new Promise<string>((resolve) => {
            finishRead = resolve
          })
        : null
    )
    const { setAnalyticsEventsAllowed } = await import('./analyticsPolicy')
    setAnalyticsEventsAllowed(true)
    client = (await import('./posthogClient')).posthogClient
    const { analytics } = await import('./analytics')
    setAnalyticsEventsAllowed(false)
    analytics.reset()
    setAnalyticsEventsAllowed(true)
    finishRead(
      JSON.stringify({
        version: 'v1',
        content: {
          [P.AnonymousId]: 'anonymous-installation',
          [P.Queue]: [
            {
              message: {
                event: 'contact_created',
                distinct_id: 'anonymous-installation',
                properties: {},
              },
            },
          ],
        },
      })
    )
    await client!.ready()
    await client!.flush()
    expect(
      sentEvents().some(
        (event: { event: string }) => event.event === 'contact_created'
      )
    ).toBe(false)
  })
})

describe('PostHog volume and privacy policy', () => {
  it.each(['ios', 'android'])(
    'preserves outcomes and flags while dropping noise on %s',
    async (platform) => {
      mocks.platform = platform
      const sdk = await start()
      for (let i = 0; i < 3; i++) {
        sdk.capture('contact_created')
        sdk.capture('Application Became Active')
        sdk.capture('Application Backgrounded')
        sdk.capture('$set', { $set: { is_supporter: true } })
        sdk.capture('navigation_destination_selected')
        sdk.capture('unregistered_event')
        sdk.capture('timer_action_completed', { action: 'paused' })
        sdk.capture('timer_action_completed', { action: 'started' })
      }
      sdk.capture('$feature_flag_called', {
        $feature_flag: 'buddies',
        $feature_flag_response: true,
      })
      await sdk.flush()
      const names = sentEvents().map((event: { event: string }) => event.event)
      expect(
        names.filter((name: string) => name === 'contact_created')
      ).toHaveLength(3)
      expect(
        names.filter((name: string) => name === 'Application Became Active')
      ).toHaveLength(1)
      expect(
        names.filter((name: string) => name === 'timer_action_completed')
      ).toHaveLength(1)
      expect(names).toContain('$feature_flag_called')
      for (const name of [
        'Application Backgrounded',
        '$set',
        'navigation_destination_selected',
        'unregistered_event',
      ])
        expect(names).not.toContain(name)
      sdk.resetSessionId()
      sdk.capture('timer_action_completed', { action: 'started' })
      mocks.fetch.mockClear()
      await sdk.flush()
      expect(
        sentEvents().filter(
          (event: { event: string }) => event.event === 'timer_action_completed'
        )
      ).toHaveLength(1)
    }
  )

  it.each(['ios', 'android'])(
    'removes private launch URLs from cold-start capture on %s',
    async (platform) => {
      mocks.platform = platform
      mocks.launchUrl =
        'witnesswork://contact/private-id?token=private-secret#notes'
      const sdk = await start()
      await vi.waitFor(() =>
        expect(
          sdk
            .getPersistedProperty<{ message: { event: string } }[]>(P.Queue)
            ?.some((item) => item.message.event === 'Application Opened')
        ).toBe(true)
      )
      await sdk.flush()
      const opened = sentEvents().find(
        (event: { event: string }) => event.event === 'Application Opened'
      )
      expect(opened.properties.url).toBeUndefined()
      expect(JSON.stringify(sentEvents())).not.toContain('private-secret')
      expect(JSON.stringify(sentEvents())).not.toContain('private-id')
    }
  )

  it('prunes restored noise and scrubs retained legacy launch URLs before delivery', async () => {
    seed({
      [P.AnonymousId]: 'anonymous-installation',
      [P.InstalledAppBuild]: '1',
      [P.InstalledAppVersion]: '1.0.0',
      [P.Queue]: [
        'Application Opened',
        '$set',
        'context_menu_action',
        'contact_created',
        'survey sent',
      ].map((event) => ({
        message: {
          event,
          distinct_id: 'anonymous-installation',
          properties:
            event === 'Application Opened'
              ? { url: 'witnesswork://contact/private-id?token=private-secret' }
              : {},
        },
      })),
    })
    const sdk = await start()
    await sdk.flush()
    const events = sentEvents()
    expect(events.map((event: { event: string }) => event.event)).toEqual([
      'Application Opened',
      'contact_created',
      'survey sent',
      'Application Opened',
    ])
    expect(events[0].properties.url).toBeUndefined()
    expect(JSON.stringify(events)).not.toContain('private-secret')
  })

  it.each(['development', 'beta', 'unknown'])(
    'keeps flags and surveys available in %s without usage ingestion',
    async (variant) => {
      mocks.variant = variant
      const sdk = await start()
      sdk.capture('contact_created')
      sdk.capture('$screen')
      sdk.capture('survey sent')
      sdk.capture('$exception')
      await sdk.reloadFeatureFlagsAsync()
      await sdk.flush()
      expect(
        sentEvents().map((event: { event: string }) => event.event)
      ).toEqual(['survey sent', '$exception'])
      expect(
        mocks.fetch.mock.calls.some(([url]) => url.includes('/flags/'))
      ).toBe(true)
    }
  )
})

it('reports each SDK flag/variant once while preserving the assigned value', async () => {
  const sdk = await start()
  sdk.updateFlags({ 'notes-import': 'variant-a' })
  expect(sdk.getFeatureFlag('notes-import', { sendEvent: false })).toBe(
    'variant-a'
  )
  expect(sdk.getFeatureFlag('notes-import')).toBe('variant-a')
  sdk.getFeatureFlag('notes-import')
  sdk.updateFlags({ 'notes-import': 'variant-b' })
  expect(sdk.getFeatureFlag('notes-import')).toBe('variant-b')
  sdk.getFeatureFlag('notes-import')
  await sdk.flush()
  const exposures = sentEvents().filter(
    (event: { event: string }) => event.event === '$feature_flag_called'
  )
  expect(
    exposures.map(
      (event: { properties: Record<string, unknown> }) =>
        event.properties.$feature_flag_response
    )
  ).toEqual(['variant-a', 'variant-b'])
})

it('drops legacy queued pause/reset timer commands while retaining starts', async () => {
  seed({
    [P.AnonymousId]: 'anonymous-installation',
    [P.Queue]: ['paused', 'reset', 'started'].map((action) => ({
      message: {
        event: 'timer_action_completed',
        distinct_id: 'anonymous-installation',
        properties: { action },
      },
    })),
  })
  const sdk = await start()
  await sdk.flush()
  const timers = sentEvents().filter(
    (event: { event: string }) => event.event === 'timer_action_completed'
  )
  expect(
    timers.map(
      (event: { properties: Record<string, unknown> }) =>
        event.properties.action
    )
  ).toEqual(['started'])
})

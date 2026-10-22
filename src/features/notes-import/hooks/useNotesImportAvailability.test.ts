import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotesImportAvailability } from '@/features/notes-import/hooks/useNotesImportAvailability'

const mocks = vi.hoisted(() => ({
  enabled: false,
  androidEnabled: false,
  status: vi.fn(),
  deviceUnverified: vi.fn(),
  suspended: vi.fn(),
  statusListeners: [] as (() => void)[],
  platform: 'ios',
  online: true as boolean | null,
  foreground: [] as { listener: () => void; minIntervalMs: number }[],
  reconnect: [] as (() => void)[],
}))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.platform
    },
  },
}))
vi.mock('@/lib/featureFlags', () => ({
  useFeatureFlag: (flag: string) =>
    flag === 'notes-import-android' ? mocks.androidEnabled : mocks.enabled,
}))
vi.mock('@/features/notes-import/lib/notesImportClient', () => ({
  fetchNotesImportStatus: mocks.status,
  notesImportDeviceUnverified: mocks.deviceUnverified,
}))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))
vi.mock('@/lib/serverAccount', () => ({
  accountSuspended: mocks.suspended,
  onAccountStatus: (listener: () => void) => {
    mocks.statusListeners.push(listener)
    return () => {
      mocks.statusListeners = mocks.statusListeners.filter(
        (l) => l !== listener
      )
    }
  },
}))
vi.mock('@/lib/http/online', () => ({
  getOnline: () => mocks.online,
  addReconnectListener: (listener: () => void) => {
    mocks.reconnect.push(listener)
    return {
      remove: () => {
        mocks.reconnect = mocks.reconnect.filter((l) => l !== listener)
      },
    }
  },
}))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: (
    listener: () => void,
    { minIntervalMs = 0 }: { minIntervalMs?: number } = {}
  ) => {
    const entry = { listener, minIntervalMs }
    mocks.foreground.push(entry)
    return {
      remove: () => {
        mocks.foreground = mocks.foreground.filter((e) => e !== entry)
      },
    }
  },
}))

/** What the transport throws when nothing answers. */
const networkFailure = () =>
  Object.assign(new Error('Attested network request failed'), {
    name: 'AttestationHttpError',
    kind: 'network',
  })
const contractFailure = () => new Error('malformed')
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.42.0' } },
}))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mocks.deviceUnverified.mockResolvedValue(false)
  mocks.suspended.mockResolvedValue(false)
  mocks.statusListeners = []
  mocks.enabled = false
  mocks.androidEnabled = false
  mocks.platform = 'ios'
  mocks.online = true
  mocks.foreground = []
  mocks.reconnect = []
})

afterEach(() => {
  vi.useRealTimers()
})

const schedule = {
  imports: { free: 5, supporter: null },
  refinements: { free: 5, supporter: null },
  windowDays: 30,
}

async function mount() {
  const { createElement } = await import('react')
  const { create, act } = await import('react-test-renderer')
  const { useNotesImportAvailability } = await import(
    './useNotesImportAvailability'
  )
  const snapshots: NotesImportAvailability[] = []
  function Consumer() {
    snapshots.push(useNotesImportAvailability())
    return null
  }
  let root!: ReturnType<typeof create>
  await act(async () => {
    root = create(createElement(Consumer))
  })
  return {
    snapshots,
    close: () =>
      act(async () => {
        root.unmount()
      }),
  }
}

describe('Notes Import availability', () => {
  it('keeps Android closed without its rollout flag', async () => {
    mocks.platform = 'android'
    mocks.enabled = true
    mocks.status.mockResolvedValue({
      available: true,
      limits: schedule,
      playIntegrity: true,
    })
    const { snapshots, close } = await mount()
    expect(mocks.status).not.toHaveBeenCalled()
    expect(snapshots.at(-1)).toMatchObject({
      available: false,
      schedule: null,
      loading: false,
      updateRequired: null,
    })
    await close()
  })
  it('keeps Android unavailable until the server can verify Play Integrity', async () => {
    mocks.platform = 'android'
    mocks.enabled = true
    mocks.androidEnabled = true
    mocks.status.mockResolvedValue({ available: true, limits: schedule })
    const { snapshots, close } = await mount()
    expect(snapshots.at(-1)).toMatchObject({
      available: false,
      reason: 'android_unavailable',
      schedule: null,
      loading: false,
    })
    await close()
  })
  it('opens Android with both flags and server support', async () => {
    mocks.platform = 'android'
    mocks.enabled = true
    mocks.androidEnabled = true
    mocks.status.mockResolvedValue({
      available: true,
      limits: schedule,
      playIntegrity: true,
    })
    const { snapshots, close } = await mount()
    expect(snapshots.at(-1)).toMatchObject({
      available: true,
      schedule,
      loading: false,
    })
    await close()
  })
  it('ignores the Android rollout flag on iOS', async () => {
    mocks.enabled = true
    mocks.status.mockResolvedValue({ available: true, limits: schedule })
    const { snapshots, close } = await mount()
    expect(snapshots.at(-1)).toMatchObject({ available: true, schedule })
    await close()
  })
  it('does not probe or expose a schedule while the flag is closed', async () => {
    mocks.status.mockResolvedValue({ available: true, limits: schedule })
    const { snapshots, close } = await mount()
    expect(mocks.status).not.toHaveBeenCalled()
    expect(snapshots.every((s) => !s.available && s.schedule === null)).toBe(
      true
    )
    await close()
  })
  it('keeps failed status probes closed even with an enabled flag', async () => {
    mocks.enabled = true
    mocks.status.mockRejectedValue(contractFailure())
    const { snapshots, close } = await mount()
    expect(snapshots.every((s) => !s.available && s.schedule === null)).toBe(
      true
    )
    expect(snapshots.at(-1)?.loading).toBe(false)
    await close()
  })
  it('closes on a device that can’t be verified, since imports need its account session', async () => {
    mocks.enabled = true
    mocks.status.mockResolvedValue({ available: true, limits: schedule })
    mocks.deviceUnverified.mockResolvedValue(true)
    const { snapshots, close } = await mount()
    expect(snapshots.at(-1)).toMatchObject({
      available: false,
      status: 'unavailable',
      reason: 'device_unverified',
      schedule: null,
      loading: false,
    })
    await close()
  })
  it('says a suspended account is suspended before the User writes anything', async () => {
    mocks.enabled = true
    mocks.status.mockResolvedValue({ available: true, limits: schedule })
    mocks.suspended.mockResolvedValue(true)
    const { snapshots, close } = await mount()
    expect(snapshots.at(-1)).toMatchObject({
      available: false,
      status: 'unavailable',
      reason: 'suspended',
      loading: false,
    })

    // Reinstated: a call that read the account again says so.
    mocks.suspended.mockResolvedValue(false)
    const { act } = await import('react-test-renderer')
    await act(async () => {
      for (const listener of mocks.statusListeners) listener()
    })
    expect(snapshots.at(-1)).toMatchObject({
      available: true,
      status: 'available',
    })
    await close()
    expect(mocks.statusListeners).toHaveLength(0)
  })
  it('lets the version floor and an outage win over an unverified device', async () => {
    mocks.enabled = true
    mocks.deviceUnverified.mockResolvedValue(true)
    mocks.status.mockResolvedValue({ available: false, reason: 'disabled' })
    const outage = await mount()
    expect(outage.snapshots.at(-1)).toMatchObject({ reason: 'disabled' })
    await outage.close()

    vi.resetModules()
    mocks.status.mockResolvedValue({
      available: true,
      limits: schedule,
      minAppVersion: '9.0.0',
    })
    const floor = await mount()
    expect(floor.snapshots.at(-1)).toMatchObject({
      reason: 'version_below_min',
    })
    await floor.close()
  })
  it('opens when the device check itself fails', async () => {
    mocks.enabled = true
    mocks.status.mockResolvedValue({ available: true, limits: schedule })
    mocks.deviceUnverified.mockRejectedValue(new Error('native'))
    const { snapshots, close } = await mount()
    expect(snapshots.at(-1)).toMatchObject({ available: true })
    await close()
  })
  it('opens only after both checks succeed', async () => {
    mocks.enabled = true
    mocks.status.mockResolvedValue({ available: true, limits: schedule })
    const { snapshots, close } = await mount()
    expect(snapshots[0].available).toBe(false)
    expect(snapshots.at(-1)).toMatchObject({
      available: true,
      schedule,
      loading: false,
    })
    await close()
  })
})

describe('availability request sharing', () => {
  it('shares an in-flight probe across mounted consumers', async () => {
    mocks.enabled = true
    let resolve!: (value: unknown) => void
    mocks.status.mockReturnValue(
      new Promise((r) => {
        resolve = r
      })
    )
    const first = await mount()
    const second = await mount()
    expect(mocks.status).toHaveBeenCalledTimes(1)
    expect(first.snapshots.at(-1)?.loading).toBe(true)
    const { act } = await import('react-test-renderer')
    await act(async () => {
      resolve({ available: true, limits: schedule })
    })
    expect(first.snapshots.at(-1)?.available).toBe(true)
    expect(second.snapshots.at(-1)?.available).toBe(true)
    await first.close()
    await second.close()
  })

  it('reuses a session result for 30 seconds then observes the new minimum version', async () => {
    vi.useFakeTimers()
    mocks.enabled = true
    mocks.status
      .mockResolvedValueOnce({ available: true, limits: schedule })
      .mockResolvedValueOnce({
        available: true,
        limits: schedule,
        minAppVersion: '9.0.0',
      })
    const first = await mount()
    await first.close()
    vi.advanceTimersByTime(29_999)
    const cached = await mount()
    expect(mocks.status).toHaveBeenCalledTimes(1)
    expect(cached.snapshots[0]).toMatchObject({
      available: true,
      loading: false,
    })
    await cached.close()
    vi.advanceTimersByTime(1)
    const refreshed = await mount()
    expect(mocks.status).toHaveBeenCalledTimes(2)
    expect(refreshed.snapshots.at(-1)).toMatchObject({
      available: false,
      reason: 'version_below_min',
      schedule: null,
    })
    await refreshed.close()
  })

  it('does not reuse a failed probe or a previous successful schedule after expiry', async () => {
    vi.useFakeTimers()
    mocks.enabled = true
    mocks.status
      .mockResolvedValueOnce({ available: true, limits: schedule })
      .mockRejectedValueOnce(contractFailure())
      .mockResolvedValueOnce({ available: false, reason: 'maintenance' })
    const first = await mount()
    await first.close()
    vi.advanceTimersByTime(30_000)
    const failed = await mount()
    expect(failed.snapshots.at(-1)).toMatchObject({
      available: false,
      status: 'failed',
      schedule: null,
      loading: false,
    })
    await failed.close()
    // Failures are reused only briefly.
    vi.advanceTimersByTime(5_000)
    const retry = await mount()
    expect(mocks.status).toHaveBeenCalledTimes(3)
    expect(retry.snapshots.at(-1)).toMatchObject({
      available: false,
      reason: 'maintenance',
    })
    await retry.close()
  })

  it('still gates a cached successful probe behind the feature flag', async () => {
    mocks.enabled = true
    mocks.status.mockResolvedValue({ available: true, limits: schedule })
    const first = await mount()
    await first.close()
    mocks.enabled = false
    const closed = await mount()
    expect(
      closed.snapshots.every((s) => !s.available && s.schedule === null)
    ).toBe(true)
    expect(mocks.status).toHaveBeenCalledTimes(1)
    await closed.close()
  })
})

describe('availability states', () => {
  it('reports a pending first check as checking, then available', async () => {
    mocks.enabled = true
    let resolve!: (value: unknown) => void
    mocks.status.mockReturnValue(
      new Promise((r) => {
        resolve = r
      })
    )
    const consumer = await mount()
    expect(consumer.snapshots.at(-1)).toMatchObject({
      status: 'checking',
      loading: true,
      refreshing: true,
      available: false,
    })
    const { act } = await import('react-test-renderer')
    await act(async () => {
      resolve({ available: true, limits: schedule })
    })
    expect(consumer.snapshots.at(-1)).toMatchObject({
      status: 'available',
      loading: false,
      refreshing: false,
    })
    await consumer.close()
  })

  it('separates offline from a failed check', async () => {
    mocks.enabled = true
    mocks.online = false
    mocks.status.mockRejectedValue(networkFailure())
    const offline = await mount()
    expect(offline.snapshots.at(-1)).toMatchObject({
      status: 'offline',
      available: false,
      loading: false,
    })
    await offline.close()

    // Online, yet nothing answered: the service, not the connection.
    mocks.online = true
    const { act } = await import('react-test-renderer')
    await act(async () => {
      offline.snapshots.at(-1)!.retry()
    })
    const failed = await mount()
    expect(failed.snapshots.at(-1)).toMatchObject({ status: 'failed' })
    await failed.close()
  })

  it('reads a connection failure as offline when the OS cannot tell', async () => {
    mocks.enabled = true
    mocks.online = null
    mocks.status.mockRejectedValue(networkFailure())
    const consumer = await mount()
    expect(consumer.snapshots.at(-1)).toMatchObject({ status: 'offline' })
    await consumer.close()
  })

  it('keeps the last answer while refreshing instead of closing access', async () => {
    vi.useFakeTimers()
    mocks.enabled = true
    let resolve!: (value: unknown) => void
    mocks.status
      .mockResolvedValueOnce({ available: true, limits: schedule })
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve = r
        })
      )
    const first = await mount()
    await first.close()
    vi.advanceTimersByTime(30_000)
    const refreshing = await mount()
    expect(mocks.status).toHaveBeenCalledTimes(2)
    expect(
      refreshing.snapshots.every((s) => s.available && s.schedule === schedule)
    ).toBe(true)
    expect(refreshing.snapshots.at(-1)).toMatchObject({
      status: 'available',
      loading: false,
      refreshing: true,
    })
    const { act } = await import('react-test-renderer')
    await act(async () => {
      resolve({ available: true, limits: schedule })
    })
    expect(refreshing.snapshots.at(-1)?.refreshing).toBe(false)
    await refreshing.close()
  })

  it('shares one failed probe across consumers mounting together', async () => {
    mocks.enabled = true
    mocks.status.mockRejectedValue(networkFailure())
    const first = await mount()
    const second = await mount()
    const third = await mount()
    expect(mocks.status).toHaveBeenCalledTimes(1)
    expect(third.snapshots.at(-1)).toMatchObject({ status: 'failed' })
    await first.close()
    await second.close()
    await third.close()
  })

  it('Try Again skips the cache', async () => {
    mocks.enabled = true
    mocks.status
      .mockRejectedValueOnce(networkFailure())
      .mockResolvedValueOnce({ available: true, limits: schedule })
    const consumer = await mount()
    expect(consumer.snapshots.at(-1)?.status).toBe('failed')
    const { act } = await import('react-test-renderer')
    await act(async () => {
      consumer.snapshots.at(-1)!.retry()
    })
    expect(mocks.status).toHaveBeenCalledTimes(2)
    expect(consumer.snapshots.at(-1)).toMatchObject({ status: 'available' })
    await consumer.close()
  })

  it('re-checks a failure as soon as the connection comes back', async () => {
    mocks.enabled = true
    mocks.online = false
    mocks.status
      .mockRejectedValueOnce(networkFailure())
      .mockResolvedValueOnce({ available: true, limits: schedule })
    const consumer = await mount()
    expect(consumer.snapshots.at(-1)?.status).toBe('offline')
    expect(mocks.reconnect).toHaveLength(1)
    mocks.online = true
    const { act } = await import('react-test-renderer')
    await act(async () => {
      mocks.reconnect.forEach((listener) => listener())
    })
    expect(mocks.status).toHaveBeenCalledTimes(2)
    expect(consumer.snapshots.at(-1)?.status).toBe('available')
    await consumer.close()
    expect(mocks.reconnect).toHaveLength(0)
  })

  it('checks again when the connection comes back during a check', async () => {
    mocks.enabled = true
    let fail!: (error: unknown) => void
    mocks.status
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          fail = reject
        })
      )
      .mockResolvedValueOnce({ available: true, limits: schedule })
    const consumer = await mount()
    const { act } = await import('react-test-renderer')
    // The check started on the dead connection is still waiting.
    await act(async () => {
      mocks.reconnect.forEach((listener) => listener())
    })
    await act(async () => {
      fail(networkFailure())
    })
    expect(mocks.status).toHaveBeenCalledTimes(2)
    expect(consumer.snapshots.at(-1)?.status).toBe('available')
    await consumer.close()
  })

  it('checks again when the account is suspended during a check', async () => {
    mocks.enabled = true
    let answer!: (value: unknown) => void
    mocks.status
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve
        })
      )
      .mockResolvedValueOnce({ available: true, limits: schedule })
    const consumer = await mount()
    // An import was refused while the check was out; the check had already
    // read the account as fine.
    mocks.suspended.mockResolvedValue(true)
    const { act } = await import('react-test-renderer')
    await act(async () => {
      for (const listener of mocks.statusListeners) listener()
    })
    await act(async () => {
      answer({ available: true, limits: schedule })
    })
    expect(mocks.status).toHaveBeenCalledTimes(2)
    expect(consumer.snapshots.at(-1)).toMatchObject({
      available: false,
      reason: 'suspended',
    })
    await consumer.close()
  })

  it('re-checks a stale answer on returning to the app, at most every 30 s', async () => {
    vi.useFakeTimers()
    mocks.enabled = true
    mocks.status
      .mockResolvedValueOnce({ available: true, limits: schedule })
      .mockResolvedValueOnce({ available: false, reason: 'maintenance' })
    const consumer = await mount()
    expect(mocks.foreground).toHaveLength(1)
    expect(mocks.foreground[0].minIntervalMs).toBe(30_000)
    const { act } = await import('react-test-renderer')
    // Still fresh: returning doesn't probe.
    await act(async () => {
      mocks.foreground[0].listener()
    })
    expect(mocks.status).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30_000)
    await act(async () => {
      mocks.foreground[0].listener()
    })
    expect(mocks.status).toHaveBeenCalledTimes(2)
    expect(consumer.snapshots.at(-1)).toMatchObject({
      status: 'unavailable',
      reason: 'maintenance',
    })
    await consumer.close()
    expect(mocks.foreground).toHaveLength(0)
  })

  it('registers no re-check listeners while the flag is closed', async () => {
    const consumer = await mount()
    expect(consumer.snapshots.at(-1)?.status).toBe('disabled')
    expect(mocks.foreground).toHaveLength(0)
    expect(mocks.reconnect).toHaveLength(0)
    await consumer.close()
  })
})

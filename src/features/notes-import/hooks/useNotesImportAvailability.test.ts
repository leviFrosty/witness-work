import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotesImportAvailability } from '@/features/notes-import/hooks/useNotesImportAvailability'

const mocks = vi.hoisted(() => ({ enabled: false, status: vi.fn() }))
vi.mock('@/lib/featureFlags', () => ({ useFeatureFlag: () => mocks.enabled }))
vi.mock('@/features/notes-import/lib/notesImportClient', () => ({
  getNotesImportStatus: mocks.status,
}))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.42.0' } },
}))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mocks.enabled = false
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
    mocks.status.mockResolvedValue(null)
    const { snapshots, close } = await mount()
    expect(snapshots.every((s) => !s.available && s.schedule === null)).toBe(
      true
    )
    expect(snapshots.at(-1)?.loading).toBe(false)
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
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ available: false, reason: 'maintenance' })
    const first = await mount()
    await first.close()
    vi.advanceTimersByTime(30_000)
    const failed = await mount()
    expect(failed.snapshots.at(-1)).toMatchObject({
      available: false,
      schedule: null,
      loading: false,
    })
    await failed.close()
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

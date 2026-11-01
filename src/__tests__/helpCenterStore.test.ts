import { beforeEach, describe, expect, it, vi } from 'vitest'
import { helpBundle } from '@/__tests__/helpers/helpCenterFixture'
import type { HelpBundle } from '@/features/updates/types/helpCenter'

const mocks = vi.hoisted(() => ({
  readSnapshot: vi.fn(),
  readCachedBundle: vi.fn(),
  refreshHelpBundle: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/features/updates/lib/helpCenter/snapshot', () => ({
  readSnapshot: mocks.readSnapshot,
}))
vi.mock('@/features/updates/lib/helpCenter/storage', () => ({
  readCachedBundle: mocks.readCachedBundle,
}))
vi.mock('@/features/updates/lib/helpCenter/refresh', () => ({
  refreshHelpBundle: mocks.refreshHelpBundle,
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: mocks.captureException },
}))
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn() } }))

import { useHelpCenterStore } from '@/features/updates/stores/helpCenter'

const snapshot = helpBundle({
  hash: 'snapshot',
  generatedAt: '2026-10-01T00:00:00.000Z',
})
const cached = helpBundle({
  hash: 'cached',
  generatedAt: '2026-10-10T00:00:00.000Z',
})
const fresh = helpBundle({
  hash: 'fresh',
  generatedAt: '2026-10-20T00:00:00.000Z',
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  useHelpCenterStore.setState({ locale: null, bundle: null, source: null })
  mocks.readSnapshot.mockImplementation((locale: string) =>
    locale === 'en-US' ? snapshot : { ...snapshot, locale }
  )
  mocks.readCachedBundle.mockResolvedValue(null)
  mocks.refreshHelpBundle.mockResolvedValue({ outcome: 'unchanged' })
})

describe('Help Center store', () => {
  it('shows the snapshot at once, before anything async', () => {
    useHelpCenterStore.getState().open('en-US')
    expect(useHelpCenterStore.getState()).toMatchObject({
      locale: 'en-US',
      bundle: snapshot,
      source: 'snapshot',
    })
  })

  it('prefers the last download over the snapshot', async () => {
    mocks.readCachedBundle.mockResolvedValue(cached)
    useHelpCenterStore.getState().open('en-US')
    await settle()
    expect(useHelpCenterStore.getState()).toMatchObject({
      bundle: cached,
      source: 'cache',
    })

    expect(mocks.refreshHelpBundle).toHaveBeenCalledWith('en-US', 'cached')
  })

  it('keeps a newer snapshot over an older download', async () => {
    mocks.readCachedBundle.mockResolvedValue({
      ...cached,
      generatedAt: '2026-09-01T00:00:00.000Z',
    })
    useHelpCenterStore.getState().open('en-US')
    await settle()
    expect(useHelpCenterStore.getState()).toMatchObject({
      bundle: snapshot,
      source: 'snapshot',
    })
    expect(mocks.refreshHelpBundle).toHaveBeenCalledWith('en-US', 'snapshot')
  })

  it('shows the download when returning to a language mid-refresh', async () => {
    let finish: (value: unknown) => void = () => {}
    mocks.refreshHelpBundle.mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve))
    )
    mocks.readCachedBundle.mockImplementation(async (locale: string) =>
      locale === 'en-US' ? cached : null
    )
    const { open } = useHelpCenterStore.getState()
    open('en-US')
    await settle()
    open('es-ES')
    open('en-US')
    expect(useHelpCenterStore.getState().source).toBe('snapshot')
    finish({ outcome: 'unchanged' })
    await settle()
    await settle()
    expect(useHelpCenterStore.getState()).toMatchObject({
      locale: 'en-US',
      bundle: cached,
      source: 'cache',
    })
  })

  it('swaps in a newer bundle from the website', async () => {
    mocks.refreshHelpBundle.mockResolvedValue({
      outcome: 'updated',
      bundle: fresh,
    })
    useHelpCenterStore.getState().open('en-US')
    await settle()
    expect(useHelpCenterStore.getState()).toMatchObject({
      bundle: fresh,
      source: 'network',
    })
    expect(mocks.capture).toHaveBeenCalledWith('help_center_refreshed', {
      outcome: 'updated',
      reason: undefined,
    })
  })

  it('keeps what it shows when the refresh fails offline, unreported', async () => {
    mocks.readCachedBundle.mockResolvedValue(cached)
    mocks.refreshHelpBundle.mockResolvedValue({
      outcome: 'failed',
      reason: 'offline',
    })
    useHelpCenterStore.getState().open('en-US')
    await settle()
    expect(useHelpCenterStore.getState().bundle).toBe(cached)
    expect(mocks.captureException).not.toHaveBeenCalled()
    expect(mocks.capture).toHaveBeenCalledWith('help_center_refreshed', {
      outcome: 'failed',
      reason: 'offline',
    })
  })

  it('reports an invalid bundle from the website', async () => {
    mocks.refreshHelpBundle.mockResolvedValue({
      outcome: 'failed',
      reason: 'invalid',
    })
    useHelpCenterStore.getState().open('en-US')
    await settle()
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
    expect(useHelpCenterStore.getState().bundle).toBe(snapshot)
  })

  it('shows a download it could not save', async () => {
    mocks.refreshHelpBundle.mockResolvedValue({
      outcome: 'failed',
      reason: 'storage',
      bundle: fresh,
      error: new Error('disk full'),
    })
    useHelpCenterStore.getState().open('en-US')
    await settle()
    expect(useHelpCenterStore.getState().bundle).toBe(fresh)
  })

  it('runs one refresh at a time per locale', async () => {
    let finish: (value: unknown) => void = () => {}
    mocks.refreshHelpBundle.mockReturnValue(
      new Promise((resolve) => (finish = resolve))
    )
    useHelpCenterStore.getState().open('en-US')
    useHelpCenterStore.getState().open('en-US')
    await settle()
    expect(mocks.refreshHelpBundle).toHaveBeenCalledTimes(1)
    finish({ outcome: 'unchanged' })
    await settle()
  })

  it('ignores a late result for a language no longer shown', async () => {
    let finish: (value: unknown) => void = () => {}
    mocks.refreshHelpBundle.mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve))
    )
    useHelpCenterStore.getState().open('en-US')
    useHelpCenterStore.getState().open('de-DE')
    await settle()
    finish({ outcome: 'updated', bundle: fresh })
    await settle()
    const state = useHelpCenterStore.getState()
    expect(state.locale).toBe('de-DE')
    expect((state.bundle as HelpBundle).locale).toBe('de-DE')
  })
})

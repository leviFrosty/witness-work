import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: null as { accountId: string } | null,
  usage: vi.fn(),
  status: vi.fn(),
  ready: vi.fn(async () => undefined),
}))

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/attestation', () => ({
  deviceAttestation: { checkSupport: async () => 'supported' },
}))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureMessage: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: {
    ready: mocks.ready,
    snapshot: () => mocks.session,
    lastOpenFailure: () => null,
  },
  accountSuspended: async () => false,
}))
vi.mock('@/lib/serverAccount/revenueCatLinkRuntime', () => ({
  relinkAfterSupporterRefusal: async () => true,
}))
vi.mock('@/features/scribe/lib/defaultClient', () => ({
  scribeClient: () => ({ usage: mocks.usage, status: mocks.status }),
}))

import {
  noteSupporterAnswer,
  refreshStatus,
  refreshUsage,
} from '@/features/scribe/runtime/status'
import { useScribeStatusStore } from '@/features/scribe/stores/status'
import { useScribeUsageStore } from '@/features/scribe/stores/usage'
import type { UsageSnapshotWire } from '@/features/scribe/lib/wire'

const SNAPSHOT: UsageSnapshotWire = {
  plan: 'free',
  supporterCheckFailed: false,
  windows: [{ id: 'monthly', percentUsed: 12, resetsAt: 2_000 }],
  limited: false,
  resetsAt: null,
  asOf: 1_000,
}

describe('refreshUsage', () => {
  beforeEach(() => {
    mocks.session = null
    mocks.usage.mockReset().mockResolvedValue(SNAPSHOT)
    useScribeUsageStore.setState(useScribeUsageStore.getInitialState(), true)
    useScribeStatusStore.setState({ devClient: false })
  })

  it('opens a session to read usage by default', async () => {
    await refreshUsage()
    expect(mocks.usage).toHaveBeenCalledTimes(1)
    expect(useScribeUsageStore.getState()).toMatchObject({
      snapshot: SNAPSHOT,
      loading: false,
      failed: false,
    })
  })

  it('reads in passing only with a session this device already has', async () => {
    await refreshUsage({ open: false })
    expect(mocks.usage).not.toHaveBeenCalled()
    expect(useScribeUsageStore.getState()).toMatchObject({
      snapshot: null,
      loading: false,
    })

    mocks.session = { accountId: 'acct_1' }
    await refreshUsage({ open: false, force: true })
    expect(mocks.usage).toHaveBeenCalledTimes(1)
    expect(useScribeUsageStore.getState().snapshot).toEqual(SNAPSHOT)
  })

  it('reads at most every 30 s unless forced', async () => {
    await refreshUsage()
    await refreshUsage()
    expect(mocks.usage).toHaveBeenCalledTimes(1)
    await refreshUsage({ force: true })
    expect(mocks.usage).toHaveBeenCalledTimes(2)
  })

  it('reads usage again when a link says the plan changed', async () => {
    mocks.session = { accountId: 'acct_1' }
    useScribeUsageStore.setState({ snapshot: SNAPSHOT, fetchedAt: Date.now() })
    noteSupporterAnswer(false)
    expect(mocks.usage).not.toHaveBeenCalled()
    noteSupporterAnswer(true)
    await vi.waitFor(() => expect(mocks.usage).toHaveBeenCalledTimes(1))
  })
})

describe('refreshStatus', () => {
  beforeEach(() => {
    mocks.status.mockReset()
    useScribeStatusStore.setState(useScribeStatusStore.getInitialState(), true)
  })

  it('reads again when forced while an older read is still running', async () => {
    let answer!: (status: unknown) => void
    mocks.status
      .mockImplementationOnce(
        () => new Promise((resolve) => (answer = resolve))
      )
      .mockResolvedValue({ enabled: false, reason: 'disabled' })
    const first = refreshStatus({ force: true })
    // The connection comes back while the first read is out.
    void refreshStatus({ force: true })
    expect(mocks.status).toHaveBeenCalledTimes(1)
    answer({ enabled: true })
    await first
    await vi.waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(2))
    await vi.waitFor(() =>
      expect(useScribeStatusStore.getState().status).toEqual({
        enabled: false,
        reason: 'disabled',
      })
    )
  })

  it('shares a running read when nothing forced another', async () => {
    mocks.status.mockResolvedValue({ enabled: true })
    await Promise.all([refreshStatus({ force: true }), refreshStatus()])
    expect(mocks.status).toHaveBeenCalledTimes(1)
  })
})

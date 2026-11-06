import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  os: 'ios' as string,
  support: 'unsupported' as string,
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.os
    },
  },
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/attestation', () => ({
  deviceAttestation: { checkSupport: async () => mocks.support },
}))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureMessage: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: { lastOpenFailure: () => null },
  accountSuspended: async () => false,
}))
vi.mock('@/lib/serverAccount/revenueCatLinkRuntime', () => ({
  relinkAfterSupporterRefusal: async () => true,
}))
vi.mock('@/features/scribe/lib/defaultClient', () => ({
  scribeClient: () => ({}),
}))

const gateAfterRefresh = async () => {
  const { refreshDeviceGate } = await import('@/features/scribe/runtime/status')
  const { useScribeStatusStore } = await import(
    '@/features/scribe/stores/status'
  )
  await refreshDeviceGate()
  return useScribeStatusStore.getState().gate
}

describe('refreshDeviceGate', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.support = 'unsupported'
  })

  it('blocks a phone that cannot attest', async () => {
    mocks.os = 'ios'
    expect((await gateAfterRefresh()).ineligible).toBe(true)
  })

  it('never calls a browser unverifiable: its session comes from a passkey', async () => {
    mocks.os = 'web'
    expect((await gateAfterRefresh()).ineligible).toBe(false)
  })
})

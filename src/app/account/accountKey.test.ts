import { describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  replace: vi.fn(),
  heldDuring: null as boolean | null,
}))

vi.mock('../../../modules/buddies-keychain', () => ({
  peekRootSeed: vi.fn(),
  getOrCreateRootSeed: vi.fn(),
  replaceRootSeed: vi.fn(),
  isAvailable: () => true,
  isReplaceAvailable: () => true,
}))
vi.mock('@/stores/preferences', () => ({ usePreferences: {} }))
vi.mock('@/lib/accountKey', () => ({
  deviceAccountKey: {},
  keyChangeRecords: {},
}))
vi.mock('@/app/buddies/joinBuddiesHere', () => ({
  joinBuddiesHere: vi.fn(async () => {}),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/serverAccount', () => ({ serverAccount: {} }))
vi.mock('@/lib/serverAccount/accountDevices', () => ({}))
vi.mock('@/features/buddies/lib/buddiesService', () => ({
  buddiesEngine: {},
}))
vi.mock('@/features/buddies/lib/buddyProfile', () => ({}))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({ useBuddies: {} }))
vi.mock('@/app/sync/cloudSync', () => ({ leaveCloudSyncAccount: vi.fn() }))
vi.mock('@/app/sync/iCloudSync', () => ({ iCloudSync: {} }))
vi.mock('@/lib/accountKey/accountKey', () => ({
  createAccountKeyService: () => ({ replace: runtime.replace }),
}))

describe('replaceAccountKey', () => {
  it('holds Cloud Sync’s default for the whole replace, even a failed one', async () => {
    const { cloudSyncDefaultHeld } = await import(
      '@/app/sync/cloudSyncDefaultHold'
    )
    const { replaceAccountKey } = await import('./accountKey')
    runtime.replace.mockImplementationOnce(async () => {
      runtime.heldDuring = cloudSyncDefaultHeld()
      throw new Error('offline')
    })

    await expect(
      replaceAccountKey(new Uint8Array(32), { source: 'recovery_key' })
    ).rejects.toThrow('offline')
    expect(runtime.heldDuring).toBe(true)
    expect(cloudSyncDefaultHeld()).toBe(false)
  })
})

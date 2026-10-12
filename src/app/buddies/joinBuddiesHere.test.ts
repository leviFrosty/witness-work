import { beforeEach, describe, expect, it, vi } from 'vitest'

const { buddies, preferences, peekRootSeed, canSync, sync, capture } =
  vi.hoisted(() => {
    const buddies = {
      registeredInboxId: null as string | null,
      onboardingComplete: false,
      buddies: [] as unknown[],
    }
    const preferences = { lastiCloudPulledAt: null as number | null }
    return {
      buddies,
      preferences,
      peekRootSeed: vi.fn(async (): Promise<string | null> => 'seed'),
      canSync: vi.fn(() => true),
      sync: vi.fn(async () => {
        buddies.registeredInboxId = 'inbox'
        buddies.buddies = [{}, {}]
        return 'synced'
      }),
      capture: vi.fn(),
    }
  })

vi.mock('../../../modules/buddies-keychain', () => ({ peekRootSeed }))
vi.mock('@/app/sync/iCloudSync', () => ({ canSync }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture } }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => preferences },
}))
vi.mock('@/features/buddies/lib/buddiesService', () => ({
  buddiesEngine: { sync },
}))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: {
    getState: () => buddies,
    setState: (change: Partial<typeof buddies>) =>
      Object.assign(buddies, change),
  },
}))

const { joinBuddiesHere } = await import('./joinBuddiesHere')

describe('joinBuddiesHere', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(buddies, {
      registeredInboxId: null,
      onboardingComplete: false,
      buddies: [],
    })
    preferences.lastiCloudPulledAt = 1
    canSync.mockReturnValue(true)
    peekRootSeed.mockResolvedValue('seed')
  })

  it('starts Buddies here from the identity the User has on another device', async () => {
    await expect(joinBuddiesHere()).resolves.toBe(true)
    expect(sync).toHaveBeenCalledWith({ automatic: true })
    expect(buddies.onboardingComplete).toBe(true)
    expect(capture).toHaveBeenCalledWith('buddies_device_joined', {
      buddies: 2,
    })
  })

  it('waits for iCloud Sync, so this device publishes the same Plans', async () => {
    canSync.mockReturnValue(false)
    await expect(joinBuddiesHere()).resolves.toBe(false)
    preferences.lastiCloudPulledAt = null
    canSync.mockReturnValue(true)
    await expect(joinBuddiesHere()).resolves.toBe(false)
    expect(peekRootSeed).not.toHaveBeenCalled()
    expect(sync).not.toHaveBeenCalled()
  })

  it('does nothing for a User who never started Buddies', async () => {
    peekRootSeed.mockResolvedValue(null)
    await expect(joinBuddiesHere()).resolves.toBe(false)
    expect(sync).not.toHaveBeenCalled()
    expect(buddies.onboardingComplete).toBe(false)
  })

  it('leaves a device that already started alone', async () => {
    buddies.registeredInboxId = 'inbox'
    await expect(joinBuddiesHere()).resolves.toBe(false)
    expect(peekRootSeed).not.toHaveBeenCalled()
  })

  it('runs once for callers that ask together', async () => {
    const [first, second] = await Promise.all([
      joinBuddiesHere(),
      joinBuddiesHere(),
    ])
    expect([first, second]).toEqual([true, true])
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('tries again later when the first sync fails', async () => {
    sync.mockRejectedValueOnce(new Error('offline'))
    await expect(joinBuddiesHere()).rejects.toThrow('offline')
    expect(buddies.onboardingComplete).toBe(false)
    await expect(joinBuddiesHere()).resolves.toBe(true)
  })
})

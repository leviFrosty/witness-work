import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  buddies,
  preferences,
  peekRootSeed,
  canSync,
  sync,
  capture,
  accountInfo,
} = vi.hoisted(() => {
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
    accountInfo: vi.fn(async () => ({ inboxIds: ['inbox-of-AAAA'] })),
  }
})

vi.mock('@/lib/accountKey', () => ({
  deviceAccountKey: { peek: peekRootSeed },
}))
vi.mock('@/app/sync/iCloudSync', () => ({ canSync }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture } }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => preferences },
}))
vi.mock('@/lib/serverAccount', () => ({
  fetchServerAccountInfo: accountInfo,
}))
vi.mock('@/features/buddies/lib/keys', () => ({
  deriveIdentity: (seed: Uint8Array) => ({
    inboxId: `inbox-of-${seed.length === 3 ? 'AAAA' : 'other'}`,
  }),
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
    peekRootSeed.mockResolvedValue('AAAA')
    accountInfo.mockResolvedValue({ inboxIds: ['inbox-of-AAAA'] })
  })

  it('starts Buddies here from the identity the User has on another device', async () => {
    await expect(joinBuddiesHere()).resolves.toBe(true)
    expect(sync).toHaveBeenCalledWith({ automatic: true })
    expect(buddies.onboardingComplete).toBe(true)
    expect(capture).toHaveBeenCalledWith('buddies_device_joined', {
      buddies: 2,
      via: 'sync',
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

  it('starts right after a handoff without waiting for iCloud Sync', async () => {
    preferences.lastiCloudPulledAt = null
    canSync.mockReturnValue(false)
    await expect(joinBuddiesHere('handoff')).resolves.toBe(true)
    expect(accountInfo).toHaveBeenCalledTimes(1)
    expect(sync).toHaveBeenCalledWith({ automatic: true })
    expect(capture).toHaveBeenCalledWith('buddies_device_joined', {
      buddies: 2,
      via: 'handoff',
    })
  })

  it("doesn't start Buddies after a handoff when the account never used it", async () => {
    accountInfo.mockResolvedValue({ inboxIds: [] })
    await expect(joinBuddiesHere('handoff')).resolves.toBe(false)
    expect(sync).not.toHaveBeenCalled()
    expect(buddies.onboardingComplete).toBe(false)
  })

  it("tries again later when the account can't be read after a handoff", async () => {
    accountInfo.mockRejectedValueOnce(new Error('offline'))
    await expect(joinBuddiesHere('handoff')).rejects.toThrow('offline')
    expect(sync).not.toHaveBeenCalled()
  })
})

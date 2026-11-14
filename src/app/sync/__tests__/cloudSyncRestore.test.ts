import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  prefs: {} as Record<string, unknown>,
  offline: false,
  offered: true,
  usesCloud: true,
  localData: false,
  keyPresent: true,
}))

vi.mock('@/stores/preferences', () => ({
  usePreferences: {
    getState: () => runtime.prefs,
    setState: (patch: Record<string, unknown>) =>
      Object.assign(runtime.prefs, patch),
  },
}))
vi.mock('@/lib/serverAccount', () => ({
  hasAccountKey: vi.fn(async () => runtime.keyPresent),
}))
vi.mock('@/lib/http/online', () => ({
  isKnownOffline: () => runtime.offline,
}))
vi.mock('@/lib/syncTransport/platform', () => ({
  hasSyncEngine: () => true,
  cloudSyncOnly: () => false,
}))
vi.mock('@/lib/syncTransport/provider', () => ({
  cloudSyncOffered: () => runtime.offered,
  usesCloudSync: () => runtime.usesCloud,
}))
vi.mock('@/app/sync/cloudSync', () => ({
  prepareCloudSync: vi.fn(),
}))
vi.mock('@/app/sync/iCloudSync', () => ({
  iCloudSync: {
    peekRemotePayload: vi.fn(),
    hasMeaningfulLocalData: () => runtime.localData,
    applyPullEnable: vi.fn(),
  },
}))

const { prepareCloudSync } = await import('@/app/sync/cloudSync')
const { iCloudSync } = await import('@/app/sync/iCloudSync')
const {
  claimAutoRestore,
  cloudSyncRestoreWaiting,
  declineCloudSyncRestore,
  findCloudSyncRestore,
  peekCloudSyncRestore,
  prefetchCloudSyncRestore,
  resetCloudSyncRestoreForTests,
  restoreFromCloudSync,
} = await import('@/app/sync/cloudSyncRestore')

const REMOTE = { deviceName: 'iPhone', writtenAt: 1 } as never
const ACCOUNT = { token: 'account:a', changedAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  resetCloudSyncRestoreForTests()
  runtime.prefs = {
    onboardingComplete: false,
    iCloudSyncEnabled: false,
    iCloudSyncSetByUser: false,
    syncProvider: null,
  }
  runtime.offline = false
  runtime.offered = true
  runtime.usesCloud = true
  runtime.localData = false
  runtime.keyPresent = true
  vi.mocked(prepareCloudSync).mockResolvedValue({
    outcome: 'ready',
    status: {} as never,
  })
  vi.mocked(iCloudSync.peekRemotePayload).mockResolvedValue({
    status: 'found',
    remote: REMOTE,
    account: ACCOUNT,
  })
})

describe('peekCloudSyncRestore', () => {
  it("doesn't open a session on a device without an account key", async () => {
    runtime.keyPresent = false
    expect(await peekCloudSyncRestore()).toEqual({ status: 'unavailable' })
    expect(prepareCloudSync).not.toHaveBeenCalled()
  })

  it('reports offline when the session cannot open without a network', async () => {
    runtime.offline = true
    vi.mocked(prepareCloudSync).mockResolvedValue({
      outcome: 'no_session',
      error: null,
    })
    expect(await peekCloudSyncRestore()).toEqual({ status: 'offline' })
  })

  it('reports unavailable when the account is not entitled', async () => {
    vi.mocked(prepareCloudSync).mockResolvedValue({
      outcome: 'not_entitled',
      status: {} as never,
    })
    expect(await peekCloudSyncRestore()).toEqual({ status: 'unavailable' })
    expect(iCloudSync.peekRemotePayload).not.toHaveBeenCalled()
  })
})

describe('findCloudSyncRestore', () => {
  it('says there is no account without asking the server', async () => {
    runtime.keyPresent = false
    expect(await findCloudSyncRestore()).toEqual({ status: 'no_account' })
    expect(prepareCloudSync).not.toHaveBeenCalled()
  })

  it('reuses a lookup that found records', async () => {
    await findCloudSyncRestore()
    expect(await findCloudSyncRestore()).toMatchObject({ status: 'found' })
    expect(prepareCloudSync).toHaveBeenCalledOnce()
  })

  it('looks again after finding nothing, and when asked to', async () => {
    vi.mocked(iCloudSync.peekRemotePayload).mockResolvedValueOnce({
      status: 'none',
    })
    expect(await findCloudSyncRestore()).toEqual({ status: 'none' })
    expect(await findCloudSyncRestore()).toMatchObject({ status: 'found' })
    await findCloudSyncRestore({ fresh: true })
    expect(prepareCloudSync).toHaveBeenCalledTimes(3)
  })
})

describe('the welcome screens', () => {
  it('look ahead only on a fresh install', async () => {
    runtime.localData = true
    prefetchCloudSyncRestore()
    expect(prepareCloudSync).not.toHaveBeenCalled()
  })

  it('send a new-looking User to Welcome back when their records are there', async () => {
    prefetchCloudSyncRestore()
    await findCloudSyncRestore()
    expect(cloudSyncRestoreWaiting()).toBe(true)
  })

  it("don't send them back after they said they're new", async () => {
    prefetchCloudSyncRestore()
    await findCloudSyncRestore()
    declineCloudSyncRestore()
    expect(cloudSyncRestoreWaiting()).toBe(false)
  })

  it('restore automatically once a launch', () => {
    expect(claimAutoRestore()).toBe(true)
    expect(claimAutoRestore()).toBe(false)
  })
})

describe('restoreFromCloudSync', () => {
  it('replaces an empty device and turns Cloud Sync on', () => {
    expect(restoreFromCloudSync(REMOTE)).toBe(true)
    expect(runtime.prefs.syncProvider).toBe('cloud')
    expect(iCloudSync.applyPullEnable).toHaveBeenCalledWith(
      REMOTE,
      'onboarding_restore'
    )
  })

  it('leaves a device with records for Merge or Replace', () => {
    runtime.localData = true
    expect(restoreFromCloudSync(REMOTE)).toBe(false)
    expect(iCloudSync.applyPullEnable).not.toHaveBeenCalled()
  })

  it('leaves a device that already chose a sync option alone', () => {
    runtime.prefs.syncProvider = 'platform'
    expect(restoreFromCloudSync(REMOTE)).toBe(false)
  })
})

import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  AppState: { currentState: 'background', addEventListener: vi.fn() },
}))
import {
  ICLOUD_PULL_WAIT_MS,
  iCloudPullWaitRemainingMs,
} from '@/lib/iCloudPullWait'

describe('iCloudPullWaitRemainingMs', () => {
  const activeSince = 1_000_000

  it('decides immediately when iCloud sync is off', () => {
    expect(
      iCloudPullWaitRemainingMs({
        iCloudSyncOn: false,
        now: activeSince,
        state: { activeSince: null, completePullAt: null },
      })
    ).toBe(0)
  })

  it('waits for the app to come to the foreground before the window opens', () => {
    // A widget or background task booted the runtime; nobody opened the app.
    expect(
      iCloudPullWaitRemainingMs({
        iCloudSyncOn: true,
        now: activeSince + 60_000,
        state: { activeSince: null, completePullAt: activeSince },
      })
    ).toBe(Infinity)
  })

  it('decides once a complete pull finished since the app came forward', () => {
    expect(
      iCloudPullWaitRemainingMs({
        iCloudSyncOn: true,
        now: activeSince + 1_500,
        state: { activeSince, completePullAt: activeSince + 1_200 },
      })
    ).toBe(0)
  })

  it('keeps waiting when the last complete pull predates the foreground', () => {
    for (const completePullAt of [null, activeSince - 60_000]) {
      expect(
        iCloudPullWaitRemainingMs({
          iCloudSyncOn: true,
          now: activeSince + 4_000,
          state: { activeSince, completePullAt },
        })
      ).toBe(ICLOUD_PULL_WAIT_MS - 4_000)
    }
  })

  it('stops waiting once the window has passed', () => {
    for (const elapsed of [ICLOUD_PULL_WAIT_MS, 60_000]) {
      expect(
        iCloudPullWaitRemainingMs({
          iCloudSyncOn: true,
          now: activeSince + elapsed,
          state: { activeSince, completePullAt: null },
        })
      ).toBe(0)
    }
  })
})

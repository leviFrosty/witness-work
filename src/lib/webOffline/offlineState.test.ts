import { describe, expect, it } from 'vitest'
import { offlineBannerShows } from '@/lib/webOffline/offlineState'

const clear = { syncIssue: null, syncErrorCode: null }

describe('offlineBannerShows', () => {
  it('shows while the browser is offline, hides once it is back', () => {
    expect(offlineBannerShows({ online: false, ...clear })).toBe(true)
    expect(offlineBannerShows({ online: true, ...clear })).toBe(false)
    expect(offlineBannerShows({ online: null, ...clear })).toBe(false)
  })

  it('shows when sync failed for the network’s reason while the browser says online', () => {
    expect(
      offlineBannerShows({
        online: true,
        syncIssue: 'push-failed',
        syncErrorCode: 'network',
      })
    ).toBe(true)
  })

  it('does not blame the network for other sync problems', () => {
    for (const syncErrorCode of [
      'rate-limited',
      'server-error',
      'unauthorized',
    ])
      expect(
        offlineBannerShows({
          online: true,
          syncIssue: 'read-failed',
          syncErrorCode,
        })
      ).toBe(false)

    expect(
      offlineBannerShows({
        online: true,
        syncIssue: null,
        syncErrorCode: 'network',
      })
    ).toBe(false)
  })
})

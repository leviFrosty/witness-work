import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ os: 'ios', openURL: vi.fn() }))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.os
    },
  },
}))
vi.mock('@/lib/links', () => ({ openURL: mocks.openURL }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import links from '@/constants/links'
import { openStoreListing } from '@/lib/storeListing'

beforeEach(() => {
  mocks.openURL.mockReset()
})

describe('openStoreListing', () => {
  it('opens the App Store on iOS', () => {
    mocks.os = 'ios'
    void openStoreListing()
    expect(mocks.openURL).toHaveBeenCalledWith(links.appStore, {
      alert: {
        title: 'failedToOpenLink',
        description: 'updateRequired_storeFailed',
      },
    })
  })

  it('opens the Play Store app on Android, with the web listing as fallback', () => {
    mocks.os = 'android'
    void openStoreListing({ title: 'updateRequired_title' })
    expect(mocks.openURL).toHaveBeenCalledWith(links.playStoreApp, {
      fallbackUrl: links.playStore,
      alert: {
        title: 'updateRequired_title',
        description: 'updateRequired_storeFailedAndroid',
      },
    })
  })

  it('opens the review page on iOS and the listing on Android', () => {
    mocks.os = 'ios'
    void openStoreListing({ review: true })
    expect(mocks.openURL).toHaveBeenLastCalledWith(
      links.appStoreReview,
      expect.anything()
    )
    mocks.os = 'android'
    void openStoreListing({ review: true })
    expect(mocks.openURL).toHaveBeenLastCalledWith(
      links.playStoreApp,
      expect.anything()
    )
  })
})

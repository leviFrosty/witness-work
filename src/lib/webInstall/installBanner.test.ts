import { describe, expect, it } from 'vitest'
import {
  installBannerShows,
  isAndroidPhone,
  type InstallContext,
} from '@/lib/webInstall/installBanner'

const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const base: InstallContext = {
  userAgent: ANDROID,
  standalone: false,
  dismissed: false,
  canPrompt: true,
  installed: false,
}
const browser = { source: 'browser' } as const
const play = { source: 'play', url: 'https://play.google.com/x' } as const

describe('isAndroidPhone', () => {
  it('is an Android browser that says Mobile', () => {
    expect(isAndroidPhone(ANDROID)).toBe(true)
    for (const agent of [ANDROID_TABLET, IPHONE, IPAD, DESKTOP])
      expect(isAndroidPhone(agent), agent).toBe(false)
  })
})

describe('installBannerShows', () => {
  it('shows on an Android phone once the browser offers its install prompt', () => {
    expect(installBannerShows(base, browser)).toBe(true)
    expect(installBannerShows({ ...base, canPrompt: false }, browser)).toBe(
      false
    )
  })

  it('shows nothing on iPhone, iPad, tablets or desktop', () => {
    for (const userAgent of [IPHONE, IPAD, ANDROID_TABLET, DESKTOP])
      expect(installBannerShows({ ...base, userAgent }, browser)).toBe(false)
  })

  it('hides in an installed app, after the X, and once installed', () => {
    expect(installBannerShows({ ...base, standalone: true }, browser)).toBe(
      false
    )
    expect(installBannerShows({ ...base, dismissed: true }, browser)).toBe(
      false
    )
    expect(installBannerShows({ ...base, installed: true }, browser)).toBe(
      false
    )
  })

  it('with the Play target, shows on any Android phone without the prompt', () => {
    expect(installBannerShows({ ...base, canPrompt: false }, play)).toBe(true)
    expect(
      installBannerShows({ ...base, canPrompt: false, dismissed: true }, play)
    ).toBe(false)
    expect(
      installBannerShows({ ...base, userAgent: IPHONE, canPrompt: false }, play)
    ).toBe(false)
  })
})

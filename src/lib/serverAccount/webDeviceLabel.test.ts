import { describe, expect, it } from 'vitest'
import {
  browserAndSystem,
  webDeviceLabel,
} from '@/lib/serverAccount/webDeviceLabel'

const UA = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  firefoxWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  safariIPhone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
}

describe('web device label', () => {
  it.each([
    [UA.chromeMac, 'Chrome', 'macOS'],
    [UA.safariMac, 'Safari', 'macOS'],
    [UA.firefoxWindows, 'Firefox', 'Windows'],
    [UA.edgeWindows, 'Edge', 'Windows'],
    [UA.safariIPhone, 'Safari', 'iOS'],
    [UA.chromeAndroid, 'Chrome', 'Android'],
    ['', 'Browser', 'Web'],
  ])('names %s', (userAgent, browser, system) => {
    expect(browserAndSystem(userAgent)).toEqual({ browser, system })
  })

  it('labels the session as the protocol says', () => {
    expect(webDeviceLabel(UA.chromeMac)).toEqual({
      name: 'Chrome on macOS',
      platform: 'web',
      model: '',
    })
  })
})

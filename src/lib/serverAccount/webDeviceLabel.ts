import type { DeviceLabel } from '@/lib/serverAccount/deviceLabel'

/**
 * How a browser names itself to the User's other devices: "Chrome on macOS"
 * (docs/passkeys-protocol.md, "Activity"). Read from the user agent, never
 * localized, and nothing that identifies the browser beyond its kind.
 */

export type BrowserAndSystem = { browser: string; system: string }

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, 'Edge'],
  [/\b(OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(Firefox|FxiOS)\//, 'Firefox'],
  [/\b(Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*Safari\//, 'Safari'],
]

const SYSTEMS: [RegExp, string][] = [
  [/\biPad\b/, 'iPadOS'],
  [/\b(iPhone|iPod)\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\b(Macintosh|Mac OS X)\b/, 'macOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bLinux\b/, 'Linux'],
]

const match = (value: string, table: [RegExp, string][], fallback: string) =>
  table.find(([pattern]) => pattern.test(value))?.[1] ?? fallback

export function browserAndSystem(userAgent: string): BrowserAndSystem {
  return {
    browser: match(userAgent, BROWSERS, 'Browser'),
    system: match(userAgent, SYSTEMS, 'Web'),
  }
}

/** This browser's session label: `{ name: "Chrome on macOS", platform: "web" }`. */
export function webDeviceLabel(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
): DeviceLabel {
  const { browser, system } = browserAndSystem(userAgent)
  return { name: `${browser} on ${system}`, platform: 'web', model: '' }
}

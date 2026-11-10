import i18n from '@/lib/locales'

type NameTable = readonly (readonly [RegExp, string])[]

const OPERATING_SYSTEMS: NameTable = [
  [/iPad/, 'iPadOS'],
  [/iPhone|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux|X11/, 'Linux'],
]

const BROWSERS: NameTable = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|OPT\/|OPiOS\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Vivaldi\//, 'Vivaldi'],
  [/YaBrowser\//, 'Yandex'],
  [/DuckDuckGo\/|Ddg\//, 'DuckDuckGo'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chromium\//, 'Chromium'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]

const HINTED_BROWSERS: NameTable = [
  [/^Microsoft Edge$/, 'Edge'],
  [/^Opera/, 'Opera'],
  [/^Samsung Internet$/, 'Samsung Internet'],
  [/^Brave$/, 'Brave'],
  [/^Vivaldi$/, 'Vivaldi'],
  [/^YaBrowser$/, 'Yandex'],
  [/^DuckDuckGo$/, 'DuckDuckGo'],
  [/^Google Chrome$/, 'Chrome'],
]

const HINTED_SYSTEMS: NameTable = [
  [/^iOS$/, 'iOS'],
  [/^Android$/, 'Android'],
  [/^Chrom(e|ium) ?OS$/, 'ChromeOS'],
  [/^Windows$/, 'Windows'],
  [/^macOS$/, 'macOS'],
  [/^Linux$/, 'Linux'],
]

const firstMatch = (text: string, table: NameTable) =>
  table.find(([pattern]) => pattern.test(text))?.[1] ?? null

export type WebDeviceSignals = {
  userAgent?: string
  userAgentData?: {
    brands?: readonly { brand: string }[]
    platform?: string
  }
  maxTouchPoints?: number
}

export function webDeviceParts(signals: WebDeviceSignals): {
  browser: string | null
  system: string | null
} {
  const userAgent = signals.userAgent ?? ''
  const brands = (signals.userAgentData?.brands ?? []).map(({ brand }) => brand)
  const hinted = HINTED_BROWSERS.find(([pattern]) =>
    brands.some((brand) => pattern.test(brand))
  )?.[1]
  const browser =
    hinted ??
    firstMatch(userAgent, BROWSERS) ??
    (brands.includes('Chromium') ? 'Chromium' : null)
  const system =
    firstMatch(signals.userAgentData?.platform ?? '', HINTED_SYSTEMS) ??
    firstMatch(userAgent, OPERATING_SYSTEMS)
  return {
    browser,
    system:
      system === 'macOS' && (signals.maxTouchPoints ?? 0) > 1
        ? 'iPadOS'
        : system,
  }
}

export function webDeviceName(signals: WebDeviceSignals): string {
  const { browser, system } = webDeviceParts(signals)
  if (browser && system)
    return i18n.t('webDevice_browserOnSystem', { browser, system })
  return browser ?? system ?? i18n.t('webDevice_browser')
}

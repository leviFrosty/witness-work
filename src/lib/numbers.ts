import {
  digitSystemFor,
  localizeDateText,
  localizeDigits,
  localizeNumeral,
  toAsciiDigits,
  type DigitSystem,
} from '@/lib/digits'

type NumberConventions = {
  language: string

  digitSystem: DigitSystem

  locale: string
}

let conventions: NumberConventions = {
  language: 'en-us',
  digitSystem: 'latn',
  locale: 'en',
}

export function numberFormatLocale(config: {
  language: string
  region?: string
  deviceRegion?: string | null
}): string {
  if (config.region) return config.region
  const language = config.language.toLowerCase().split(/[-_]/)[0]
  return config.deviceRegion
    ? `${language}-${config.deviceRegion.toUpperCase()}`
    : language
}

export function setNumberConventions(config: {
  language: string
  region?: string
  deviceRegion?: string | null
}): void {
  conventions = {
    language: config.language,
    digitSystem: digitSystemFor(config.language),
    locale: numberFormatLocale(config),
  }
}

export const appLanguage = (): string => conventions.language

export const appDigitSystem = (): DigitSystem => conventions.digitSystem

const formatters = new Map<string, Intl.NumberFormat>()

const numberFormatter = (
  locale: string,
  options: Intl.NumberFormatOptions | undefined
): Intl.NumberFormat => {
  const key = `${locale}|${JSON.stringify(options ?? {})}`
  let formatter = formatters.get(key)
  if (!formatter) {
    const latin = { ...options, numberingSystem: 'latn' }

    for (const tag of [`${locale}-u-nu-latn`, locale]) {
      try {
        formatter = new Intl.NumberFormat(tag, latin)
        break
      } catch {}
    }
    formatter ??= new Intl.NumberFormat('en-US', latin)
    formatters.set(key, formatter)
  }
  return formatter
}

const latinNumeral = (text: string): string =>
  toAsciiDigits(text)
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, ',')

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  const { language, digitSystem, locale } = conventions
  if (digitSystem !== 'latn') {
    return localizeNumeral(
      latinNumeral(numberFormatter('en-US', options).format(value)),
      language
    )
  }
  return latinNumeral(numberFormatter(locale, options).format(value))
}

export function formatPlainNumber(value: number): string {
  return localizeNumeral(String(value), conventions.language)
}

export function localizeAppDigits(text: string): string {
  return localizeDigits(text, conventions.language)
}

export function localizeAppDateText(text: string): string {
  return localizeDateText(text, conventions.language)
}

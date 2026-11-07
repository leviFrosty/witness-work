import type { VisitorLocation } from '@/lib/visitorLocation'

export const EU_27_COUNTRIES: readonly string[] = [
  ...['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR'],
  ...['HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK'],
  ...['SI', 'ES', 'SE'],
]

export const NO_WEB_SALES_COUNTRIES: ReadonlySet<string> = new Set([
  ...EU_27_COUNTRIES,

  'GB',

  'IM',
  'MC',

  ...['AX', 'GF', 'GP', 'MQ', 'MF', 'RE', 'YT'],

  ...['AL', 'AO', 'AM', 'AW', 'BS', 'BH', 'BD', 'CM', 'CL', 'CO', 'GE', 'GH'],
  ...['GN', 'IN', 'CI', 'KZ', 'KE', 'KG', 'LA', 'MR', 'MX', 'MD', 'ME', 'MA'],
  ...['MK', 'OM', 'PE', 'RU', 'SA', 'SN', 'RS', 'KR', 'TJ', 'TZ', 'TR', 'AE'],
  ...['UY', 'UZ', 'VN'],
])

export const NO_WEB_SALES_REGIONS: Readonly<Record<string, readonly string[]>> =
  {
    CA: ['MB', 'SK'],
  }

const code = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null

export const webSalesAllowed = (
  location: Partial<VisitorLocation> | null | undefined
): boolean => {
  const country = code(location?.country)
  if (!country) return true
  if (NO_WEB_SALES_COUNTRIES.has(country)) return false
  if (!Object.hasOwn(NO_WEB_SALES_REGIONS, country)) return true
  const written = code(location?.regionCode)
  const region = written?.startsWith(`${country}-`)
    ? written.slice(country.length + 1)
    : written
  return !!region && !NO_WEB_SALES_REGIONS[country].includes(region)
}

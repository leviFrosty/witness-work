import type { VisitorLocation } from '@/lib/visitorLocation'

/** The EU-27. The terms page lists these as "the European Union". */
export const EU_27_COUNTRIES: readonly string[] = [
  ...['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR'],
  ...['HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK'],
  ...['SI', 'ES', 'SE'],
]

/**
 * Countries the web doesn't sell in (docs/web-purchases.md "Countries the web
 * doesn't sell to", ADR 0041 §3). Stripe's Radar list mirrors it, and the terms
 * page lists it, with `NO_WEB_SALES_REGIONS`, from
 * services/marketing/src/lib/noWebSaleCountries.ts: change all three together.
 * A test keeps the terms list in step.
 */
export const NO_WEB_SALES_COUNTRIES: ReadonlySet<string> = new Set([
  ...EU_27_COUNTRIES,
  // The UK.
  'GB',
  // Inside the UK and French VAT areas.
  'IM',
  'MC',
  // EU regions with their own codes, blocked to keep the rule simple.
  ...['AX', 'GF', 'GP', 'MQ', 'MF', 'RE', 'YT'],
  // Countries that tax digital sales from the first sale.
  ...['AL', 'AO', 'AM', 'AW', 'BS', 'BH', 'BD', 'CM', 'CL', 'CO', 'GE', 'GH'],
  ...['GN', 'IN', 'CI', 'KZ', 'KE', 'KG', 'LA', 'MR', 'MX', 'MD', 'ME', 'MA'],
  ...['MK', 'OM', 'PE', 'RU', 'SA', 'SN', 'RS', 'KR', 'TJ', 'TZ', 'TR', 'AE'],
  ...['UY', 'UZ', 'VN'],
])

/**
 * Provinces the web doesn't sell in, by country: ISO 3166-2 subdivision codes
 * without the country prefix. Stripe's Radar sees only countries, so only the
 * paywall checks these. A visitor from one of these countries whose region is
 * unknown is blocked.
 */
export const NO_WEB_SALES_REGIONS: Readonly<Record<string, readonly string[]>> =
  {
    // Manitoba and Saskatchewan tax digital sales from the first sale.
    CA: ['MB', 'SK'],
  }

const code = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null

/**
 * Whether the web may show prices to a visitor at `location` (ISO alpha-2
 * country, and region without the country prefix). An unknown or unreadable
 * country gets them; Stripe's country check still stands behind it. A country
 * with blocked regions gets them only when the region is known and isn't one.
 */
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

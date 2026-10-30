/** The EU-27. The terms page lists these as "the European Union". */
export const EU_27_COUNTRIES: readonly string[] = [
  ...['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR'],
  ...['HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK'],
  ...['SI', 'ES', 'SE'],
]

/**
 * Countries the web doesn't sell in (docs/web-purchases.md "Countries the web
 * doesn't sell to", ADR 0041 §3). Stripe's Radar list mirrors it, and the terms
 * page lists it from services/marketing/src/lib/noWebSaleCountries.ts: change
 * all three together. A test keeps the terms list in step.
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
  // All of Canada, for now: Manitoba and Saskatchewan tax from the first sale,
  // and the country signal has no province. Once the web can see one, block
  // only MB and SK.
  'CA',
])

/**
 * Whether the web may show prices to a visitor from `country` (ISO alpha-2). An
 * unknown or unreadable country gets them; Stripe's check still stands behind
 * it.
 */
export const webSalesAllowed = (country: string | null | undefined): boolean =>
  typeof country !== 'string' ||
  !NO_WEB_SALES_COUNTRIES.has(country.trim().toUpperCase())

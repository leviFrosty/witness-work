/**
 * Countries the web doesn't sell in (docs/web-purchases.md "No EU or UK sales",
 * ADR 0041 §3). Stripe's Radar list mirrors it: change both together.
 */
export const NO_WEB_SALES_COUNTRIES: ReadonlySet<string> = new Set([
  // The EU-27.
  ...['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR'],
  ...['HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK'],
  ...['SI', 'ES', 'SE'],
  // The UK.
  'GB',
  // Inside the UK and French VAT areas.
  'IM',
  'MC',
  // EU regions with their own codes, blocked to keep the rule simple.
  ...['AX', 'GF', 'GP', 'MQ', 'MF', 'RE', 'YT'],
])

/**
 * Whether the web may show prices to a visitor from `country` (ISO alpha-2). An
 * unknown or unreadable country gets them; Stripe's check still stands behind
 * it.
 */
export const webSalesAllowed = (country: string | null | undefined): boolean =>
  typeof country !== 'string' ||
  !NO_WEB_SALES_COUNTRIES.has(country.trim().toUpperCase())

/**
 * Where the web doesn't sell Supporter subscriptions or Tips: countries as ISO
 * 3166-1 alpha-2 codes, and provinces by country. The terms page lists them.
 * This mirrors the app's src/features/supporter/lib/webSalesRegions.ts and
 * Stripe's Radar list, and a test in the app (webSalesRegions.test.ts) and one
 * here fail when they differ: change all of them together, and bump the Terms'
 * Updated date. Write each group as one quoted, space-separated string, and use
 * no other quoted strings, since the test reads this file as text.
 */

/** The EU-27, shown as "the European Union". */
export const EU_27_COUNTRIES =
  'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(
    ' '
  )

export const NO_WEB_SALE_COUNTRIES = [
  ...EU_27_COUNTRIES,
  // The UK.
  'GB',
  // Inside the UK and French VAT areas.
  ...'IM MC'.split(' '),
  // EU regions with their own codes, blocked to keep the rule simple.
  ...'AX GF GP MQ MF RE YT'.split(' '),
  // Countries that tax digital sales from the first sale.
  ...'AL AO AM AW BS BH BD CM CL CO GE GH GN IN CI KZ KE KG LA MR MX MD ME MA MK OM PE RU SA SN RS KR TJ TZ TR AE UY UZ VN'.split(
    ' '
  ),
]

/**
 * Provinces the web doesn't sell in, by country, as ISO 3166-2 codes without
 * the country prefix. One country to a line.
 */
export const NO_WEB_SALE_REGIONS: Record<string, string[]> = {
  // Manitoba and Saskatchewan tax digital sales from the first sale.
  CA: 'MB SK'.split(' '),
}

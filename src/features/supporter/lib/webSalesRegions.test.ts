import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EU_27_COUNTRIES,
  NO_WEB_SALES_COUNTRIES,
  webSalesAllowed,
} from '@/features/supporter/lib/webSalesRegions'

// docs/web-purchases.md "Countries the web doesn't sell to". Stripe's Radar
// list mirrors it.
const EU_27 =
  'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(
    ' '
  )
// Countries that tax digital sales from the first sale.
const FIRST_SALE_TAX =
  'AL AO AM AW BS BH BD CM CL CO GE GH GN IN CI KZ KE KG LA MR MX MD ME MA MK OM PE RU SA SN RS KR TJ TZ TR AE UY UZ VN'.split(
    ' '
  )
// All of Canada, until the web can see a province (Manitoba and Saskatchewan).
const CANADA = ['CA']
const LISTED = [
  ...EU_27,
  'GB',
  'IM',
  'MC',
  ...'AX GF GP MQ MF RE YT'.split(' '),
  ...FIRST_SALE_TAX,
  ...CANADA,
]

describe('NO_WEB_SALES_COUNTRIES', () => {
  it('is exactly the documented list', () => {
    expect(EU_27).toHaveLength(27)
    expect(FIRST_SALE_TAX).toHaveLength(39)
    expect(new Set(LISTED).size).toBe(LISTED.length)
    expect([...NO_WEB_SALES_COUNTRIES].sort()).toEqual([...LISTED].sort())
  })
})

describe('webSalesAllowed', () => {
  it('blocks every listed country', () => {
    for (const code of LISTED) expect(webSalesAllowed(code)).toBe(false)
  })

  it('blocks the first-sale tax countries and all of Canada', () => {
    for (const code of [...FIRST_SALE_TAX, 'CA']) {
      expect(webSalesAllowed(code)).toBe(false)
    }
  })

  it('allows countries outside the list', () => {
    for (const code of ['US', 'AU', 'JP', 'NO', 'CH', 'JE', 'GG']) {
      expect(webSalesAllowed(code)).toBe(true)
    }
  })

  it('reads lowercase codes', () => {
    expect(webSalesAllowed('de')).toBe(false)
    expect(webSalesAllowed('gb')).toBe(false)
    expect(webSalesAllowed('mx')).toBe(false)
    expect(webSalesAllowed('ca')).toBe(false)
    expect(webSalesAllowed('us')).toBe(true)
  })

  it('allows an unknown country', () => {
    expect(webSalesAllowed(null)).toBe(true)
    expect(webSalesAllowed(undefined)).toBe(true)
  })

  it('allows a country it cannot read instead of throwing', () => {
    for (const value of [42, {}, ['DE'], true]) {
      expect(webSalesAllowed(value as unknown as string)).toBe(true)
    }
  })
})

// The terms page (services/marketing) renders its country list from its own
// module, which can't import from the app. Read its source and compare.
const MARKETING_LIST = join(
  __dirname,
  '../../../../services/marketing/src/lib/noWebSaleCountries.ts'
)
const UPDATE_BOTH =
  'Update both src/features/supporter/lib/webSalesRegions.ts and services/marketing/src/lib/noWebSaleCountries.ts (and the Stripe Radar list).'

// Codes are written as quoted, space-separated strings: 'AT BE', 'CA'.
const codesIn = (source: string): string[] =>
  [...source.matchAll(/'([A-Z]{2}(?: [A-Z]{2})*)'/g)].flatMap((match) =>
    match[1].split(' ')
  )

describe('the terms page country list', () => {
  const source = readFileSync(MARKETING_LIST, 'utf8')

  it('is the same set as NO_WEB_SALES_COUNTRIES', () => {
    const marketing = codesIn(source)
    expect(new Set(marketing).size, 'duplicate code. ' + UPDATE_BOTH).toBe(
      marketing.length
    )
    expect([...new Set(marketing)].sort(), UPDATE_BOTH).toEqual(
      [...NO_WEB_SALES_COUNTRIES].sort()
    )
  })

  it('has the same EU-27 group as the app', () => {
    const group = source.match(/EU_27_COUNTRIES =\s*('[^']*')/)
    expect(group, 'EU_27_COUNTRIES array not found. ' + UPDATE_BOTH).not.toBe(
      null
    )
    const marketing = codesIn(group?.[1] ?? '')
    expect(marketing).toHaveLength(27)
    expect([...marketing].sort(), UPDATE_BOTH).toEqual([...EU_27].sort())
    expect([...EU_27_COUNTRIES].sort(), UPDATE_BOTH).toEqual([...EU_27].sort())
  })
})

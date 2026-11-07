import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EU_27_COUNTRIES,
  NO_WEB_SALES_COUNTRIES,
  NO_WEB_SALES_REGIONS,
  webSalesAllowed,
} from '@/features/supporter/lib/webSalesRegions'

const EU_27 =
  'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(
    ' '
  )

const FIRST_SALE_TAX =
  'AL AO AM AW BS BH BD CM CL CO GE GH GN IN CI KZ KE KG LA MR MX MD ME MA MK OM PE RU SA SN RS KR TJ TZ TR AE UY UZ VN'.split(
    ' '
  )
const LISTED = [
  ...EU_27,
  'GB',
  'IM',
  'MC',
  ...'AX GF GP MQ MF RE YT'.split(' '),
  ...FIRST_SALE_TAX,
]

const REGIONS = { CA: ['MB', 'SK'] }

const at = (country: unknown, regionCode: unknown = null) =>
  webSalesAllowed({ country, regionCode } as Parameters<
    typeof webSalesAllowed
  >[0])

describe('NO_WEB_SALES_COUNTRIES', () => {
  it('is exactly the documented list', () => {
    expect(EU_27).toHaveLength(27)
    expect(FIRST_SALE_TAX).toHaveLength(39)
    expect(new Set(LISTED).size).toBe(LISTED.length)
    expect([...NO_WEB_SALES_COUNTRIES].sort()).toEqual([...LISTED].sort())
  })

  it('leaves Canada to its provinces', () => {
    expect(NO_WEB_SALES_COUNTRIES.has('CA')).toBe(false)
  })
})

describe('NO_WEB_SALES_REGIONS', () => {
  it('is exactly the documented list', () => {
    expect(NO_WEB_SALES_REGIONS).toEqual(REGIONS)
  })
})

describe('webSalesAllowed', () => {
  it('blocks every listed country, whatever the region', () => {
    for (const code of LISTED) {
      expect(at(code)).toBe(false)
      expect(at(code, 'XY')).toBe(false)
    }
  })

  it('blocks Manitoba and Saskatchewan', () => {
    expect(at('CA', 'MB')).toBe(false)
    expect(at('CA', 'SK')).toBe(false)
  })

  it('allows the rest of Canada', () => {
    for (const region of ['ON', 'QC', 'BC', 'AB', 'NS', 'NU', 'YT']) {
      expect(at('CA', region)).toBe(true)
    }
  })

  it('blocks Canada when the province is unknown', () => {
    for (const region of [null, undefined, '', '  ', 42, {}]) {
      expect(at('CA', region)).toBe(false)
    }
  })

  it('reads a province only in its own country', () => {
    expect(at('US', 'SK')).toBe(true)
    expect(at('US', 'MB')).toBe(true)
  })

  it('allows countries outside the list', () => {
    for (const code of ['US', 'AU', 'JP', 'NO', 'CH', 'JE', 'GG']) {
      expect(at(code)).toBe(true)
      expect(at(code, 'CA')).toBe(true)
    }
  })

  it('reads lowercase and padded codes', () => {
    expect(at('de')).toBe(false)
    expect(at('gb')).toBe(false)
    expect(at('mx')).toBe(false)
    expect(at('ca', 'mb')).toBe(false)
    expect(at(' ca ', ' sk ')).toBe(false)
    expect(at('ca', 'on')).toBe(true)
    expect(at('us')).toBe(true)
  })

  it('reads a region written with its country', () => {
    expect(at('CA', 'CA-MB')).toBe(false)
    expect(at('CA', 'CA-ON')).toBe(true)
  })

  it('allows an unknown country', () => {
    expect(at(null)).toBe(true)
    expect(at(undefined)).toBe(true)
    expect(at(null, 'MB')).toBe(true)
    expect(webSalesAllowed(null)).toBe(true)
    expect(webSalesAllowed(undefined)).toBe(true)
  })

  it('allows a country it cannot read instead of throwing', () => {
    for (const value of [42, {}, ['DE'], true]) {
      expect(at(value)).toBe(true)
    }
  })
})

const MARKETING_LIST = join(
  __dirname,
  '../../../../services/marketing/src/lib/noWebSaleCountries.ts'
)
const UPDATE_BOTH =
  'Update both src/features/supporter/lib/webSalesRegions.ts and services/marketing/src/lib/noWebSaleCountries.ts (and the Stripe Radar list).'

const codesIn = (source: string): string[] =>
  [...source.matchAll(/'([A-Z]{2}(?: [A-Z]{2})*)'/g)].flatMap((match) =>
    match[1].split(' ')
  )

const declaration = (source: string, name: string): string =>
  source.match(
    new RegExp(`export const ${name}\\b[\\s\\S]*?(?=\\nexport |$)`)
  )?.[0] ?? ''

describe('the terms page country list', () => {
  const source = readFileSync(MARKETING_LIST, 'utf8')

  it('is the same set as NO_WEB_SALES_COUNTRIES', () => {
    const countries = declaration(source, 'NO_WEB_SALE_COUNTRIES')
    expect(
      countries,
      'NO_WEB_SALE_COUNTRIES not found. ' + UPDATE_BOTH
    ).not.toBe('')
    const marketing = [
      ...codesIn(declaration(source, 'EU_27_COUNTRIES')),
      ...codesIn(countries),
    ]
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

  it('has the same region rules as NO_WEB_SALES_REGIONS', () => {
    const regions = declaration(source, 'NO_WEB_SALE_REGIONS')
    expect(regions, 'NO_WEB_SALE_REGIONS not found. ' + UPDATE_BOTH).not.toBe(
      ''
    )
    const marketing = Object.fromEntries(
      [...regions.matchAll(/^\s*([A-Z]{2}): ('[^']*')/gm)].map((match) => [
        match[1],
        codesIn(match[2]).sort(),
      ])
    )
    const app = Object.fromEntries(
      Object.entries(NO_WEB_SALES_REGIONS).map(([country, list]) => [
        country,
        [...list].sort(),
      ])
    )
    expect(marketing, UPDATE_BOTH).toEqual(app)
  })
})

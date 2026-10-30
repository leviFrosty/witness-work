import { describe, expect, it } from 'vitest'
import {
  NO_WEB_SALES_COUNTRIES,
  webSalesAllowed,
} from '@/features/supporter/lib/webSalesRegions'

// docs/web-purchases.md "No EU or UK sales". Stripe's Radar list mirrors it.
const EU_27 =
  'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(
    ' '
  )
const LISTED = [
  ...EU_27,
  'GB',
  'IM',
  'MC',
  ...'AX GF GP MQ MF RE YT'.split(' '),
]

describe('NO_WEB_SALES_COUNTRIES', () => {
  it('is exactly the documented list', () => {
    expect(EU_27).toHaveLength(27)
    expect([...NO_WEB_SALES_COUNTRIES].sort()).toEqual([...LISTED].sort())
  })
})

describe('webSalesAllowed', () => {
  it('blocks every listed country', () => {
    for (const code of LISTED) expect(webSalesAllowed(code)).toBe(false)
  })

  it('allows countries outside the list', () => {
    for (const code of ['US', 'CA', 'JE', 'GG', 'CH', 'NO', 'MX']) {
      expect(webSalesAllowed(code)).toBe(true)
    }
  })

  it('reads lowercase codes', () => {
    expect(webSalesAllowed('de')).toBe(false)
    expect(webSalesAllowed('gb')).toBe(false)
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

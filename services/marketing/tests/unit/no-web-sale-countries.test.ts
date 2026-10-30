import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  EU_27_COUNTRIES,
  NO_WEB_SALE_COUNTRIES,
} from '../../src/lib/noWebSaleCountries.ts'
import { noWebSaleNames } from '../../src/lib/noWebSaleNames.ts'

describe('noWebSaleNames', () => {
  const names = noWebSaleNames()

  test('shows the EU-27 as one name, first', () => {
    expect(names[0]).toBe('the European Union')
    for (const name of ['Germany', 'France', 'Sweden']) {
      expect(names).not.toContain(name)
    }
  })

  test('names every other country once, alphabetically', () => {
    const rest = names.slice(1)
    expect(rest).toHaveLength(
      NO_WEB_SALE_COUNTRIES.length - EU_27_COUNTRIES.length
    )
    expect(new Set(rest).size).toBe(rest.length)
    const key = (name: string) => name.replace(/^the /, '')
    const keys = rest.map(key)
    expect(keys).toEqual(keys.toSorted(new Intl.Collator('en').compare))
  })

  test('uses readable names', () => {
    expect(names).toContain('the United Kingdom')
    expect(names).toContain('the United Arab Emirates')
    expect(names).toContain('Isle of Man')
    expect(names).toContain('the Åland Islands')
    expect(names).toContain('Saint Martin (French part)')
    expect(names).toContain(
      'Canada (until we can tell provinces apart, because Manitoba and Saskatchewan tax from the first sale)'
    )
    expect(names.join(' ')).not.toMatch(/\b[A-Z]{2}\b/)
  })
})

// The app's list is the one the paywall enforces. Services CI runs this test
// before the site deploys, so the Terms can't publish a different list.
describe("the app's web sales list", () => {
  test('matches this list', () => {
    const source = readFileSync(
      new URL(
        '../../../../src/features/supporter/lib/webSalesRegions.ts',
        import.meta.url
      ),
      'utf8'
    )
    // The app's set spreads its EU-27 constant, so read both declarations.
    const list = source.match(
      /export const EU_27_COUNTRIES[\s\S]*?export const NO_WEB_SALES_COUNTRIES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/
    )?.[0]
    expect(list, 'NO_WEB_SALES_COUNTRIES not found').toBeTruthy()
    expect(list).toContain('...EU_27_COUNTRIES')
    const appCodes = [...list!.matchAll(/['"`]([A-Z]{2})['"`]/g)].map(
      (m) => m[1]
    )
    expect(
      new Set(appCodes),
      'Update src/features/supporter/lib/webSalesRegions.ts, this list and the Stripe Radar list together'
    ).toEqual(new Set(NO_WEB_SALE_COUNTRIES))
  })
})

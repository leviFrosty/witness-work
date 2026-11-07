import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  EU_27_COUNTRIES,
  NO_WEB_SALE_COUNTRIES,
  NO_WEB_SALE_REGIONS,
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

  test('names every other country, and each country’s provinces, once, alphabetically', () => {
    const rest = names.slice(1)
    expect(rest).toHaveLength(
      NO_WEB_SALE_COUNTRIES.length -
        EU_27_COUNTRIES.length +
        Object.keys(NO_WEB_SALE_REGIONS).length
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
    expect(names).toContain('Manitoba and Saskatchewan (Canada)')
    expect(names).not.toContain('Canada')
    expect(names.join(' ')).not.toMatch(/\b[A-Z]{2}\b/)
  })
})

describe("the app's web sales list", () => {
  test('matches this list', () => {
    const source = readFileSync(
      new URL(
        '../../../../src/features/supporter/lib/webSalesRegions.ts',
        import.meta.url
      ),
      'utf8'
    )

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

  test('has these province rules', () => {
    const source = readFileSync(
      new URL(
        '../../../../src/features/supporter/lib/webSalesRegions.ts',
        import.meta.url
      ),
      'utf8'
    )
    const rules = source.match(
      /export const NO_WEB_SALES_REGIONS[\s\S]*?(?=\nexport |$)/
    )?.[0]
    expect(rules, 'NO_WEB_SALES_REGIONS not found').toBeTruthy()

    const appRules = Object.fromEntries(
      [...rules!.matchAll(/^\s*([A-Z]{2}): \[([^\]]*)\]/gm)].map((m) => [
        m[1],
        [...(m[2] ?? '').matchAll(/['"`]([A-Z0-9]{1,3})['"`]/g)]
          .map((code) => code[1])
          .sort(),
      ])
    )
    const siteRules = Object.fromEntries(
      Object.entries(NO_WEB_SALE_REGIONS).map(([country, regions]) => [
        country,
        [...regions].sort(),
      ])
    )
    expect(
      appRules,
      'Update src/features/supporter/lib/webSalesRegions.ts and this list together'
    ).toEqual(siteRules)
    expect(siteRules).toEqual({ CA: ['MB', 'SK'] })
  })
})

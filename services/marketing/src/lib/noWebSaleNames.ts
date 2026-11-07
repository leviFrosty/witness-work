import {
  EU_27_COUNTRIES,
  NO_WEB_SALE_COUNTRIES,
  NO_WEB_SALE_REGIONS,
} from './noWebSaleCountries.ts'

const EUROPEAN_UNION = 'the European Union'
const WITH_THE = new Set(['AE', 'AX', 'BS', 'GB'])

const NAMES: Record<string, string> = { MF: 'Saint Martin (French part)' }

const REGION_NAMES: Record<string, string> = {
  'CA-MB': 'Manitoba',
  'CA-SK': 'Saskatchewan',
}

export const noWebSaleNames = (): string[] => {
  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
  const collator = new Intl.Collator('en')
  const eu = new Set(EU_27_COUNTRIES)
  const and = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })
  const countryName = (code: string) =>
    NAMES[code] ?? regionNames.of(code) ?? code
  const countries = NO_WEB_SALE_COUNTRIES.filter((code) => !eu.has(code)).map(
    (code) => {
      const name = countryName(code)
      return {
        sortKey: name,
        label: `${WITH_THE.has(code) ? 'the ' : ''}${name}`,
      }
    }
  )
  const provinces = Object.entries(NO_WEB_SALE_REGIONS).map(
    ([country, regions]) => {
      const names = regions
        .map((region) => REGION_NAMES[`${country}-${region}`] ?? region)
        .sort(collator.compare)
      const label = `${and.format(names)} (${countryName(country)})`
      return { sortKey: label, label }
    }
  )
  const rest = [...countries, ...provinces].sort((a, b) =>
    collator.compare(a.sortKey, b.sortKey)
  )
  return [EUROPEAN_UNION, ...rest.map(({ label }) => label)]
}

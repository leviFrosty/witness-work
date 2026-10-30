import { EU_27_COUNTRIES, NO_WEB_SALE_COUNTRIES } from './noWebSaleCountries.ts'

const EUROPEAN_UNION = 'the European Union'
const WITH_THE = new Set(['AE', 'AX', 'BS', 'GB'])
// CLDR's "St. Martin" reads like Sint Maarten (SX), which isn't blocked.
const NAMES: Record<string, string> = { MF: 'Saint Martin (French part)' }
const NOTES: Record<string, string> = {
  CA: 'until we can tell provinces apart, because Manitoba and Saskatchewan tax from the first sale',
}

/**
 * The places the terms page names: the EU-27 as "the European Union", then the
 * rest alphabetically, in English.
 */
export const noWebSaleNames = (): string[] => {
  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
  const collator = new Intl.Collator('en')
  const eu = new Set(EU_27_COUNTRIES)
  const rest = NO_WEB_SALE_COUNTRIES.filter((code) => !eu.has(code))
    .map((code) => {
      const name = NAMES[code] ?? regionNames.of(code) ?? code
      const note = NOTES[code]
      return {
        sortKey: name,
        label: `${WITH_THE.has(code) ? 'the ' : ''}${name}${note ? ` (${note})` : ''}`,
      }
    })
    .sort((a, b) => collator.compare(a.sortKey, b.sortKey))
  return [EUROPEAN_UNION, ...rest.map(({ label }) => label)]
}

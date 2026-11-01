import type { Pluralizer } from 'i18n-js'
import type { PluralCategory } from 'make-plural/cardinals'

export type CardinalRule = (n: number | string) => PluralCategory

export function createPluralizer(rule: CardinalRule): Pluralizer {
  return (_i18n, count) => {
    const keys: string[] = count === 0 ? ['zero'] : []
    for (const key of [rule(count), 'other'])
      if (!keys.includes(key)) keys.push(key)
    return keys
  }
}

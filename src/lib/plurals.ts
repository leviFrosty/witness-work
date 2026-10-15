import type { Pluralizer } from 'i18n-js'
import type { PluralCategory } from 'make-plural/cardinals'

/** A CLDR cardinal rule from `make-plural/cardinals`, e.g. `ru` or `ar`. */
export type CardinalRule = (n: number | string) => PluralCategory

/**
 * An i18n-js pluralizer for one Language's CLDR cardinal rule.
 *
 * I18n-js tries the returned keys in order and renders the first one the
 * translation has. Count 0 tries `zero` first, as i18n-js's English default
 * does, since English strings use `zero` for "No matches"-style copy. Every
 * list ends in `other`, so a translation without the Language's own category
 * (say Russian `few`) still renders instead of a missing-translation string.
 */
export function createPluralizer(rule: CardinalRule): Pluralizer {
  return (_i18n, count) => {
    const keys: string[] = count === 0 ? ['zero'] : []
    for (const key of [rule(count), 'other'])
      if (!keys.includes(key)) keys.push(key)
    return keys
  }
}

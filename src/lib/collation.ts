import { appLanguage } from '@/lib/numbers'

/**
 * Alphabetical order in the app's Language, not the device's: names sort the
 * way the Language the user reads the app in sorts them (Arabic letters in
 * Arabic order, `ö` with `o` in German), whatever the phone is set to.
 */

const collators = new Map<string, Intl.Collator>()

const collatorFor = (
  locale: string,
  options: Intl.CollatorOptions | undefined
): Intl.Collator => {
  const key = `${locale}|${JSON.stringify(options ?? {})}`
  let collator = collators.get(key)
  if (!collator) {
    try {
      collator = new Intl.Collator(locale, options)
    } catch {
      // A tag this runtime's Intl rejects: use its default order.
      collator = new Intl.Collator(undefined, options)
    }
    collators.set(key, collator)
  }
  return collator
}

/**
 * Compares two strings for display order in the app Language. Takes
 * `Intl.Collator` options, e.g. `{ sensitivity: 'base', numeric: true }`.
 */
export function compareText(
  a: string,
  b: string,
  options?: Intl.CollatorOptions
): number {
  return collatorFor(appLanguage(), options).compare(a, b)
}

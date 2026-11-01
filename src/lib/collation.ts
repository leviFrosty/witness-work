import { appLanguage } from '@/lib/numbers'

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
      collator = new Intl.Collator(undefined, options)
    }
    collators.set(key, collator)
  }
  return collator
}

export function compareText(
  a: string,
  b: string,
  options?: Intl.CollatorOptions
): number {
  return collatorFor(appLanguage(), options).compare(a, b)
}

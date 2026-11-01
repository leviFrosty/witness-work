import { digitSystemFor } from '@/lib/digits'
import { isRtlLayoutFor } from '@/lib/rtl'

export type NativeLocale = {
  rtl: boolean

  numberLocale: string
}

export function numberLocale(language: string): string {
  const tag = language.toLowerCase().replace(/_/g, '-')
  const system = digitSystemFor(tag)
  return system !== 'latn' && !tag.includes('-u-')
    ? `${tag}-u-nu-${system}`
    : tag
}

export function nativeLocale(language: string): NativeLocale {
  return { rtl: isRtlLayoutFor(language), numberLocale: numberLocale(language) }
}

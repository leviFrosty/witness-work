import { Address } from '@/types/contact'

/**
 * One-line address for display and map searches. Kept apart from
 * `@/lib/address` so pure callers (the watch snapshot) don't load geocoding.
 */
export const addressToString = (address?: Address) => {
  if (!address) {
    return ''
  }

  return Object.keys(address)
    .reduce(
      (prev, line, index) =>
        !address[line as keyof Address]?.length
          ? prev
          : (prev += `${index !== 0 ? ' ' : ''}${
              address[line as keyof Address]
            }`),
      ''
    )
    .replace(/(\r\n|\n|\r)/gm, '')
}

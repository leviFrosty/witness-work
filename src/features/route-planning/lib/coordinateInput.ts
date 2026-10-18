import type { Coordinate } from '@/types/contact'

/** One number, optionally with a degree sign and a hemisphere letter. */
const PART = String.raw`([NSEWnsew])?\s*(-?\d{1,3}(?:[.,]\d+)?)\s*°?\s*([NSEWnsew])?`

const PAIR = new RegExp(String.raw`^\s*${PART}\s*[,;\s]\s*${PART}\s*$`)

/** Google Maps share links carry `@lat,lng` or `q=lat,lng`. */
const IN_LINK = /(?:@|[?&](?:q|ll|query)=)(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/

const signed = (
  value: string,
  before: string | undefined,
  after: string | undefined
) => {
  const number = Number(value.replace(',', '.'))
  const hemisphere = (before ?? after)?.toUpperCase()
  return hemisphere === 'S' || hemisphere === 'W' ? -Math.abs(number) : number
}

const valid = (latitude: number, longitude: number): Coordinate | null =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  Math.abs(latitude) <= 90 &&
  Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null

/**
 * Reads coordinates typed or pasted in the usual forms: `37.7749, -122.4194`,
 * `37.7749 -122.4194`, `37.7749° N, 122.4194° W`, or a maps link with
 * `@lat,lng`. Decimal commas work when a semicolon or space separates the two
 * numbers.
 */
export const parseCoordinateInput = (text: string): Coordinate | null => {
  const link = text.match(IN_LINK)
  if (link) return valid(Number(link[1]), Number(link[2]))

  const pair = text.trim().match(PAIR)
  if (!pair) return null
  const [, b1, v1, a1, b2, v2, a2] = pair
  // In "N 37.7 W 122.4" the W follows the first number but leads the second.
  const lettersLead = !!b1 && !!a1 && !b2 && !a2
  const first = signed(v1!, b1, lettersLead ? undefined : a1)
  const second = signed(v2!, lettersLead ? a1 : b2, a2)
  // "122.4194° W, 37.7749° N" names longitude first.
  const firstIsLongitude = /[EW]/i.test(b1 ?? a1 ?? '')
  return firstIsLongitude ? valid(second, first) : valid(first, second)
}

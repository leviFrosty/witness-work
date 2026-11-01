import type { Coordinate } from '@/types/contact'

const PART = String.raw`([NSEWnsew])?\s*(-?\d{1,3}(?:[.,]\d+)?)\s*°?\s*([NSEWnsew])?`

const PAIR = new RegExp(String.raw`^\s*${PART}\s*[,;\s]\s*${PART}\s*$`)

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

export const parseCoordinateInput = (text: string): Coordinate | null => {
  const link = text.match(IN_LINK)
  if (link) return valid(Number(link[1]), Number(link[2]))

  const pair = text.trim().match(PAIR)
  if (!pair) return null
  const [, b1, v1, a1, b2, v2, a2] = pair

  const lettersLead = !!b1 && !!a1 && !b2 && !a2
  const first = signed(v1!, b1, lettersLead ? undefined : a1)
  const second = signed(v2!, lettersLead ? a1 : b2, a2)

  const firstIsLongitude = /[EW]/i.test(b1 ?? a1 ?? '')
  return firstIsLongitude ? valid(second, first) : valid(first, second)
}

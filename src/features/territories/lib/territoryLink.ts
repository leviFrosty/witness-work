import type { Coordinate } from '@/types/contact'

const NUMBER = String.raw`-?\d{1,3}(?:\.\d+)?`
const PAIR = String.raw`(${NUMBER})\s*(?:,|%2C)\s*(${NUMBER})`

const QUERY_KEYS = [
  'q',
  'query',
  'll',
  'sll',
  'center',
  'destination',
  'daddr',
  'coordinate',
  'address',
]

const coordinate = (
  latitude: string | undefined,
  longitude: string | undefined
): Coordinate | undefined => {
  const lat = Number(latitude)
  const lng = Number(longitude)
  if (latitude === undefined || longitude === undefined) return undefined
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined
  return { latitude: lat, longitude: lng }
}

const decode = (text: string) => {
  let decoded = text
  for (let pass = 0; pass < 2; pass++) {
    try {
      decoded = decodeURIComponent(decoded)
    } catch {
      break
    }
  }
  return decoded
}

const firstMatch = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const found = pattern.exec(text)
    const point = found && coordinate(found[1], found[2])
    if (point) return point
  }
  return undefined
}

export const coordinateFromLink = (input: string): Coordinate | undefined => {
  const text = decode(input.trim())
  if (!text) return undefined

  const osmMarker = /[?&]mlat=(-?[\d.]+).*?[?&]mlon=(-?[\d.]+)/.exec(text)
  const marked = osmMarker && coordinate(osmMarker[1], osmMarker[2])
  if (marked) return marked
  return firstMatch(text, [
    new RegExp(String.raw`!3d(${NUMBER})!4d(${NUMBER})`),
    new RegExp(
      String.raw`[?&](?:${QUERY_KEYS.join('|')})=(?:loc:)?${PAIR}(?:[&#]|$)`
    ),
    new RegExp(String.raw`/@${PAIR}`),
    new RegExp(String.raw`#map=\d+(?:\.\d+)?/(${NUMBER})/(${NUMBER})`),
    new RegExp(String.raw`^geo:${PAIR}`),
    new RegExp(String.raw`^${PAIR}$`),
  ])
}

export const linkFromText = (input: string): string | undefined => {
  const found = /(?:https?:\/\/|geo:)[^\s<>"]+/i.exec(input.trim())
  return found?.[0]
}

const SHORT_LINK_HOSTS = [
  'maps.app.goo.gl',
  'goo.gl',
  'g.co',
  'maps.apple',
  'apple.co',
]

export const isShortMapLink = (url: string): boolean => {
  const host = /^https?:\/\/([^/?#]+)/i.exec(url)?.[1]?.toLowerCase()
  return !!host && SHORT_LINK_HOSTS.includes(host)
}

const RESOLVE_TIMEOUT_MS = 6000

export const resolveLinkCoordinate = async (
  url: string,
  fetchLink: typeof fetch = fetch
): Promise<Coordinate | undefined> => {
  const direct = coordinateFromLink(url)
  if (direct || !isShortMapLink(url)) return direct
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS)
  try {
    const response = await fetchLink(url, {
      redirect: 'follow',
      signal: controller.signal,
    })
    return coordinateFromLink(response.url)
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

export const mapLinkFor = ({ latitude, longitude }: Coordinate): string =>
  `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`

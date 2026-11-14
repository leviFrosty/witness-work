/**
 * Decodes a HERE flexible polyline (the format Routing v8 returns) into flat
 * `[lat, lng, lat, lng, …]` pairs. Any third dimension (altitude, elevation…)
 * is read and dropped. Spec:
 * https://github.com/heremaps/flexible-polyline#specifications
 *
 * Returns `null` for anything that isn't a version 1 polyline, so a malformed
 * HERE answer is an upstream error rather than a broken line on the map.
 */

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const DECODING = new Map([...ALPHABET].map((char, index) => [char, index]))
const FORMAT_VERSION = 1

/** Reads unsigned varints: 5 bits per character, `0x20` means more follow. */
const readVarints = (encoded: string): number[] | null => {
  const values: number[] = []
  let value = 0
  let shift = 0
  for (const char of encoded) {
    const chunk = DECODING.get(char)
    if (chunk === undefined) return null
    value += (chunk & 0x1f) * 2 ** shift
    if (chunk & 0x20) {
      shift += 5
      // Past 2^53 the arithmetic stops being exact; no real route gets there.
      if (shift > 50) return null
      continue
    }
    values.push(value)
    value = 0
    shift = 0
  }
  // A trailing continuation chunk means the string was cut short.
  return shift === 0 ? values : null
}

/** Zigzag: even values are non-negative, odd ones negative. */
const toSigned = (value: number) =>
  value % 2 === 1 ? -(value + 1) / 2 : value / 2

export const decodeFlexiblePolyline = (encoded: string): number[] | null => {
  const values = readVarints(encoded)
  if (!values || values.length < 2 || values[0] !== FORMAT_VERSION) return null
  const header = values[1]!
  const precision = header & 0x0f
  const thirdDimension = (header >> 4) & 0x07
  const stride = thirdDimension ? 3 : 2
  const body = values.slice(2)
  if (body.length % stride !== 0) return null

  const factor = 10 ** precision
  const points: number[] = []
  let lat = 0
  let lng = 0
  for (let i = 0; i < body.length; i += stride) {
    lat += toSigned(body[i]!)
    lng += toSigned(body[i + 1]!)
    const latitude = lat / factor
    const longitude = lng / factor
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
    points.push(latitude, longitude)
  }
  return points
}

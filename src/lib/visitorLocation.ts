/**
 * Where the visitor is, as Cloudflare sees it (docs/web-purchases.md "Countries
 * the web doesn't sell to"): `country` and `regionCode` from ww-api's `GET
 * /app/v1/config`, or else the country alone from `loc=` in the app origin's
 * `/cdn-cgi/trace`. The web paywall reads both; session replay's EU and UK
 * opt-in reads the country.
 */

/** An ISO 3166-1 alpha-2 country and an ISO 3166-2 region, upper-case, or null. */
export type VisitorLocation = {
  country: string | null
  /** The subdivision without the country prefix (`MB`); null without a country. */
  regionCode: string | null
}

const UNKNOWN_LOCATION: VisitorLocation = { country: null, regionCode: null }

const COUNTRY = /^[A-Za-z]{2}$/
/** ISO 3166-2 subdivision codes are one to three letters or digits. */
const REGION = /^[A-Za-z0-9]{1,3}$/
/** Cloudflare's unknown country, and Tor. */
const UNKNOWN = new Set(['XX', 'T1'])

const toCountry = (value: unknown): string | null => {
  if (typeof value !== 'string' || !COUNTRY.test(value)) return null
  const code = value.toUpperCase()
  return UNKNOWN.has(code) ? null : code
}

/**
 * A country and region as ww-api sends them, checked: the region is null when
 * it's malformed or there's no country. Takes `CA-MB` as well as `MB`.
 */
export const parseVisitorLocation = (
  country: unknown,
  regionCode: unknown
): VisitorLocation => {
  const code = toCountry(country)
  if (!code) return UNKNOWN_LOCATION
  const region = typeof regionCode === 'string' ? regionCode.toUpperCase() : ''
  const written = region.startsWith(`${code}-`)
    ? region.slice(code.length + 1)
    : region
  return { country: code, regionCode: REGION.test(written) ? written : null }
}

/**
 * A development override: a country (`gb`) or a country and region (`CA-MB`).
 * Null for anything else.
 */
export const parseDevLocation = (
  value: string | null | undefined
): VisitorLocation | null => {
  if (typeof value !== 'string') return null
  const match = /^([A-Za-z0-9]+)(?:-([A-Za-z0-9]{1,3}))?$/.exec(value.trim())
  const location = match && parseVisitorLocation(match[1], match[2] ?? null)
  return location?.country ? location : null
}

/** The upper-case alpha-2 country in a trace, or null when it's unknown. */
export const parseCloudflareTrace = (text: string): string | null => {
  if (typeof text !== 'string') return null
  const line = text.split('\n').find((l) => l.startsWith('loc='))
  return line ? toCountry(line.slice('loc='.length).trim()) : null
}

/**
 * Reads the location once per launch, once the config answers; every later call
 * gets the same answer. The app config's country and region come first. When
 * the config has no country (a worker from before them, or an unknown country),
 * the trace's country stands in with an unknown region. When the config can't
 * be read, the trace (or unknown) answers that call only and the next call asks
 * again, so a failed start doesn't decide the whole launch. `devOverride`
 * (`gb`, `CA-MB`) replaces both; only a development build on localhost passes
 * it.
 */
export const createVisitorLocation = ({
  fetchConfigLocation,
  fetchTrace,
  devOverride,
}: {
  /** The config's location, or null when it has no country. */
  fetchConfigLocation: () => Promise<VisitorLocation | null>
  fetchTrace: () => Promise<string>
  devOverride?: string | null
}) => {
  const fromTrace = async (): Promise<VisitorLocation> => {
    try {
      return {
        country: parseCloudflareTrace(await fetchTrace()),
        regionCode: null,
      }
    } catch {
      return UNKNOWN_LOCATION
    }
  }
  /** The location, and whether later calls may reuse it. */
  const read = async (): Promise<{
    location: VisitorLocation
    keep: boolean
  }> => {
    const override = parseDevLocation(devOverride)
    if (override) return { location: override, keep: true }
    let fromConfig: VisitorLocation | null
    try {
      fromConfig = await fetchConfigLocation()
    } catch {
      return { location: await fromTrace(), keep: false }
    }
    if (fromConfig?.country) return { location: fromConfig, keep: true }
    return { location: await fromTrace(), keep: true }
  }
  let pending: Promise<VisitorLocation> | null = null
  return {
    location: (): Promise<VisitorLocation> => {
      if (pending) return pending
      const attempt = read()
      const location = attempt.then((result) => result.location)
      pending = location
      void attempt.then((result) => {
        if (!result.keep && pending === location) pending = null
      })
      return location
    },
  }
}

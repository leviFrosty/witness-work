/**
 * The visitor's country as Cloudflare sees it: `loc=` in the app origin's
 * `/cdn-cgi/trace` (docs/web-purchases.md "No EU or UK sales"). The web paywall
 * and session replay's EU and UK opt-in both read it.
 */

const COUNTRY = /^[A-Za-z]{2}$/
/** Cloudflare's unknown country, and Tor. */
const UNKNOWN = new Set(['XX', 'T1'])

const toCountry = (value: unknown): string | null => {
  if (typeof value !== 'string' || !COUNTRY.test(value)) return null
  const code = value.toUpperCase()
  return UNKNOWN.has(code) ? null : code
}

/** The upper-case alpha-2 country in a trace, or null when it's unknown. */
export const parseCloudflareTrace = (text: string): string | null => {
  if (typeof text !== 'string') return null
  const line = text.split('\n').find((l) => l.startsWith('loc='))
  return line ? toCountry(line.slice('loc='.length).trim()) : null
}

/**
 * Reads the country once per launch; every later call gets the same answer. A
 * failed read is unknown for the rest of the launch. `devOverride`, a country
 * code, replaces the trace; only a development build on localhost passes it.
 */
export const createVisitorCountry = ({
  fetchTrace,
  devOverride,
}: {
  fetchTrace: () => Promise<string>
  devOverride?: string | null
}) => {
  let pending: Promise<string | null> | null = null
  return {
    country: (): Promise<string | null> => {
      pending ??= (async () => {
        const override = toCountry(devOverride)
        if (override) return override
        try {
          return parseCloudflareTrace(await fetchTrace())
        } catch {
          return null
        }
      })()
      return pending
    },
  }
}

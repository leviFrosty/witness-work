import { Platform } from 'react-native'
import { devCountryOverride } from '@/lib/launchAddress'
import { createVisitorCountry } from '@/lib/visitorCountry'

/**
 * The web visitor's country, as Cloudflare sees it (docs/web-purchases.md "No
 * EU or UK sales"), read once per launch. The web paywall's region notice uses
 * it, and session replay's EU and UK opt-in will (ADR 0043). Native apps never
 * read it.
 */

/** Long enough for a slow connection; an unanswered trace is unknown. */
const TRACE_TIMEOUT_MS = 5_000

const fetchTrace = async (): Promise<string> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TRACE_TIMEOUT_MS)
  try {
    const response = await fetch('/cdn-cgi/trace', {
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`trace ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

let visitorCountry: ReturnType<typeof createVisitorCountry> | null = null

/**
 * The country code, or null when it's unknown (or on a phone). Every call in a
 * launch shares the first read.
 */
export const readVisitorCountry = (): Promise<string | null> => {
  if (Platform.OS !== 'web') return Promise.resolve(null)
  visitorCountry ??= createVisitorCountry({
    fetchTrace,
    devOverride: devCountryOverride(),
  })
  return visitorCountry.country()
}

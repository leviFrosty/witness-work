import { appVariant, type AppVariant } from '@/lib/appVariant'
import { setLaunchAddress } from '@/lib/launchAddress'
import { scrubPurchaseReturn } from '@/lib/purchaseReturn'

/**
 * The web entry's first step, before any other module loads: before launch
 * links, analytics, session replay, error tracking or Skia
 * (docs/web-purchases.md "The return page"):
 *
 * - A checkout return meant for another origin goes there, and nothing else
 *   loads.
 * - Otherwise checkout's ids leave the address, and the `app_user_id` stays in
 *   memory only (`@/lib/launchAddress`).
 * - A development build on localhost reads `?dev_country=` to test the region
 *   notice, and `?dev_buy_gate=1` to make web Buy wait for an account session
 *   and a settled id as Beta and production do. Every build removes both from
 *   the address.
 */

const DEV_COUNTRY = 'dev_country'
const DEV_BUY_GATE = 'dev_buy_gate'
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1'])

export type ScrubbedAddress = {
  /** Where to go instead of loading the app, or null. */
  forwardTo: string | null
  /** The address to show, without checkout's ids or `dev_country`. */
  url: string
  appUserId: string | null
  /** A checkout return forwarded here from another origin. */
  forwarded: boolean
  devCountry: string | null
  devBuyGate: boolean
}

/** `url` without the param `name`, and its one value. */
const takeParam = (
  url: string,
  name: string
): { url: string; value: string | null } => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { url, value: null }
  }
  const values = parsed.searchParams.getAll(name)
  if (values.length === 0) return { url, value: null }
  parsed.searchParams.delete(name)
  return {
    url: parsed.toString(),
    value: values.length === 1 ? values[0] : null,
  }
}

export function scrubAddress(
  {
    href,
    origin,
    hostname,
  }: { href: string; origin: string; hostname: string },
  variant: AppVariant
): ScrubbedAddress {
  const scrubbed = scrubPurchaseReturn(href, { variant, origin })
  const country = takeParam(scrubbed.url, DEV_COUNTRY)
  const buyGate = takeParam(country.url, DEV_BUY_GATE)
  const devLocal = variant === 'development' && LOCAL_HOSTS.has(hostname)
  return {
    forwardTo: scrubbed.forwardTo,
    url: buyGate.url,
    appUserId: scrubbed.forwardTo ? null : scrubbed.appUserId,
    forwarded: scrubbed.forwarded,
    devCountry: devLocal ? country.value : null,
    devBuyGate: devLocal && buyGate.value === '1',
  }
}

/** False when the page is leaving for another origin, so nothing may load. */
export function scrubLaunchAddress(
  { location, history }: Pick<Window, 'location' | 'history'> = window,
  variant: AppVariant = appVariant
): boolean {
  const address = scrubAddress(location, variant)
  if (address.forwardTo) {
    location.replace(address.forwardTo)
    return false
  }
  if (address.url !== location.href)
    history.replaceState(history.state, '', address.url)
  setLaunchAddress({
    returnedAppUserId: address.appUserId,
    forwardedReturn: address.forwarded,
    devCountry: address.devCountry,
    devBuyGate: address.devBuyGate,
  })
  return true
}

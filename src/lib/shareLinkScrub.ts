import {
  APP_LINK_HOSTS,
  escapeRegExp,
  LEGACY_APP_LINK_HOST,
  LEGACY_CONTACT_PATH_PREFIX,
  WEB_APP_HOST,
} from '@/constants/appLinks'
import { redactPurchaseEventProperties } from '@/lib/purchaseReturn'

/**
 * `char` as written or percent-encoded, once or more (a link inside another
 * link's query): `/`, `%2F`, `%252F`, ….
 */
const encodable = (char: string) =>
  `(?:${escapeRegExp(char)}|%(?:25)*${char.charCodeAt(0).toString(16).toUpperCase()})`
const SLASH = encodable('/')
const HASH = encodable('#')

/** The `/c/` of `/c/<payload>`, its slashes written or encoded. */
const LEGACY_CONTACT_PATH = LEGACY_CONTACT_PATH_PREFIX.split('/')
  .map(escapeRegExp)
  .join(SLASH)

/** A legacy contact link's path payload: `/c/<payload>`, old host only. */
const LEGACY_PATH_PAYLOAD = new RegExp(
  `(${escapeRegExp(LEGACY_APP_LINK_HOST)}${LEGACY_CONTACT_PATH})[^\\s#?"']+`,
  'gi'
)
/**
 * Any fragment on the app's link hosts and the web app, from the first `#`,
 * written or encoded, on. Unanchored, so a host inside a longer one (`x.` or
 * `.example.org`) is covered too. Quotes before the `#` don't stop it, since
 * the parsers read them in a query.
 */
const FRAGMENT = new RegExp(
  `((?:${[...APP_LINK_HOSTS, WEB_APP_HOST].map(escapeRegExp).join('|')})[^\\s#]*?)(${HASH})[^\\s"']*`,
  'gi'
)
/** The `witnesswork://import-contact/<payload>` hand-off. */
const IMPORT_CONTACT_PAYLOAD = new RegExp(
  `(import-contact${SLASH})[^\\s#?"']+`,
  'gi'
)

/**
 * Share links carry private data in the URL itself: a shared contact (with
 * visit notes) in `/c/<payload>` or after `#`, the
 * `witnesswork://import-contact/` hand-off from the fallback page, and secrets
 * in any other fragment on the app's link hosts (docs/app-links.md). This
 * scrubber retains the route and removes the payload from diagnostic strings.
 * Launch events use the stricter wrapper below, which removes the entire URL.
 */
export function scrubShareLinkUrl(value: string): string {
  return value
    .replace(LEGACY_PATH_PAYLOAD, '$1[redacted]')
    .replace(FRAGMENT, '$1$2[redacted]')
    .replace(IMPORT_CONTACT_PAYLOAD, '$1[redacted]')
}

/** Scrubs every top-level string property. */
export function scrubShareLinkProperties<T>(
  properties: Record<string, T>
): Record<string, T | string> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      typeof value === 'string' ? scrubShareLinkUrl(value) : value,
    ])
  )
}

/**
 * Also applied on delivery: restored queues bypass the SDK capture hook. Web
 * checkout's ids come out of every URL too (docs/web-purchases.md "The return
 * page"); native events carry none, so that changes nothing there.
 */
export function scrubAnalyticsEventProperties<T>(
  event: string,
  properties: Record<string, T> = {}
): Record<string, T | string> {
  const scrubbed = scrubShareLinkProperties(
    redactPurchaseEventProperties(properties)
  )
  // All launch URLs may contain private route IDs, query data or secrets.
  if (event === 'Application Opened') delete scrubbed.url
  return scrubbed
}

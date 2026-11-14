import {
  APP_LINK_HOSTS,
  escapeRegExp,
  LEGACY_APP_LINK_HOST,
  LEGACY_CONTACT_PATH_PREFIX,
  WEB_APP_HOST,
} from '@/constants/appLinks'
import { redactPurchaseEventProperties } from '@/lib/purchaseReturn'

const encodable = (char: string) =>
  `(?:${escapeRegExp(char)}|%(?:25)*${char.charCodeAt(0).toString(16).toUpperCase()})`
const SLASH = encodable('/')
const HASH = encodable('#')

const LEGACY_CONTACT_PATH = LEGACY_CONTACT_PATH_PREFIX.split('/')
  .map(escapeRegExp)
  .join(SLASH)

const LEGACY_PATH_PAYLOAD = new RegExp(
  `(${escapeRegExp(LEGACY_APP_LINK_HOST)}${LEGACY_CONTACT_PATH})[^\\s#?"']+`,
  'gi'
)

const FRAGMENT = new RegExp(
  `((?:${[...APP_LINK_HOSTS, WEB_APP_HOST].map(escapeRegExp).join('|')})[^\\s#]*?)(${HASH})[^\\s"']*`,
  'gi'
)

const IMPORT_CONTACT_PAYLOAD = new RegExp(
  `(import-contact${SLASH})[^\\s#?"']+`,
  'gi'
)

const GUEST_LINK = /v1\.[\w-]{22}\.[\w-]{22}\.[\w-]{43}/g

export function scrubShareLinkUrl(value: string): string {
  return value
    .replace(GUEST_LINK, '[redacted]')
    .replace(LEGACY_PATH_PAYLOAD, '$1[redacted]')
    .replace(FRAGMENT, '$1$2[redacted]')
    .replace(IMPORT_CONTACT_PAYLOAD, '$1[redacted]')
}

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

export function scrubAnalyticsEventProperties<T>(
  event: string,
  properties: Record<string, T> = {}
): Record<string, T | string> {
  const scrubbed = scrubShareLinkProperties(
    redactPurchaseEventProperties(properties)
  )

  if (event === 'Application Opened') delete scrubbed.url
  return scrubbed
}

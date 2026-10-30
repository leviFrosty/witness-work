import type { AppVariant } from '@/lib/appVariant'

/**
 * Web checkout returns to `/supporter/thank-you?tier=…` with RevenueCat's
 * `app_user_id` appended (docs/web-purchases.md "The return page"). The web
 * entry scrubs that before anything else runs, and the analytics client drops
 * the same params from every URL it sends, as a backstop.
 */

export type PurchaseTier = 'supporter' | 'tip'

/** Brings checkout back to a web app off its config's return host. */
export type ReturnKey = 'beta' | 'local'

export const PURCHASE_RETURN_PATH = '/supporter/thank-you'

/** Where each build's RevenueCat Billing config sends checkout back to. */
const RETURN_HOSTS: Record<AppVariant, string> = {
  development: 'https://app-dev.witnesswork.app',
  beta: 'https://app.witnesswork.app',
  production: 'https://app.witnesswork.app',
}

/** The only origins a return is ever forwarded to, per build. */
const RETURN_KEYS: Record<AppVariant, Partial<Record<ReturnKey, string>>> = {
  development: { local: 'http://localhost:8081' },
  beta: { beta: 'https://beta.app.witnesswork.app' },
  production: { beta: 'https://beta.app.witnesswork.app' },
}

const ALL_RETURN_KEYS: ReadonlySet<string> = new Set<ReturnKey>([
  'beta',
  'local',
])

/** Params that carry the RevenueCat customer, removed on every path. */
const ID_PARAMS: ReadonlySet<string> = new Set(['app_user_id', 'redeem_url'])

const CHECKOUT_HOST = 'pay.rev.cat'
const REDACTED_CHECKOUT_URL = `https://${CHECKOUT_HOST}/`

/** Enough to undo double encoding without looping on junk. */
const MAX_DECODES = 3

const decodeOnce = (value: string): string | null => {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return null
  }
}

const decodeFully = (value: string): string => {
  let decoded = value
  for (let i = 0; i < MAX_DECODES; i++) {
    const next = decodeOnce(decoded)
    if (next === null || next === decoded) break
    decoded = next
  }
  return decoded
}

/**
 * Names match whatever their case or encoding, as a lenient reader might, and
 * with a trailing `[]` or NUL some servers drop.
 */
const paramName = (raw: string): string =>
  decodeFully(raw)
    .trim()
    .toLowerCase()
    .replace(/(?:\[\]|\0)+$/, '')

type Param = { name: string; value: string }

const parseParam = (segment: string): Param => {
  const eq = segment.indexOf('=')
  return eq < 0
    ? { name: paramName(segment), value: '' }
    : { name: paramName(segment.slice(0, eq)), value: segment.slice(eq + 1) }
}

const returnKeyOf = (rawValue: string): ReturnKey | null => {
  const key = decodeOnce(rawValue)?.trim().toLowerCase()
  return key && ALL_RETURN_KEYS.has(key) ? (key as ReturnKey) : null
}

const mentionsCheckout = (rawValue: string): boolean =>
  decodeFully(rawValue).toLowerCase().includes(CHECKOUT_HOST)

const isPurchaseParam = ({ name, value }: Param): boolean =>
  ID_PARAMS.has(name) ||
  (name === 'utm_content' && returnKeyOf(value) !== null) ||
  mentionsCheckout(value)

/**
 * `query` without purchase params, keeping every other byte as it was. Splits
 * on `;` as well as `&`, as some servers do; each kept param keeps the
 * separator before it.
 */
const stripQuery = (query: string): { query: string; removed: boolean } => {
  // Params at even indexes, each separator between them at the odd one after.
  const parts = query.split(/([&;])/)
  const kept: string[] = []
  for (let i = 0; i < parts.length; i += 2) {
    if (isPurchaseParam(parseParam(parts[i]))) continue
    kept.push(kept.length ? `${parts[i - 1]}${parts[i]}` : parts[i])
  }
  return {
    query: kept.join(''),
    removed: kept.length !== (parts.length + 1) / 2,
  }
}

type UrlParts = { head: string; query: string | null; hash: string | null }

const splitUrl = (url: string): UrlParts => {
  const hashAt = url.indexOf('#')
  const beforeHash = hashAt < 0 ? url : url.slice(0, hashAt)
  const hash = hashAt < 0 ? null : url.slice(hashAt + 1)
  const queryAt = beforeHash.indexOf('?')
  return queryAt < 0
    ? { head: beforeHash, query: null, hash }
    : {
        head: beforeHash.slice(0, queryAt),
        query: beforeHash.slice(queryAt + 1),
        hash,
      }
}

/**
 * Removes purchase params from the query and from a fragment that holds one
 * (`#app_user_id=…`, `#/route?app_user_id=…`). Works on any string, relative or
 * not; returns it untouched when there's nothing to remove.
 */
const stripPurchaseParams = (url: string): string => {
  const { head, query, hash } = splitUrl(url)
  let removed = false
  let out = head
  if (query !== null) {
    const stripped = stripQuery(query)
    removed ||= stripped.removed
    if (stripped.query) out += `?${stripped.query}`
  }
  if (hash !== null) {
    const queryAt = hash.indexOf('?')
    const route = queryAt < 0 ? '' : hash.slice(0, queryAt)
    const stripped = stripQuery(queryAt < 0 ? hash : hash.slice(queryAt + 1))
    removed ||= stripped.removed
    const rest =
      queryAt < 0 ? stripped.query : stripped.query && `?${stripped.query}`
    if (route || rest) out += `#${route}${rest}`
  }
  return removed ? out : url
}

const isCheckoutUrl = (url: string): boolean => {
  const lower = url.trim().toLowerCase()
  if (/^pay\.rev\.cat(?:[:/\\?#]|$)/.test(lower)) return true
  let host: string
  try {
    host = new URL(url, 'https://base.invalid').hostname
  } catch {
    return lower.includes(CHECKOUT_HOST)
  }
  host = host.replace(/\.$/, '')
  return host === CHECKOUT_HOST || host.endsWith(`.${CHECKOUT_HOST}`)
}

/** `origin` as `URL.origin` writes it, or null. */
const toOrigin = (origin: string): string | null => {
  try {
    const parsed = new URL(origin).origin
    return parsed === 'null' ? null : parsed
  } catch {
    return null
  }
}

/** The one value every copy of a query param agrees on, decoded, or null. */
const agreedValue = (
  query: string | null,
  name: string,
  read: (rawValue: string) => string | null = decodeOnce
): string | null => {
  if (query === null) return null
  const values = query
    .split('&')
    .map(parseParam)
    .filter((param) => param.name === name)
    .map((param) => read(param.value))
  const [first] = values
  return first && values.every((value) => value === first) ? first : null
}

const toTier = (value: string | null): PurchaseTier | null =>
  value === 'supporter' || value === 'tip' ? value : null

const isReturnPath = (pathname: string): boolean =>
  pathname === PURCHASE_RETURN_PATH || pathname === `${PURCHASE_RETURN_PATH}/`

export type PurchaseReturn = {
  /** `href` without purchase params, or `href` itself when it had none. */
  url: string
  /**
   * The removed `app_user_id`, for comparing with this browser's customer in
   * memory. Never log in with it, save it or send it anywhere.
   */
  appUserId: string | null
  tier: PurchaseTier | null
  /** The return page on the origin checkout started from, or null. */
  forwardTo: string | null
}

/**
 * Scrubs the address the web app loaded with. Removes the customer's ids on any
 * path, and a return key wherever it appears. On the return page, a return key
 * forwards to that key's origin for this build, carrying only `tier`; the
 * origin always comes from the fixed table, never from the URL.
 */
export const scrubPurchaseReturn = (
  href: string,
  { variant, origin }: { variant: AppVariant; origin: string }
): PurchaseReturn => {
  const { query } = splitUrl(href)
  const tier = toTier(agreedValue(query, 'tier'))
  const key = agreedValue(query, 'utm_content', returnKeyOf) as ReturnKey | null
  const here = toOrigin(origin)
  let forwardTo: string | null = null
  if (key && here) {
    let current: URL | null = null
    try {
      current = new URL(href)
    } catch {
      // Not an address this page could have; nothing to forward.
    }
    const target = RETURN_KEYS[variant]?.[key]
    if (
      current?.origin === here &&
      isReturnPath(current.pathname) &&
      target &&
      target !== here
    ) {
      forwardTo = `${target}${PURCHASE_RETURN_PATH}${tier ? `?tier=${tier}` : ''}`
    }
  }
  return {
    url: stripPurchaseParams(href),
    appUserId: agreedValue(query, 'app_user_id'),
    tier,
    forwardTo,
  }
}

/**
 * The return key a web app on `origin` adds to checkout links, or null when
 * checkout already returns here (the config's return host) or can't.
 */
export const returnKeyFor = ({
  origin,
  variant,
}: {
  origin: string
  variant: AppVariant
}): ReturnKey | null => {
  const here = toOrigin(origin)
  if (!here || here === RETURN_HOSTS[variant]) return null
  const keys = RETURN_KEYS[variant] ?? {}
  const match = (Object.keys(keys) as ReturnKey[]).find(
    (key) => keys[key] === here
  )
  return match ?? null
}

/**
 * `url` without purchase params; a checkout URL becomes its bare origin. Any
 * other input comes back as it was.
 */
export const redactPurchaseUrl = (url: string): string => {
  if (typeof url !== 'string') return url
  return isCheckoutUrl(url) ? REDACTED_CHECKOUT_URL : stripPurchaseParams(url)
}

/** Event properties that hold a page or link URL, whatever they look like. */
const URL_PROPERTIES: ReadonlySet<string> = new Set([
  '$current_url',
  '$referrer',
  '$initial_referrer',
  '$initial_current_url',
  '$el_href',
  '$session_entry_url',
  '$session_entry_referrer',
  '$external_click_url',
])

/** Person properties where PostHog repeats the initial URLs. */
const PERSON_PROPERTIES = ['$set', '$set_once'] as const

/** Autocapture's elements as one string, with its own redaction. */
const ELEMENTS_CHAIN = '$elements_chain'

/** Absolute, scheme-less checkout, root-relative, query or fragment. */
const URL_LIKE = /^\s*(?:[a-z][a-z\d+.-]*:\/\/|pay\.rev\.cat|[/?#])/i

const looksLikeUrl = (value: string): boolean => URL_LIKE.test(value)

/** `href="…"` and `attr__href="…"` in an elements chain, `\"` escaped. */
const CHAIN_HREF = /((?:attr__)?href=")((?:[^"\\]|\\.)*)"/g

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** Every listed or URL-looking top-level string, the way share links scrub. */
const redactUrlProperties = (
  properties: Record<string, unknown>
): Record<string, unknown> => {
  const out = { ...properties }
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== 'string' || key === ELEMENTS_CHAIN) continue
    if (URL_PROPERTIES.has(key) || looksLikeUrl(value)) {
      out[key] = redactPurchaseUrl(value)
    }
  }
  return out
}

const redactElement = (element: unknown): unknown => {
  if (!isRecord(element)) return element
  const out = { ...element }
  for (const key of ['attr__href', 'href']) {
    const value = out[key]
    if (typeof value === 'string') out[key] = redactPurchaseUrl(value)
  }
  return out
}

/**
 * A copy of an analytics event's properties with purchase params redacted from
 * its URLs and autocaptured element `href`s.
 */
export const redactPurchaseEventProperties = <
  T extends Record<string, unknown>,
>(
  properties: T
): T => {
  const out = redactUrlProperties(properties)
  for (const key of PERSON_PROPERTIES) {
    const value = out[key]
    if (isRecord(value)) out[key] = redactUrlProperties(value)
  }
  if (Array.isArray(out.$elements)) {
    out.$elements = out.$elements.map(redactElement)
  }
  const chain = out[ELEMENTS_CHAIN]
  if (typeof chain === 'string') {
    out[ELEMENTS_CHAIN] = chain.replace(
      CHAIN_HREF,
      (_, name: string, value: string) => `${name}${redactPurchaseUrl(value)}"`
    )
  }
  return out as T
}

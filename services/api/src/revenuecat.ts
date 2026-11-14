/**
 * Server-side Supporter verification via the RevenueCat REST v1 API. The app's
 * RevenueCat App User ID is its shared account id (witness-work ADR 0011),
 * which defaults to the Keychain install UUID (ADR 0007) — so we look the
 * subscriber up by whichever of those the client sent.
 *
 * Who counts as a Supporter is defined once, in witness-work ADR 0014, and this
 * check must stay in step with the app's `supporterSinceDate`.
 *
 * The secret key never ships in the app — only the proxy holds it.
 */

/**
 * Promotional entitlement granted by hand from the RevenueCat dashboard. Mirrors
 * `LIFETIME_SUPPORTER_ENTITLEMENT` in the app.
 */
export const LIFETIME_SUPPORTER_ENTITLEMENT = 'Lifetime Supporter'

export const REVENUECAT_API_ORIGIN = 'https://api.revenuecat.com'

/**
 * How long one read may take, headers and body together. Past it the read
 * fails like a 5xx, so a hung RevenueCat can't hold a request (or a webhook
 * delivery) open; every caller already fails closed on that.
 */
export const REVENUECAT_TIMEOUT_MS = 5_000

export interface SupporterCheckArgs {
  apiKey: string
  appUserId: string
  /**
   * @deprecated Ignored. Supporter status no longer keys on one entitlement
   * name (witness-work ADR 0014); kept so existing callers still compile.
   */
  entitlementId?: string
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
  /**
   * RevenueCat's REST API origin; `REVENUECAT_API_ORIGIN` by default. The
   * verify loop points development workers at a local fake.
   */
  apiOrigin?: string
  /** Injectable clock for tests (epoch ms). Defaults to Date.now(). */
  nowMs?: number
  /** The read's deadline; `REVENUECAT_TIMEOUT_MS` by default. */
  timeoutMs?: number
  /**
   * Count RevenueCat Billing (web) sandbox subscriptions; off by default.
   * Pass `countsWebSandboxSubscriptions(env)`.
   */
  countWebSandbox?: boolean
}

/**
 * Whether this worker counts RevenueCat Billing sandbox subscriptions (Stripe
 * test cards) toward Supporter status: only a development worker with
 * `REVENUECAT_COUNT_WEB_SANDBOX = "true"` (ADR 0014). Production ignores the var.
 */
export const countsWebSandboxSubscriptions = (env: {
  APP_ATTEST_ENVIRONMENT?: string
  REVENUECAT_COUNT_WEB_SANDBOX?: string
}): boolean =>
  env.APP_ATTEST_ENVIRONMENT === 'development' &&
  env.REVENUECAT_COUNT_WEB_SANDBOX === 'true'

interface RcEntitlement {
  expires_date?: string | null
  product_identifier?: string
}

interface RcSubscription {
  expires_date?: string | null
  store?: string
  is_sandbox?: boolean
}

interface RcSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, RcEntitlement>
    /**
     * Recurring purchases keyed by product id, including dashboard grants
     * (`rc_promo_<entitlement>_<duration>`, store `promotional`). One-time
     * Tips live in `non_subscriptions` instead, so they never match here.
     */
    subscriptions?: Record<string, RcSubscription>
    /** The customer's first app user id, whichever id was asked about. */
    original_app_user_id?: unknown
    /** Its other app user ids, when RevenueCat lists them. */
    aliases?: unknown
  }
}

/**
 * What RevenueCat says about one customer, by ADR 0014's rule: whether it's a
 * Supporter and until when.
 */
export interface SupporterStatus {
  /** False when RevenueCat has never seen the id (404). */
  known: boolean
  supporter: boolean
  /**
   * When Supporter status ends (epoch ms): the latest end among the
   * entitlements that qualify, each the sooner of the entitlement's and its
   * subscription's expiry. Null for no end (a lifetime grant), and when not a
   * Supporter.
   */
  expiresAt: number | null
  /**
   * The customer's `original_app_user_id` and `aliases`, as RevenueCat named
   * them (unfiltered strings; absent when it named none). ADR 0039 §9 locks
   * a customer by them.
   */
  originalAppUserId?: string
  aliases?: string[]
}

/**
 * Reads the subscriber from RevenueCat and applies ADR 0014: an active
 * entitlement backed by an active subscription (monthly, annual, or a
 * promotional grant), or an active `Lifetime Supporter` grant. An entitlement
 * unlocked by a one-time Tip doesn't count, whatever it's called. A
 * RevenueCat Billing (web) sandbox subscription counts only with
 * `countWebSandbox`; App Store and Play sandbox purchases always count.
 *
 * An unknown subscriber (404) is `{ known: false, supporter: false }`. Any
 * other failure throws `RevenueCatError`; the caller decides how to fail
 * closed and reports anything else.
 */
export const fetchSupporterStatus = async ({
  apiKey,
  appUserId,
  fetchImpl = fetch,
  apiOrigin = REVENUECAT_API_ORIGIN,
  nowMs = Date.now(),
  timeoutMs = REVENUECAT_TIMEOUT_MS,
  countWebSandbox = false,
}: SupporterCheckArgs): Promise<SupporterStatus> => {
  // One deadline for the headers and the body. Raced as well as passed on,
  // so it holds whatever the fetch does with the signal.
  const signal = AbortSignal.timeout(timeoutMs)
  const deadline = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    })
  })
  deadline.catch(() => undefined)
  let res: Response
  try {
    res = await Promise.race([
      fetchImpl(
        `${apiOrigin}/v1/subscribers/${encodeURIComponent(appUserId)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          signal,
        }
      ),
      deadline,
    ])
  } catch {
    // A network failure or the deadline is RevenueCat being unreachable,
    // like a 5xx. Its message would name the URL, which holds the app user id.
    throw new RevenueCatError('RevenueCat unreachable')
  }

  if (!res.ok) {
    // 404 = RevenueCat has never seen this id → definitively not a Supporter.
    // Anything else is unexpected; the caller logs it.
    if (res.status !== 404) {
      throw new RevenueCatError(`RevenueCat ${res.status}`)
    }
    return { known: false, supporter: false, expiresAt: null }
  }

  let body: RcSubscriberResponse
  try {
    body = (await Promise.race([res.json(), deadline])) as RcSubscriberResponse
  } catch {
    throw new RevenueCatError('RevenueCat answered late or with invalid JSON')
  }
  const entitlements = body.subscriber?.entitlements ?? {}
  const subscriptions = body.subscriber?.subscriptions ?? {}

  // Infinity for no expiry; NaN for an unparseable one (never active).
  const expiryMs = (expiresDate: string | null | undefined) =>
    expiresDate == null ? Infinity : Date.parse(expiresDate)
  const isActive = (ms: number) =>
    Number.isFinite(ms) ? ms > nowMs : ms === Infinity

  const ignored = (subscription: RcSubscription | undefined) =>
    !countWebSandbox &&
    subscription?.store === 'rc_billing' &&
    subscription.is_sandbox === true
  // RevenueCat names one product per entitlement, the one ending last, so an
  // ignored subscription can hide another that unlocks the same entitlement.
  // Those are the subscriptions no entitlement names. This assumes every
  // subscription product unlocks some entitlement, as the catalog does. Both
  // web configs share product ids, so a sandbox purchase can also hide a live
  // purchase of the same product: testers use separate customers.
  const named = new Set(
    Object.values(entitlements).map((e) => e.product_identifier)
  )
  const hiddenEnd = Math.max(
    -Infinity,
    ...Object.entries(subscriptions)
      .filter(([id, sub]) => !named.has(id) && !ignored(sub))
      .map(([, sub]) => expiryMs(sub.expires_date))
      .filter(isActive)
  )

  let end = -Infinity
  for (const [identifier, entitlement] of Object.entries(entitlements)) {
    const entitlementEnd = expiryMs(entitlement.expires_date)
    if (!isActive(entitlementEnd)) continue
    if (identifier === LIFETIME_SUPPORTER_ENTITLEMENT) {
      end = Math.max(end, entitlementEnd)
      continue
    }
    // `Object.hasOwn` so a product id like `constructor` can't hit the prototype.
    const productId = entitlement.product_identifier
    if (!productId || !Object.hasOwn(subscriptions, productId)) continue
    const subscription = subscriptions[productId]
    const subscriptionEnd = ignored(subscription)
      ? hiddenEnd
      : expiryMs(subscription?.expires_date)
    if (!isActive(subscriptionEnd)) continue
    end = Math.max(end, Math.min(entitlementEnd, subscriptionEnd))
  }

  const original = body.subscriber?.original_app_user_id
  const aliases = Array.isArray(body.subscriber?.aliases)
    ? body.subscriber.aliases.filter((id): id is string => typeof id === 'string')
    : []
  const others = {
    ...(typeof original === 'string' ? { originalAppUserId: original } : {}),
    ...(aliases.length ? { aliases } : {}),
  }
  if (end === -Infinity)
    return { known: true, supporter: false, expiresAt: null, ...others }
  return {
    known: true,
    supporter: true,
    expiresAt: end === Infinity ? null : end,
    ...others,
  }
}

/**
 * Returns true iff the subscriber is a Supporter (witness-work ADR 0014); see
 * `fetchSupporterStatus`.
 *
 * Fails CLOSED: an unknown subscriber (404) resolves to `false`, and any
 * other failure throws `RevenueCatError`, so the caller falls back to the
 * free-credit meter rather than granting unlimited access on a fluke. The
 * caller is responsible for reporting unexpected failures.
 */
export const isSupporter = async (args: SupporterCheckArgs): Promise<boolean> =>
  (await fetchSupporterStatus(args)).supporter

/** Distinguishes an unexpected RevenueCat failure (report it) from a 404. */
export class RevenueCatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RevenueCatError'
  }
}

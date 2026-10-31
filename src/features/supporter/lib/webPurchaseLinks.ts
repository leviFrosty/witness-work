import { appVariant, type AppVariant } from '@/lib/appVariant'
import type { ReturnKey } from '@/lib/purchaseReturn'
import { toRevenueCatAppUserId } from '@/lib/serverAccount/revenueCatLink'

/**
 * RevenueCat Web Purchase Links: the hosted checkout the web opens on Buy
 * (docs/web-purchases.md "Links"). Each offering has at most one link.
 */

/**
 * A link token, with `sandbox/` in front for the sandbox config. A bare
 * `sandbox` is a prefix without its token.
 */
const WEB_PURCHASE_LINK = /^(?:sandbox\/)?(?!sandbox$)[A-Za-z0-9_-]+$/

const isSandboxLink = (link: string): boolean => link.startsWith('sandbox/')

/** Every return key, so a value from outside the type can be refused. */
const RETURN_KEYS = { beta: true, local: true } satisfies Record<
  ReturnKey,
  true
>

const CHECKOUT_ORIGIN = 'https://pay.rev.cat'

export const isWebPurchaseLink = (value: unknown): value is string =>
  typeof value === 'string' && WEB_PURCHASE_LINK.test(value)

/**
 * Offering ids to links, from `EXPO_PUBLIC_REVENUECAT_WEB_PURCHASE_LINKS` (one
 * line of JSON). A malformed value gives no links, and a bad entry is dropped,
 * so its offering has no Buy button. Sandbox links count only in development
 * builds (docs/web-purchases.md "Sandbox only in development").
 */
export const parseWebPurchaseLinks = (
  raw: string | undefined,
  variant: AppVariant = appVariant
): ReadonlyMap<string, string> => {
  const links = new Map<string, string>()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw ?? '')
  } catch {
    return links
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return links
  }
  for (const [offering, link] of Object.entries(parsed)) {
    if (!offering || !isWebPurchaseLink(link)) continue
    if (isSandboxLink(link) && variant !== 'development') continue
    links.set(offering, link)
  }
  return links
}

/**
 * The checkout URL for one package, or null when it can't be built safely: the
 * link, package id or return key is malformed, or the app user id isn't one
 * ww-api accepts (never RevenueCat's anonymous id, since checkout needs an
 * identified customer). `returnKey` brings checkout back to a web app off the
 * config's return host.
 */
export const checkoutUrl = ({
  link,
  appUserId,
  packageId,
  returnKey,
}: {
  link: string
  appUserId: string | null | undefined
  packageId: string
  returnKey: ReturnKey | null
}): string | null => {
  const id = toRevenueCatAppUserId(appUserId)
  if (!id || !isWebPurchaseLink(link) || !packageId.trim()) return null
  if (returnKey !== null && !Object.hasOwn(RETURN_KEYS, returnKey)) return null
  const query = [
    `package_id=${encodeURIComponent(packageId)}`,
    'hide_back_button=true',
    'skip_purchase_success=true',
    ...(returnKey ? [`utm_content=${encodeURIComponent(returnKey)}`] : []),
  ]
  return `${CHECKOUT_ORIGIN}/${link}/${encodeURIComponent(id)}?${query.join('&')}`
}

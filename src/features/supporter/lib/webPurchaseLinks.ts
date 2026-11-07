import { appVariant, type AppVariant } from '@/lib/appVariant'
import type { ReturnKey } from '@/lib/purchaseReturn'
import { toRevenueCatAppUserId } from '@/lib/serverAccount/revenueCatLink'

const WEB_PURCHASE_LINK = /^(?:sandbox\/)?(?!sandbox$)[A-Za-z0-9_-]+$/

const isSandboxLink = (link: string): boolean => link.startsWith('sandbox/')

const RETURN_KEYS = { beta: true, local: true } satisfies Record<
  ReturnKey,
  true
>

const CHECKOUT_ORIGIN = 'https://pay.rev.cat'

export const isWebPurchaseLink = (value: unknown): value is string =>
  typeof value === 'string' && WEB_PURCHASE_LINK.test(value)

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

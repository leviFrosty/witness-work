import { PURCHASE_RETURN_PATH } from '@/lib/purchaseReturn'

/**
 * Screens only the web app opens by URL, added to the navigation's linking
 * config. Web checkout returns to `/supporter/thank-you` (docs/web-purchases.md
 * "The return page").
 */
export const webLinkingScreens = {
  'Web Purchase Return': PURCHASE_RETURN_PATH.slice(1),
} as const

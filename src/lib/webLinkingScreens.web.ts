import { PURCHASE_RETURN_PATH } from '@/lib/purchaseReturn'

/**
 * Screens only the web app opens by URL, or whose params must never reach the
 * address, added to the navigation's linking config:
 *
 * - Web checkout returns to `/supporter/thank-you` (docs/web-purchases.md "The
 *   return page").
 * - Buddy Invite's `link` carries the invite's secret. React Navigation writes
 *   the params of a screen with no path into the address's query, and so into
 *   the tab's history; this path writes none (a param that stringifies to
 *   `undefined` is left out). The web entry sends `/buddies/invite` itself to
 *   Home (`scrubLaunchAddress.web.ts`), so reloading never opens it without its
 *   link.
 */
export const webLinkingScreens = {
  'Web Purchase Return': PURCHASE_RETURN_PATH.slice(1),
  'Buddy Invite': {
    path: 'buddies/invite',
    stringify: { link: () => undefined as unknown as string },
  },
} as const

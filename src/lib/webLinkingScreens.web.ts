import { PURCHASE_RETURN_PATH } from '@/lib/purchaseReturn'

/** A param that stringifies to `undefined` is left out of the address. */
const leftOut = (..._params: unknown[]) => undefined as unknown as string

/**
 * Screens only the web app opens by URL, or whose params must never reach the
 * address, added to the navigation's linking config:
 *
 * - Web checkout returns to `/supporter/thank-you` (docs/web-purchases.md "The
 *   return page").
 * - Buddy Invite's `link` carries the invite's secret. React Navigation writes
 *   the params of a screen with no path into the address's query, and so into
 *   the tab's history; this path writes none. The web entry sends
 *   `/buddies/invite` itself to Home (`scrubLaunchAddress.web.ts`), so
 *   reloading never opens it without its link.
 * - Scribe AI's Terms sheet carries where to go next (`next`) as an object, which
 *   an address can only spell `next=[object Object]`. The conversation's
 *   one-shot text and pages are the User's own words and photos. None of them
 *   belongs in the address. A reload on the sheet has no `next`, and the sheet
 *   then just closes.
 */
export const webLinkingScreens = {
  'Web Purchase Return': PURCHASE_RETURN_PATH.slice(1),
  'Buddy Invite': {
    path: 'buddies/invite',
    stringify: { link: leftOut },
  },
  ScribeConsent: {
    path: 'ScribeConsent',
    stringify: { next: leftOut },
  },
} as const

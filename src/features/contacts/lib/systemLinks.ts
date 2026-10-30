import { isOwnAppLink } from '@/constants/appLinks'
import { isContactShareLink } from '@/features/contacts/lib/contactShareLink'

/**
 * Schemes the host app hands off to the system instead of handling itself. iOS
 * routes widget `Link(destination:)` taps through the host app first when the
 * host declares any custom URL scheme, so without the hand-off, the contacts
 * widget's call, text, and directions buttons would just open WitnessWork.
 */
const FORWARDED_SCHEMES = ['tel:', 'sms:', 'mailto:', 'http:', 'https:']

/**
 * Whether an incoming URL belongs to the system rather than the app. Never one
 * of the app's own links on any of its hosts (contact shares, Buddies invites,
 * handoffs; `isOwnAppLink`), which open in the app, where their own listeners
 * handle them: handing one off bounces iOS to Safari, and on Android, where the
 * app owns the link, opens the app again, which hands it off again.
 */
export function shouldForwardToSystem(url: string): boolean {
  return (
    FORWARDED_SCHEMES.some((scheme) => url.startsWith(scheme)) &&
    !isOwnAppLink(url) &&
    !isContactShareLink(url)
  )
}

import {
  appLinkBase,
  appLinkBasePattern,
  appLinkFragment,
} from '@/constants/appLinks'
import { fromB64u, toB64u } from '@/features/buddies/lib/bytes'

/**
 * `https://ww-proxy.leviwilkerson.com/b#1<b64u(secret)>`, or
 * `https://witnesswork.app/buddies/invite#1…` once new links move to the apex
 * (`CREATE_LINKS_ON_NEW_HOST`). Everything after `#` stays on the device —
 * browsers and link previews never send it to a server — and the path carries
 * nothing identifying. The leading `1` is the link version.
 */
const SECRET = '1([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])'
const INVITE_FRAGMENT = new RegExp(`^${SECRET}`)
const INVITE_LINK_IN_TEXT = new RegExp(
  `${appLinkBasePattern('buddyInvite')}#${SECRET}`
)

export function buildInviteLink(secret: Uint8Array): string {
  if (secret.length !== 16) throw new Error('Invite secret must be 16 bytes')
  return `${appLinkBase('buddyInvite')}#1${toB64u(secret)}`
}

function decodeSecret(encoded: string | undefined): Uint8Array | null {
  if (!encoded) return null
  try {
    const secret = fromB64u(encoded)
    return secret.length === 16 ? secret : null
  } catch {
    return null
  }
}

/** Finds an invite link anywhere in `text` (e.g. a pasted message). */
export function parseInviteSecret(text: string): Uint8Array | null {
  return decodeSecret(INVITE_LINK_IN_TEXT.exec(text)?.[1])
}

/**
 * Whether `url`, all of it apart from surrounding space, is an invite link: an
 * opened or scanned link must be one from its start, not merely contain one.
 */
export function isInviteLink(url: string): boolean {
  const fragment = appLinkFragment(url, 'buddyInvite')
  return (
    fragment !== null &&
    decodeSecret(INVITE_FRAGMENT.exec(fragment)?.[1]) !== null
  )
}

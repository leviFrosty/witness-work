import {
  appLinkBase,
  appLinkBasePattern,
  appLinkFragment,
} from '@/constants/appLinks'
import { fromB64u, toB64u } from '@/features/buddies/lib/bytes'

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

export function parseInviteSecret(text: string): Uint8Array | null {
  return decodeSecret(INVITE_LINK_IN_TEXT.exec(text)?.[1])
}

export function isInviteLink(url: string): boolean {
  const fragment = appLinkFragment(url, 'buddyInvite')
  return (
    fragment !== null &&
    decodeSecret(INVITE_FRAGMENT.exec(fragment)?.[1]) !== null
  )
}

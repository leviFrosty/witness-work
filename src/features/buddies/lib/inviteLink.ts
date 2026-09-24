import { fromB64u, toB64u } from '@/features/buddies/lib/bytes'

/**
 * `https://ww-proxy.leviwilkerson.com/b#1<b64u(secret)>`. Everything after `#`
 * stays on the device — browsers and link previews never send it to a server —
 * and the path carries nothing identifying. The leading `1` is the link
 * version.
 */
const INVITE_LINK_PREFIX = 'https://ww-proxy.leviwilkerson.com/b#1'
const INVITE_LINK_PATTERN =
  /https:\/\/ww-proxy\.leviwilkerson\.com\/b\/?#1([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/

export function buildInviteLink(secret: Uint8Array): string {
  if (secret.length !== 16) throw new Error('Invite secret must be 16 bytes')
  return `${INVITE_LINK_PREFIX}${toB64u(secret)}`
}

/** Finds an invite link anywhere in `text` (e.g. a pasted message). */
export function parseInviteSecret(text: string): Uint8Array | null {
  const match = INVITE_LINK_PATTERN.exec(text)
  if (!match) return null
  try {
    const secret = fromB64u(match[1])
    return secret.length === 16 ? secret : null
  } catch {
    return null
  }
}

export function isInviteLink(url: string): boolean {
  return parseInviteSecret(url) !== null
}

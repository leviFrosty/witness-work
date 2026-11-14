import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { fromB64u, toB64u, utf8 } from '@/lib/bytes'
import type { AppVariant } from '@/lib/toAppVariant'

const EMPTY = new Uint8Array(0)

const derive = (ikm: Uint8Array, info: string) =>
  hkdf(sha256, ikm, EMPTY, utf8(info), 32)

const ID_22 = /^[A-Za-z0-9_-]{22}$/

export const SCOPE_ID_PATTERN = ID_22

export const LINK_ID_PATTERN = ID_22

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const ANY_CASE_UUID = new RegExp(UUID_PATTERN.source, 'i')

export const isScopeId = (value: unknown): value is string =>
  typeof value === 'string' && SCOPE_ID_PATTERN.test(value)

export const isLinkId = (value: unknown): value is string =>
  typeof value === 'string' && LINK_ID_PATTERN.test(value)

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && ANY_CASE_UUID.test(value)

export function scopeIdForStreet(streetId: string): string {
  if (!isUuid(streetId)) throw new Error('Street id must be a UUID')
  const hex = streetId.replace(/-/g, '')
  return toB64u(
    Uint8Array.from({ length: 16 }, (_, index) =>
      parseInt(hex.slice(index * 2, index * 2 + 2), 16)
    )
  )
}

export function streetIdForScope(scopeId: string): string | null {
  if (!isScopeId(scopeId)) return null
  const bytes = fromB64u(scopeId)
  if (toB64u(bytes) !== scopeId) return null
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const sortedScopeIds = (scopeIds: readonly string[]) =>
  [...new Set(scopeIds)].sort()

const scopeKeys = new WeakMap<Uint8Array, Map<string, Uint8Array>>()

export function deriveScopeKey(
  spaceKey: Uint8Array,
  scopeId: string
): Uint8Array {
  if (spaceKey.length !== 32) throw new Error('Space key must be 32 bytes')
  if (!isScopeId(scopeId)) throw new Error('Invalid scope id')
  let keys = scopeKeys.get(spaceKey)
  if (!keys) {
    keys = new Map()
    scopeKeys.set(spaceKey, keys)
  }
  let key = keys.get(scopeId)
  if (!key) {
    key = derive(spaceKey, `ww-spaces/v1/scope-record|${scopeId}`)
    keys.set(scopeId, key)
  }
  return key
}

export const newLinkId = (randomBytes: (length: number) => Uint8Array) =>
  toB64u(randomBytes(16))

export function deriveLinkSecret(
  rootSeed: Uint8Array,
  spaceId: string,
  linkId: string
): Uint8Array {
  if (rootSeed.length !== 32) throw new Error('Root seed must be 32 bytes')
  if (!ID_22.test(spaceId)) throw new Error('Invalid space id')
  if (!isLinkId(linkId)) throw new Error('Invalid link id')
  return derive(rootSeed, `ww-spaces/v1/link|${spaceId}|${linkId}`)
}

export type LinkCredentials = {
  linkToken: string

  verifier: string

  linkKey: Uint8Array
}

export function linkVerifier(linkToken: string): string {
  return toB64u(sha256(fromB64u(linkToken)))
}

export function deriveLinkCredentials(linkSecret: Uint8Array): LinkCredentials {
  if (linkSecret.length !== 32) throw new Error('Link secret must be 32 bytes')
  const token = derive(linkSecret, 'ww-spaces/v1/link-token')
  return {
    linkToken: toB64u(token),
    verifier: toB64u(sha256(token)),
    linkKey: derive(linkSecret, 'ww-spaces/v1/link-key'),
  }
}

export const GUEST_LINK_ORIGINS: Record<AppVariant, string> = {
  production: 'https://app.witnesswork.app',
  beta: 'https://beta.app.witnesswork.app',
  development: 'http://localhost:8081',
}

export const GUEST_LINK_PATH = '/territories/guest'

export const GUEST_LINK_VERSION = 'v1'

export type GuestLink = {
  spaceId: string
  linkId: string

  linkSecret: Uint8Array
}

export function guestLinkFragment({
  spaceId,
  linkId,
  linkSecret,
}: GuestLink): string {
  if (!ID_22.test(spaceId)) throw new Error('Invalid space id')
  if (!isLinkId(linkId)) throw new Error('Invalid link id')
  if (linkSecret.length !== 32) throw new Error('Link secret must be 32 bytes')
  return `${GUEST_LINK_VERSION}.${spaceId}.${linkId}.${toB64u(linkSecret)}`
}

export const guestLinkUrl = (variant: AppVariant, link: GuestLink) =>
  `${GUEST_LINK_ORIGINS[variant]}${GUEST_LINK_PATH}#${guestLinkFragment(link)}`

export function parseGuestLinkFragment(fragment: string): GuestLink | null {
  const parts = fragment.replace(/^#/, '').split('.')
  if (parts.length !== 4 || parts[0] !== GUEST_LINK_VERSION) return null
  const [, spaceId, linkId, secret] = parts
  if (!ID_22.test(spaceId) || !isLinkId(linkId)) return null
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return null
  const linkSecret = fromB64u(secret)
  if (toB64u(linkSecret) !== secret) return null
  return { spaceId, linkId, linkSecret }
}

export function parseGuestLinkUrl(
  url: string
): (GuestLink & { variant: AppVariant }) | null {
  const match = /^(https?:\/\/[^/?#]+)([^?#]*)(?:\?[^#]*)?#(.*)$/.exec(
    url.trim()
  )
  if (!match) return null
  const [, origin, path, fragment] = match
  const variant = (Object.keys(GUEST_LINK_ORIGINS) as AppVariant[]).find(
    (name) => GUEST_LINK_ORIGINS[name] === origin.toLowerCase()
  )
  if (!variant || path.replace(/\/$/, '') !== GUEST_LINK_PATH) return null
  const link = parseGuestLinkFragment(fragment)
  return link && { ...link, variant }
}

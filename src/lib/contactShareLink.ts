import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate'
import { Address, Contact } from '../types/contact'
import { Conversation } from '../types/conversation'
import { CustomFieldDefinition } from '../types/customField'
import { ContactImportData } from './contactImport'
import { logger } from './logger'

/**
 * Contact-share universal link encoding.
 *
 * The app produces URLs like:
 *
 * https://ww-proxy.leviwilkerson.com/c/<gzip+base64url(contact json)>
 *
 * Ww-proxy serves the AASA file that registers this path prefix with iOS.
 * Tapping the URL on a device with WitnessWork installed opens the app
 * directly; otherwise a fallback HTML page with an App Store CTA renders.
 */

// --- Constants (no magic numbers) -------------------------------------------

export const CONTACT_SHARE_LINK = {
  ORIGIN_PROD: 'https://ww-proxy.leviwilkerson.com',
  /**
   * Dev builds intercept the same prod domain (AASA lists both bundle IDs), so
   * there is no separate dev origin — shared links open whichever build is
   * installed on the device.
   */
  PATH_PREFIX: '/c/',

  /**
   * Custom-scheme fallback used by the ww-proxy fallback page's "Open app"
   * link, and as a reliable entry point on the iOS simulator where Universal
   * Links are flaky even with a valid AASA. Format:
   * witnesswork://import-contact/<payload>
   */
  SCHEME_HOST: 'import-contact',

  /**
   * Hard cap on the final URL length. 4 KB preserves iMessage rich-link
   * previews and keeps cross-messenger reliability (WhatsApp/Signal get flaky
   * past ~2 KB but iMessage — our primary target — is fine to 4 KB).
   */
  MAX_URL_BYTES: 4_000,

  /**
   * Safety cap on the number of conversations bundled into a shared link.
   * Prevents pathologically large payloads even if they'd theoretically fit
   * under MAX_URL_BYTES. Users with more will still share their full
   * conversation history — we just pick the most recent ones.
   */
  MAX_CONVERSATIONS: 50,
} as const

// --- Strip policies (type-safe field handling) ------------------------------

/**
 * `always`: field is always included (required by the import format).
 * `optional`: field is included only when non-empty. `omit`: field is
 * device-local state and never travels with a share.
 *
 * Using `Record<keyof T, FieldPolicy>` forces every key of the source type to
 * be assigned a policy — if someone adds a new field to `Contact` /
 * `Conversation` / `Address` / `FollowUp` without updating the policy here,
 * TypeScript will error at the object literal below.
 */
type FieldPolicy = 'always' | 'optional' | 'omit'

const CONTACT_POLICY: Record<keyof Contact, FieldPolicy> = {
  id: 'always',
  name: 'always',
  createdAt: 'always',
  phone: 'optional',
  phoneRegionCode: 'optional',
  email: 'optional',
  gender: 'optional',
  address: 'optional',
  coordinate: 'optional',
  customFields: 'optional',
  // Device-local state that should not flow between devices:
  userDraggedCoordinate: 'omit',
  dismissedUntil: 'omit',
  dismissedNotificationId: 'omit',
  isFavorite: 'omit',
  // Sync bookkeeping — only meaningful inside the iCloud sync payload, not in
  // a universal-link share intended for another person.
  updatedAt: 'omit',
  // Avatar holds either an emoji or a per-device image URI; the URI would be a
  // dead path on the recipient's device, so the whole field is dropped from
  // shares. The recipient picks their own avatar.
  avatar: 'omit',
  // Cosmetic, paired with the omitted avatar — the recipient's theme decides.
  avatarBackground: 'omit',
  // Cosmetic chrome for the recipient's Contact Details screen — let their
  // own theme/accent decide rather than imposing the sender's choice.
  heroBackground: 'omit',
  // Capture-time / file-size / resolution metadata of the avatar image is
  // device-local. The recipient gets a fresh avatar (or none) and would
  // recompute their own meta if they pick one.
  avatarMeta: 'omit',
}

const ADDRESS_POLICY: Record<keyof Address, FieldPolicy> = {
  line1: 'optional',
  line2: 'optional',
  city: 'optional',
  state: 'optional',
  zip: 'optional',
  country: 'optional',
}

type FollowUp = NonNullable<Conversation['followUp']>

const FOLLOW_UP_POLICY: Record<keyof FollowUp, FieldPolicy> = {
  date: 'always',
  notifyMe: 'always',
  topic: 'optional',
  notifications: 'optional',
  dismissed: 'optional',
}

const CONVERSATION_POLICY: Record<keyof Conversation, FieldPolicy> = {
  id: 'always',
  contact: 'always',
  date: 'always',
  isBibleStudy: 'always',
  note: 'optional',
  followUp: 'optional',
  notAtHome: 'optional',
  updatedAt: 'omit',
}

// --- Stripping --------------------------------------------------------------

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0
  }
  return false
}

function stripByPolicy<T extends object>(
  source: T,
  policy: Record<keyof T, FieldPolicy>
): Partial<T> {
  const out: Partial<T> = {}
  ;(Object.keys(policy) as (keyof T)[]).forEach((key) => {
    const rule = policy[key]
    if (rule === 'omit') return
    const value = source[key]
    if (rule === 'optional' && isEmpty(value)) return
    out[key] = value
  })
  return out
}

function stripAddress(address: Address | undefined): Address | undefined {
  if (!address) return undefined
  const stripped = stripByPolicy(address, ADDRESS_POLICY)
  return isEmpty(stripped) ? undefined : (stripped as Address)
}

function stripContact(contact: Contact): Partial<Contact> {
  const stripped = stripByPolicy(contact, CONTACT_POLICY)
  const strippedAddress = stripAddress(stripped.address)
  if (strippedAddress) {
    stripped.address = strippedAddress
  } else {
    delete stripped.address
  }
  return stripped
}

function stripFollowUp(
  followUp: FollowUp | undefined
): Partial<FollowUp> | undefined {
  if (!followUp) return undefined
  return stripByPolicy(followUp, FOLLOW_UP_POLICY)
}

function stripConversation(conversation: Conversation): Partial<Conversation> {
  const stripped = stripByPolicy(conversation, CONVERSATION_POLICY)
  const strippedFollowUp = stripFollowUp(stripped.followUp)
  if (strippedFollowUp) {
    stripped.followUp = strippedFollowUp as Conversation['followUp']
  } else {
    delete stripped.followUp
  }
  return stripped
}

/**
 * Picks the subset of `defs` whose ids appear as keys in
 * `contact.customFields`, so the share payload only carries the labels the
 * recipient actually needs to render. `order` / `createdAt` / `archived` are
 * dropped — the recipient orders the def at the end of their local list when it
 * lands, and sender-side archive state would only confuse the merge.
 * `updatedAt` is preserved so future LWW merges (if both ends have the def)
 * work correctly.
 */
function pickReferencedDefs(
  contact: Partial<Contact>,
  defs: CustomFieldDefinition[]
): CustomFieldDefinition[] {
  const fields = contact.customFields
  if (!fields) return []
  const referenced = new Set(Object.keys(fields))
  if (referenced.size === 0) return []
  return defs
    .filter((d) => referenced.has(d.id))
    .map((d) => ({
      id: d.id,
      label: d.label,
      // Order will be reassigned on import (slotted at end of recipient's
      // active list). Keep the field in the type but normalize the value.
      order: 0,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      ...(d.type ? { type: d.type } : {}),
    }))
}

// --- Compression / encoding -------------------------------------------------

function u8ToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  // Hermes / RN provide btoa globally.
  return globalThis
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlToU8(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((value.length + 3) % 4)
  const binary = globalThis.atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function encodePayload(data: ContactImportData): string {
  const json = JSON.stringify(data)
  const compressed = gzipSync(strToU8(json))
  return u8ToBase64Url(compressed)
}

function decodePayload(payload: string): unknown {
  const compressed = base64UrlToU8(payload)
  const json = strFromU8(gunzipSync(compressed))
  return JSON.parse(json)
}

// --- Public API -------------------------------------------------------------

/**
 * Thrown by `buildContactShareLink` when the encoded payload exceeds
 * `MAX_URL_BYTES` even after dropping every conversation. Callers should catch
 * this specifically to surface a "contact too large to link" UX, rather than
 * silently falling back to file export — file export only works for recipients
 * who already have the app, so the user needs to know what's happening.
 */
export class ContactShareLinkTooLargeError extends Error {
  readonly bareUrlBytes: number
  readonly maxUrlBytes: number
  constructor(bareUrlBytes: number, maxUrlBytes: number) {
    super(
      `Contact exceeds URL size cap (${bareUrlBytes} > ${maxUrlBytes}) even with zero conversations.`
    )
    this.name = 'ContactShareLinkTooLargeError'
    this.bareUrlBytes = bareUrlBytes
    this.maxUrlBytes = maxUrlBytes
  }
}

export type ContactShareLinkResult = {
  url: string
  /**
   * Number of conversations actually included after trimming. When less than
   * `conversations.length` passed to `buildContactShareLink`, the oldest
   * entries were dropped to fit under the URL size cap.
   */
  includedConversations: number
  /**
   * True when the payload had to be trimmed to fit — callers may want to
   * surface a notice to the user.
   */
  trimmed: boolean
}

/**
 * Build a universal link for a contact + its conversations. Conversations are
 * sorted newest-first and trimmed as needed to keep the final URL under
 * `MAX_URL_BYTES` (post-compression). Throws if even the bare contact (zero
 * conversations) exceeds the cap — that means the contact itself is
 * pathologically large (custom fields abuse, etc.) and should go through the
 * file-export flow instead.
 *
 * `customFieldDefs` is the sender's full def list; only the defs whose ids are
 * actually referenced by `contact.customFields` are embedded in the payload,
 * stripped of fields the recipient doesn't need (`order`, `archived`,
 * `createdAt`). Without these defs the recipient would render UUID keys because
 * the labels live in the sender's local store.
 */
export function buildContactShareLink(
  contact: Contact,
  conversations: Conversation[],
  customFieldDefs: CustomFieldDefinition[] = [],
  now: Date = new Date()
): ContactShareLinkResult {
  const baseUrl = `${CONTACT_SHARE_LINK.ORIGIN_PROD}${CONTACT_SHARE_LINK.PATH_PREFIX}`

  const sortedNewestFirst = [...conversations].sort((a, b) => {
    const at = new Date(a.date).getTime()
    const bt = new Date(b.date).getTime()
    return bt - at
  })

  const hardLimited = sortedNewestFirst.slice(
    0,
    CONTACT_SHARE_LINK.MAX_CONVERSATIONS
  )

  const strippedContact = stripContact(contact) as Contact

  // Pick only the defs the contact actually references. Empty when the
  // contact has no custom fields — keeps existing share links byte-for-byte
  // unchanged for users who never used the feature.
  const referencedDefs = pickReferencedDefs(strippedContact, customFieldDefs)

  const tryBuild = (convs: Conversation[]): string => {
    const importData: ContactImportData = {
      version: '1.0',
      type: 'witnesswork-contact',
      exportedAt: now.toISOString(),
      contact: strippedContact,
      ...(convs.length > 0
        ? {
            conversations: convs.map(
              (c) => stripConversation(c) as Conversation
            ),
          }
        : {}),
      ...(referencedDefs.length > 0 ? { customFieldDefs: referencedDefs } : {}),
    }
    return baseUrl + encodePayload(importData)
  }

  // Fast path: does the whole thing fit?
  const url = tryBuild(hardLimited)
  if (url.length <= CONTACT_SHARE_LINK.MAX_URL_BYTES) {
    return {
      url,
      includedConversations: hardLimited.length,
      trimmed: hardLimited.length < conversations.length,
    }
  }

  // Binary-search the largest conversation count that still fits. This is
  // cheaper than re-encoding on every single drop when the user has dozens
  // of conversations.
  let low = 0
  let high = hardLimited.length
  let best = 0
  let bestUrl = ''
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const candidateUrl = tryBuild(hardLimited.slice(0, mid))
    if (candidateUrl.length <= CONTACT_SHARE_LINK.MAX_URL_BYTES) {
      best = mid
      bestUrl = candidateUrl
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  if (bestUrl === '') {
    const bareUrl = tryBuild([])
    throw new ContactShareLinkTooLargeError(
      bareUrl.length,
      CONTACT_SHARE_LINK.MAX_URL_BYTES
    )
  }

  return {
    url: bestUrl,
    includedConversations: best,
    trimmed: true,
  }
}

/**
 * Parse an incoming universal link. Returns the decoded import data, or `null`
 * if the URL does not look like a contact share link. Validation of the inner
 * shape is left to `validateContactImport` so we reuse the existing
 * invalid-file messaging.
 */
/**
 * Extracts the encoded payload from either the universal-link form
 * (https://ww-proxy.leviwilkerson.com/c/<payload>) or the custom-scheme
 * fallback form (witnesswork://import-contact/<payload>). Returns null if the
 * URL matches neither.
 */
function extractPayload(url: string): string | null {
  try {
    const parsed = new URL(url)
    const expected = new URL(CONTACT_SHARE_LINK.ORIGIN_PROD)

    // https universal link
    if (
      parsed.protocol === expected.protocol &&
      parsed.hostname === expected.hostname &&
      parsed.pathname.startsWith(CONTACT_SHARE_LINK.PATH_PREFIX)
    ) {
      const payload = parsed.pathname.slice(
        CONTACT_SHARE_LINK.PATH_PREFIX.length
      )
      return payload || null
    }

    // witnesswork://import-contact/<payload>
    if (
      parsed.protocol === 'witnesswork:' &&
      parsed.hostname === CONTACT_SHARE_LINK.SCHEME_HOST
    ) {
      // URL parses `witnesswork://import-contact/foo` with pathname = '/foo'
      const payload = parsed.pathname.replace(/^\//, '')
      return payload || null
    }

    return null
  } catch (error) {
    logger.log('[contactShareLink.extract] URL parse failed:', {
      input: url,
      error: String(error),
    })
    return null
  }
}

export function parseContactShareLink(url: string): unknown | null {
  const payload = extractPayload(url)
  logger.log('[contactShareLink.parse]', {
    input: url,
    payloadLength: payload?.length ?? 0,
  })
  if (!payload) return null
  try {
    const decoded = decodePayload(payload)
    logger.log('[contactShareLink.parse] decoded type =', typeof decoded)
    return decoded
  } catch (error) {
    logger.error('[contactShareLink.parse] decode error:', error)
    return null
  }
}

export function isContactShareLink(url: string): boolean {
  const payload = extractPayload(url)
  if (!payload) {
    logger.log('[contactShareLink.isShareLink] no match:', { input: url })
    return false
  }
  return true
}

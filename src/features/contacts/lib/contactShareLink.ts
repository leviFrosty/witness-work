import { Gunzip, gzipSync, strToU8, strFromU8 } from 'fflate'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { CustomFieldDefinition } from '@/types/customField'
import {
  buildContactShareData,
  CONTACT_SHARE_LIMITS,
  ContactImportData,
  newestFirst,
} from '@/features/contacts/lib/contactShareFormat'
import { logger } from '@/lib/logger'

/**
 * Contact-share universal link encoding.
 *
 * The app produces URLs like:
 *
 * https://ww-proxy.leviwilkerson.com/c#<gzip+base64url(contact json)>
 *
 * The payload rides in the URL fragment, which never leaves the device: link
 * previews and the fallback page only ever request the bare `/c`, so the
 * contact stays out of ww-proxy's request logs and Sentry.
 *
 * Ww-proxy serves the AASA file that registers these URLs with iOS. Tapping the
 * URL on a device with WitnessWork installed opens the app directly; otherwise
 * a fallback HTML page with an App Store CTA renders.
 */

// --- Constants (no magic numbers) -------------------------------------------

export const CONTACT_SHARE_LINK = {
  /**
   * Dev builds intercept the same prod domain (AASA lists both bundle IDs), so
   * there is no separate dev origin — shared links open whichever build is
   * installed on the device.
   */
  ORIGIN_PROD: 'https://ww-proxy.leviwilkerson.com',

  /** The payload goes in the fragment: `/c#<payload>`. */
  PATH: '/c',

  /**
   * Links shared by older app versions carried the payload in the path
   * (`/c/<payload>`). Still parsed so already-sent links import.
   */
  LEGACY_PATH_PREFIX: '/c/',

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

/**
 * Compressed bytes inflated per step. Deflate expands at most about 1,032×, so
 * one step can overshoot the output limit by about 1 MB at most before the
 * check stops it.
 */
const INFLATE_STEP_BYTES = 1024

/**
 * Gunzips `compressed`, throwing as soon as the output passes `maxBytes`.
 * Streams in small steps instead of trusting the size gzip declares, so a
 * crafted payload can't make the app allocate more than the limit.
 */
export function gunzipWithLimit(compressed: Uint8Array, maxBytes: number) {
  const chunks: Uint8Array[] = []
  let size = 0
  const stream = new Gunzip((chunk) => {
    size += chunk.length
    if (size > maxBytes) throw new Error('Contact share payload too large')
    chunks.push(chunk)
  })
  for (let at = 0; at < compressed.length; at += INFLATE_STEP_BYTES) {
    const end = Math.min(at + INFLATE_STEP_BYTES, compressed.length)
    stream.push(compressed.subarray(at, end), end === compressed.length)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function decodePayload(payload: string): unknown {
  if (payload.length > CONTACT_SHARE_LIMITS.MAX_LINK_PAYLOAD_CHARS) {
    throw new Error('Contact share link too long')
  }
  const compressed = base64UrlToU8(payload)
  const json = strFromU8(
    gunzipWithLimit(compressed, CONTACT_SHARE_LIMITS.MAX_LINK_JSON_BYTES)
  )
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
 * actually referenced by `contact.customFields` are embedded in the payload.
 * Without these defs the recipient would render UUID keys because the labels
 * live in the sender's local store. What each record carries is set by
 * `contactShareFormat.ts`, shared with the file export.
 */
export function buildContactShareLink(
  contact: Contact,
  conversations: Visit[],
  customFieldDefs: CustomFieldDefinition[] = [],
  now: Date = new Date()
): ContactShareLinkResult {
  const baseUrl = `${CONTACT_SHARE_LINK.ORIGIN_PROD}${CONTACT_SHARE_LINK.PATH}#`

  const hardLimited = newestFirst(conversations).slice(
    0,
    CONTACT_SHARE_LINK.MAX_CONVERSATIONS
  )

  const tryBuild = (convs: Visit[]): string =>
    baseUrl +
    encodePayload(buildContactShareData(contact, convs, customFieldDefs, now))

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
 * Extracts the encoded payload from the universal-link form
 * (https://ww-proxy.leviwilkerson.com/c#<payload>), the legacy path form
 * (https://ww-proxy.leviwilkerson.com/c/<payload>), or the custom-scheme
 * fallback form (witnesswork://import-contact/<payload>). Returns null if the
 * URL matches none of them.
 */
function extractPayload(url: string): string | null {
  try {
    const parsed = new URL(url)
    const expected = new URL(CONTACT_SHARE_LINK.ORIGIN_PROD)

    if (
      parsed.protocol === expected.protocol &&
      parsed.hostname === expected.hostname
    ) {
      // https://ww-proxy.leviwilkerson.com/c#<payload>
      if (parsed.pathname === CONTACT_SHARE_LINK.PATH) {
        return parsed.hash.slice(1) || null
      }
      // https://ww-proxy.leviwilkerson.com/c/<payload>
      if (parsed.pathname.startsWith(CONTACT_SHARE_LINK.LEGACY_PATH_PREFIX)) {
        const payload = parsed.pathname.slice(
          CONTACT_SHARE_LINK.LEGACY_PATH_PREFIX.length
        )
        return payload || null
      }
      return null
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

/**
 * Decodes an incoming share link's payload, or returns `null` if the URL is not
 * a contact share link, is over `CONTACT_SHARE_LIMITS`, or doesn't decode. The
 * result is untrusted: imports validate it with `importContactFromLink`.
 */
export function parseContactShareLink(url: string): unknown | null {
  const payload = extractPayload(url)
  logger.log('[contactShareLink.parse]', {
    payloadLength: payload?.length ?? 0,
  })
  if (!payload) return null
  try {
    return decodePayload(payload)
  } catch (error) {
    // A malformed link is bad input, not an app error.
    logger.warn('[contactShareLink.parse] decode failed:', String(error))
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

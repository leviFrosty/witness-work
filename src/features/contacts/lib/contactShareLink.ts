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
import { redactLink } from '@/lib/redactLink'

export const CONTACT_SHARE_LINK = {
  ORIGIN_PROD: 'https://ww-proxy.leviwilkerson.com',

  PATH: '/c',

  LEGACY_PATH_PREFIX: '/c/',

  SCHEME_HOST: 'import-contact',

  MAX_URL_BYTES: 4_000,

  MAX_CONVERSATIONS: 50,
} as const

function u8ToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

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

const INFLATE_STEP_BYTES = 1024

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

  includedConversations: number

  trimmed: boolean
}

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
    encodePayload(
      buildContactShareData(contact, convs, customFieldDefs, now, {
        richNotes: false,
      })
    )

  const url = tryBuild(hardLimited)
  if (url.length <= CONTACT_SHARE_LINK.MAX_URL_BYTES) {
    return {
      url,
      includedConversations: hardLimited.length,
      trimmed: hardLimited.length < conversations.length,
    }
  }

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

function extractPayload(url: string): string | null {
  try {
    const parsed = new URL(url)
    const expected = new URL(CONTACT_SHARE_LINK.ORIGIN_PROD)

    if (
      parsed.protocol === expected.protocol &&
      parsed.hostname === expected.hostname
    ) {
      if (parsed.pathname === CONTACT_SHARE_LINK.PATH) {
        return parsed.hash.slice(1) || null
      }

      if (parsed.pathname.startsWith(CONTACT_SHARE_LINK.LEGACY_PATH_PREFIX)) {
        const payload = parsed.pathname.slice(
          CONTACT_SHARE_LINK.LEGACY_PATH_PREFIX.length
        )
        return payload || null
      }
      return null
    }

    if (
      parsed.protocol === 'witnesswork:' &&
      parsed.hostname === CONTACT_SHARE_LINK.SCHEME_HOST
    ) {
      const payload = parsed.pathname.replace(/^\//, '')
      return payload || null
    }

    return null
  } catch (error) {
    logger.log('[contactShareLink.extract] URL parse failed:', {
      input: redactLink(url),
      error: String(error),
    })
    return null
  }
}

export function parseContactShareLink(url: string): unknown | null {
  const payload = extractPayload(url)
  logger.log('[contactShareLink.parse]', {
    payloadLength: payload?.length ?? 0,
  })
  if (!payload) return null
  try {
    return decodePayload(payload)
  } catch (error) {
    logger.warn('[contactShareLink.parse] decode failed:', String(error))
    return null
  }
}

export function isContactShareLink(url: string): boolean {
  const payload = extractPayload(url)
  if (!payload) {
    logger.log('[contactShareLink.isShareLink] no match:', {
      input: redactLink(url),
    })
    return false
  }
  return true
}

import { z } from 'zod'
import { base64ToBytes, bytesToBase64Url } from './crypto'

/**
 * OAuth access tokens for Google service accounts (Play Integrity, Firebase
 * Cloud Messaging), minted with the JWT-bearer grant (RFC 7523) and cached per
 * isolate, per key and scope, until shortly before they expire. Tokens never
 * leave memory: they are bearer credentials.
 */

export const PLAY_INTEGRITY_SCOPE = 'https://www.googleapis.com/auth/playintegrity'
export const FIREBASE_MESSAGING_SCOPE =
  'https://www.googleapis.com/auth/firebase.messaging'
/** Fixed, rather than read from the key file, so a key can't redirect the assertion. */
const TOKEN_URI = 'https://oauth2.googleapis.com/token'
const ASSERTION_LIFETIME_SECONDS = 3_600
const REFRESH_MARGIN_MS = 5 * 60_000

const serviceAccountSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
})

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
})

export interface GoogleAuthDependencies {
  fetch: typeof fetch
  now(): number
}

export class GoogleAuthError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause == null ? undefined : { cause: options.cause })
    this.name = 'GoogleAuthError'
  }
}

const encoder = new TextEncoder()

const encodeJson = (value: unknown): string =>
  bytesToBase64Url(encoder.encode(JSON.stringify(value)))

/** PKCS#8 PEM; tolerates keys pasted with literal `\n` sequences. */
const importServiceAccountKey = (pem: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(
      pem
        .replace(/\\n/g, '\n')
        .replace(/-----(?:BEGIN|END) [A-Z ]+-----/g, '')
        .replace(/\s+/g, '')
    ),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

export const createServiceAccountAssertion = async (
  account: z.infer<typeof serviceAccountSchema>,
  scope: string,
  nowMs: number
): Promise<string> => {
  const issuedAt = Math.floor(nowMs / 1000)
  const header = encodeJson({ alg: 'RS256', typ: 'JWT' })
  const claims = encodeJson({
    iss: account.client_email,
    scope,
    aud: TOKEN_URI,
    iat: issuedAt,
    exp: issuedAt + ASSERTION_LIFETIME_SECONDS,
  })
  const signingInput = `${header}.${claims}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    await importServiceAccountKey(account.private_key),
    encoder.encode(signingInput)
  )
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`
}

interface CachedToken {
  accessToken: string
  expiresAt: number
}

/** Keyed by scope and the service account JSON the token was minted for. */
const cached = new Map<string, CachedToken>()

const cacheKey = (serviceAccountJson: string, scope: string): string =>
  `${scope}\n${serviceAccountJson}`

/** Clears the isolate-level token cache (tests only). */
export const resetGoogleAuthState = (): void => {
  cached.clear()
}

/** Drops a token Google rejected, so the next call mints a new one. */
export const forgetGoogleAccessToken = (
  serviceAccountJson: string,
  scope: string,
  accessToken: string
): void => {
  const key = cacheKey(serviceAccountJson, scope)
  if (cached.get(key)?.accessToken === accessToken) cached.delete(key)
}

export const getGoogleAccessToken = async (
  serviceAccountJson: string,
  scope: string,
  dependencies: GoogleAuthDependencies
): Promise<string> => {
  const now = dependencies.now()
  const key = cacheKey(serviceAccountJson, scope)
  const hit = cached.get(key)
  if (hit && now < hit.expiresAt - REFRESH_MARGIN_MS) return hit.accessToken

  let account: z.infer<typeof serviceAccountSchema>
  try {
    account = serviceAccountSchema.parse(JSON.parse(serviceAccountJson))
  } catch (error) {
    throw new GoogleAuthError('Invalid Google service account', {
      cause: error,
    })
  }

  let assertion: string
  try {
    assertion = await createServiceAccountAssertion(account, scope, now)
  } catch (error) {
    throw new GoogleAuthError('Could not sign the service account assertion', {
      cause: error,
    })
  }

  const response = await dependencies.fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  })
  if (!response.ok) {
    throw new GoogleAuthError(
      `Google token exchange failed with HTTP ${response.status}`
    )
  }
  const parsed = tokenResponseSchema.safeParse(
    await response.json().catch(() => null)
  )
  if (!parsed.success) {
    throw new GoogleAuthError('Google token exchange returned no token')
  }
  cached.set(key, {
    accessToken: parsed.data.access_token,
    expiresAt: now + parsed.data.expires_in * 1000,
  })
  return parsed.data.access_token
}

export const getPlayIntegrityAccessToken = (
  serviceAccountJson: string,
  dependencies: GoogleAuthDependencies
): Promise<string> =>
  getGoogleAccessToken(serviceAccountJson, PLAY_INTEGRITY_SCOPE, dependencies)

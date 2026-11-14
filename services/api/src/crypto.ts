/**
 * Small WebCrypto helpers shared by the credit meter and App Attest. Workers
 * runtime — everything goes through `crypto.subtle` / global `crypto`.
 */

const encoder = new TextEncoder()

/** Lowercase hex of `bytes`. */
export const bytesToHex = (bytes: Uint8Array): string => {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

/** SHA-256 of raw bytes. */
export const sha256Bytes = async (data: Uint8Array): Promise<Uint8Array> => {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(digest)
}

/**
 * Canonical content hash for a notes string: lowercase hex SHA-256 of its UTF-8
 * bytes. MUST stay byte-for-byte identical to the witness-work client's
 * `notesContentHash` so credit metering and the client ledger agree on identity
 * (decisions 6 & 8).
 */
export const sha256Hex = async (text: string): Promise<string> =>
  bytesToHex(await sha256Bytes(encoder.encode(text)))

/**
 * Fixed-work string comparison for bounded secret tokens. Folding the lengths
 * into the result and always scanning the same 256 UTF-16 positions avoids the
 * early length/content exits that create a useful token timing oracle.
 */
export const timingSafeEqual = (a: string, b: string): boolean => {
  let diff = a.length ^ b.length
  for (let i = 0; i < 256; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0 && a.length <= 256 && b.length <= 256
}

/** Decodes standard or URL-safe base64 to bytes. */
export const base64ToBytes = (b64: string): Uint8Array => {
  const normalized = b64.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Encodes bytes to URL-safe base64 without padding. */
export const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** b64u SHA-256 of a string's UTF-8: what channels store for a key or a claim. */
export const sha256B64u = async (text: string): Promise<string> =>
  bytesToBase64Url(await sha256Bytes(encoder.encode(text)))

/**
 * b64u SHA-256 of a b64u token's bytes, what a channel's verifier holds for
 * the token (the handoff's and approval's `claimToken`, `browserToken`). A
 * token that isn't base64url hashes as no bytes, which no verifier matches.
 */
export const tokenDigest = async (token: string): Promise<string> => {
  let bytes: Uint8Array = new Uint8Array()
  if (/^[A-Za-z0-9_-]*$/.test(token) && token.length % 4 !== 1) {
    try {
      bytes = base64ToBytes(token)
    } catch {
      // Not base64url.
    }
  }
  return bytesToBase64Url(await sha256Bytes(bytes))
}

/** Cryptographically-random URL-safe token of `byteLength` random bytes. */
export const randomToken = (byteLength = 32): string =>
  bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))

/**
 * Imports an ES256 signing key from a PKCS#8 PEM (an Apple `.p8`, P-256).
 * Tolerates secrets stored with literal (or doubly escaped) `\n` sequences,
 * on one line, or without the PEM armor.
 */
export const importEs256PrivateKey = (pem: string): Promise<CryptoKey> => {
  const base64 = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(?:BEGIN|END) [A-Z ]+-----/g, '')
    // Base64 has no backslashes or whitespace.
    .replace(/[\s\\]+/g, '')
  return crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(base64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
}

const encodeJson = (value: unknown): string =>
  bytesToBase64Url(encoder.encode(JSON.stringify(value)))

/**
 * A compact ES256 JWS. WebCrypto's ECDSA signature is already the raw
 * `r || s` (IEEE P1363) that JOSE wants, so it's encoded as is.
 */
export const signEs256Jwt = async (
  key: CryptoKey,
  header: Record<string, unknown>,
  claims: Record<string, unknown>
): Promise<string> => {
  const signingInput = `${encodeJson({ alg: 'ES256', ...header })}.${encodeJson(claims)}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(signingInput)
  )
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`
}

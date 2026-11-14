import { base64ToBytes, bytesToBase64Url } from '../crypto'

/** A throwaway P-256 key pair, the private half as a `.p8`-style PEM. */
export const generateTestKey = async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair
  const pkcs8 = new Uint8Array(
    (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer
  )
  const base64 = bytesToBase64Url(pkcs8).replace(/-/g, '+').replace(/_/g, '/')
  const body = base64.match(/.{1,64}/g)!.join('\n')
  const pem = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`
  return { pem, publicKey: pair.publicKey }
}

const decoder = new TextDecoder()
const decodePart = (part: string) =>
  JSON.parse(decoder.decode(base64ToBytes(part))) as Record<string, unknown>

/** Splits a JWT and checks its ES256 signature against `publicKey`. */
export const verifyJwt = async (token: string, publicKey: CryptoKey) => {
  const [header, claims, signature] = token.split('.')
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    base64ToBytes(signature!),
    new TextEncoder().encode(`${header}.${claims}`)
  )
  return {
    valid,
    header: decodePart(header!),
    claims: decodePart(claims!),
    signatureBytes: base64ToBytes(signature!).length,
  }
}

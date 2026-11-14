// reflect-metadata must load before @peculiar/x509 (its tsyringe DI needs it).
import 'reflect-metadata'
import { X509Certificate, cryptoProvider } from '@peculiar/x509'
import { base64ToBytes, bytesToBase64Url, sha256Bytes } from '../crypto'
import { APPLE_APP_ATTEST_ROOT_CA_PEM } from './appleRootCa'
import { decodeAttestation, parseAuthData } from './decode'
import { extractAttestationNonce } from './der'
import { appIdRpHash, bytesEqual } from './appId'
import { AppAttestError } from './errors'

// @peculiar/x509 needs a WebCrypto implementation; the Workers global works.
cryptoProvider.set(crypto as Crypto)

const APPLE_APP_ATTEST_OID = '1.2.840.113635.100.8.2'
const ECDSA_P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

const decodeEnvironment = (
  aaguid: Uint8Array | undefined
): 'development' | 'production' => {
  if (!aaguid) return 'production'
  const text = new TextDecoder().decode(aaguid)
  return text.startsWith('appattestdevelop') ? 'development' : 'production'
}

export interface VerifyAttestationCryptographyArgs {
  /** Base64 of the CBOR attestation object from `DCAppAttestService.attestKey`. */
  attestation: string
  /** The key identifier returned by `generateKey`. */
  keyId: string
  /** Exact domain-separated client data whose SHA-256 was passed to `attestKey`. */
  clientData: string
  teamId: string
  /**
   * Bundle ids this Worker accepts. The attestation's rpIdHash must match
   * exactly one; the matched id is returned so the caller can bind the key to it.
   */
  bundleIds: readonly string[]
  /** When true, reject development-environment (`appattestdevelop`) attestations. */
  requireProduction?: boolean
}

export interface VerifiedAttestation {
  /** Base64url SPKI of the attested P-256 public key. */
  spki: string
  environment: 'development' | 'production'
  /** The accepted bundle id whose App ID (`<TeamID>.<BundleID>`) the key attested. */
  bundleId: string
}

const verify = async ({
  attestation,
  keyId,
  clientData,
  teamId,
  bundleIds,
  requireProduction = false,
}: VerifyAttestationCryptographyArgs): Promise<VerifiedAttestation> => {
  let att
  try {
    att = decodeAttestation(base64ToBytes(attestation))
  } catch (e) {
    throw new AppAttestError(`malformed attestation: ${(e as Error).message}`, {
      reason: 'attestation_invalid',
      cause: e,
    })
  }
  if (att.fmt !== 'apple-appattest') {
    throw new AppAttestError(`unexpected attestation format: ${att.fmt}`, {
      reason: 'attestation_invalid',
    })
  }
  if (att.attStmt.x5c.length < 2) {
    throw new AppAttestError('attestation chain too short', {
      reason: 'attestation_invalid',
    })
  }

  // 1. clientDataHash = SHA256(clientData); nonce = SHA256(authData || hash).
  const clientDataHash = await sha256Bytes(new TextEncoder().encode(clientData))
  const nonce = await sha256Bytes(concat(att.authData, clientDataHash))

  // 2. Validate the certificate chain leaf → intermediate → pinned Apple root.
  const leaf = new X509Certificate(att.attStmt.x5c[0])
  const intermediate = new X509Certificate(att.attStmt.x5c[1])
  const root = new X509Certificate(APPLE_APP_ATTEST_ROOT_CA_PEM)
  const now = new Date()
  const leafOk = await leaf.verify({ publicKey: intermediate, date: now })
  const intOk = await intermediate.verify({ publicKey: root, date: now })
  if (!leafOk || !intOk) {
    throw new AppAttestError('certificate chain does not validate to Apple root', {
      reason: 'attestation_invalid',
    })
  }

  // 3. The leaf's Apple extension must carry our computed nonce.
  const ext = leaf.getExtension(APPLE_APP_ATTEST_OID)
  if (!ext) {
    throw new AppAttestError('leaf missing App Attest nonce extension', {
      reason: 'attestation_invalid',
    })
  }
  const certNonce = extractAttestationNonce(new Uint8Array(ext.value))
  if (!bytesEqual(certNonce, nonce)) {
    throw new AppAttestError('attestation nonce mismatch', {
      reason: 'attestation_invalid',
    })
  }

  // 4. credentialId in authData must equal SHA256(public key) and the keyId.
  const spki = new Uint8Array(leaf.publicKey.rawData)
  const verifyKey = await crypto.subtle.importKey('spki', spki, ECDSA_P256, true, [
    'verify',
  ])
  const rawPoint = new Uint8Array(
    (await crypto.subtle.exportKey('raw', verifyKey)) as ArrayBuffer
  )
  const publicKeyHash = await sha256Bytes(rawPoint)

  const parsed = parseAuthData(att.authData)
  if (!parsed.credentialId || !bytesEqual(parsed.credentialId, publicKeyHash)) {
    throw new AppAttestError('credentialId != SHA256(publicKey)', {
      reason: 'attestation_invalid',
    })
  }

  let decodedKeyId: Uint8Array
  try {
    decodedKeyId = base64ToBytes(keyId)
  } catch (e) {
    throw new AppAttestError('keyId is not valid base64', {
      reason: 'attestation_invalid',
      cause: e,
    })
  }
  if (!bytesEqual(decodedKeyId, publicKeyHash)) {
    throw new AppAttestError('keyId != SHA256(publicKey)', {
      reason: 'attestation_invalid',
    })
  }

  // 5. rpIdHash must hash one of our app ids; attestation sign-count must be 0.
  let bundleId: string | null = null
  for (const candidate of bundleIds) {
    if (bytesEqual(parsed.rpIdHash, await appIdRpHash(teamId, candidate))) {
      bundleId = candidate
      break
    }
  }
  if (bundleId == null) {
    throw new AppAttestError('rpIdHash mismatch (wrong app id)', {
      reason: 'attestation_invalid',
    })
  }
  if (parsed.signCount !== 0) {
    throw new AppAttestError('attestation signCount must be 0', {
      reason: 'attestation_invalid',
    })
  }

  const environment = decodeEnvironment(parsed.aaguid)
  if (requireProduction && environment !== 'production') {
    throw new AppAttestError('development attestation rejected', {
      reason: 'attestation_invalid',
    })
  }

  return { spki: bytesToBase64Url(spki), environment, bundleId }
}

/**
 * Pure Apple attestation verification. Ownership, recovery authorization,
 * challenge replay, and persistence live in the lifecycle module.
 */
export const verifyAttestationCryptography = async (
  args: VerifyAttestationCryptographyArgs
): Promise<VerifiedAttestation> => {
  try {
    return await verify(args)
  } catch (e) {
    if (e instanceof AppAttestError) throw e
    throw new AppAttestError('attestation verification failed', {
      reason: 'attestation_invalid',
      cause: e,
    })
  }
}

import {
  base64ToBytes,
  bytesToBase64Url,
  sha256Bytes,
  sha256Hex,
} from '../crypto'
import {
  isAttestationPurpose,
  type AttestationPurpose,
} from '../attestation/purposes'

export const APP_ATTEST_PROTOCOL_VERSION = 2 as const
export const APP_ATTEST_V2_DOMAIN = 'witnesswork.app-attest'
export const APP_ATTEST_CHALLENGE_TTL_SECONDS = 300

export type AppAttestOperation = 'bind' | 'enroll' | 'assert'
/** The registry in src/attestation/purposes.ts, shared with Play Integrity. */
export type AppAttestAssertionPurpose = AttestationPurpose

export {
  NOTES_IMPORT_KICKOFF_PURPOSE,
  NOTES_IMPORT_VERIFY_PURPOSE,
  NOTES_IMPORT_TRANSCRIBE_PURPOSE,
} from '../attestation/purposes'

export interface V2ChallengeRequest {
  protocolVersion: 2
  operation: AppAttestOperation
  operationId: string
  uuid: string
  keyId: string
  purpose?: AppAttestAssertionPurpose
  /** Assertion-only fields. Required by the strict assertion challenge type. */
  accountId?: string
  contentHash?: string
  requestHash?: string
}

export interface V2AssertionChallengeRequest extends V2ChallengeRequest {
  operation: 'assert'
  purpose: AppAttestAssertionPurpose
  contentHash: string
  requestHash: string
}

export interface V2ChallengeResponse {
  protocolVersion: 2
  operation: AppAttestOperation
  operationId: string
  challenge: string
  expiresAt: number
}

export interface V2BindRequest extends V2ChallengeRequest {
  operation: 'bind'
  challenge: string
  attestation: string
  recoveryToken: string
}

export interface V2EnrollRequest extends V2ChallengeRequest {
  operation: 'enroll'
  challenge: string
  assertion: string
  recoveryToken: string
}

export type V2RegistrationRequest = V2BindRequest | V2EnrollRequest

export type V2RegistrationStatus =
  | 'bound'
  | 'already_bound'
  | 'rotated'
  | 'recovery_enrolled'

export interface V2RegistrationResponse {
  ok: true
  protocolVersion: 2
  operationId: string
  status: V2RegistrationStatus
  recoveryEnrolled: boolean
}

export interface V2AssertionRequest extends V2ChallengeRequest {
  operation: 'assert'
  purpose: AppAttestAssertionPurpose
  challenge: string
  assertion: string
  accountId?: string
  contentHash: string
  requestHash: string
}

export type V2AssertionFinalRequest = V2AssertionRequest

export interface V2AssertionResponse {
  ok: true
  protocolVersion: 2
  operationId: string
}

export interface V1RegistrationRequest {
  protocolVersion: 1
  keyId: string
  attestation: string
  challenge: string
  uuid: string
}

export interface V1AssertionRequest {
  protocolVersion: 1
  assertion: string
  keyId: string
  challenge: string
  uuid: string
  accountId?: string
  contentHash: string
}

export interface V1ChallengeResponse {
  challenge: string
}

export interface V1RegistrationResponse {
  ok: true
}

export interface V1AssertionResponse {
  ok: true
}

export interface ProtectedAssertionBinding {
  uuid: string
  accountId?: string
  contentHash: string
  requestHash?: string
  purpose: AppAttestAssertionPurpose
}

const field = (value: string | undefined): string => value ?? ''

export interface NotesImportRequestHashInput {
  notesText: string
  context: unknown
  refinement?: unknown | null
}

/**
 * Deterministic JSON for protocol hashing: object keys are sorted recursively,
 * array order is retained, and scalar encoding follows JSON.stringify.
 */
const stableCanonicalJson = (value: unknown): string => {
  const serialized = JSON.stringify(value, (_key, nested: unknown) => {
    if (nested == null || typeof nested !== 'object' || Array.isArray(nested)) {
      return nested
    }
    const record = nested as Record<string, unknown>
    const ordered: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >
    for (const key of Object.keys(record).sort()) ordered[key] = record[key]
    return ordered
  })
  if (serialized === undefined) {
    throw new TypeError('Value cannot be represented as canonical JSON')
  }
  return serialized
}

/** Exact payload covered by a Notes Import v2 request hash. */
export const buildNotesImportRequestCanonicalJson = (
  input: NotesImportRequestHashInput
): string =>
  stableCanonicalJson({
    notesText: input.notesText,
    context: input.context,
    refinement: input.refinement ?? null,
  })

/** Lowercase hexadecimal SHA-256 of the exact canonical Notes Import payload. */
export const computeNotesImportRequestHash = (
  input: NotesImportRequestHashInput
): Promise<string> => sha256Hex(buildNotesImportRequestCanonicalJson(input))

/**
 * Lowercase hexadecimal SHA-256 of a page transcription request. The content
 * hash already covers the image bytes (as sent, base64), so the request hash
 * binds only the rest of the payload.
 */
export const computeNotesImportTranscribeRequestHash = (input: {
  imageHash: string
  mimeType: string
}): Promise<string> =>
  sha256Hex(
    stableCanonicalJson({ imageHash: input.imageHash, mimeType: input.mimeType })
  )

/** Byte-for-byte App Attest client data for an initial or recovery bind. */
export const buildV2BindClientData = (args: {
  operationId: string
  challenge: string
  uuid: string
  tokenHash: string
}): string =>
  [
    APP_ATTEST_V2_DOMAIN,
    '2',
    'bind',
    args.operationId,
    args.challenge,
    args.uuid,
    args.tokenHash,
  ].join('|')

/** Byte-for-byte client data asserted by the currently active key to enroll a token. */
export const buildV2EnrollClientData = (args: {
  operationId: string
  challenge: string
  uuid: string
  keyId: string
  tokenHash: string
}): string =>
  [
    APP_ATTEST_V2_DOMAIN,
    '2',
    'enroll',
    args.operationId,
    args.challenge,
    args.uuid,
    args.keyId,
    args.tokenHash,
  ].join('|')

/** Byte-for-byte client data for a v2 protected assertion. */
export const buildV2AssertionClientData = (args: {
  purpose: AppAttestAssertionPurpose
  operationId: string
  challenge: string
  uuid: string
  accountId?: string
  contentHash: string
  requestHash: string
}): string =>
  [
    APP_ATTEST_V2_DOMAIN,
    '2',
    'assert',
    args.purpose,
    args.operationId,
    args.challenge,
    args.uuid,
    field(args.accountId),
    args.contentHash,
    args.requestHash,
  ].join('|')

/** Canonical challenge identity; hashed before it is persisted. */
export const buildV2ChallengeDescriptor = (
  request: V2ChallengeRequest
): string =>
  [
    APP_ATTEST_V2_DOMAIN,
    '2',
    'challenge',
    request.operation,
    request.operationId,
    request.uuid,
    request.keyId,
    field(request.purpose),
    ...(request.operation === 'assert' && request.requestHash !== undefined
      ? [field(request.accountId), field(request.contentHash), request.requestHash]
      : []),
  ].join('|')

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

export interface RecoveryTokenMaterial {
  /** SHA-256(token bytes), base64url without padding; this is signed by the client. */
  tokenHash: string
  /** Domain-separated verifier persisted by the identity object. */
  verifier: string
}

/**
 * Parse the v2 256-bit base64url token and derive non-secret material. The raw
 * token is never persisted or included in an error.
 */
export const deriveRecoveryTokenMaterial = async (
  recoveryToken: string
): Promise<RecoveryTokenMaterial | null> => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(recoveryToken)) return null

  let tokenBytes: Uint8Array
  try {
    tokenBytes = base64ToBytes(recoveryToken)
  } catch {
    return null
  }
  if (
    tokenBytes.length !== 32 ||
    bytesToBase64Url(tokenBytes) !== recoveryToken
  ) {
    return null
  }

  const tokenHashBytes = await sha256Bytes(tokenBytes)
  const verifierDomain = new TextEncoder().encode(
    `${APP_ATTEST_V2_DOMAIN}|2|recovery-verifier|`
  )
  const verifier = await sha256Bytes(concat(verifierDomain, tokenHashBytes))
  return {
    tokenHash: bytesToBase64Url(tokenHashBytes),
    verifier: bytesToBase64Url(verifier),
  }
}

export const isAppAttestUuid = (value: string): boolean =>
  /^[A-Za-z0-9_-]{8,64}$/.test(value)

export const isAppAttestOperationId = (value: string): boolean =>
  /^[A-Za-z0-9_-]{8,128}$/.test(value)

export const isAppAttestKeyId = (value: string): boolean => {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return false
  try {
    const bytes = base64ToBytes(value)
    if (bytes.length !== 32) return false
    const standard = `${bytesToBase64Url(bytes)
      .replace(/-/g, '+')
      .replace(/_/g, '/')}=`
    return standard === value
  } catch {
    return false
  }
}

export const isAppAttestChallenge = (value: string): boolean =>
  /^[A-Za-z0-9_-]{43}$/.test(value)

export const isAppAttestAssertionPurpose = isAttestationPurpose

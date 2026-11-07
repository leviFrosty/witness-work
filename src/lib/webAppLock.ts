import { sha256 } from '@noble/hashes/sha2.js'
import { fromB64u, fromUtf8, sameBytes, toB64u, utf8 } from '@/lib/bytes'
import { PasskeyError } from '@/lib/passkeys/errors'
import type {
  AuthenticationResponseJSON,
  PasskeyAssertion,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'
import type { StepUpPasskey } from '@/lib/serverAccount/stepUp'

export type WebLockCredentials = { rpId: string; ids: string[] }

export type LockCheckFailure =
  | 'wrong_credential'
  | 'challenge'
  | 'origin'
  | 'rp_id'
  | 'user_verification'
  | 'malformed'

const FLAG_UP = 0x01
const FLAG_UV = 0x04

const AUTHENTICATOR_DATA_MIN = 37

const decode = (text: unknown): Uint8Array | null => {
  if (typeof text !== 'string') return null
  try {
    return fromB64u(text)
  } catch {
    return null
  }
}

export function checkLockAssertion(
  response: AuthenticationResponseJSON,
  expected: {
    challenge: string
    credentials: WebLockCredentials
    origin: string
  }
): 'ok' | LockCheckFailure {
  if (
    response.type !== 'public-key' ||
    response.id !== response.rawId ||
    !expected.credentials.ids.includes(response.rawId)
  )
    return 'wrong_credential'
  const clientDataBytes = decode(response.response?.clientDataJSON)
  const authenticatorData = decode(response.response?.authenticatorData)
  if (!clientDataBytes || !authenticatorData) return 'malformed'
  let clientData: Record<string, unknown>
  try {
    clientData = JSON.parse(fromUtf8(clientDataBytes)) as Record<
      string,
      unknown
    >
  } catch {
    return 'malformed'
  }
  if (clientData.type !== 'webauthn.get') return 'malformed'
  if (clientData.challenge !== expected.challenge) return 'challenge'
  if (clientData.origin !== expected.origin || clientData.crossOrigin === true)
    return 'origin'
  if (authenticatorData.length < AUTHENTICATOR_DATA_MIN) return 'malformed'
  if (
    !sameBytes(
      authenticatorData.subarray(0, 32),
      sha256(utf8(expected.credentials.rpId))
    )
  )
    return 'rp_id'
  const flags = authenticatorData[32]
  if ((flags & FLAG_UP) === 0 || (flags & FLAG_UV) === 0)
    return 'user_verification'
  return 'ok'
}

export type WebLockUnlock =
  | { status: 'unlocked' }
  | { status: 'cancelled' }
  | { status: 'noCredentials' }
  | { status: 'refused'; reason: LockCheckFailure }
  | { status: 'failed'; reason: 'no_credentials' | 'not_supported' | 'failed' }

export type WebLockEnable =
  | { status: 'enabled'; credentials: WebLockCredentials }
  | { status: 'refused'; reason: LockCheckFailure | 'no_rp_id' }

export type WebAppLockDeps = {
  get: (
    options: PublicKeyCredentialRequestOptionsJSON
  ) => Promise<PasskeyAssertion>
  randomBytes: (length: number) => Uint8Array

  origin: () => string
  credentials: {
    read: () => WebLockCredentials | null
    write: (credentials: WebLockCredentials | null) => void
  }
}

const GET_FAILURES: Partial<
  Record<PasskeyError['code'], 'cancelled' | 'no_credentials' | 'not_supported'>
> = {
  cancelled: 'cancelled',
  no_credentials: 'no_credentials',
  not_supported: 'not_supported',
  domain_not_associated: 'not_supported',
}

export function createWebAppLock(deps: WebAppLockDeps) {
  function enable(stepUp: StepUpPasskey): WebLockEnable {
    if (!stepUp.rpId || stepUp.credentialIds.length === 0)
      return { status: 'refused', reason: 'no_rp_id' }
    const credentials = { rpId: stepUp.rpId, ids: [...stepUp.credentialIds] }
    const checked = checkLockAssertion(stepUp.assertion.response, {
      challenge: stepUp.challenge,
      credentials,
      origin: deps.origin(),
    })
    if (checked !== 'ok') return { status: 'refused', reason: checked }
    deps.credentials.write(credentials)
    return { status: 'enabled', credentials }
  }

  async function unlock(): Promise<WebLockUnlock> {
    const credentials = deps.credentials.read()

    if (!credentials || credentials.ids.length === 0)
      return { status: 'noCredentials' }
    const challenge = toB64u(deps.randomBytes(32))
    let assertion: PasskeyAssertion
    try {
      assertion = await deps.get({
        rpId: credentials.rpId,
        challenge,
        allowCredentials: credentials.ids.map((id) => ({
          id,
          type: 'public-key',
        })),
        userVerification: 'required',
        timeout: 300_000,
      })
    } catch (error) {
      const failure =
        error instanceof PasskeyError ? GET_FAILURES[error.code] : undefined
      if (failure === 'cancelled') return { status: 'cancelled' }
      return { status: 'failed', reason: failure ?? 'failed' }
    }
    const checked = checkLockAssertion(assertion.response, {
      challenge,
      credentials,
      origin: deps.origin(),
    })
    return checked === 'ok'
      ? { status: 'unlocked' }
      : { status: 'refused', reason: checked }
  }

  function keepListed(listed: readonly string[]): boolean {
    const credentials = deps.credentials.read()
    if (!credentials) return false
    const ids = credentials.ids.filter((id) => listed.includes(id))
    if (ids.length !== credentials.ids.length)
      deps.credentials.write(ids.length ? { ...credentials, ids } : null)
    return ids.length > 0
  }

  function noteStepUp(stepUp: StepUpPasskey) {
    const credentials = deps.credentials.read()
    if (
      !credentials ||
      stepUp.rpId !== credentials.rpId ||
      stepUp.credentialIds.length === 0
    )
      return
    deps.credentials.write({ ...credentials, ids: [...stepUp.credentialIds] })
  }

  return { enable, unlock, keepListed, noteStepUp }
}

export type WebAppLock = ReturnType<typeof createWebAppLock>

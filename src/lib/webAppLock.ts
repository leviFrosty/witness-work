import { sha256 } from '@noble/hashes/sha2.js'
import { fromB64u, fromUtf8, sameBytes, toB64u, utf8 } from '@/lib/bytes'
import { PasskeyError } from '@/lib/passkeys/errors'
import type {
  AuthenticationResponseJSON,
  PasskeyAssertion,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'
import type { StepUpPasskey } from '@/lib/serverAccount/stepUp'

/**
 * App Lock on the web (docs/passkeys-protocol.md, "On the web"): available once
 * the account has a passkey, off by default, and unlocked with one of the
 * account's passkeys, checked on the device, so it works offline.
 *
 * - **Turning it on** is a step-up: the server verifies the passkey's signature,
 *   and names the account's passkeys and their RP ID, which this browser keeps.
 *   The same assertion must also pass the device's check below, so a browser
 *   that can't unlock never turns the lock on.
 * - **Unlocking** (and turning it off) is a get for those passkeys with a
 *   challenge made here, with no request to the server. The device checks that
 *   the get answered for one of the kept passkeys, for this page's origin and
 *   the kept RP ID, signed the challenge it was given, and that the User was
 *   verified (UV) as well as present.
 *
 * The device doesn't hold the passkeys' public keys (`GET /passkeys` doesn't
 * list them), so it can't verify the signature itself: the get succeeding is
 * the browser's word, not cryptographic proof. App Lock is a privacy screen for
 * this browser, not an account control: it doesn't encrypt anything, and
 * someone with the browser's developer tools can get past it (by editing its
 * storage, or answering the get with a forged assertion).
 */

/** The account's passkeys this browser unlocks with. */
export type WebLockCredentials = { rpId: string; ids: string[] }

/** Why an assertion didn't pass the device's check. */
export type LockCheckFailure =
  /** Not one of the account's passkeys. */
  | 'wrong_credential'
  | 'challenge'
  | 'origin'
  | 'rp_id'
  /** The authenticator didn't verify the User (UV), or they weren't present. */
  | 'user_verification'
  | 'malformed'

/** WebAuthn's authenticator data flags. */
const FLAG_UP = 0x01
const FLAG_UV = 0x04
/** `rpIdHash` (32) and `flags` (1), then the counter (4). */
const AUTHENTICATOR_DATA_MIN = 37

const decode = (text: unknown): Uint8Array | null => {
  if (typeof text !== 'string') return null
  try {
    return fromB64u(text)
  } catch {
    return null
  }
}

/**
 * The device's check of an unlocking get: one of `credentials`' passkeys,
 * `challenge` (`b64u`) signed for `origin` and the RP ID, with the User
 * verified.
 */
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
  /** Nothing kept to unlock with: the lock can't hold. */
  | { status: 'noCredentials' }
  /** The get answered, but not as the account's passkey for this page. */
  | { status: 'refused'; reason: LockCheckFailure }
  /** None of the account's passkeys is here, or the get failed. */
  | { status: 'failed'; reason: 'no_credentials' | 'not_supported' | 'failed' }

export type WebLockEnable =
  | { status: 'enabled'; credentials: WebLockCredentials }
  | { status: 'refused'; reason: LockCheckFailure | 'no_rp_id' }

export type WebAppLockDeps = {
  get: (
    options: PublicKeyCredentialRequestOptionsJSON
  ) => Promise<PasskeyAssertion>
  randomBytes: (length: number) => Uint8Array
  /** `location.origin`. */
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
  /**
   * Keeps the step-up's passkeys once its assertion passes the device's check
   * too.
   */
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

  /** A get for the kept passkeys, checked here; no request to the server. */
  async function unlock(): Promise<WebLockUnlock> {
    const credentials = deps.credentials.read()
    // An empty list would be a discoverable get, offering any passkey.
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

  /**
   * Drops passkeys the account no longer lists. Returns whether any is left to
   * unlock with.
   */
  function keepListed(listed: readonly string[]): boolean {
    const credentials = deps.credentials.read()
    if (!credentials) return false
    const ids = credentials.ids.filter((id) => listed.includes(id))
    if (ids.length !== credentials.ids.length)
      deps.credentials.write(ids.length ? { ...credentials, ids } : null)
    return ids.length > 0
  }

  /**
   * Takes the account's passkeys from a later step-up, so one added since
   * unlocks too. Only while the lock is on, and for the same RP ID.
   */
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

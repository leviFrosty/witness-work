import { HttpError } from '@/lib/http/request'
import {
  type AccountAuthorize,
  sendBearerAccountOp,
  sendBearerSignedAccountOp,
  unexpectedResponse,
} from '@/lib/serverAccount/client'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

/**
 * The wire half of changing the account key (docs/account-key-change.md,
 * "Server"): `account/rekey`, signed by the old key and the new one over the
 * session's bearer token, and the stored key history. The device flow is
 * `src/app/account/keyChange`.
 */

export type KeyChangeClientOptions = {
  baseUrl: string
  authorize: AccountAuthorize
  /** Request timestamps (`syncNow`). */
  now: () => number
  randomBytes: (length: number) => Uint8Array
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

/** A passkey's wrap of the new key, from the step-up just passed (web). */
export type RekeyPasskeyWrap = {
  credentialId: string
  wrapId: string
  wrap: string
}

export type RekeyRequest = {
  oldKey: Uint8Array
  newKey: Uint8Array
  /** The account's epoch as this device read it. */
  keyEpoch: number
  /** The new key history, sealed under the new key (`sealKeyHistory`). */
  history: string
  /** This device's label sealed under the new key (`sealDeviceLabel`). */
  device?: string
  passkeyWrap?: RekeyPasskeyWrap
}

export type RekeyResult =
  /** The account's key is the new one; the session carries the new epoch. */
  | {
      outcome: 'committed'
      keyEpoch: number
      accessToken: string
      /** Epoch ms, the server's clock. */
      accessExpiresAt: number
    }
  /** The account's key or epoch isn't what this device read: another won. */
  | { outcome: 'conflict'; keyEpoch: number | null }
  /** The old key was retired already: changed on another device. */
  | { outcome: 'keyRetired'; changedAt: number | null }
  /** A web session younger than a day. */
  | { outcome: 'sessionTooNew' }
  /** A web session without a fresh step-up. */
  | { outcome: 'stepUpRequired' }
  /**
   * 401 `key_changed`: the session's token is from before a change, its own or
   * another device's. Checked like a lost answer (refresh, then `GET
   * /account`), never sent again as it is.
   */
  | { outcome: 'keyChanged' }

/** The token predates a key change (docs/account-key-change.md). */
const KEY_CHANGED = 'key_changed'

const isKeyChanged = (error: unknown) =>
  error instanceof HttpError &&
  error.status === 401 &&
  (error.body as { reason?: unknown } | null)?.reason === KEY_CHANGED

const numberOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** The refusal's body field, from the server's JSON error. */
const bodyField = (error: HttpError, field: string) =>
  numberOrNull((error.body as Record<string, unknown> | null)?.[field])

/**
 * The refusal a key change expects as an outcome, or null. A session that
 * couldn't open for a retired key (`AccountSessionError`) counts too.
 */
export function rekeyRefusal(error: unknown): RekeyResult | null {
  if (!(error instanceof HttpError)) return null
  switch (error.serverCode) {
    case KEY_CHANGED:
      return error.status === 401 ? { outcome: 'keyChanged' } : null
    case 'conflict':
      return error.status === 409
        ? { outcome: 'conflict', keyEpoch: bodyField(error, 'keyEpoch') }
        : null
    case 'key_retired':
      return {
        outcome: 'keyRetired',
        changedAt:
          bodyField(error, 'changedAt') ??
          numberOrNull((error as { changedAt?: unknown }).changedAt),
      }
    case 'session_too_new':
      return { outcome: 'sessionTooNew' }
    case 'step_up_required':
      return { outcome: 'stepUpRequired' }
    default:
      return null
  }
}

/**
 * `POST /accounts/v1/account/rekey`. Not retried here: after a lost answer the
 * device reads the account (`GET /account`) and sends it again, which the
 * server answers as committed when it was. Other failures throw `HttpError`.
 */
export async function rekeyAccount(
  request: RekeyRequest,
  options: KeyChangeClientOptions
): Promise<RekeyResult> {
  const oldSigning = deriveAccountSigningKey(request.oldKey)
  const newSigning = deriveAccountSigningKey(request.newKey)
  if (oldSigning.publicKey === newSigning.publicKey)
    throw new Error('The new account key must differ from the old one')
  let answer: Awaited<ReturnType<typeof sendBearerSignedAccountOp>>
  try {
    answer = await sendBearerSignedAccountOp(
      'account/rekey',
      {
        newAccountPub: newSigning.publicKey,
        keyEpoch: request.keyEpoch,
        history: request.history,
        ...(request.device !== undefined && { device: request.device }),
        ...(request.passkeyWrap && { passkeyWrap: request.passkeyWrap }),
      },
      {
        baseUrl: options.baseUrl,
        // A 401 `key_changed` isn't a token to refresh and sign again for: it
        // leaves the session client as its own code, and the caller checks.
        authorize: (run) =>
          options.authorize(async (authorization) => {
            try {
              return await run(authorization)
            } catch (error) {
              if (!isKeyChanged(error)) throw error
              throw new HttpError(
                'client',
                401,
                KEY_CHANGED,
                null,
                undefined,
                (error as HttpError).body
              )
            }
          }),
        fetchImpl: options.fetchImpl,
        signal: options.signal,
        sign: {
          baseUrl: options.baseUrl,
          key: oldSigning,
          now: options.now,
          randomBytes: options.randomBytes,
          fetchImpl: options.fetchImpl,
        },
      },
      {
        cosign: [
          { field: 'newSignature', op: 'account/rekey/new', key: newSigning },
        ],
      }
    )
  } catch (error) {
    const refusal = rekeyRefusal(error)
    if (refusal) return refusal
    throw error
  }
  const { ok, keyEpoch, accessToken, accessExpiresAt } = answer.data ?? {}
  if (
    ok !== true ||
    typeof keyEpoch !== 'number' ||
    !Number.isSafeInteger(keyEpoch) ||
    typeof accessToken !== 'string' ||
    accessToken.length === 0 ||
    typeof accessExpiresAt !== 'number' ||
    accessExpiresAt <= 0
  )
    throw unexpectedResponse(answer.status)
  return { outcome: 'committed', keyEpoch, accessToken, accessExpiresAt }
}

/** The account's epoch, and its sealed key history (null before any change). */
export type StoredKeyHistory = { keyEpoch: number; history: string | null }

/** `GET /accounts/v1/account/key-history`. Failures throw `HttpError`. */
export async function fetchKeyHistory(
  options: Pick<
    KeyChangeClientOptions,
    'baseUrl' | 'authorize' | 'fetchImpl' | 'signal'
  >
): Promise<StoredKeyHistory> {
  const response = await sendBearerAccountOp<Record<string, unknown>>(
    'account/key-history',
    null,
    options,
    { idempotent: true }
  )
  const { ok, keyEpoch, history } = response.data ?? {}
  if (
    ok !== true ||
    typeof keyEpoch !== 'number' ||
    !Number.isSafeInteger(keyEpoch) ||
    keyEpoch < 0 ||
    (history !== null && typeof history !== 'string')
  )
    throw unexpectedResponse(response.status)
  return { keyEpoch, history }
}

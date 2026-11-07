import { HttpError } from '@/lib/http/request'
import {
  type AccountAuthorize,
  sendBearerAccountOp,
  sendBearerSignedAccountOp,
  unexpectedResponse,
} from '@/lib/serverAccount/client'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

export type KeyChangeClientOptions = {
  baseUrl: string
  authorize: AccountAuthorize

  now: () => number
  randomBytes: (length: number) => Uint8Array
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export type RekeyPasskeyWrap = {
  credentialId: string
  wrapId: string
  wrap: string
}

export type RekeyRequest = {
  oldKey: Uint8Array
  newKey: Uint8Array

  keyEpoch: number

  history: string

  device?: string
  passkeyWrap?: RekeyPasskeyWrap
}

export type RekeyResult =
  | {
      outcome: 'committed'
      keyEpoch: number
      accessToken: string

      accessExpiresAt: number
    }
  | { outcome: 'conflict'; keyEpoch: number | null }
  | { outcome: 'keyRetired'; changedAt: number | null }
  | { outcome: 'sessionTooNew' }
  | { outcome: 'stepUpRequired' }
  | { outcome: 'keyChanged' }

const KEY_CHANGED = 'key_changed'

const isKeyChanged = (error: unknown) =>
  error instanceof HttpError &&
  error.status === 401 &&
  (error.body as { reason?: unknown } | null)?.reason === KEY_CHANGED

const numberOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const bodyField = (error: HttpError, field: string) =>
  numberOrNull((error.body as Record<string, unknown> | null)?.[field])

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

export type StoredKeyHistory = { keyEpoch: number; history: string | null }

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

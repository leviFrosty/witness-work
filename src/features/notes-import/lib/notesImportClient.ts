import axios, { isAxiosError } from 'axios'
import * as Crypto from 'expo-crypto'
import { MMKV } from 'react-native-mmkv'
import apis from '@/constants/apis'
import { getOrCreateInstallId } from '@/lib/installId'
import { notesContentHash } from '@/features/notes-import/lib/notesContentHash'
import type {
  NotesImportContext,
  NotesImportResult,
} from '@/features/notes-import/lib/notesImportTypes'
import * as AppAttest from '../../../../modules/app-attest'

/**
 * Notes Import network client. Owns identity (Keychain UUID), the App Attest
 * handshake + per-request assertion, and the metered model call. A configured
 * dev-bypass token (dev/staging worker only) skips App Attest so the simulator
 * — which has no Secure Enclave — can exercise the full flow.
 */

const DEV_BYPASS_TOKEN = process.env.EXPO_PUBLIC_NOTES_IMPORT_DEV_BYPASS || ''
const REQUEST_TIMEOUT_MS = 90_000

export interface NotesImportCredits {
  /** Credits left after this import; `null` for Supporters (unlimited). */
  remaining: number | null
  isSupporter: boolean
}

export interface NotesImportResponse {
  result: NotesImportResult
  contentHash: string
  refinement: boolean
  credits: NotesImportCredits
}

export type NotesImportErrorCode =
  | 'limit_reached'
  | 'refinement_limit'
  | 'too_large'
  | 'attestation_required'
  | 'attestation_failed'
  | 'model_error'
  | 'bad_request'
  | 'network'
  | 'unknown'

/**
 * A typed failure the hook can branch on (e.g. show the paywall on
 * `limit_reached`).
 */
export class NotesImportClientError extends Error {
  code: NotesImportErrorCode
  status?: number
  constructor(code: NotesImportErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'NotesImportClientError'
    this.code = code
    this.status = status
  }
}

export interface RequestNotesImportArgs {
  notesText: string
  context: NotesImportContext
  /** Present for a stateless follow-up refinement of an earlier parse. */
  refinement?: { previousResultJSON: string; instruction: string }
}

// --- App Attest device-key persistence ---------------------------------

let _attestStore: MMKV | null = null
const attestStore = (): MMKV =>
  (_attestStore ??= new MMKV({ id: 'app-attest' }))
const KEY_ID_KEY = 'keyId'

const base64Sha256 = (data: string): Promise<string> =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data, {
    encoding: Crypto.CryptoEncoding.BASE64,
  })

const getChallenge = async (): Promise<string> => {
  const { data } = await axios.post<{ challenge: string }>(
    apis.notesImportChallenge,
    {},
    { timeout: REQUEST_TIMEOUT_MS }
  )
  return data.challenge
}

/**
 * Ensures this device has an attested App Attest key bound to `uuid`,
 * performing the one-time handshake if needed. Returns the keyId. `force`
 * re-attests even if a keyId is cached (used when the server reports it doesn't
 * know the key).
 */
const ensureAttested = async (uuid: string, force = false): Promise<string> => {
  const cached = attestStore().getString(KEY_ID_KEY)
  if (cached && !force) return cached

  const keyId = await AppAttest.generateKey()
  const challenge = await getChallenge()
  const clientDataHash = await base64Sha256(challenge)
  const attestation = await AppAttest.attestKey(keyId, clientDataHash)
  await axios.post(
    apis.notesImportAttest,
    { keyId, attestation, challenge, uuid },
    { timeout: REQUEST_TIMEOUT_MS }
  )
  attestStore().set(KEY_ID_KEY, keyId)
  return keyId
}

const toClientError = (e: unknown): NotesImportClientError => {
  if (isAxiosError(e)) {
    const status = e.response?.status
    const code = (e.response?.data as { code?: string } | undefined)?.code as
      | NotesImportErrorCode
      | undefined
    const message =
      (e.response?.data as { error?: string } | undefined)?.error ?? e.message
    if (code) return new NotesImportClientError(code, message, status)
    if (!e.response) {
      return new NotesImportClientError('network', 'Network error', status)
    }
    return new NotesImportClientError('unknown', message, status)
  }
  if (e instanceof NotesImportClientError) return e
  return new NotesImportClientError('unknown', (e as Error).message)
}

const postImport = async (
  body: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<NotesImportResponse> => {
  const { data } = await axios.post<NotesImportResponse>(
    apis.notesImport,
    body,
    {
      timeout: REQUEST_TIMEOUT_MS,
      headers,
    }
  )
  return data
}

/**
 * Runs a Notes Import (or a follow-up refinement) end to end: identity, App
 * Attest (or dev bypass), and the metered model call. Throws
 * {@link NotesImportClientError} with a branchable `code` on failure.
 */
export const requestNotesImport = async ({
  notesText,
  context,
  refinement,
}: RequestNotesImportArgs): Promise<NotesImportResponse> => {
  const uuid = getOrCreateInstallId()
  const contentHash = await notesContentHash(notesText)
  const baseBody = { uuid, notesText, contentHash, context, refinement }

  try {
    if (DEV_BYPASS_TOKEN) {
      return await postImport(baseBody, { 'x-ww-dev-bypass': DEV_BYPASS_TOKEN })
    }

    const signedBody = async (keyId: string) => {
      const challenge = await getChallenge()
      const clientData = `${challenge}|${uuid}|${contentHash}`
      const assertion = await AppAttest.generateAssertion(
        keyId,
        await base64Sha256(clientData)
      )
      return { ...baseBody, keyId, challenge, assertion }
    }

    let keyId = await ensureAttested(uuid)
    try {
      return await postImport(await signedBody(keyId))
    } catch (e) {
      // The server may no longer know our key (KV reset, new env). Re-attest
      // once and retry before surfacing the failure.
      const err = toClientError(e)
      if (
        err.code === 'attestation_failed' ||
        err.code === 'attestation_required'
      ) {
        keyId = await ensureAttested(uuid, true)
        return await postImport(await signedBody(keyId))
      }
      throw e
    }
  } catch (e) {
    throw toClientError(e)
  }
}

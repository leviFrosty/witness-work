import axios, { isAxiosError } from 'axios'
import { fetch as expoFetch } from 'expo/fetch'
import * as Crypto from 'expo-crypto'
import { MMKV } from 'react-native-mmkv'
import apis from '@/constants/apis'
import { getOrCreateAccountId } from '@/lib/account'
import { getOrCreateInstallId } from '@/lib/installId'
import { notesContentHash } from '@/features/notes-import/lib/notesContentHash'
import type {
  NotesImportContext,
  NotesImportResult,
} from '@/features/notes-import/lib/notesImportTypes'
import {
  normalizeNotesImportCredits,
  normalizeNotesImportStatus,
  type NotesImportCredits,
  type NotesImportStatus,
} from '@/features/notes-import/lib/notesImportUsage'
import * as AppAttest from '../../../../modules/app-attest'

/**
 * Notes Import network client. Owns identity (the Keychain install UUID for App
 * Attest, plus the shared account id for Supporter status/metering — ADR 0011),
 * the App Attest handshake + per-request assertion, and the metered model call.
 * A configured dev-bypass token (dev/staging worker only) skips App Attest so
 * the simulator — which has no Secure Enclave — can exercise the full flow.
 *
 * Two model paths exist:
 *
 * - {@link runNotesImportStreaming} (preferred): an attested kickoff returns an
 *   import id + a short-lived subscribe token; progress then streams over SSE
 *   (via `expo/fetch`) so the user sees the model working instead of a dead
 *   spinner. The run lives server-side in a Durable Object, so a dropped or
 *   backgrounded connection resumes losslessly (replay by `Last-Event-ID`, with
 *   a result-snapshot fallback).
 * - {@link requestNotesImport} (legacy): one blocking request/response. Kept as a
 *   fallback during the streaming cutover.
 */

const DEV_BYPASS_TOKEN = process.env.EXPO_PUBLIC_NOTES_IMPORT_DEV_BYPASS || ''
// Hard-gate the App Attest dev-bypass on __DEV__ so a production bundle can NEVER
// skip attestation, even if the bypass env var leaks into a release build. (The
// dev worker also has to honor the header — production rejects it — but
// client-side defense-in-depth is cheap.)
const DEV_BYPASS_ENABLED = __DEV__ && DEV_BYPASS_TOKEN.length > 0
const REQUEST_TIMEOUT_MS = 90_000

export type { NotesImportCredits } from '@/features/notes-import/lib/notesImportUsage'

export interface NotesImportResponse {
  result: NotesImportResult
  contentHash: string
  refinement: boolean
  /**
   * The run produced no records (an Empty Import) AND still charged an Import
   * Credit because the anti-abuse empty window was exhausted (ADR 0012). Drives
   * the composer's fixed Scribe AI "this one counted" notice. A within-window
   * free empty — or any non-empty run — is false.
   */
  emptyCharged: boolean
  /** Null only when a malformed/missing server snapshot must be ignored. */
  credits: NotesImportCredits | null
}

interface NotesImportWireResponse
  extends Omit<NotesImportResponse, 'credits' | 'emptyCharged'> {
  credits: unknown
  /** Absent on older proxy payloads → normalized to false. */
  emptyCharged?: boolean
}

const normalizeNotesImportResponse = (
  response: NotesImportWireResponse
): NotesImportResponse => ({
  ...response,
  emptyCharged: response.emptyCharged ?? false,
  credits: normalizeNotesImportCredits(response.credits),
})

export type NotesImportErrorCode =
  | 'limit_reached'
  | 'refinement_limit'
  | 'too_large'
  | 'attestation_required'
  | 'attestation_failed'
  | 'model_error'
  | 'bad_request'
  | 'active_cap'
  | 'unavailable'
  | 'network'
  | 'unknown'

/**
 * A typed failure the hook can branch on (e.g. show the paywall on
 * `limit_reached`).
 */
export class NotesImportClientError extends Error {
  code: NotesImportErrorCode
  status?: number
  /**
   * Human-readable dump of the raw HTTP exchange (method, URL, status, response
   * body — including the server's dev-only `detail`). Populated only in
   * `__DEV__` for developer logs; never surfaced in production builds.
   */
  debug?: string
  /** Authoritative usage attached to an allowance denial, when valid. */
  credits?: NotesImportCredits
  constructor(
    code: NotesImportErrorCode,
    message: string,
    status?: number,
    debug?: string,
    credits?: NotesImportCredits
  ) {
    super(message)
    this.name = 'NotesImportClientError'
    this.code = code
    this.status = status
    this.debug = debug
    this.credits = credits
  }
}

export type NotesImportUnavailableReason = 'disabled' | 'no_provider'
export type { NotesImportStatus } from '@/features/notes-import/lib/notesImportUsage'

/**
 * Cheap, unauthenticated availability probe (no App Attest, no inference).
 * Returns null on network or contract failure: callers remain fail-open for
 * access, but have no public schedule from which to make Help/Paywall claims.
 */
export const getNotesImportStatus =
  async (): Promise<NotesImportStatus | null> => {
    try {
      const { data } = await axios.get<unknown>(apis.notesImportStatus, {
        timeout: 8_000,
      })
      return normalizeNotesImportStatus(data)
    } catch {
      return null
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
let _attestInFlight: Promise<string> | null = null

const ensureAttested = async (uuid: string, force = false): Promise<string> => {
  const cached = attestStore().getString(KEY_ID_KEY)
  if (cached && !force) return cached
  // Coalesce concurrent first-time attestations so two simultaneous kickoffs
  // don't each burn a Secure Enclave key + attest round-trip (and leave the
  // cache pointing at only one of them). `force` re-attests unconditionally.
  if (!force && _attestInFlight) return _attestInFlight

  const run = (async (): Promise<string> => {
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
  })()

  if (force) return run
  _attestInFlight = run
  try {
    return await run
  } finally {
    if (_attestInFlight === run) _attestInFlight = null
  }
}

// --- Dev-tools diagnostics (ToolsScreen) --------------------------------

/**
 * Static snapshot of everything the auth boundary depends on — identities,
 * bypass state, App Attest support, and the cached device key. Read-only; safe
 * to render in the dev Tools screen.
 */
export const getNotesImportAuthSnapshot = () => {
  const installId = getOrCreateInstallId()
  const accountId = getOrCreateAccountId()
  return {
    baseUrl: apis.notesImport.replace(/\/notes-import$/, ''),
    devBypassEnabled: DEV_BYPASS_ENABLED,
    appAttestSupported: AppAttest.isSupported(),
    cachedKeyId: attestStore().getString(KEY_ID_KEY) ?? null,
    installId,
    accountId,
    accountIdAdopted: accountId !== installId,
  }
}

/**
 * Dev-tools only: drop the cached App Attest keyId so the next attested call
 * runs the full handshake again (mirrors the server forgetting the key).
 */
export const clearCachedAttestKey = (): void => {
  attestStore().delete(KEY_ID_KEY)
}

export interface NotesImportAuthDebugStep {
  step: string
  ok: boolean
  ms: number
  detail?: string
}

export interface NotesImportAuthDebugReport {
  ok: boolean
  steps: NotesImportAuthDebugStep[]
  keyId: string | null
}

/**
 * Exercises the auth boundary end to end for the dev Tools screen, reporting
 * each hop separately so a failure pinpoints itself: status probe → challenge →
 * (if needed or forced) the full App Attest handshake → an assertion signed
 * locally and verified by ww-api's attested no-op endpoint — the exact
 * verifyAssertion path kickoff runs. Uses the same primitives and cache as the
 * real import path, so a forced handshake here genuinely re-attests the device.
 * No inference is spent and no credits are touched.
 */
export const runNotesImportAuthDiagnostics = async (
  options: { forceReattest?: boolean } = {}
): Promise<NotesImportAuthDebugReport> => {
  const steps: NotesImportAuthDebugStep[] = []
  const run = async <T>(
    step: string,
    fn: () => Promise<T>,
    detail?: (result: T) => string
  ): Promise<T | null> => {
    const started = Date.now()
    try {
      const result = await fn()
      steps.push({
        step,
        ok: true,
        ms: Date.now() - started,
        detail: detail?.(result),
      })
      return result
    } catch (e) {
      const err = toClientError(e)
      steps.push({
        step,
        ok: false,
        ms: Date.now() - started,
        detail: err.debug ?? `${err.code}: ${err.message}`,
      })
      return null
    }
  }
  const report = (): NotesImportAuthDebugReport => ({
    ok: steps.every((s) => s.ok),
    steps,
    keyId: attestStore().getString(KEY_ID_KEY) ?? null,
  })

  await run('status probe', getNotesImportStatus, (s) => JSON.stringify(s))

  const challenge = await run('challenge', getChallenge, (c) =>
    c ? `${c.length} chars` : 'empty'
  )
  if (challenge === null) return report()

  if (DEV_BYPASS_ENABLED) {
    steps.push({
      step: 'attestation',
      ok: true,
      ms: 0,
      detail: 'skipped — dev bypass header active',
    })
    return report()
  }
  if (!AppAttest.isSupported()) {
    steps.push({
      step: 'attestation',
      ok: false,
      ms: 0,
      detail: 'App Attest unsupported (simulator or non-iOS build)',
    })
    return report()
  }

  const uuid = getOrCreateInstallId()
  const cached = attestStore().getString(KEY_ID_KEY)
  let keyId: string | null = cached ?? null
  if (!cached || options.forceReattest) {
    keyId = await run('generate key', () => AppAttest.generateKey())
    if (keyId === null) return report()
    const attestation = await run(
      'attest key (Secure Enclave → Apple)',
      async () => AppAttest.attestKey(keyId!, await base64Sha256(challenge)),
      (a) => `${a.length} chars CBOR`
    )
    if (attestation === null) return report()
    const registered = await run('register attestation (ww-api)', async () => {
      await axios.post(
        apis.notesImportAttest,
        { keyId, attestation, challenge, uuid },
        { timeout: REQUEST_TIMEOUT_MS }
      )
      attestStore().set(KEY_ID_KEY, keyId!)
    })
    if (registered === null) return report()
  } else {
    steps.push({ step: 'device key', ok: true, ms: 0, detail: 'using cache' })
  }

  // Sign the same canonical clientData the real calls use over a fixed probe
  // hash, then have ww-api run the full verifyAssertion path — challenge
  // consumption, signature check, and sign-count advance, exactly as kickoff
  // does, minus metering and inference.
  const accountId = getOrCreateAccountId()
  const contentHash = await notesContentHash('notes-import auth diagnostics')
  const freshChallenge = await run(
    'challenge (assertion)',
    getChallenge,
    (c) => (c ? `${c.length} chars` : 'empty')
  )
  if (freshChallenge === null) return report()
  const assertion = await run(
    'sign assertion (local)',
    async () => {
      const clientData = `${freshChallenge}|${uuid}|${accountId}|${contentHash}`
      return AppAttest.generateAssertion(keyId!, await base64Sha256(clientData))
    },
    (a) => `${a.length} chars CBOR`
  )
  if (assertion === null) return report()
  await run('verify assertion (ww-api)', async () => {
    await axios.post(
      apis.notesImportVerify,
      {
        uuid,
        accountId,
        keyId,
        challenge: freshChallenge,
        assertion,
        contentHash,
      },
      { timeout: REQUEST_TIMEOUT_MS }
    )
  })
  return report()
}

/**
 * In DEV only, format the raw HTTP exchange for developer logs — including the
 * proxy's dev-only `detail` field (e.g. the underlying gateway error behind an
 * opaque `model_error`). Returns undefined in production.
 */
const buildDebugInfo = (e: unknown): string | undefined => {
  if (!__DEV__ || !isAxiosError(e)) return undefined
  const method = e.config?.method?.toUpperCase() ?? 'POST'
  const url = e.config?.url ?? '(unknown url)'
  const status = e.response?.status ?? '(no response)'
  let bodyStr: string
  try {
    bodyStr =
      e.response?.data != null
        ? JSON.stringify(e.response.data, null, 2)
        : e.message
  } catch {
    bodyStr = String(e.response?.data ?? e.message)
  }
  return `${method} ${url}\n→ ${status}\n${bodyStr}`
}

const toClientError = (e: unknown): NotesImportClientError => {
  if (isAxiosError(e)) {
    const status = e.response?.status
    const debug = buildDebugInfo(e)
    const payload = e.response?.data as
      | { code?: string; error?: string; credits?: unknown }
      | undefined
    const code = payload?.code as NotesImportErrorCode | undefined
    const message = payload?.error ?? e.message
    const credits = normalizeNotesImportCredits(payload?.credits) ?? undefined
    if (code) {
      return new NotesImportClientError(code, message, status, debug, credits)
    }
    if (!e.response) {
      return new NotesImportClientError(
        'network',
        'Network error',
        status,
        debug
      )
    }
    return new NotesImportClientError('unknown', message, status, debug)
  }
  if (e instanceof NotesImportClientError) return e
  return new NotesImportClientError('unknown', (e as Error).message)
}

/**
 * POST a body through the App Attest boundary (or the dev bypass), with one
 * re-attest retry if the server has forgotten our key (KV reset / new env).
 * Shared by the legacy and streaming-kickoff calls so both sign identically.
 */
const postAttested = async <T>(
  url: string,
  baseBody: Record<string, unknown>,
  uuid: string,
  accountId: string,
  contentHash: string
): Promise<T> => {
  if (DEV_BYPASS_ENABLED) {
    const { data } = await axios.post<T>(url, baseBody, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'x-ww-dev-bypass': DEV_BYPASS_TOKEN },
    })
    return data
  }

  const signedBody = async (keyId: string) => {
    const challenge = await getChallenge()
    // MUST stay byte-for-byte identical to ww-api's buildAssertionClientData:
    // binding the account id into the signature means a proxying user can't
    // swap in someone else's account id post-signature.
    const clientData = `${challenge}|${uuid}|${accountId}|${contentHash}`
    const assertion = await AppAttest.generateAssertion(
      keyId,
      await base64Sha256(clientData)
    )
    return { ...baseBody, keyId, challenge, assertion }
  }

  let keyId = await ensureAttested(uuid)
  try {
    const { data } = await axios.post<T>(url, await signedBody(keyId), {
      timeout: REQUEST_TIMEOUT_MS,
    })
    return data
  } catch (e) {
    const err = toClientError(e)
    if (
      err.code === 'attestation_failed' ||
      err.code === 'attestation_required'
    ) {
      keyId = await ensureAttested(uuid, true)
      const { data } = await axios.post<T>(url, await signedBody(keyId), {
        timeout: REQUEST_TIMEOUT_MS,
      })
      return data
    }
    throw e
  }
}

/**
 * Runs a Notes Import (or a follow-up refinement) end to end via the LEGACY
 * blocking path: identity, App Attest (or dev bypass), and the metered model
 * call in one request/response. Throws {@link NotesImportClientError} with a
 * branchable `code` on failure.
 */
export const requestNotesImport = async ({
  notesText,
  context,
  refinement,
}: RequestNotesImportArgs): Promise<NotesImportResponse> => {
  // Two identities (ADR 0011). `uuid` is this device's install id — the App
  // Attest identity ww-api pins device keys to, so an adopted account id can
  // never lock a device out at re-attest. `accountId` is the shared account id
  // RevenueCat knows; ww-api verifies Supporter status and meters credits
  // per-person against it, and it's bound into the signed clientData.
  const uuid = getOrCreateInstallId()
  const accountId = getOrCreateAccountId()
  const contentHash = await notesContentHash(notesText)
  try {
    const response = await postAttested<NotesImportWireResponse>(
      apis.notesImport,
      { uuid, accountId, notesText, contentHash, context, refinement },
      uuid,
      accountId,
      contentHash
    )
    return normalizeNotesImportResponse(response)
  } catch (e) {
    throw toClientError(e)
  }
}

// --- Streaming import (kickoff → SSE) ----------------------------------

/** Coarse lifecycle of an import, mirrored from the proxy's `events.ts`. */
export type ImportStatus =
  | 'queued'
  | 'starting'
  | 'thinking'
  | 'structuring'
  | 'done'
  | 'error'

/**
 * A progress event off the SSE stream. Everything but `done` is cosmetic — it
 * exists purely so the user sees the model working. `done` carries the
 * authoritative result (identical shape to {@link NotesImportResponse}).
 */
export type ImportStreamEvent =
  | { type: 'status'; status: ImportStatus }
  | { type: 'reasoning'; text: string }
  | { type: 'progress'; chars: number }
  | { type: 'done'; payload: NotesImportResponse }
  | {
      type: 'error'
      code: string
      message: string
      credits?: NotesImportCredits
    }

type ImportStreamWireEvent =
  | Exclude<ImportStreamEvent, { type: 'done' } | { type: 'error' }>
  | { type: 'done'; payload: NotesImportWireResponse }
  | { type: 'error'; code: string; message: string; credits?: unknown }

interface NotesImportKickoffResponse {
  importId: string
  subscribeToken: string
  refinement: boolean
  /** Required current usage snapshot; validated before reaching the manager. */
  credits: unknown
}

interface ResultSnapshot {
  status: ImportStatus | null
  payload?: NotesImportResponse
  error?: { code: string; message: string; credits?: NotesImportCredits }
}

interface WireResultSnapshot extends Omit<ResultSnapshot, 'payload' | 'error'> {
  payload?: NotesImportWireResponse
  error?: { code: string; message: string; credits?: unknown }
}

type StreamOutcome =
  | { kind: 'done'; payload: NotesImportResponse }
  | {
      kind: 'error'
      code: string
      message: string
      credits?: NotesImportCredits
    }
  | { kind: 'closed' }

/** Attested kickoff: gate inference, reserve a concurrency slot, return ids. */
const kickoffNotesImport = async ({
  notesText,
  context,
  refinement,
}: RequestNotesImportArgs): Promise<NotesImportKickoffResponse> => {
  // Same identity rules as `requestNotesImport` — see the comment there.
  const uuid = getOrCreateInstallId()
  const accountId = getOrCreateAccountId()
  const contentHash = await notesContentHash(notesText)
  try {
    return await postAttested<NotesImportKickoffResponse>(
      apis.notesImportKickoff,
      { uuid, accountId, notesText, contentHash, context, refinement },
      uuid,
      accountId,
      contentHash
    )
  } catch (e) {
    throw toClientError(e)
  }
}

/** Parse one SSE frame into its id + concatenated data (ignoring comments). */
const parseFrame = (frame: string): { id?: string; data?: string } => {
  let id: string | undefined
  let data = ''
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue
    if (line.startsWith('id:')) id = line.slice(3).trim()
    else if (line.startsWith('data:'))
      data += (data ? '\n' : '') + line.slice(5).trim()
  }
  return { id, data: data || undefined }
}

/**
 * Open the SSE stream and pump events until a terminal one or the connection
 * closes. Returns the outcome; throws only if the AbortSignal fires. Uses
 * `expo/fetch` because React Native's built-in fetch can't read a streaming
 * body and has no EventSource.
 *
 * Exported so the resume path can re-enter a live run by its persisted
 * `subscribeToken` without a fresh kickoff.
 */
export const consumeStream = async (
  importId: string,
  subscribeToken: string,
  lastEventId: string,
  onEvent: (ev: ImportStreamEvent) => void,
  onCursor: (id: string) => void,
  signal?: AbortSignal
): Promise<StreamOutcome> => {
  const params = new URLSearchParams({ token: subscribeToken })
  const resuming = lastEventId && lastEventId !== '0'
  if (resuming) params.set('lastEventId', lastEventId)

  const res = await expoFetch(
    `${apis.notesImportEvents(importId)}?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        ...(resuming ? { 'Last-Event-ID': lastEventId } : {}),
      },
      signal,
    }
  )
  if (res.status === 401) {
    return {
      kind: 'error',
      code: 'attestation_required',
      message: 'Stream token expired',
    }
  }
  if (!res.ok || !res.body) return { kind: 'closed' }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  // Read until a terminal event or natural close. We do NOT call reader.cancel()
  // on a terminal event: the server closes its side right after sending it, so
  // cancelling here would try to close an already-closed stream (expo/fetch logs
  // "The stream is not in a state that permits close"). On user cancel, the
  // AbortSignal aborts the fetch and read() rejects — handled by the caller.
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return { kind: 'closed' }
    buf += decoder.decode(value, { stream: true })
    let idx = buf.indexOf('\n\n')
    while (idx !== -1) {
      const { id, data } = parseFrame(buf.slice(0, idx))
      buf = buf.slice(idx + 2)
      if (id) onCursor(id)
      if (data) {
        let ev: ImportStreamEvent | null = null
        try {
          const wireEvent = JSON.parse(data) as ImportStreamWireEvent
          if (wireEvent.type === 'done') {
            ev = {
              ...wireEvent,
              payload: normalizeNotesImportResponse(wireEvent.payload),
            }
          } else if (wireEvent.type === 'error') {
            const credits =
              normalizeNotesImportCredits(wireEvent.credits) ?? undefined
            ev = { ...wireEvent, credits }
          } else {
            ev = wireEvent
          }
        } catch {
          ev = null
        }
        if (ev) {
          onEvent(ev)
          if (ev.type === 'done') return { kind: 'done', payload: ev.payload }
          if (ev.type === 'error') {
            return {
              kind: 'error',
              code: ev.code,
              message: ev.message,
              credits: ev.credits,
            }
          }
        }
      }
      idx = buf.indexOf('\n\n')
    }
  }
}

/** Final-result snapshot for reconnect after the stream closed. */
export const fetchNotesImportResult = async (
  importId: string,
  subscribeToken: string,
  signal?: AbortSignal
): Promise<ResultSnapshot> => {
  const { data } = await axios.get<WireResultSnapshot>(
    `${apis.notesImportResult(importId)}?token=${encodeURIComponent(
      subscribeToken
    )}`,
    { timeout: 15_000, signal }
  )
  return {
    ...data,
    payload: data.payload
      ? normalizeNotesImportResponse(data.payload)
      : undefined,
    error: data.error
      ? {
          code: data.error.code,
          message: data.error.message,
          credits: normalizeNotesImportCredits(data.error.credits) ?? undefined,
        }
      : undefined,
  }
}

/** The live run handle the client persists ("activeRun") while Working. */
export interface NotesImportRunHandle {
  importId: string
  subscribeToken: string
}

/**
 * Forget a run entirely, server-side: aborts any in-flight model call AND wipes
 * its Durable Object immediately (rather than letting it self-evict after the
 * retention window), freeing the user's concurrency slot. Authorized by the
 * same `?token=` capability as cancel/result (destroy can't spend inference, so
 * it needs no App Attest). Best-effort and fire-and-forget: a failed destroy
 * just falls back to the DO self-evicting. Backs the history view's per-row
 * delete.
 */
export const destroyNotesImport = async (
  run: NotesImportRunHandle
): Promise<void> => {
  try {
    await axios.post(
      `${apis.notesImportDestroy(run.importId)}?token=${encodeURIComponent(
        run.subscribeToken
      )}`,
      undefined,
      { timeout: 10_000 }
    )
  } catch {
    // Best-effort: a failed destroy just falls back to the DO self-evicting.
  }
}

export interface RunStreamingArgs extends RequestNotesImportArgs {
  /** Cosmetic progress sink for the UI. */
  onEvent?: (ev: ImportStreamEvent) => void
  /**
   * Fires immediately after a successful (re-)kickoff with the new run handle,
   * so the caller can persist it as the resumable `activeRun` BEFORE
   * streaming.
   */
  onKickoff?: (run: NotesImportRunHandle) => void
  /**
   * Fires with the usage snapshot the kickoff returned (when present), so the
   * meter can show as soon as the run starts. The authoritative final snapshot
   * still arrives in the `done` payload. No-op if the proxy omits credits.
   */
  onCredits?: (credits: NotesImportCredits) => void
  /** Cancels the kickoff + stream (e.g. on unmount / user cancel). */
  signal?: AbortSignal
}

/**
 * Subscribe to a run's SSE stream and resolve with its final result, surviving
 * a dropped/backgrounded connection: resume from the last event id, fall back
 * to a result snapshot, then a bounded reconnect. Throws
 * {@link NotesImportClientError} — notably `attestation_required` when the
 * subscribe token has expired (~1h), which the resume path treats as
 * "re-kickoff". Does NOT kick off; the run must already exist (`importId` +
 * `subscribeToken`).
 */
const streamRunToCompletion = async (
  run: NotesImportRunHandle,
  onEvent?: (ev: ImportStreamEvent) => void,
  signal?: AbortSignal
): Promise<NotesImportResponse> => {
  const { importId, subscribeToken } = run
  let lastEventId = '0'
  let attempts = 0
  for (;;) {
    if (signal?.aborted) {
      throw new NotesImportClientError('unknown', 'Import cancelled')
    }
    const cursorBefore = lastEventId
    let outcome: StreamOutcome
    try {
      outcome = await consumeStream(
        importId,
        subscribeToken,
        lastEventId,
        (ev) => onEvent?.(ev),
        (id) => {
          lastEventId = id
        },
        signal
      )
    } catch (e) {
      if (signal?.aborted) throw toClientError(e)
      outcome = { kind: 'closed' }
    }

    if (outcome.kind === 'done') return outcome.payload
    if (outcome.kind === 'error') {
      throw new NotesImportClientError(
        outcome.code as NotesImportErrorCode,
        outcome.message,
        undefined,
        undefined,
        outcome.credits
      )
    }

    // The connection delivered new events before dropping — it's healthy, just
    // flaky — so reset the consecutive-failure counter. Otherwise `attempts`
    // would count total drops over a long run and abort a healthy import.
    if (lastEventId !== cursorBefore) attempts = 0

    // Stream dropped without a terminal event (e.g. iOS backgrounding). Prefer
    // a result snapshot; otherwise reconnect from the last seen event id.
    const snap = await fetchNotesImportResult(
      importId,
      subscribeToken,
      signal
    ).catch(() => null)
    // A cancel/stop during the snapshot fetch must not resolve as a success.
    if (signal?.aborted) {
      throw new NotesImportClientError('unknown', 'Import cancelled')
    }
    if (snap?.status === 'done' && snap.payload) return snap.payload
    if (snap?.status === 'error' && snap.error) {
      throw new NotesImportClientError(
        snap.error.code as NotesImportErrorCode,
        snap.error.message,
        undefined,
        undefined,
        snap.error.credits
      )
    }
    if (++attempts >= 4) {
      throw new NotesImportClientError(
        'network',
        'Lost connection to the import'
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 700 * attempts))
  }
}

/**
 * Runs a Notes Import (or refinement) over the streaming path: attested
 * kickoff, then subscribe to the SSE progress stream, surfacing every event via
 * `onEvent` and resolving with the final result. The new run handle is surfaced
 * via `onKickoff` so the caller can persist it for resume. Throws
 * {@link NotesImportClientError}.
 */
export const runNotesImportStreaming = async ({
  notesText,
  context,
  refinement,
  onEvent,
  onKickoff,
  onCredits,
  signal,
}: RunStreamingArgs): Promise<NotesImportResponse> => {
  const { importId, subscribeToken, credits } = await kickoffNotesImport({
    notesText,
    context,
    refinement,
  })
  onKickoff?.({ importId, subscribeToken })
  // Surface the usage snapshot up front so the meter populates at run start.
  const kickoffCredits = normalizeNotesImportCredits(credits)
  if (kickoffCredits) onCredits?.(kickoffCredits)
  onEvent?.({ type: 'status', status: 'queued' })

  return streamRunToCompletion({ importId, subscribeToken }, onEvent, signal)
}

export interface ResumeNotesImportArgs extends RunStreamingArgs {
  /** The persisted run handle to reconnect to before any re-kickoff. */
  run: NotesImportRunHandle
}

/**
 * Resumes a Working import after the app was killed/backgrounded, WITHOUT
 * spending a kickoff first: reconnect to the persisted run via its subscribe
 * token (replay + tail), falling back to the result snapshot. If the token /
 * result window has lapsed (~1h) or the run is otherwise unreachable, it
 * escalates to an attested re-kickoff from the persisted `notesText` — which is
 * credit-free (the meter is idempotent per contentHash) and lands on the same
 * run if still alive, otherwise replays the cached result or re-runs.
 * `onKickoff` fires only on that re-kickoff, with the fresh run handle to
 * persist. Throws {@link NotesImportClientError} for genuine terminal failures
 * (e.g. model_error).
 */
export const resumeNotesImport = async ({
  run,
  notesText,
  context,
  refinement,
  onEvent,
  onKickoff,
  onCredits,
  signal,
}: ResumeNotesImportArgs): Promise<NotesImportResponse> => {
  try {
    return await streamRunToCompletion(run, onEvent, signal)
  } catch (e) {
    if (signal?.aborted) throw e
    const code = e instanceof NotesImportClientError ? e.code : 'unknown'
    // Token/result window lapsed (~1h) or the run is unreachable → re-kickoff
    // from the persisted notes. Genuine terminal errors surface unchanged.
    if (code !== 'attestation_required' && code !== 'network') throw e
    return runNotesImportStreaming({
      notesText,
      context,
      refinement,
      onEvent,
      onKickoff,
      onCredits,
      signal,
    })
  }
}

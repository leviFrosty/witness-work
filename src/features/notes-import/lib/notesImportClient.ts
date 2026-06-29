import axios, { isAxiosError } from 'axios'
import { fetch as expoFetch } from 'expo/fetch'
import * as Crypto from 'expo-crypto'
import { MMKV } from 'react-native-mmkv'
import apis from '@/constants/apis'
import { getOrCreateInstallId } from '@/lib/installId'
import { notesContentHash } from '@/features/notes-import/lib/notesContentHash'
import type {
  NotesImportContext,
  NotesImportResult,
} from '@/features/notes-import/lib/notesImportTypes'
import {
  normalizeNotesImportCredits,
  type NotesImportCredits,
  type NotesImportCreditsWire,
} from '@/features/notes-import/lib/notesImportUsage'
import * as AppAttest from '../../../../modules/app-attest'

/**
 * Notes Import network client. Owns identity (Keychain UUID), the App Attest
 * handshake + per-request assertion, and the metered model call. A configured
 * dev-bypass token (dev/staging worker only) skips App Attest so the simulator
 * — which has no Secure Enclave — can exercise the full flow.
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
const DEV_IMPORTS_UNLIMITED = DEV_BYPASS_ENABLED
const REQUEST_TIMEOUT_MS = 90_000

export type { NotesImportCredits } from '@/features/notes-import/lib/notesImportUsage'

export interface NotesImportResponse {
  result: NotesImportResult
  contentHash: string
  refinement: boolean
  credits: NotesImportCredits
}

interface NotesImportWireResponse extends Omit<NotesImportResponse, 'credits'> {
  credits: NotesImportCreditsWire
}

const normalizeNotesImportResponse = (
  response: NotesImportWireResponse
): NotesImportResponse => ({
  ...response,
  credits: normalizeNotesImportCredits(response.credits, {
    unlimitedImports: DEV_IMPORTS_UNLIMITED,
  }),
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
  constructor(
    code: NotesImportErrorCode,
    message: string,
    status?: number,
    debug?: string
  ) {
    super(message)
    this.name = 'NotesImportClientError'
    this.code = code
    this.status = status
    this.debug = debug
  }
}

export type NotesImportUnavailableReason = 'disabled' | 'no_provider'

export interface NotesImportStatus {
  available: boolean
  /**
   * Why the feature is down: a known machine code
   * ({@link NotesImportUnavailableReason}) OR operator-supplied free text from
   * the KV kill-switch (e.g. "Down for maintenance until 5pm"). The latter is
   * safe to surface to users as a detail line; the codes are not.
   */
  reason?: string
}

/**
 * Cheap, unauthenticated availability probe (no App Attest, no inference). The
 * proxy reports `available: false` when the feature is manually disabled or no
 * vetted ZDR provider is currently healthy. Fails OPEN: any network/parse error
 * resolves to `{ available: true }` so a flaky probe never blocks a feature
 * that would actually work — the real import path still enforces everything.
 */
export const getNotesImportStatus = async (): Promise<NotesImportStatus> => {
  try {
    const { data } = await axios.get<NotesImportStatus>(
      apis.notesImportStatus,
      {
        timeout: 8_000,
      }
    )
    return { available: data?.available !== false, reason: data?.reason }
  } catch {
    return { available: true }
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
    const code = (e.response?.data as { code?: string } | undefined)?.code as
      | NotesImportErrorCode
      | undefined
    const message =
      (e.response?.data as { error?: string } | undefined)?.error ?? e.message
    if (code) return new NotesImportClientError(code, message, status, debug)
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
    const clientData = `${challenge}|${uuid}|${contentHash}`
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
  const uuid = getOrCreateInstallId()
  const contentHash = await notesContentHash(notesText)
  try {
    const response = await postAttested<NotesImportWireResponse>(
      apis.notesImport,
      { uuid, notesText, contentHash, context, refinement },
      uuid,
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
  | { type: 'error'; code: string; message: string }

type ImportStreamWireEvent =
  | Exclude<ImportStreamEvent, { type: 'done' }>
  | { type: 'done'; payload: NotesImportWireResponse }

interface NotesImportKickoffResponse {
  importId: string
  subscribeToken: string
  refinement: boolean
}

interface ResultSnapshot {
  status: ImportStatus | null
  payload?: NotesImportResponse
  error?: { code: string; message: string }
}

interface WireResultSnapshot extends Omit<ResultSnapshot, 'payload'> {
  payload?: NotesImportWireResponse
}

type StreamOutcome =
  | { kind: 'done'; payload: NotesImportResponse }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'closed' }

/** Attested kickoff: gate inference, reserve a concurrency slot, return ids. */
const kickoffNotesImport = async ({
  notesText,
  context,
  refinement,
}: RequestNotesImportArgs): Promise<NotesImportKickoffResponse> => {
  const uuid = getOrCreateInstallId()
  const contentHash = await notesContentHash(notesText)
  try {
    return await postAttested<NotesImportKickoffResponse>(
      apis.notesImportKickoff,
      { uuid, notesText, contentHash, context, refinement },
      uuid,
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
          ev =
            wireEvent.type === 'done'
              ? {
                  ...wireEvent,
                  payload: normalizeNotesImportResponse(wireEvent.payload),
                }
              : wireEvent
        } catch {
          ev = null
        }
        if (ev) {
          onEvent(ev)
          if (ev.type === 'done') return { kind: 'done', payload: ev.payload }
          if (ev.type === 'error') {
            return { kind: 'error', code: ev.code, message: ev.message }
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
        outcome.message
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
        snap.error.message
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
  signal,
}: RunStreamingArgs): Promise<NotesImportResponse> => {
  const { importId, subscribeToken } = await kickoffNotesImport({
    notesText,
    context,
    refinement,
  })
  onKickoff?.({ importId, subscribeToken })
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
      signal,
    })
  }
}

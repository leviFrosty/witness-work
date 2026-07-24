import axios, { isAxiosError } from 'axios'
import { fetch as expoFetch } from 'expo/fetch'
import apis from '@/constants/apis'
import {
  NotesImportAppAttestError,
  NotesImportAppAttestHttpError,
} from '@/features/notes-import/lib/notesImportAppAttest'
import { notesImportAppAttest } from '@/features/notes-import/lib/notesImportAppAttestRuntime'
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

/**
 * Notes Import network client. Delegates authenticated kickoff/legacy posts,
 * identity injection, App Attest lifecycle, recovery, and dev bypass to the
 * deep Notes Import App Attest module. This file owns model-response
 * normalization and the kickoff → SSE/result lifecycle only.
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
  | 'cancelled'
  | 'unknown'

/**
 * A typed failure the hook can branch on (e.g. show the paywall on
 * `limit_reached`).
 */
export class NotesImportClientError extends Error {
  code: NotesImportErrorCode
  status?: number
  /**
   * Redacted developer metadata (method/URL/status/stable code only). Populated
   * only in `__DEV__`; never contains request/response bodies or auth
   * material.
   */
  debug?: string
  /** Authoritative usage attached to an allowance denial, when valid. */
  credits?: NotesImportCredits
  /** Stable App Attest semantic metadata, when supplied by the backend. */
  reason?: string
  action?: string
  constructor(
    code: NotesImportErrorCode,
    message: string,
    status?: number,
    debug?: string,
    credits?: NotesImportCredits,
    reason?: string,
    action?: string
  ) {
    super(message)
    this.name = 'NotesImportClientError'
    this.code = code
    this.status = status
    this.debug = debug
    this.credits = credits
    this.reason = reason
    this.action = action
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

/** DEV-only exchange metadata. Raw bodies and auth material are never included. */
const buildDebugInfo = (e: unknown): string | undefined => {
  if (typeof __DEV__ === 'undefined' || !__DEV__ || !isAxiosError(e)) {
    return undefined
  }
  const method = e.config?.method?.toUpperCase() ?? 'POST'
  const url = e.config?.url ?? '(unknown url)'
  const status = e.response?.status ?? '(no response)'
  const payload = isRecord(e.response?.data) ? e.response.data : null
  const code = typeof payload?.code === 'string' ? payload.code : 'none'
  return `${method} ${url}\n→ ${status}\ncode=${code}`
}

const NOTES_IMPORT_ERROR_CODES = new Set<NotesImportErrorCode>([
  'limit_reached',
  'refinement_limit',
  'too_large',
  'attestation_required',
  'attestation_failed',
  'model_error',
  'bad_request',
  'active_cap',
  'unavailable',
  'network',
  'cancelled',
  'unknown',
])

const isNotesImportErrorCode = (
  value: unknown
): value is NotesImportErrorCode =>
  typeof value === 'string' &&
  NOTES_IMPORT_ERROR_CODES.has(value as NotesImportErrorCode)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const developerDebug = (value: string): string | undefined =>
  typeof __DEV__ !== 'undefined' && __DEV__ ? value : undefined

const toClientError = (e: unknown): NotesImportClientError => {
  if (e instanceof NotesImportClientError) return e
  if (e instanceof NotesImportAppAttestError) {
    const code =
      e.code === 'cancelled'
        ? 'cancelled'
        : e.code === 'network'
          ? 'network'
          : 'attestation_failed'
    const message =
      code === 'cancelled'
        ? 'Import cancelled'
        : code === 'network'
          ? 'Network error'
          : 'Device verification failed'
    return new NotesImportClientError(
      code,
      message,
      e.status,
      developerDebug(`auth=${e.code}`),
      undefined,
      e.reason,
      e.action
    )
  }
  if (e instanceof NotesImportAppAttestHttpError) {
    const code = isNotesImportErrorCode(e.serverCode)
      ? e.serverCode
      : e.kind === 'cancelled'
        ? 'cancelled'
        : e.kind === 'network'
          ? 'network'
          : 'unknown'
    const message =
      code === 'cancelled'
        ? 'Import cancelled'
        : code === 'network'
          ? 'Network error'
          : 'Notes Import request failed'
    return new NotesImportClientError(
      code,
      message,
      e.status,
      e.serverCode ? developerDebug(`server=${e.serverCode}`) : undefined,
      normalizeNotesImportCredits(e.credits) ?? undefined,
      e.reason,
      e.action
    )
  }
  if (isAxiosError(e)) {
    const status = e.response?.status
    const debug = buildDebugInfo(e)
    if (e.code === 'ERR_CANCELED') {
      return new NotesImportClientError(
        'cancelled',
        'Import cancelled',
        status,
        debug
      )
    }
    const payload = isRecord(e.response?.data) ? e.response.data : null
    const code = isNotesImportErrorCode(payload?.code)
      ? payload.code
      : undefined
    const message =
      typeof payload?.error === 'string' ? payload.error : e.message
    const credits = normalizeNotesImportCredits(payload?.credits) ?? undefined
    const reason =
      typeof payload?.reason === 'string' ? payload.reason : undefined
    const action =
      typeof payload?.action === 'string' ? payload.action : undefined
    if (code) {
      return new NotesImportClientError(
        code,
        message,
        status,
        debug,
        credits,
        reason,
        action
      )
    }
    if (!e.response) {
      return new NotesImportClientError(
        'network',
        'Network error',
        status,
        debug
      )
    }
    return new NotesImportClientError(
      'unknown',
      message,
      status,
      debug,
      undefined,
      reason,
      action
    )
  }
  if (e instanceof Error && e.name === 'AbortError') {
    return new NotesImportClientError('cancelled', 'Import cancelled')
  }
  return new NotesImportClientError(
    'unknown',
    e instanceof Error ? e.message : 'Unknown error'
  )
}

/**
 * The single caller seam for protected model posts. The deep module injects
 * both identities and owns protocol negotiation, FIFO authorization, and every
 * key lifecycle transition.
 */
const postAttested = <T>(
  endpoint: 'kickoff' | 'legacy',
  payload: Record<string, unknown>,
  contentHash: string,
  signal?: AbortSignal
): Promise<T> =>
  notesImportAppAttest.post<T>({
    endpoint,
    payload,
    contentHash,
    signal,
  })

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
  const contentHash = await notesContentHash(notesText)
  try {
    const response = await postAttested<NotesImportWireResponse>(
      'legacy',
      { notesText, context, refinement },
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
  signal,
}: RequestNotesImportArgs & {
  signal?: AbortSignal
}): Promise<NotesImportKickoffResponse> => {
  const contentHash = await notesContentHash(notesText)
  try {
    return await postAttested<NotesImportKickoffResponse>(
      'kickoff',
      { notesText, context, refinement },
      contentHash,
      signal
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
      throw new NotesImportClientError('cancelled', 'Import cancelled')
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
      throw new NotesImportClientError('cancelled', 'Import cancelled')
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
    signal,
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

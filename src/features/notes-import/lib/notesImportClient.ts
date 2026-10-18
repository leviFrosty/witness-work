import { fetch as expoFetch } from 'expo/fetch'
import apis from '@/constants/apis'
import { HttpError, type RequestOptions } from '@/lib/http/request'
import { kindForStatus } from '@/lib/http/networkError'
import { perf } from '@/lib/perf'
import { type AttestationSupport, deviceAttestation } from '@/lib/attestation'
import { attestationTransport } from '@/lib/attestation/transport'
import { accountSessions, hasAccountKey } from '@/lib/serverAccount'
import {
  AccountSessionError,
  type AttestationProblem,
} from '@/lib/serverAccount/session'
import { linkBeforePaidCall } from '@/lib/serverAccount/revenueCatLinkRuntime'
import type {
  NotesImportContext,
  NotesImportResult,
} from '@/features/notes-import/lib/notesImportTypes'
import { ACCOUNT_TIMEOUT_MS } from '@/lib/serverAccount/client'
import {
  normalizeNotesImportAccountUsage,
  normalizeNotesImportCredits,
  normalizeNotesImportStatus,
  type NotesImportAccountUsage,
  type NotesImportCredits,
  type NotesImportStatus,
} from '@/features/notes-import/lib/notesImportUsage'

/**
 * Notes Import network client. Every call but the public status probe goes
 * through this device's attested account session (ADR 0027): it carries
 * `Authorization: Bearer`, ww-api meters the session's account, and the
 * session's own attestation stands in for attesting each import. The session
 * client opens, refreshes and reopens the session, refreshes once on a 401, and
 * shows Update Required on a 426. This file owns the request bodies,
 * model-response normalization and the kickoff → SSE/result lifecycle.
 *
 * Two model paths exist:
 *
 * - {@link runNotesImportStreaming} (preferred): kickoff returns an import id;
 *   progress then streams over SSE (via `expo/fetch`) so the user sees the
 *   model working instead of a dead spinner. The run lives server-side in a
 *   Durable Object, so a dropped or backgrounded connection resumes losslessly
 *   (replay by `Last-Event-ID`, with a result-snapshot fallback). Only the
 *   account that kicked a run off can read or delete it.
 * - {@link requestNotesImport}: one blocking request/response, the synchronous
 *   fallback.
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
  /** This device's session couldn't be opened: verification didn't pass. */
  | 'attestation_failed'
  /**
   * Device verification couldn't run right now (Apple, Google, or ww-api's
   * verifier had trouble). Temporary: retry later. Distinct from
   * `attestation_failed` / `device_ineligible`.
   */
  | 'attestation_unavailable'
  | 'model_error'
  | 'bad_request'
  | 'active_cap'
  /** Import from Paper: this account read its page allowance for today. */
  | 'transcribe_limit'
  | 'unavailable'
  | 'network'
  | 'cancelled'
  | 'unknown'
  /**
   * This device or app build can never be verified (a simulator, App Attest
   * unsupported, Android without Google Play, or ww-api found it isn't
   * genuine), so it can't have the account session Notes Import needs.
   */
  | 'device_ineligible'
  /** Ww-api suspended this account: no new imports or page reads. */
  | 'suspended'
  /** Ww-api answered 426: this app version is too old. */
  | 'upgrade_required'
  /**
   * A run route found no import this account may read: deleted, past its
   * retention, or another account's.
   */
  | 'not_found'

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
  /** The server's stable reason (a refused attestation), when it gave one. */
  reason?: string
  action?: string
  /** How long the server asked to wait (`active_cap`, outages), when it said. */
  retryAfterMs?: number
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

/**
 * `disabled` / `no_provider` come from the proxy; `version_below_min` is
 * synthesized client-side when this build is under the advertised
 * `minAppVersion` floor.
 */
export type NotesImportUnavailableReason =
  | 'disabled'
  | 'no_provider'
  | 'version_below_min'
export type { NotesImportStatus } from '@/features/notes-import/lib/notesImportUsage'

/** The status endpoint answered, but not in the shape this build reads. */
export class NotesImportStatusContractError extends Error {
  constructor() {
    super('Notes Import status response was malformed')
    this.name = 'NotesImportStatusContractError'
  }
}

/**
 * Cheap, public availability probe (no session, no inference). Shared with App
 * Attest's protocol negotiation and Play Integrity's project lookup. Throws the
 * transport's `AttestationHttpError` on a network or HTTP failure (classify it
 * with `classifyNetworkError`), or {@link NotesImportStatusContractError} on a
 * malformed body.
 */
export const fetchNotesImportStatus = async (): Promise<NotesImportStatus> => {
  const status = normalizeNotesImportStatus(
    await attestationTransport.getStatus()
  )
  if (!status) throw new NotesImportStatusContractError()
  return status
}

/** {@link fetchNotesImportStatus}, or null on any failure. */
export const getNotesImportStatus =
  async (): Promise<NotesImportStatus | null> =>
    fetchNotesImportStatus().catch(() => null)

/**
 * The account's allowance (`GET /notes-import/usage`), the same on every device
 * on the account. Read as this device's session, opening one only when the
 * device already has the account key (a second device often has the key before
 * it has a session); it never creates a key. Null without either, on any
 * failure (servers from before the route answer 404), or for a malformed
 * answer, so the composer keeps what it shows.
 */
export const fetchNotesImportAccountUsage =
  async (): Promise<NotesImportAccountUsage | null> => {
    try {
      await accountSessions.ready()
      if (!accountSessions.snapshot() && !(await hasAccountKey())) return null
      const response = await accountSessions.request<unknown>({
        url: apis.notesImportUsage,
        method: 'GET',
        timeoutMs: ACCOUNT_TIMEOUT_MS,
      })
      return normalizeNotesImportAccountUsage(response.data)
    } catch {
      return null
    }
  }

let deviceSupport: Promise<AttestationSupport> | null = null

/**
 * Whether this device is already known to fail verification, so Notes Import
 * can say so before the User writes anything: it can't attest at all (checked
 * once per launch), or its last session open was refused for the device and is
 * still holding off. Never opens a session or creates an account key.
 */
export const notesImportDeviceUnverified = async (): Promise<boolean> => {
  if (accountSessions.lastOpenFailure()?.attestation === 'device') return true
  const pending = (deviceSupport ??= deviceAttestation
    .checkSupport()
    .catch((): AttestationSupport => 'unknown'))
  const support = await pending
  // Unknown (offline, Play unreachable) is asked again next time.
  if (support === 'unknown' && deviceSupport === pending) deviceSupport = null
  return support === 'unsupported'
}

export interface RequestNotesImportArgs {
  notesText: string
  context: NotesImportContext
  /** Present for a stateless follow-up refinement of an earlier parse. */
  refinement?: { previousResultJSON: string; instruction: string }
}

/**
 * Per-route budgets. Only the synchronous fallback waits for the model, and
 * transcribe for the vision model to read one page; kickoff returns quickly, so
 * a stalled connection there fails in seconds. Opening the session, when it has
 * to, happens before these start.
 */
const KICKOFF_TIMEOUT_MS = 15_000
const SYNC_TIMEOUT_MS = 90_000
const TRANSCRIBE_TIMEOUT_MS = 60_000
const RESULT_TIMEOUT_MS = 15_000
const DESTROY_TIMEOUT_MS = 10_000

const NOTES_IMPORT_ERROR_CODES = new Set<NotesImportErrorCode>([
  'limit_reached',
  'refinement_limit',
  'too_large',
  'attestation_failed',
  'model_error',
  'bad_request',
  'active_cap',
  'transcribe_limit',
  'unavailable',
  'network',
  'cancelled',
  'unknown',
  'suspended',
  'upgrade_required',
  'not_found',
])

const isNotesImportErrorCode = (
  value: unknown
): value is NotesImportErrorCode =>
  typeof value === 'string' &&
  NOTES_IMPORT_ERROR_CODES.has(value as NotesImportErrorCode)

const developerDebug = (value: string): string | undefined =>
  typeof __DEV__ !== 'undefined' && __DEV__ ? value : undefined

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A 429 or 5xx whose code this build doesn't know (`server_error`, the per-IP
 * `rate_limited`, sessions `disabled`, a proxy's bare 502): the service is
 * busy, not the app broken.
 */
const isTemporaryHttpFailure = (status: number | null | undefined) =>
  status === 429 || (status != null && status >= 500)

const cancelledError = () =>
  new NotesImportClientError('cancelled', 'Import cancelled')

const networkError = () =>
  new NotesImportClientError('network', 'Network error')

/** What a session that couldn't be opened means for an import. */
const ATTESTATION_CODES: Record<AttestationProblem, NotesImportErrorCode> = {
  device: 'device_ineligible',
  temporary: 'attestation_unavailable',
  failed: 'attestation_failed',
}

/** A session that couldn't be opened or used (`AccountSessionError`). */
const fromSessionError = (e: AccountSessionError): NotesImportClientError => {
  const debug = developerDebug(`session=${e.failure}`)
  const status = e.status ?? undefined
  switch (e.failure) {
    case 'cancelled':
      return cancelledError()
    case 'offline':
      return networkError()
    case 'attestation': {
      const code = ATTESTATION_CODES[e.attestation ?? 'failed']
      return new NotesImportClientError(
        code,
        code === 'attestation_unavailable'
          ? 'Device verification unavailable'
          : 'Device verification failed',
        status,
        debug,
        undefined,
        e.reason ?? undefined
      )
    }
    case 'upgrade':
      return new NotesImportClientError(
        'upgrade_required',
        'Update required',
        status,
        debug
      )
    case 'unavailable':
    case 'rateLimited': {
      const error = new NotesImportClientError(
        'unavailable',
        'Notes Import request failed',
        status,
        debug
      )
      if (e.retryAfterMs !== null) error.retryAfterMs = e.retryAfterMs
      return error
    }
    case 'server':
      return new NotesImportClientError(
        isTemporaryHttpFailure(e.status) ? 'unavailable' : 'unknown',
        'Notes Import request failed',
        status,
        debug
      )
  }
}

/**
 * A Notes Import route's own refusal. ww-api's bodies carry the stable code in
 * `code` (`error` is human text), plus `credits` on allowance denials and
 * `retryAfter` (seconds) when it says when to come back.
 */
const fromHttpError = (e: HttpError): NotesImportClientError => {
  if (e.kind === 'cancelled') return cancelledError()
  // No response: offline, refused, or the timeout fired.
  if (e.status === null) return networkError()
  const body = isRecord(e.body) ? e.body : null
  // The stream's refusals have no body to read; their code is the error's own.
  const serverCode = typeof body?.code === 'string' ? body.code : e.serverCode
  const code: NotesImportErrorCode = isNotesImportErrorCode(serverCode)
    ? serverCode
    : // The token was refused even after a refresh: this session won't do.
      e.status === 401
      ? 'attestation_failed'
      : isTemporaryHttpFailure(e.status)
        ? 'unavailable'
        : 'unknown'
  const error = new NotesImportClientError(
    code,
    'Notes Import request failed',
    e.status,
    developerDebug(
      `status=${e.status}${serverCode ? ` server=${serverCode}` : ''}`
    ),
    normalizeNotesImportCredits(body?.credits) ?? undefined,
    typeof body?.reason === 'string' ? body.reason : undefined,
    typeof body?.action === 'string' ? body.action : undefined
  )
  const bodyRetryAfter =
    typeof body?.retryAfter === 'number' ? body.retryAfter * 1000 : null
  const retryAfterMs = e.retryAfterMs ?? bodyRetryAfter
  if (retryAfterMs !== null) error.retryAfterMs = retryAfterMs
  return error
}

const toClientError = (e: unknown): NotesImportClientError => {
  if (e instanceof NotesImportClientError) return e
  // An HttpError too, so first.
  if (e instanceof AccountSessionError) return fromSessionError(e)
  if (e instanceof HttpError) return fromHttpError(e)
  if (e instanceof Error && e.name === 'AbortError') return cancelledError()
  return new NotesImportClientError(
    'unknown',
    e instanceof Error ? e.message : 'Unknown error'
  )
}

/** A bearer request as this device's account session. */
const sessionRequest = async <T>(options: RequestOptions): Promise<T> => {
  try {
    return (await accountSessions.request<T>(options)).data
  } catch (e) {
    throw toClientError(e)
  }
}

/**
 * Kickoff's and the synchronous fallback's body. No identity, hashes or
 * attestation: the session's account is the meter, and the session attested
 * when it opened. Supporter status is the account's (ADR 0029).
 */
const modelRequestBody = ({
  notesText,
  context,
  refinement,
}: RequestNotesImportArgs) => ({
  notesText,
  context,
  ...(refinement && { refinement }),
})

/**
 * A metered call as the session: links this device's RevenueCat customer to the
 * account first when this launch hasn't (ADR 0029), so a Supporter is metered
 * as one. A link that fails or takes too long never holds it up.
 */
const meteredRequest = async <T>(options: RequestOptions): Promise<T> => {
  await linkBeforePaidCall()
  return sessionRequest<T>(options)
}

/**
 * Runs a Notes Import (or a follow-up refinement) end to end over the
 * synchronous fallback: the metered model call in one request/response. Throws
 * {@link NotesImportClientError} with a branchable `code` on failure.
 */
export const requestNotesImport = async (
  args: RequestNotesImportArgs
): Promise<NotesImportResponse> =>
  normalizeNotesImportResponse(
    await meteredRequest<NotesImportWireResponse>({
      url: apis.notesImport,
      method: 'POST',
      json: modelRequestBody(args),
      timeoutMs: SYNC_TIMEOUT_MS,
    })
  )

// --- Import from Paper (page transcription) ----------------------------

export interface TranscribeNotesPageArgs {
  /** Base64 page image (JPEG), already resized and stripped of metadata. */
  image: string
  mimeType: 'image/jpeg'
  signal?: AbortSignal
}

export interface TranscribedNotesPage {
  text: string
  /** The model ran out of room before the end of the page. */
  truncated: boolean
}

/**
 * Reads one page photo into plain text (ADR 0025), as the session's account. No
 * credit is spent here: the text goes into the composer for review and is
 * imported through the normal kickoff. Throws {@link NotesImportClientError}.
 */
export const transcribeNotesPage = async ({
  image,
  mimeType,
  signal,
}: TranscribeNotesPageArgs): Promise<TranscribedNotesPage> => {
  const response = await meteredRequest<unknown>({
    url: apis.notesImportTranscribe,
    method: 'POST',
    json: { image, mimeType },
    timeoutMs: TRANSCRIBE_TIMEOUT_MS,
    signal,
  })
  if (!isRecord(response) || typeof response.text !== 'string') {
    throw new NotesImportClientError('unknown', 'Malformed transcription')
  }
  return { text: response.text, truncated: response.truncated === true }
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

/** Kickoff: gate inference, reserve a concurrency slot, return the run's id. */
const kickoffNotesImport = async ({
  signal,
  ...args
}: RequestNotesImportArgs & {
  signal?: AbortSignal
}): Promise<NotesImportKickoffResponse> => {
  const response = await meteredRequest<unknown>({
    url: apis.notesImportKickoff,
    method: 'POST',
    json: modelRequestBody(args),
    timeoutMs: KICKOFF_TIMEOUT_MS,
    signal,
  })
  if (!isRecord(response) || typeof response.importId !== 'string') {
    throw new NotesImportClientError('unknown', 'Malformed kickoff')
  }
  return response as unknown as NotesImportKickoffResponse
}

/**
 * Parse one SSE frame into its id + concatenated data. Comment lines (`:`),
 * such as the server's `: heartbeat` keep-alives, are ignored, so a
 * comment-only frame yields neither.
 */
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
 * How long the stream may stay silent before we treat it as stalled. The server
 * sends a `: heartbeat` comment every 15 s, so this spans three missed beats;
 * servers without heartbeats still send progress well inside it. A stalled
 * connection (Wi-Fi handoff, a proxy that went quiet) otherwise waits forever.
 */
export const SSE_IDLE_TIMEOUT_MS = 45_000

class StreamIdleError extends Error {
  constructor() {
    super('Notes Import stream went quiet')
    this.name = 'StreamIdleError'
  }
}

/** The stream's answers that reconnecting can't fix. */
const STREAM_REFUSALS: Record<number, string> = {
  /** The session handles this one: refresh once and reconnect. */
  401: 'unauthorized',
  404: 'not_found',
  426: 'upgrade_required',
}

/**
 * Open the SSE stream with the session's `authorization` and pump events until
 * a terminal one or the connection closes. Returns the outcome; throws if the
 * AbortSignal fires or the connection errors, and an `HttpError` for a 401, 404
 * or 426, which reconnecting can't fix (the session refreshes on the 401). Uses
 * `expo/fetch` because React Native's built-in fetch can't read a streaming
 * body and has no EventSource.
 *
 * An idle watchdog ({@link SSE_IDLE_TIMEOUT_MS}, reset by every chunk,
 * heartbeats included) aborts a stalled connection and returns `closed`, so the
 * caller falls through to its snapshot-and-reconnect path.
 */
export const consumeStream = async (
  importId: string,
  authorization: string,
  lastEventId: string,
  onEvent: (ev: ImportStreamEvent) => void,
  onCursor: (id: string) => void,
  signal?: AbortSignal
): Promise<StreamOutcome> => {
  const resuming = lastEventId && lastEventId !== '0'

  // Our own controller, so the watchdog can drop the connection without
  // touching the caller's signal. Hermes may lack AbortSignal.any.
  const controller = new AbortController()
  const onCallerAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', onCallerAbort)

  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let rejectIdle: (error: StreamIdleError) => void = () => {}
  const idle = new Promise<never>((_, reject) => {
    rejectIdle = reject
  })
  // Raced against every await below; never left unhandled.
  idle.catch(() => {})
  const armIdle = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      perf.count('notesImport:sseIdleAbort')
      rejectIdle(new StreamIdleError())
      controller.abort()
    }, SSE_IDLE_TIMEOUT_MS)
  }

  try {
    armIdle()
    const res = await Promise.race([
      expoFetch(apis.notesImportEvents(importId), {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: authorization,
          ...(resuming ? { 'Last-Event-ID': lastEventId } : {}),
        },
        signal: controller.signal,
      }),
      idle,
    ])
    const refusal = STREAM_REFUSALS[res.status]
    if (refusal) {
      throw new HttpError(kindForStatus(res.status), res.status, refusal)
    }
    if (!res.ok || !res.body) return { kind: 'closed' }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    // Read until a terminal event or natural close. We do NOT call
    // reader.cancel() on a terminal event: the server closes its side right
    // after sending it, so cancelling here would try to close an already-closed
    // stream (expo/fetch logs "The stream is not in a state that permits
    // close"). On user cancel or an idle abort, the controller aborts the fetch
    // and read() rejects; the race against `idle` unblocks us even if it
    // doesn't.
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), idle])
      if (done) return { kind: 'closed' }
      // Any bytes, heartbeat comments included, prove the connection is alive.
      armIdle()
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
  } catch (error) {
    // A stall, not a cancel: hand back to snapshot-and-reconnect.
    if (error instanceof StreamIdleError && !signal?.aborted) {
      return { kind: 'closed' }
    }
    throw error
  } finally {
    clearTimeout(idleTimer)
    signal?.removeEventListener('abort', onCallerAbort)
  }
}

/** Final-result snapshot for reconnect after the stream closed. */
export const fetchNotesImportResult = async (
  importId: string,
  signal?: AbortSignal
): Promise<ResultSnapshot> => {
  const data = await sessionRequest<WireResultSnapshot>({
    url: apis.notesImportResult(importId),
    timeoutMs: RESULT_TIMEOUT_MS,
    signal,
  })
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

/**
 * The live run handle the client persists ("activeRun") while Working. The
 * session's token authorizes it; there's no per-run secret.
 */
export interface NotesImportRunHandle {
  importId: string
}

/**
 * Forget a run entirely, server-side: aborts any in-flight model call AND wipes
 * its Durable Object immediately (rather than letting it self-evict after the
 * retention window), freeing the account's concurrency slot. Best-effort and
 * fire-and-forget: a failed destroy just falls back to the DO self-evicting,
 * and a 404 means it's already gone. Backs the history view's per-row delete.
 */
export const destroyNotesImport = async (
  run: NotesImportRunHandle
): Promise<void> => {
  try {
    await accountSessions.request({
      url: apis.notesImportDestroy(run.importId),
      method: 'POST',
      timeoutMs: DESTROY_TIMEOUT_MS,
      responseType: 'none',
    })
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
 * Failures reconnecting can't fix: the session couldn't be had (this device
 * can't be verified, accounts are off, the app is too old), or the run isn't
 * this account's to read (404). Offline and a busy server reconnect instead.
 */
const endsStream = (e: unknown): boolean => {
  if (e instanceof AccountSessionError)
    return (
      e.failure === 'attestation' ||
      e.failure === 'upgrade' ||
      e.failure === 'unavailable'
    )
  return e instanceof HttpError && (e.status === 401 || e.status === 404)
}

/**
 * Subscribe to a run's SSE stream and resolve with its final result, surviving
 * a dropped/backgrounded connection: resume from the last event id, fall back
 * to a result snapshot, then a bounded reconnect. Each connection takes the
 * session's current token (a fresh one once it's near expiry, and after a 401
 * one refresh and a second try), so a run outlives any one token. Throws
 * {@link NotesImportClientError} — notably `not_found` when the run is gone or
 * isn't this account's, which the resume path treats as "re-kickoff". Does NOT
 * kick off; the run must already exist.
 */
const streamRunToCompletion = async (
  { importId }: NotesImportRunHandle,
  onEvent?: (ev: ImportStreamEvent) => void,
  signal?: AbortSignal
): Promise<NotesImportResponse> => {
  let lastEventId = '0'
  let attempts = 0
  for (;;) {
    if (signal?.aborted) throw cancelledError()
    const cursorBefore = lastEventId
    let outcome: StreamOutcome
    try {
      outcome = await accountSessions.withSession(
        (authorization) =>
          consumeStream(
            importId,
            authorization,
            lastEventId,
            (ev) => onEvent?.(ev),
            (id) => {
              lastEventId = id
            },
            signal
          ),
        { signal }
      )
    } catch (e) {
      if (signal?.aborted || endsStream(e)) throw toClientError(e)
      outcome = { kind: 'closed' }
    }

    if (outcome.kind === 'done') return outcome.payload
    if (outcome.kind === 'error') {
      throw new NotesImportClientError(
        isNotesImportErrorCode(outcome.code) ? outcome.code : 'unknown',
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
    let snap: ResultSnapshot | null = null
    try {
      snap = await fetchNotesImportResult(importId, signal)
    } catch (e) {
      const code = e instanceof NotesImportClientError ? e.code : 'unknown'
      if (!signal?.aborted && isFinalSnapshotFailure(code)) throw e
    }
    // A cancel/stop during the snapshot fetch must not resolve as a success.
    if (signal?.aborted) throw cancelledError()
    if (snap?.status === 'done' && snap.payload) return snap.payload
    if (snap?.status === 'error' && snap.error) {
      throw new NotesImportClientError(
        isNotesImportErrorCode(snap.error.code) ? snap.error.code : 'unknown',
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

/** A snapshot failure that reconnecting can't fix (see `endsStream`). */
const isFinalSnapshotFailure = (code: NotesImportErrorCode): boolean =>
  code === 'not_found' ||
  code === 'device_ineligible' ||
  code === 'attestation_failed' ||
  code === 'attestation_unavailable' ||
  code === 'upgrade_required'

/**
 * Runs a Notes Import (or refinement) over the streaming path: kickoff, then
 * subscribe to the SSE progress stream, surfacing every event via `onEvent` and
 * resolving with the final result. The new run handle is surfaced via
 * `onKickoff` so the caller can persist it for resume. Throws
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
  const { importId, credits } = await kickoffNotesImport({
    notesText,
    context,
    refinement,
    signal,
  })
  onKickoff?.({ importId })
  // Surface the usage snapshot up front so the meter populates at run start.
  const kickoffCredits = normalizeNotesImportCredits(credits)
  if (kickoffCredits) onCredits?.(kickoffCredits)
  onEvent?.({ type: 'status', status: 'queued' })

  return streamRunToCompletion({ importId }, onEvent, signal)
}

export interface ResumeNotesImportArgs extends RunStreamingArgs {
  /** The persisted run handle to reconnect to before any re-kickoff. */
  run: NotesImportRunHandle
}

/**
 * Resumes a Working import after the app was killed/backgrounded, WITHOUT
 * spending a kickoff first: reconnect to the persisted run (replay + tail),
 * falling back to the result snapshot. If the run is gone (deleted, past its
 * ~1h retention, or another account's) or otherwise unreachable, it escalates
 * to a re-kickoff from the persisted `notesText` — credit-free when this
 * account already imported the same notes (the meter is idempotent per
 * contentHash) — which lands on the same run if still alive, otherwise replays
 * the cached result or re-runs. `onKickoff` fires only on that re-kickoff, with
 * the fresh run handle to persist. Throws {@link NotesImportClientError} for
 * genuine terminal failures (e.g. model_error).
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
    // The run is gone or unreachable → re-kickoff from the persisted notes.
    // Genuine terminal errors surface unchanged.
    if (code !== 'not_found' && code !== 'network') throw e
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

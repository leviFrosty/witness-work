/**
 * Notes Import progress stream — wire contract.
 *
 * This is the SOURCE OF TRUTH for what the client sees on the live import
 * channel. The stream exists SOLELY to keep the user informed that the model is
 * working (phase changes, optional reasoning, a heartbeat of output growth) — it
 * is never parsed for data. The authoritative structured result rides on the
 * single terminal `done` event (and is also fetchable via GET .../result), and
 * mirrors the legacy synchronous `POST /notes-import` response so the app's
 * apply logic is unchanged.
 *
 * Every event carries a monotonic `seq` (its SQLite rowid in the run DO) so a
 * client that drops and reconnects resumes with `Last-Event-ID` and never
 * replays an event it already applied.
 */

import type { CreditsSnapshot } from '../credits'
import type { NotesImportResult } from './schema'

/** Coarse lifecycle, surfaced purely so the wait feels alive. */
export type ImportStatus =
  | 'queued' // accepted, model not yet started
  | 'starting' // about to call the model
  | 'thinking' // model is reasoning (only when reasoning is enabled + emitted)
  | 'structuring' // model is emitting the structured result
  | 'done' // finished; final result available on the `done` event
  | 'error' // failed
  | 'cancelled' // interrupted by the client before completion (never charged)

/**
 * The payload delivered once an import succeeds. Field-for-field identical to
 * the legacy `POST /notes-import` 200 body so `useNotesImport.applyResult` needs
 * no change beyond where it reads it from.
 */
export interface NotesImportSuccess {
  result: NotesImportResult
  contentHash: string
  refinement: boolean
  /**
   * The run produced no records (an Empty Import) AND still charged an Import
   * Credit because the rolling free-empty window was exhausted (ADR 0012). The
   * client shows a fixed Scribe AI notice when this is true; a within-window free
   * empty (or any non-empty run) leaves it false. Absent on older payloads →
   * treat as false.
   */
  emptyCharged: boolean
  credits: CreditsSnapshot
}

/** Terminal failure, branchable by the same codes the legacy path returns. */
export interface NotesImportFailure {
  code: string
  message: string
}

/** A single progress event on the stream. `seq` is assigned by the run DO. */
export type ImportEvent =
  | { type: 'status'; seq: number; status: ImportStatus }
  | { type: 'reasoning'; seq: number; text: string }
  | { type: 'progress'; seq: number; chars: number }
  | { type: 'done'; seq: number; payload: NotesImportSuccess }
  | { type: 'error'; seq: number; code: string; message: string }
  | { type: 'cancelled'; seq: number }

/** Distributes `Omit` across the union so each member keeps its own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

/** An event before the DO has assigned it a sequence number. */
export type UnsequencedEvent = DistributiveOmit<ImportEvent, 'seq'>

export const isTerminalEvent = (e: { type: ImportEvent['type'] }): boolean =>
  e.type === 'done' || e.type === 'error' || e.type === 'cancelled'

/**
 * Serialize one event as an SSE frame. The `id:` line is the resume cursor; the
 * `event:` line lets the client switch on type without first parsing `data`.
 * `data` repeats the full event (sans `seq`) as JSON for convenience.
 *
 * An UNSEQUENCED event (no `seq` — a cosmetic reasoning/progress frame that the
 * run DO broadcasts without persisting) is framed WITHOUT an `id:` line. Per the
 * SSE spec a frame with no `id:` leaves the client's `Last-Event-ID` unchanged,
 * so these throwaway frames never become a resume cursor: a reconnect resumes
 * from the last persisted status/terminal event and simply re-tails live.
 */
export const formatSSE = (e: ImportEvent | UnsequencedEvent): string => {
  const seq = 'seq' in e ? e.seq : undefined
  const rest: Record<string, unknown> = { ...e }
  delete rest.seq
  const id = seq === undefined ? '' : `id: ${seq}\n`
  return `${id}event: ${e.type}\ndata: ${JSON.stringify(rest)}\n\n`
}

/**
 * Resolve a client-supplied resume cursor (the `Last-Event-ID` header or a
 * `lastEventId` query param) to a seq. Anything missing/garbled means "from the
 * very start" (0), so a fresh subscriber gets the full replay.
 */
export const parseLastEventId = (raw: string | null | undefined): number => {
  if (!raw) return 0
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

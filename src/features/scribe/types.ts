import type { ReactNode } from 'react'
import type { SharedValue } from 'react-native-reanimated'

/** Where the User started Scribe AI (analytics `entry`). */
export type ScribeEntryPoint =
  | 'home_orb'
  | 'plus_sheet'
  | 'menu_bar'
  | 'settings'
  | 'onboarding'
  | 'history'
  | 'conversation'
  | 'say_a_change'

export type ScribeInputSource = 'voice' | 'keyboard' | 'photo' | 'paper'

// ---------------------------------------------------------------- availability

/**
 * - Hidden: entry points don't render (flag off, server kill switch, no
 *   provider).
 * - Offline: entry points render disabled with the no-internet badge; tapping
 *   explains.
 * - Blocked: entry points render; the conversation screen explains and offers no
 *   input.
 * - Available: everything works; `limited` means a usage window is full until
 *   `resetsAt`.
 */
export type ScribeAvailability =
  | { status: 'hidden'; reason: 'flag_off' | 'disabled' | 'no_provider' }
  | { status: 'offline' }
  | {
      status: 'blocked'
      reason:
        | 'update_required'
        | 'device_ineligible'
        | 'attestation_unavailable'
        | 'suspended'
    }
  | { status: 'available'; limited: boolean; resetsAt: number | null }

/**
 * On-device speech for the current app Language. `unsupported` → orb opens the
 * conversation with the keyboard.
 */
export type ScribeVoiceAvailability = 'checking' | 'available' | 'unsupported'

// ---------------------------------------------------------------- usage

export type ScribePlan = 'free' | 'supporter'
export type ScribeUsageWindowId = 'session' | 'weekly' | 'monthly'

export interface ScribeUsageWindow {
  id: ScribeUsageWindowId
  /** 0–100, never raw units. */
  percentUsed: number
  /** Epoch ms; null when the window hasn't started (0 %). */
  resetsAt: number | null
}

export interface ScribeUsage {
  plan: ScribePlan
  /** Shortest first: free → [monthly]; supporter → [session, weekly]. */
  windows: ScribeUsageWindow[]
  limited: boolean
  /** When limited: when Scribe AI works again. */
  resetsAt: number | null
  supporterCheckFailed: boolean
  asOf: number
}

export interface ScribeUsageState {
  usage: ScribeUsage | null
  loading: boolean
  /** The last read failed; `usage` is the last good snapshot or null. */
  failed: boolean
  refresh(): void
}

// ---------------------------------------------------------------- errors and run state

export type ScribeErrorCode =
  | 'network'
  | 'timeout'
  | 'limit_reached'
  | 'context_full'
  | 'too_large'
  /** The model hit its output cap (`finish: length`). */
  | 'too_much'
  /** Step cap reached without an answer (`step_limit`). */
  | 'couldnt_finish'
  | 'suspended'
  | 'device_ineligible'
  | 'attestation_unavailable'
  | 'update_required'
  | 'disabled'
  | 'unavailable'
  | 'rate_limited'
  | 'model_error'
  | 'unknown'

export interface ScribeError {
  code: ScribeErrorCode
  /** Try again is offered. */
  retryable: boolean
  retryAfterMs: number | null
  /** Limit_reached only. */
  resetsAt: number | null
}

/** What a read tool is looking at, for the "Looking at your …" line. */
export type ScribeActivityArea =
  | 'contacts'
  | 'visits'
  | 'plans'
  | 'time'
  | 'buddies'

export type ScribeRun =
  | { phase: 'idle' }
  /** Request sent, not yet admitted (`start` not received). */
  | { phase: 'sending' }
  /**
   * Admitted; `reading` lists areas of read tools run in this turn so far,
   * newest last.
   */
  | { phase: 'thinking'; reading: ScribeActivityArea[] }
  | { phase: 'error'; error: ScribeError }

// ---------------------------------------------------------------- conversation

export type ScribeNotice =
  | { kind: 'limit_reached'; plan: ScribePlan; resetsAt: number | null }
  | { kind: 'too_much' }
  | { kind: 'couldnt_finish' }
  | { kind: 'refused' }

export type ScribeTimelineItem =
  | {
      type: 'user'
      id: string
      at: number
      text: string
      source: ScribeInputSource
    }
  /** Plain text. Render without markdown, links or images. */
  | {
      type: 'assistant'
      id: string
      at: number
      text: string
      streaming: boolean
    }
  | { type: 'proposal'; id: string; at: number; proposalId: string }
  | { type: 'notice'; id: string; at: number; notice: ScribeNotice }

export type ScribeContextBudgetState = 'ok' | 'nearFull' | 'full'

export interface ScribeConversationSummary {
  id: string
  /** The first user message, ≤ 60 chars. Device only. */
  title: string
  createdAt: number
  updatedAt: number
  /** Cards applied (and not undone) across the conversation's Proposals. */
  appliedCount: number
  hasPendingProposal: boolean
}

export interface ScribeConversationController {
  /** Null until the first send of a new conversation. */
  conversationId: string | null
  items: readonly ScribeTimelineItem[]
  run: ScribeRun
  budget: ScribeContextBudgetState
  pendingProposalId: string | null
  /**
   * Sends a user message (starting the conversation if needed) and runs the
   * turn. Supersedes a pending Proposal. Resolves when the turn ends.
   */
  send(input: {
    text: string
    source: ScribeInputSource
    entry: ScribeEntryPoint
  }): Promise<void>
  /** Re-runs the failed step of the last turn. */
  retry(): Promise<void>
  /** Aborts the running step; keeps the user message. */
  stop(): void
}

// ---------------------------------------------------------------- proposals

export type ScribeEffectKind =
  | 'time.create'
  | 'time.update'
  | 'time.delete'
  | 'plan.create'
  | 'plan.update'
  | 'contact.create'
  | 'contact.update'
  | 'visit.create'
  | 'category.create'

/** Literal phrases the User said, shown as `from "next Tuesday"`. */
export interface ScribeSpoken {
  date: string | null
  time: string | null
}

/** Null category = Standard. */
export interface ScribeCategoryLabel {
  name: string
  credit: boolean
}

export type ScribeFieldChange =
  | { field: 'date'; before: string; after: string }
  | { field: 'minutes'; before: number; after: number }
  | { field: 'startMinutes'; before: number | null; after: number | null }
  | { field: 'anytime'; before: boolean; after: boolean }
  /** Null is Standard. */
  | { field: 'category'; before: string | null; after: string | null }
  | {
      field: 'title' | 'note' | 'name' | 'phone' | 'email' | 'address'
      before: string | null
      after: string | null
    }

/**
 * Dates are local `YYYY-MM-DD`; minutes are whole minutes; startMinutes is
 * minutes after local midnight. Format with src/lib/dates.ts and
 * src/lib/minutes.ts.
 */
export type ScribeEffectPreview =
  | {
      kind: 'time.create'
      date: string
      minutes: number
      category: ScribeCategoryLabel | null
      note: string | null
      spoken: ScribeSpoken
    }
  | {
      kind: 'time.update'
      /** The entry as it was read, for the card. */
      date: string
      minutes: number
      category: ScribeCategoryLabel | null
      changes: ScribeFieldChange[]
      spoken: ScribeSpoken
    }
  | {
      kind: 'time.delete'
      date: string
      minutes: number
      category: ScribeCategoryLabel | null
      note: string | null
    }
  | {
      kind: 'plan.create'
      date: string
      minutes: number
      startMinutes: number | null
      anytime: boolean
      category: ScribeCategoryLabel | null
      title: string | null
      note: string | null
      spoken: ScribeSpoken
      /** Buddies to invite from the Plan once it's added, by display name. */
      inviteNames: string[]
    }
  | {
      kind: 'plan.update'
      date: string
      title: string | null
      changes: ScribeFieldChange[]
      spoken: ScribeSpoken
    }
  | {
      kind: 'contact.create'
      name: string
      address: string | null
      phone: string | null
      email: string | null
    }
  | { kind: 'contact.update'; name: string; changes: ScribeFieldChange[] }
  | {
      kind: 'visit.create'
      date: string
      notAtHome: boolean
      bibleStudy: boolean
      note: string | null
      followUp: {
        date: string
        topic: string | null
        spoken: ScribeSpoken
      } | null
      spoken: ScribeSpoken
    }
  | { kind: 'category.create'; name: string; credit: boolean }

export type ScribeWarningCode =
  | 'duplicate_time'
  | 'plan_overlap'
  | 'over_credit_cap'
  | 'shared_month'

export interface ScribeWarning {
  code: ScribeWarningCode
  severity: 'info' | 'warning'
}

export interface ScribeEffect {
  id: string
  kind: ScribeEffectKind
  preview: ScribeEffectPreview
  warnings: ScribeWarning[]
  status: 'pending' | 'applied' | 'skipped' | 'failed' | 'undone'
  /** Skipped: the record changed or vanished since it was read. */
  skipReason: 'changed' | 'missing' | null
}

export interface ScribeContactOption {
  contactId: string
  name: string
  addressLine: string | null
}

export type ScribeContactChoice =
  | { type: 'existing'; contactId: string }
  | { type: 'new' }

export type ScribeCardContact =
  | {
      type: 'existing'
      contactId: string
      name: string
      addressLine: string | null
    }
  | { type: 'new'; name: string; addressLine: string | null }
  | {
      type: 'choice'
      spokenName: string
      options: ScribeContactOption[]
      chosen: ScribeContactChoice | null
    }

export interface ScribeReviewCard {
  id: string
  kind: 'contact' | 'time' | 'plan' | 'category'
  /** Set when kind is 'contact'. */
  contact: ScribeCardContact | null
  /**
   * Contact cards: the contact.create/contact.update effect first (if any),
   * then visit.create effects. Other cards: one effect.
   */
  effects: ScribeEffect[]
  selected: boolean
  /** Selected && contact is an unresolved choice. Blocks Add. */
  needsChoice: boolean
  /**
   * Data protection mode, and Add would create the card's Contact: the User
   * confirms the householder agreed. Null otherwise.
   */
  consent: { given: boolean } | null
  /** Selected && consent asked but not given. Blocks Add. */
  needsConsent: boolean
  status:
    | 'pending'
    | 'applied'
    | 'partial'
    | 'skipped'
    | 'failed'
    | 'undone'
    | 'dismissed'
  /** The record it added, to open from the card; null until added. */
  target: ScribeCardTarget | null
}

/** Where an added card's record is. */
export type ScribeCardTarget =
  | { type: 'contact'; contactId: string; visitId: string | null }
  | { type: 'plan'; planId: string }

export type ScribeProposalStatus =
  | 'pending'
  | 'applying'
  | 'applied'
  | 'partially_applied'
  | 'dismissed'
  | 'superseded'
  | 'failed'
  | 'undone'

export interface ScribeProposal {
  id: string
  conversationId: string
  createdAt: number
  status: ScribeProposalStatus
  /** In the order the model proposed them. */
  cards: ScribeReviewCard[]
  /** Write calls that couldn't be prepared even after the model's retry. */
  invalidCount: number
  /**
   * Proposed after reading text from Visit notes: show the "from your notes"
   * hint.
   */
  tainted: boolean
  /**
   * Records an Undo left in place because they changed since or something else
   * uses them.
   */
  undoKept: number
}

export interface ScribeApplyResult {
  status: 'applied' | 'partially_applied' | 'failed'
  appliedCards: number
  skippedCards: number
}

/** Where an Undo ran: the Added toast, History, or the conversation's own link. */
export type ScribeUndoSource = 'toast' | 'history' | 'conversation'

export interface ScribeUndoResult {
  status: 'undone' | 'partially_undone' | 'nothing_to_undo'
  /**
   * Records left alone because they changed since, or are still used by
   * something else.
   */
  kept: number
}

export interface ScribeProposalController {
  proposal: ScribeProposal | null
  counts: {
    selected: number
    ready: number
    needsChoice: number
    needsConsent: number
  }
  /** Status pending && selected > 0 && needsChoice === needsConsent === 0. */
  canAdd: boolean
  /** Added, and its undo record is still within the undo window. */
  canUndo: boolean
  toggleCard(cardId: string): void
  /** Also selects the card. */
  chooseContact(cardId: string, choice: ScribeContactChoice): void
  /** The householder agreed (or not) to be kept; agreeing selects the card. */
  setConsent(cardId: string, agreed: boolean): void
  add(): Promise<ScribeApplyResult>
  dismiss(): void
}

// ---------------------------------------------------------------- history

export interface ScribeLegacyImport {
  /** The Notes Import ledger hash. */
  id: string
  title: string
  acceptedAt: number
  counts: { contacts: number; visits: number; timeEntries: number }
}

export interface ScribeHistoryController {
  /** Newest first. */
  conversations: readonly ScribeConversationSummary[]
  /** Accepted Notes Imports that can still be undone, newest first. */
  legacyImports: readonly ScribeLegacyImport[]
  /** Deletes the transcript only; applied records stay. */
  deleteConversation(id: string): void
  undoLegacyImport(id: string): ScribeUndoResult
}

// ---------------------------------------------------------------- capture

export type ScribeVoiceState =
  | 'idle'
  /**
   * Permission undetermined: show the priming card, then call
   * confirmPermission().
   */
  | 'priming'
  | 'requesting'
  /** Permission denied: show Open Settings. */
  | 'denied'
  /** Mic opening or on-device model downloading (`preparingPercent`). */
  | 'preparing'
  | 'listening'
  | 'finishing'
  | 'error'

export type ScribeVoiceErrorCode =
  | 'model_unavailable'
  | 'audio_unavailable'
  | 'busy'
  | 'unsupported'
  | 'failed'

/**
 * `done` and `cap` send the text; `interrupted` (a call, leaving the app) and
 * `typed` (Type instead) leave it in the composer to finish.
 */
export type ScribeVoiceFinishReason = 'done' | 'cap' | 'interrupted' | 'typed'

export interface ScribeVoiceCaptureOptions {
  /**
   * Called once per recording with the final on-device transcript ('' when
   * nothing was heard).
   */
  onFinished(text: string, reason: ScribeVoiceFinishReason): void
  /**
   * Shortest time `preparing` lasts, so a fast start still shows the loading
   * spinner and snaps to ready once the sheet has settled. The microphone
   * already records underneath. Default 0.
   */
  minPreparingMs?: number
}

export interface ScribeVoiceCapture {
  state: ScribeVoiceState
  preparingPercent: number | null
  /**
   * 0–1, normalized to the room and recent peak; UI thread. Drive the orb from
   * this, never from React state.
   */
  level: SharedValue<number>
  /** Updated about 4× a second. */
  elapsedMs: number
  /** ≥ SCRIBE_VOICE_QUIET_MS of silence after speech: show the pause hint. */
  quiet: boolean
  /** Set during the last 20 s before SCRIBE_VOICE_MAX_MS. */
  remainingMs: number | null
  error: ScribeVoiceErrorCode | null
  start(): Promise<void>
  confirmPermission(): Promise<void>
  done(): void
  /** Ends listening; onFinished gets what was heard with reason `typed`. */
  switchToKeyboard(): void
  /** Ends without onFinished. */
  discard(): void
  openSettings(): void
}

export interface ScribePaperPage {
  uri: string
  width: number
  height: number
}

/** On-device OCR of a scan or photos (iOS; `available` false elsewhere). */
export interface ScribePhotoCapture {
  available: boolean
  /** The limited-access photo picker; render it on the screen that captures. */
  picker: ReactNode
  busy: boolean
  /** Text for the composer, or null when cancelled or nothing was read. */
  capture(): Promise<string | null>
}

/** Why paper pages weren't read; `page_limit` is ww-api's daily page limit. */
export type ScribePaperError = ScribeErrorCode | 'page_limit'

/** Paper pages read by ww-api (/scribe/v1/transcribe), metered. */
export interface ScribePaperCapture {
  available: boolean
  /** The limited-access photo picker; render it on the screen that captures. */
  picker: ReactNode
  busy: boolean
  progress: { done: number; total: number } | null
  /** The last batch's failure; cleared when any new capture or send starts. */
  error: ScribePaperError | null
  /** With `page_limit`: when more pages can be read, if ww-api said. */
  retryAt: number | null
  /**
   * Pages left unread for a reason that can pass (no connection, a busy
   * service), kept until `retry` reads them or `skip` drops them. `reason` is
   * what stopped the batch, or null when single pages failed.
   */
  unread: {
    count: number
    total: number
    reason: ScribePaperError | null
  } | null
  /** Text for the composer, or null when cancelled or nothing was read. */
  capture(
    source: 'camera' | 'library' | 'pages',
    pages?: ScribePaperPage[]
  ): Promise<string | null>
  /** Reads the `unread` pages again; their text for the composer, or null. */
  retry(): Promise<string | null>
  /**
   * Drops the `unread` pages; the text read after the first of them, which
   * waited to keep page order, or null.
   */
  skip(): string | null
  clearError(): void
}

// ---------------------------------------------------------------- routes

export interface ScribeConversationParams {
  conversationId?: string
  /** Sent once per distinct submitId. */
  initialText?: string
  inputSource?: ScribeInputSource
  submitId?: string
  entry: ScribeEntryPoint
  focusComposer?: boolean
  /**
   * What a recording heard before Type instead or an interruption: put in the
   * composer once, not sent.
   */
  draftText?: string
  /** Onboarding's Import from Paper: read on open. */
  paperPages?: ScribePaperPage[]
}

export interface ScribeVoiceParams {
  entry: ScribeEntryPoint
  /** Continue this conversation (Say a change). */
  conversationId?: string
}

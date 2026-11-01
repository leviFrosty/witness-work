import type { ReactNode } from 'react'
import type { SharedValue } from 'react-native-reanimated'

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

export type ScribeVoiceAvailability = 'checking' | 'available' | 'unsupported'

export type ScribePlan = 'free' | 'supporter'
export type ScribeUsageWindowId = 'session' | 'weekly' | 'monthly'

export interface ScribeUsageWindow {
  id: ScribeUsageWindowId

  percentUsed: number

  resetsAt: number | null
}

export interface ScribeUsage {
  plan: ScribePlan

  windows: ScribeUsageWindow[]
  limited: boolean

  resetsAt: number | null
  supporterCheckFailed: boolean
  asOf: number
}

export interface ScribeUsageState {
  usage: ScribeUsage | null
  loading: boolean

  failed: boolean
  refresh(): void
}

export type ScribeErrorCode =
  | 'network'
  | 'timeout'
  | 'limit_reached'
  | 'context_full'
  | 'too_large'
  | 'too_much'
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

  retryable: boolean
  retryAfterMs: number | null

  resetsAt: number | null
}

export type ScribeActivityArea =
  | 'contacts'
  | 'visits'
  | 'plans'
  | 'time'
  | 'buddies'

export type ScribeRun =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'thinking'; reading: ScribeActivityArea[] }
  | { phase: 'error'; error: ScribeError }

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

  title: string
  createdAt: number
  updatedAt: number

  appliedCount: number
  hasPendingProposal: boolean
}

export interface ScribeConversationController {
  conversationId: string | null
  items: readonly ScribeTimelineItem[]
  run: ScribeRun
  budget: ScribeContextBudgetState
  pendingProposalId: string | null

  send(input: {
    text: string
    source: ScribeInputSource
    entry: ScribeEntryPoint
  }): Promise<void>

  retry(): Promise<void>

  stop(): void
}

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

export interface ScribeSpoken {
  date: string | null
  time: string | null
}

export interface ScribeCategoryLabel {
  name: string
  credit: boolean
}

export type ScribeFieldChange =
  | { field: 'date'; before: string; after: string }
  | { field: 'minutes'; before: number; after: number }
  | { field: 'startMinutes'; before: number | null; after: number | null }
  | { field: 'anytime'; before: boolean; after: boolean }
  | { field: 'category'; before: string | null; after: string | null }
  | {
      field: 'title' | 'note' | 'name' | 'phone' | 'email' | 'address'
      before: string | null
      after: string | null
    }

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

  contact: ScribeCardContact | null

  effects: ScribeEffect[]
  selected: boolean

  needsChoice: boolean

  consent: { given: boolean } | null

  needsConsent: boolean
  status:
    | 'pending'
    | 'applied'
    | 'partial'
    | 'skipped'
    | 'failed'
    | 'undone'
    | 'dismissed'

  target: ScribeCardTarget | null
}

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

  cards: ScribeReviewCard[]

  invalidCount: number

  tainted: boolean

  undoKept: number
}

export interface ScribeApplyResult {
  status: 'applied' | 'partially_applied' | 'failed'
  appliedCards: number
  skippedCards: number
}

export type ScribeUndoSource = 'toast' | 'history' | 'conversation'

export interface ScribeUndoResult {
  status: 'undone' | 'partially_undone' | 'nothing_to_undo'

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

  canAdd: boolean

  canUndo: boolean
  toggleCard(cardId: string): void

  chooseContact(cardId: string, choice: ScribeContactChoice): void

  setConsent(cardId: string, agreed: boolean): void
  add(): Promise<ScribeApplyResult>
  dismiss(): void
}

export interface ScribeLegacyImport {
  id: string
  title: string
  acceptedAt: number
  counts: { contacts: number; visits: number; timeEntries: number }
}

export interface ScribeHistoryController {
  conversations: readonly ScribeConversationSummary[]

  legacyImports: readonly ScribeLegacyImport[]

  deleteConversation(id: string): void
  undoLegacyImport(id: string): ScribeUndoResult
}

export type ScribeVoiceState =
  | 'idle'
  | 'priming'
  | 'requesting'
  | 'denied'
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

export type ScribeVoiceFinishReason = 'done' | 'cap' | 'interrupted' | 'typed'

export interface ScribeVoiceCaptureOptions {
  onFinished(text: string, reason: ScribeVoiceFinishReason): void

  minPreparingMs?: number
}

export interface ScribeVoiceCapture {
  state: ScribeVoiceState
  preparingPercent: number | null

  level: SharedValue<number>

  elapsedMs: number

  quiet: boolean

  remainingMs: number | null
  error: ScribeVoiceErrorCode | null
  start(): Promise<void>
  confirmPermission(): Promise<void>
  done(): void

  switchToKeyboard(): void

  discard(): void
  openSettings(): void
}

export interface ScribePaperPage {
  uri: string
  width: number
  height: number
}

export interface ScribePhotoCapture {
  available: boolean

  picker: ReactNode
  busy: boolean

  capture(): Promise<string | null>
}

export type ScribePaperError = ScribeErrorCode | 'page_limit'

export interface ScribePaperCapture {
  available: boolean

  picker: ReactNode
  busy: boolean
  progress: { done: number; total: number } | null

  error: ScribePaperError | null

  retryAt: number | null

  unread: {
    count: number
    total: number
    reason: ScribePaperError | null
  } | null

  capture(
    source: 'camera' | 'library' | 'pages',
    pages?: ScribePaperPage[]
  ): Promise<string | null>

  retry(): Promise<string | null>

  skip(): string | null
  clearError(): void
}

export interface ScribeConversationParams {
  conversationId?: string

  initialText?: string
  inputSource?: ScribeInputSource
  submitId?: string
  entry: ScribeEntryPoint
  focusComposer?: boolean

  draftText?: string

  paperPages?: ScribePaperPage[]
}

export interface ScribeVoiceParams {
  entry: ScribeEntryPoint

  conversationId?: string
}

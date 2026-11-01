import { analytics } from '@/lib/analytics'
import type {
  ScribeEntryPoint,
  ScribeErrorCode,
  ScribeInputSource,
  ScribePlan,
  ScribeUndoResult,
  ScribeUndoSource,
  ScribeUsageWindowId,
} from '@/features/scribe/types'
import {
  SCRIBE_MEMORY_MAX_CHARS,
  type ScribeMemoryChange,
} from '@/features/scribe/lib/memory'

export const turnBucket = (turn: number): string =>
  turn <= 1 ? '1' : turn === 2 ? '2' : turn <= 5 ? '3-5' : '6+'

export const turnDurationBucket = (ms: number): string =>
  ms < 5_000 ? '<5s' : ms < 15_000 ? '5-15s' : ms < 30_000 ? '15-30s' : '30s+'

export const voiceDurationBucket = (ms: number): string =>
  ms < 15_000 ? '<15s' : ms < 60_000 ? '15-60s' : ms < 120_000 ? '1-2m' : '2m+'

export function trackTurnStarted(props: {
  entry: ScribeEntryPoint
  input: ScribeInputSource
  turn: number
  pendingProposal: boolean
}): void {
  analytics.capture('scribe_turn_started', {
    entry: props.entry,
    input: props.input,
    turn: turnBucket(props.turn),
    pending_proposal: props.pendingProposal,
  })
}

export type TurnOutcome = 'proposal' | 'answer' | 'error' | 'stopped' | 'limit'

export function trackTurnFinished(props: {
  outcome: TurnOutcome
  steps: number
  readCalls: number
  writeCalls: number
  invalidCalls: number
  errorCode: ScribeErrorCode | null
  durationMs: number
}): void {
  analytics.capture('scribe_turn_finished', {
    outcome: props.outcome,
    steps: props.steps,
    read_calls: props.readCalls,
    write_calls: props.writeCalls,
    invalid_calls: props.invalidCalls,
    error_code: props.errorCode,
    duration: turnDurationBucket(props.durationMs),
  })
}

export function trackProposalResolved(props: {
  outcome:
    | 'applied'
    | 'partially_applied'
    | 'dismissed'
    | 'superseded'
    | 'failed'
  cards: number
  appliedCards: number
  deselectedCards: number
  choiceCards: number
  consentCards: number
  kinds: readonly string[]
  tainted: boolean
}): void {
  analytics.capture('scribe_proposal_resolved', {
    outcome: props.outcome,
    cards: props.cards,
    applied_cards: props.appliedCards,
    deselected_cards: props.deselectedCards,
    choice_cards: props.choiceCards,
    consent_cards: props.consentCards,
    kinds: [...new Set(props.kinds)].sort().join(','),
    tainted: props.tainted,
  })
}

export function trackUndo(props: {
  source: ScribeUndoSource
  target: 'scribe' | 'legacy_import'
  result: ScribeUndoResult['status']
}): void {
  analytics.capture('scribe_undo', props)
}

export function trackLimitReached(props: {
  plan: ScribePlan
  window: ScribeUsageWindowId | null
}): void {
  analytics.capture('scribe_limit_reached', props)
}

export function trackContextFull(state: 'near_full' | 'full'): void {
  analytics.capture('scribe_context_full', { state })
}

export function trackCaptureFinished(props: {
  input: 'voice' | 'photo' | 'paper'
  outcome:
    | 'done'
    | 'cap'
    | 'interrupted'
    | 'typed'
    | 'discarded'
    | 'empty'
    | 'error'
  durationMs?: number
  pages?: number
  errorCode?: string | null
  engine?: string | null

  retry?: boolean

  retryOffered?: boolean
}): void {
  analytics.capture('scribe_capture_finished', {
    input: props.input,
    outcome: props.outcome,
    ...(props.durationMs !== undefined
      ? { duration: voiceDurationBucket(props.durationMs) }
      : {}),
    ...(props.pages !== undefined ? { pages: props.pages } : {}),
    error_code: props.errorCode ?? null,
    ...(props.engine ? { engine: props.engine } : {}),
    ...(props.retry !== undefined ? { retry: props.retry } : {}),
    ...(props.retryOffered ? { retry_offered: true } : {}),
  })
}

export const memoryFillBucket = (chars: number): string => {
  const share = chars / SCRIBE_MEMORY_MAX_CHARS
  return share < 0.25
    ? '<25%'
    : share < 0.5
      ? '25-50%'
      : share < 0.75
        ? '50-75%'
        : '75%+'
}

export function trackMemorySaved(
  changes: readonly ScribeMemoryChange[],
  chars: number
): void {
  analytics.capture('scribe_memory_saved', {
    added: changes.filter((change) => change === 'added').length,
    changed: changes.filter((change) => change === 'changed').length,
    removed: changes.filter((change) => change === 'removed').length,
    fill: memoryFillBucket(chars),
  })
}

export function trackScribeTurnedOnOff(enabled: boolean): void {
  analytics.capture('scribe_setting_changed', { enabled })
}

export function trackPrivacyViewed(surface: 'settings' | 'first_open'): void {
  analytics.capture('scribe_privacy_viewed', { surface })
}

export function trackTermsResolved(
  surface: 'first_open' | 'settings',
  outcome: 'accepted' | 'dismissed'
): void {
  analytics.capture('scribe_terms_resolved', { surface, outcome })
}

export function trackMemoryManaged(
  action: 'edited' | 'cleared' | 'turned_off' | 'turned_on',
  chars: number
): void {
  analytics.capture('scribe_memory_managed', {
    action,
    fill: memoryFillBucket(chars),
  })
}

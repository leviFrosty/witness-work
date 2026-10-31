import { platformKey } from '@/app/account/attestationCopy'
import type { OfferStartProblem } from '@/app/account/handoff'
import i18n, { type TranslationKey } from '@/lib/locales'
import {
  type ApprovalHello,
  type ParsedApprovalLink,
  parseApprovalLink,
} from '@/lib/serverAccount/approval'
import type { ApprovalLocation } from '@/lib/serverAccount/approvalClient'
import type {
  ApprovalFailure,
  PhoneApprovalState,
} from '@/lib/serverAccount/approvalSession'
import { isHandoffLink } from '@/lib/serverAccount/handoff'
import {
  FINAL_FAILURES,
  RETRYABLE_PROBLEMS,
} from '@/features/settings/components/account/handoff/handoffEnding'

/**
 * What Sign In on a Computer shows, from where the screen is (scanning,
 * starting the account's session, or a running approval) and the approval's
 * state. Pure, so the flow and its copy are tested without the screen.
 */

/** Starting an approval once a code is scanned. */
export type ApprovalStart =
  | { phase: 'scanning' }
  | { phase: 'starting' }
  | { phase: 'problem'; problem: OfferStartProblem }
  | { phase: 'ready' }

/**
 * `scanAgain` goes back to the scanner for the computer's next code; `tryAgain`
 * starts the same code again, offered only before anything was claimed.
 */
export type ApprovalAction = 'scanAgain' | 'tryAgain' | 'done'

export type ApprovalAsking = Extract<
  PhoneApprovalState,
  { step: 'confirm' | 'sending' }
>

export type ApprovalView =
  | { kind: 'scan'; problem?: TranslationKey }
  | { kind: 'loading'; body: TranslationKey | null }
  | { kind: 'confirm'; state: ApprovalAsking; sending: boolean }
  | { kind: 'approved'; browser: string }
  | {
      kind: 'ended'
      tone: 'neutral' | 'error'
      offline?: boolean
      title?: TranslationKey
      body: TranslationKey
      primary: ApprovalAction
    }

const FAILURE: Record<ApprovalFailure, TranslationKey> = {
  offline: 'approval_failOffline',
  unavailable: 'handoff_failUnavailable',
  expired: 'approval_failExpired',
  used: 'approval_failUsed',
  conflict: 'approval_failConflict',
  cancelled: 'approval_failCancelled',
  badToken: 'approval_failBadToken',
  tampered: 'approval_failTampered',
  noAccount: 'handoff_failNoAccount',
  unverified: platformKey(
    'approval_failUnverified',
    'approval_failUnverifiedAndroid'
  ),
  verifyLater: 'handoff_failVerifyLater',
  updateRequired: 'handoff_failUpdate',
  rateLimited: 'handoff_failRateLimited',
  server: 'approval_failServer',
}

const PROBLEM: Record<OfferStartProblem, TranslationKey> = {
  unsupported: 'account_updateRequired',
  unavailable: 'handoff_problemUnavailable',
  unverified: platformKey(
    'approval_failUnverified',
    'approval_failUnverifiedAndroid'
  ),
  verifyLater: 'handoff_failVerifyLater',
  updateRequired: 'handoff_failUpdate',
  offline: 'approval_problemOffline',
}

const SCAN_PROBLEM: Record<
  Extract<ParsedApprovalLink, { ok: false }>['problem'],
  TranslationKey
> = {
  notApproval: 'approval_scanNotApproval',
  wrongHost: 'approval_scanWrongHost',
  version: 'handoff_scanVersion',
  damaged: 'handoff_scanDamaged',
}

const connecting: ApprovalView = {
  kind: 'loading',
  body: 'approval_connecting',
}

export function approvalView(
  start: ApprovalStart,
  state: PhoneApprovalState | null
): ApprovalView {
  switch (start.phase) {
    case 'scanning':
      return { kind: 'scan' }
    case 'starting':
      return connecting
    case 'problem':
      return {
        kind: 'ended',
        tone: 'error',
        offline: start.problem === 'offline',
        body: PROBLEM[start.problem],
        primary: RETRYABLE_PROBLEMS.has(start.problem) ? 'tryAgain' : 'done',
      }
  }
  if (!state) return connecting
  switch (state.step) {
    case 'invalid':
      return { kind: 'scan', problem: SCAN_PROBLEM[state.problem] }
    case 'idle':
    case 'claiming':
      return connecting
    case 'confirm':
    case 'sending':
      return { kind: 'confirm', state, sending: state.step === 'sending' }
    case 'done':
      return { kind: 'approved', browser: approvalBrowserLine(state.hello) }
    case 'declined':
      return {
        kind: 'ended',
        tone: 'neutral',
        title: 'approval_declinedTitle',
        body: 'approval_declinedBody',
        primary: 'done',
      }
    case 'cancelled':
      return { kind: 'loading', body: null }
    case 'failed':
      return {
        kind: 'ended',
        tone: 'error',
        offline: state.reason === 'offline',
        title: 'approval_failedTitle',
        body: FAILURE[state.reason],
        primary: FINAL_FAILURES.has(state.reason) ? 'done' : 'scanAgain',
      }
  }
}

/**
 * Reads a code scanned inside the app; only `origins`' approval links are
 * taken. A Set Up Another Device code gets its own hint.
 */
export function readScannedApproval(
  data: string,
  origins: readonly string[]
): { ok: true; link: string } | { ok: false; problem: TranslationKey } {
  const parsed = parseApprovalLink(data, origins)
  if (parsed.ok) return { ok: true, link: data.trim() }
  if (parsed.problem === 'notApproval' && isHandoffLink(data))
    return { ok: false, problem: 'approval_scanHandoffCode' }
  return { ok: false, problem: SCAN_PROBLEM[parsed.problem] }
}

/** "Chrome on macOS", from the browser's sealed hello. */
export function approvalBrowserLine({ browser, system }: ApprovalHello) {
  if (browser && system)
    return i18n.t('approval_browserLine', { browser, system })
  return browser || system || i18n.t('approval_unknownBrowser')
}

/** "Near Springfield, Illinois, US", as coarse as the server knows it. */
export function approvalPlace(location: ApprovalLocation | undefined) {
  const place = [location?.city, location?.region, location?.country]
    .filter(Boolean)
    .join(', ')
  return place
    ? i18n.t('approval_near', { place })
    : i18n.t('approval_placeUnknown')
}

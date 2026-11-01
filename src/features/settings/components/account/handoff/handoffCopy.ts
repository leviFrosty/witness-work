import { platformKey } from '@/app/account/attestationCopy'
import type { HandoffFailure } from '@/lib/serverAccount/handoffSession'
import type { HandoffHello } from '@/lib/serverAccount/handoff'
import i18n, { type TranslationKey } from '@/lib/locales'

const OLD: Record<HandoffFailure, TranslationKey> = {
  offline: 'handoff_failOffline',
  unavailable: 'handoff_failUnavailable',
  expired: 'handoff_failExpiredOld',
  used: 'handoff_failConflictOld',
  conflict: 'handoff_failConflictOld',
  cancelled: 'handoff_failCancelledOld',
  badToken: 'handoff_failServer',
  tampered: 'handoff_failTampered',
  noAccount: 'handoff_failNoAccount',
  unverified: platformKey(
    'handoff_failUnverifiedOld',
    'handoff_failUnverifiedOldAndroid'
  ),
  verifyLater: 'handoff_failVerifyLater',
  updateRequired: 'handoff_failUpdate',
  rateLimited: 'handoff_failRateLimited',
  server: 'handoff_failServer',
}

const NEW: Record<HandoffFailure, TranslationKey> = {
  offline: 'handoff_failOffline',
  unavailable: 'handoff_failUnavailable',
  expired: 'handoff_failExpiredNew',
  used: 'handoff_failUsed',
  conflict: 'handoff_failUsed',
  cancelled: 'handoff_failCancelledNew',
  badToken: 'handoff_failBadToken',
  tampered: 'handoff_failTampered',
  noAccount: 'handoff_failServer',
  unverified: platformKey(
    'handoff_failUnverifiedNew',
    'handoff_failUnverifiedNewAndroid'
  ),
  verifyLater: 'handoff_failVerifyLater',
  updateRequired: 'handoff_failUpdate',
  rateLimited: 'handoff_failRateLimited',
  server: 'handoff_failServer',
}

export const handoffFailureMessage = (
  role: 'old' | 'new',
  reason: HandoffFailure
) => i18n.t((role === 'old' ? OLD : NEW)[reason])

export const handoffDeviceLine = (hello: HandoffHello) =>
  [
    i18n.t(
      hello.platform === 'ios'
        ? 'handoff_platformIos'
        : 'handoff_platformAndroid'
    ),
    hello.model || null,
  ]
    .filter(Boolean)
    .join(' · ')

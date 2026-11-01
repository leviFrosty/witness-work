import { Platform } from 'react-native'
import moment from 'moment'
import { whenPhrase } from '@/lib/dayPhrases'
import { localizeDisplayDate } from '@/lib/dates'
import i18n, { type TranslationKey } from '@/lib/locales'
import type {
  ScribeAvailability,
  ScribeErrorCode,
  ScribeUsage,
  ScribeUsageWindow,
  ScribeUsageWindowId,
} from '@/features/scribe/types'

type BlockedReason = Extract<
  ScribeAvailability,
  { status: 'blocked' }
>['reason']

export const blockedCopy = (reason: BlockedReason): TranslationKey => {
  switch (reason) {
    case 'update_required':
      return 'scribe_blockedUpdate'
    case 'device_ineligible':
      return Platform.OS === 'android'
        ? 'scribe_blockedDeviceAndroid'
        : 'scribe_blockedDevice'
    case 'attestation_unavailable':
      return 'scribe_blockedAttestation'
    case 'suspended':
      return 'scribe_blockedSuspended'
  }
}

export const blockedStatusCopy = (reason: BlockedReason): TranslationKey => {
  switch (reason) {
    case 'update_required':
      return 'updateRequired_title'
    case 'device_ineligible':
      return 'account_statusUnverified'
    case 'attestation_unavailable':
      return 'account_statusVerifyLater'
    case 'suspended':
      return 'account_statusSuspended'
  }
}

export const errorCopy = (code: ScribeErrorCode): TranslationKey | null => {
  switch (code) {
    case 'network':
    case 'timeout':
      return 'scribe_errorNetwork'
    case 'rate_limited':
      return 'scribe_errorBusy'
    case 'unavailable':
    case 'disabled':
      return 'scribe_errorUnavailable'
    case 'too_large':
      return 'scribe_errorTooLarge'
    case 'too_much':
      return 'scribe_errorTooMuch'
    case 'couldnt_finish':
      return 'scribe_errorCouldntFinish'
    case 'limit_reached':
    case 'context_full':
      return null
    case 'suspended':
    case 'device_ineligible':
    case 'attestation_unavailable':
    case 'update_required':
      return blockedCopy(code)
    case 'model_error':
    case 'unknown':
      return 'scribe_errorGeneric'
  }
}

export const USAGE_WINDOW_COPY: Record<ScribeUsageWindowId, TranslationKey> = {
  session: 'scribe_usageWindow_session',
  weekly: 'scribe_usageWindow_weekly',
  monthly: 'scribe_usageWindow_monthly',
}

export const fullestWindow = (
  usage: ScribeUsage | null
): ScribeUsageWindow | null =>
  usage?.windows.reduce<ScribeUsageWindow | null>(
    (fullest, w) =>
      !fullest || w.percentUsed > fullest.percentUsed ? w : fullest,
    null
  ) ?? null

const RELATIVE_UNDER_MS = 12 * 60 * 60 * 1000

export const formatResetTime = (resetsAt: number, now = Date.now()): string =>
  resetsAt - now < RELATIVE_UNDER_MS
    ? localizeDisplayDate(moment(resetsAt).from(moment(now)))
    : whenPhrase(new Date(resetsAt), now)

export const limitNoticeCopy = (
  resetsAt: number | null,
  now = Date.now()
): string => {
  if (resetsAt !== null && resetsAt <= now)
    return i18n.t('scribe_limitNoticeLifted')
  return [
    i18n.t('scribe_limitTitle'),
    resetsAt
      ? i18n.t('scribe_limitBody', { when: formatResetTime(resetsAt, now) })
      : null,
  ]
    .filter(Boolean)
    .join('. ')
}

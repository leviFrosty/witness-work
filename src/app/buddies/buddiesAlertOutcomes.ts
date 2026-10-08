import { Platform } from 'react-native'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import type { BuddyAlertOutcome } from '@/features/buddies/lib/pushAlerts'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { mmkvStorage } from '@/stores/mmkv'

/**
 * How Buddies alerts turned out on this device, counted until the app next
 * reports them: `named`, `quiet` (muted here, so not posted), or
 * `fallback.<reason>` (the template text). The iOS extension keeps the same
 * counts in the App Group; Android keeps them here. Counts only: no kinds,
 * names, or ids.
 */
export type AlertOutcomeKey = 'named' | 'quiet' | `fallback.${string}`

const STORAGE_KEY = 'buddiesAlertOutcomes'

export const alertOutcomeKey = (
  outcome: BuddyAlertOutcome | { failed: 'error' }
): AlertOutcomeKey =>
  'alert' in outcome
    ? 'named'
    : 'quiet' in outcome
      ? 'quiet'
      : `fallback.${outcome.failed}`

function readCounts(): Record<string, number> {
  try {
    const parsed = JSON.parse(mmkvStorage.getString(STORAGE_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/** Android: counts one alert until the next report. */
export function recordAlertOutcome(key: AlertOutcomeKey) {
  const counts = readCounts()
  counts[key] = (counts[key] ?? 0) + 1
  mmkvStorage.set(STORAGE_KEY, JSON.stringify(counts))
}

function takeCounts(): Record<string, number> {
  if (Platform.OS === 'ios') return BuddiesKeychain.takeAlertOutcomes()
  const counts = readCounts()
  mmkvStorage.delete(STORAGE_KEY)
  return counts
}

/**
 * Sends what happened to Buddies alerts since the last report, then forgets it.
 * Answers whether named alerts work in the field, and why they don't when they
 * fall back to the template.
 */
export function reportAlertOutcomes() {
  let counts: Record<string, number>
  try {
    counts = takeCounts()
  } catch (error) {
    logger.warn('[buddies] alert outcomes', error)
    return
  }
  const count = (key: string) =>
    Number.isSafeInteger(counts[key]) && counts[key] > 0 ? counts[key] : 0
  const reasons = Object.keys(counts)
    .filter((key) => key.startsWith('fallback.') && count(key) > 0)
    .sort()
  const named = count('named')
  const quiet = count('quiet')
  const fallback = reasons.reduce((total, key) => total + count(key), 0)
  if (named + quiet + fallback === 0) return
  analytics.capture('buddies_alerts_shown', {
    named,
    fallback,
    quiet,
    fallback_reasons:
      reasons.map((key) => key.slice('fallback.'.length)).join(',') ||
      undefined,
  })
}

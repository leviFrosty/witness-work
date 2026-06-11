import i18n, { TranslationKey } from '@/lib/locales'
import { ContactStaleness } from '@/lib/contactStaleness'
import { StalenessBreakpoints } from '@/types/staleness'
import { normalizeStalenessBreakpoints } from '@/constants/staleness'

/**
 * Human-readable criteria line for a staleness bucket ("Last visit within the
 * past 7 days"), reflecting the user's breakpoints so the color key never
 * describes thresholds the classifier isn't actually using.
 *
 * Lives apart from `contactStaleness.ts` so the pure classifier (used by
 * filters, indexes, and tests) doesn't drag in the i18n/native-module graph.
 */
export function getStalenessCriteriaText(
  staleness: ContactStaleness,
  breakpoints: StalenessBreakpoints
): string {
  const { weekDays, monthDays } = normalizeStalenessBreakpoints(breakpoints)
  switch (staleness) {
    case 'never':
      return i18n.t('contacts_stalenessCriteria_never')
    case 'recent':
      return i18n.t('contacts_stalenessCriteriaDays_recent' as TranslationKey, {
        count: weekDays,
      })
    case 'week':
      return i18n.t('contacts_stalenessCriteriaDays_week' as TranslationKey, {
        count: weekDays,
      })
    case 'month':
      return i18n.t('contacts_stalenessCriteriaDays_month' as TranslationKey, {
        count: monthDays,
      })
  }
}

import i18n, { TranslationKey } from '@/lib/locales'
import { ContactStaleness } from '@/lib/contactStaleness'
import { StalenessBreakpoints } from '@/types/staleness'
import { normalizeStalenessBreakpoints } from '@/constants/staleness'

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

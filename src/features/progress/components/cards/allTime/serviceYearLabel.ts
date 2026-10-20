import i18n from '@/lib/locales'
import { formatPlainNumber, localizeAppDigits } from '@/lib/numbers'

/** A Service Year by its end year, as Year by Year labels it ("2024—25"). */
export const serviceYearLabel = (endYear: number) =>
  i18n.t('scheduleCalendar.serviceYearSpanShort', {
    start: formatPlainNumber(endYear - 1),
    end: localizeAppDigits(String(endYear % 100).padStart(2, '0')),
  })

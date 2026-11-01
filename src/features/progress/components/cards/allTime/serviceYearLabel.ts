import i18n from '@/lib/locales'
import { formatPlainNumber, localizeAppDigits } from '@/lib/numbers'

export const serviceYearLabel = (endYear: number) =>
  i18n.t('scheduleCalendar.serviceYearSpanShort', {
    start: formatPlainNumber(endYear - 1),
    end: localizeAppDigits(String(endYear % 100).padStart(2, '0')),
  })

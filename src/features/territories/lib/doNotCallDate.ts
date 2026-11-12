import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import { wholeYearsSince } from '@/features/territories/lib/doorPins'

export const doNotCallDate = (at: number, now = Date.now()) => {
  const date = formatDate(at, { style: 'medium' })
  const years = wholeYearsSince(at, now)
  if (years < 1) return date
  return i18n.t('territories.pins.dateWithAge', {
    date,
    age: i18n.t('territories.pins.yearsAgo', { count: years }),
  })
}

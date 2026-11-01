import i18n from '@/lib/locales'

export type CalendarDayFacts = {
  date: string
  isToday: boolean

  isPast: boolean

  wentInService: boolean
  loggedMinutes: number
  hasPlan: boolean
  plannedMinutes: number
  hasNote: boolean

  extra?: string
}

const singleFullStop = (part: string): string =>
  part.replace(/(^|[^.])\.\.(?!\.)/g, '$1.')

export const calendarDayAccessibilityLabel = (
  facts: CalendarDayFacts,
  formatDuration: (minutes: number) => string
): string => {
  const parts = [i18n.t('scheduleCalendar.dayLabelDate', { date: facts.date })]
  if (facts.isToday) parts.push(i18n.t('scheduleCalendar.dayLabelToday'))
  if (facts.wentInService) {
    parts.push(
      i18n.t('scheduleCalendar.dayLabelLogged', {
        value: formatDuration(facts.loggedMinutes),
      })
    )
  }
  if (facts.hasPlan && facts.plannedMinutes > 0) {
    const goalMet =
      facts.wentInService && facts.loggedMinutes >= facts.plannedMinutes
    parts.push(
      i18n.t(
        goalMet
          ? 'scheduleCalendar.dayLabelPlannedGoalMet'
          : 'scheduleCalendar.dayLabelPlanned',
        { value: formatDuration(facts.plannedMinutes) }
      )
    )
  }

  if (facts.hasPlan && facts.isPast && !facts.wentInService) {
    parts.push(i18n.t('scheduleCalendar.dayLabelMissed'))
  }
  if (facts.hasNote) parts.push(i18n.t('scheduleCalendar.dayLabelNote'))
  if (facts.extra) {
    parts.push(i18n.t('scheduleCalendar.dayLabelExtra', { text: facts.extra }))
  }
  return parts.map(singleFullStop).join(' ')
}

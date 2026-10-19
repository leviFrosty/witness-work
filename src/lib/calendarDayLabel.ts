import i18n from '@/lib/locales'

/** What a calendar day's square shows, read out by screen readers. */
export type CalendarDayFacts = {
  /** The day, already formatted for display ("Tuesday, March 12, 2026"). */
  date: string
  isToday: boolean
  /** Before today. */
  isPast: boolean
  /** Some countable time was logged. */
  wentInService: boolean
  loggedMinutes: number
  hasPlan: boolean
  plannedMinutes: number
  hasNote: boolean
  /** Already localized, e.g. who the day's Plan is with. */
  extra?: string
}

/**
 * One label for a calendar day, so a screen reader hears what the square's
 * colors, border and dots show: "Tuesday, March 12, 2026. Today. Logged 2h.
 * Planned 3h. Has a note." Each part is its own sentence from the locale, so
 * the order of words within a part follows the Language.
 */
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
  // Matches the square's red: a past Plan with nothing logged.
  if (facts.hasPlan && facts.isPast && !facts.wentInService) {
    parts.push(i18n.t('scheduleCalendar.dayLabelMissed'))
  }
  if (facts.hasNote) parts.push(i18n.t('scheduleCalendar.dayLabelNote'))
  if (facts.extra) {
    parts.push(i18n.t('scheduleCalendar.dayLabelExtra', { text: facts.extra }))
  }
  return parts.join(' ')
}

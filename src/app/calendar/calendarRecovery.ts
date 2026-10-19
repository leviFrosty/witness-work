/** The next step offered beside a Calendar Sync error. */
export type CalendarRecovery = 'open_settings' | 'try_again'

const PERMISSION_ERRORS = [
  'calendarPermissionError',
  'calendarPermissionErrorAndroid',
]
/** Often pass on a second attempt: the connection, iCloud, or the account. */
const RETRY_ERRORS = [
  'calendarConnectionError',
  'calendarConnectionErrorAndroid',
  'calendarCreateError',
]

export function calendarRecovery(
  errorKey: string | null | undefined
): CalendarRecovery | null {
  if (!errorKey) return null
  if (PERMISSION_ERRORS.includes(errorKey)) return 'open_settings'
  if (RETRY_ERRORS.includes(errorKey)) return 'try_again'
  return null
}

/** The recovery the running action came from, for its analytics. */
let attempt: CalendarRecovery | null = null
export function setRecoveryAttempt(recovery: CalendarRecovery | null) {
  attempt = recovery
}
export function recoveryProperties() {
  return attempt ? { recovery: attempt } : {}
}

import { analytics } from '@/lib/analytics'
import { getEntryMode } from '@/lib/publisherCapabilities'
import { usePreferences } from '@/stores/preferences'
import type { Publisher } from '@/types/publisher'

/** Where the User answered **Hours Logging**. Bounded, safe as analytics. */
export type HoursLoggingSource = 'settings' | 'onboarding' | 'tray'

/**
 * Switches **Hours Logging** and records that the User has answered, so neither
 * onboarding nor the tray asks again.
 */
export const setHoursLogging = (
  enabled: boolean,
  source: HoursLoggingSource
) => {
  usePreferences.getState().set({ logsHours: enabled, hoursLoggingAsked: true })
  analytics.capture('hours_logging_changed', { enabled, source })
}

/**
 * Whether to ask the User if they want to log hours: a Kingdom Publisher who
 * hasn't answered and isn't logging them. New installs answer in onboarding;
 * this catches everyone set up before the question existed.
 */
export const shouldAskAboutHoursLogging = ({
  role,
  logsHours,
  hoursLoggingAsked,
}: {
  role: Publisher
  logsHours: boolean
  hoursLoggingAsked: boolean
}) => getEntryMode(role) === 'checkbox' && !logsHours && !hoursLoggingAsked

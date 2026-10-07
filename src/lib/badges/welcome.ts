export type BadgesWelcomeState = 'pending' | 'done'

/**
 * What one evaluation does to the one-time "Your badges are here" screen. Only
 * this device's very first pass (`badgesBackfilledAt` and the welcome both
 * unset) decides it: `pending` when its history already reaches a badge the
 * User will see, else `done` so it never comes up later. Any other pass,
 * including the first pass again after an import or restore, leaves it alone
 * (undefined) and gets the summary card instead.
 */
export const welcomeAfterEvaluation = ({
  firstPass,
  welcome,
  quiet,
  showBadges,
  historyCount,
}: {
  firstPass: boolean
  welcome: BadgesWelcomeState | null
  /** Seeding test data: filed as history with nothing shown. */
  quiet: boolean
  showBadges: boolean
  /** Badges this pass filed as history. */
  historyCount: number
}): BadgesWelcomeState | undefined => {
  if (!firstPass || welcome !== null) return undefined
  return !quiet && showBadges && historyCount > 0 ? 'pending' : 'done'
}

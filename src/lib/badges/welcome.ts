export type BadgesWelcomeState = 'pending' | 'done'

export const welcomeAfterEvaluation = ({
  firstPass,
  welcome,
  quiet,
  showBadges,
  historyCount,
}: {
  firstPass: boolean
  welcome: BadgesWelcomeState | null

  quiet: boolean
  showBadges: boolean

  historyCount: number
}): BadgesWelcomeState | undefined => {
  if (!firstPass || welcome !== null) return undefined
  return !quiet && showBadges && historyCount > 0 ? 'pending' : 'done'
}

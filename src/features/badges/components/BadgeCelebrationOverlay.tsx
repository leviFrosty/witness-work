import { type ReactNode, useEffect, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import BadgeCelebration, {
  type BadgeCelebrationAction,
  type BadgeCelebrationContent,
} from '@/features/badges/components/BadgeCelebration'
import BadgesWelcome, {
  type BadgesWelcomeAction,
} from '@/features/badges/components/BadgesWelcome'
import useTakeoverTurn from '@/hooks/useTakeoverTurn'
import { analytics } from '@/lib/analytics'
import { useBadgeSession } from '@/stores/badgeSession'
import { usePreferences } from '@/stores/preferences'
import { useProfileOverlay } from '@/stores/profileOverlay'
import { useTakeover } from '@/stores/takeover'
import type { BadgeKey } from '@/types/badges'
import type { RootStackNavigation } from '@/types/rootStack'

/**
 * The badge takeovers, each asking the takeover arbiter for its own turn (ADR
 * 0021), which decides when it won't interrupt (nothing above the tabs, the app
 * in front, nothing else showing):
 *
 * - **Celebration** of badges the User's own action just earned. It expires with
 *   the action's moment, or when another celebration of the same action (a
 *   streak milestone) goes first; the badges then wait on the Home card.
 * - **Welcome**, once per device, to the badges their records already reached.
 *   Never on a launch that showed the update reveal: it waits for a quieter
 *   one.
 * - **Summary** of badges found in imported or restored history.
 *
 * One badge moment at a time: closing one drops the summary queued behind it
 * (the badges stay new). Turning badges off drops everything unseen.
 * HomeTabStack mounts the single instance.
 */
export default function BadgeCelebrationOverlay({
  audience,
}: {
  /** Who will see a new badge, the one named first (from Buddies). */
  audience?: (badge: BadgeKey) => ReactNode
} = {}) {
  const navigation = useNavigation<RootStackNavigation>()
  const celebrations = useBadgeSession((s) => s.celebrations)
  const claim = useBadgeSession((s) => s.claim)
  const historyCount = useBadgeSession((s) => s.historyCount)
  const welcomePending = usePreferences((s) => s.badgesWelcome === 'pending')
  const showBadges = usePreferences((s) => s.showBadges)
  const revealedThisLaunch = useTakeover((s) =>
    s.arbiter.shown.includes('update-reveal')
  )
  const welcomeShowing = useTakeover(
    (s) => s.arbiter.active?.kind === 'badges-welcome'
  )

  const celebration = useTakeoverTurn(
    'badge-celebration',
    showBadges && celebrations.length > 0,
    claim
      ? {
          expiresAt: claim.expiresAt,
          group: claim.group,
          dropOnBackground: true,
        }
      : {}
  )
  const welcome = useTakeoverTurn(
    'badges-welcome',
    showBadges && welcomePending && (!revealedThisLaunch || welcomeShowing)
  )
  const summary = useTakeoverTurn(
    'badges-history',
    showBadges && historyCount > 0 && !welcomePending
  )

  // What each turn shows, fixed when it starts, so badges arriving meanwhile
  // wait for their own moment instead of changing the card under the User.
  const [content, setContent] = useState<BadgeCelebrationContent | null>(null)
  if (celebration.active && content?.kind !== 'live')
    setContent({ kind: 'live', keys: celebrations })
  else if (summary.active && content?.kind !== 'history')
    setContent({ kind: 'history', count: historyCount })
  else if (!celebration.active && !summary.active && content) setContent(null)

  // Its moment passed: the badges stay new and the Home card names them.
  useEffect(() => {
    if (celebration.status === 'expired')
      useBadgeSession.getState().clearCelebrations()
  }, [celebration.status])

  useEffect(() => {
    if (showBadges) return
    const session = useBadgeSession.getState()
    if (session.celebrations.length) session.clearCelebrations()
    if (session.historyCount) session.clearHistory()
    if (usePreferences.getState().badgesWelcome === 'pending')
      usePreferences.getState().set({ badgesWelcome: 'done' })
  }, [showBadges])

  const handleClose = (action: BadgeCelebrationAction) => {
    const session = useBadgeSession.getState()
    // Celebrated: the Home card has nothing to add about these.
    if (content?.kind === 'live')
      usePreferences.getState().dismissBadgeCard(content.keys)
    session.clearCelebrations()
    session.clearHistory()
    if (action === 'see_all')
      navigation.navigate('Badges', { source: 'celebration' })
  }

  const handleWelcomeClose = (action: BadgesWelcomeAction) => {
    usePreferences.getState().set({ badgesWelcome: 'done' })
    useBadgeSession.getState().clearHistory()
    analytics.capture('badges_welcome_closed', { action })
    if (action !== 'look') return
    // The profile overlay has badges at the top; it grows from the header
    // avatar, which only measures itself once the profile is set up.
    const { origin, show } = useProfileOverlay.getState()
    if (origin) show(origin)
    else navigation.navigate('Badges', { source: 'welcome' })
  }

  if (welcome.active) return <BadgesWelcome onClose={handleWelcomeClose} />
  if (content)
    return (
      <BadgeCelebration
        content={content}
        onClose={handleClose}
        audience={
          content.kind === 'live' && content.keys[0]
            ? audience?.(content.keys[0])
            : null
        }
      />
    )
  return null
}

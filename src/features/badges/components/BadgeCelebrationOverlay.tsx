import { type ComponentProps, useEffect, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import type BadgeCelebrationComponent from '@/features/badges/components/BadgeCelebration'
import type {
  BadgeCelebrationAction,
  BadgeCelebrationContent,
} from '@/features/badges/components/BadgeCelebration'
import type BadgesWelcomeComponent from '@/features/badges/components/BadgesWelcome'
import type { BadgesWelcomeAction } from '@/features/badges/components/BadgesWelcome'
import useTakeoverTurn from '@/hooks/useTakeoverTurn'
import { analytics } from '@/lib/analytics'
import { useBadgeSession } from '@/stores/badgeSession'
import { usePreferences } from '@/stores/preferences'
import { useProfileOverlay } from '@/stores/profileOverlay'
import { useTakeover } from '@/stores/takeover'
import type { RootStackNavigation } from '@/types/rootStack'

export default function BadgeCelebrationOverlay() {
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

  const [content, setContent] = useState<BadgeCelebrationContent | null>(null)
  if (celebration.active && content?.kind !== 'live')
    setContent({ kind: 'live', keys: celebrations })
  else if (summary.active && content?.kind !== 'history')
    setContent({ kind: 'history', count: historyCount })
  else if (!celebration.active && !summary.active && content) setContent(null)

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

    const { origin, show } = useProfileOverlay.getState()
    if (origin) show(origin)
    else navigation.navigate('Badges', { source: 'welcome' })
  }

  if (welcome.active) return <BadgesWelcome onClose={handleWelcomeClose} />
  if (content)
    return <BadgeCelebration content={content} onClose={handleClose} />
  return null
}

function BadgeCelebration(
  props: ComponentProps<typeof BadgeCelebrationComponent>
) {
  const Card: typeof BadgeCelebrationComponent =
    require('@/features/badges/components/BadgeCelebration').default
  return <Card {...props} />
}

function BadgesWelcome(props: ComponentProps<typeof BadgesWelcomeComponent>) {
  const Card: typeof BadgesWelcomeComponent =
    require('@/features/badges/components/BadgesWelcome').default
  return <Card {...props} />
}

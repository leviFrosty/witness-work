import { Gift as GiftIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { NotificationItem } from '@/types/notifications'
import { useMilestoneRevealStore } from '@/features/milestones/stores/milestoneReveal'

/**
 * Lets a User who skipped The Milestone Update reveal replay it. Gone once the
 * showcase is seen or the item is dismissed.
 */
export default function useMilestoneUpdateNotification(): NotificationItem | null {
  const { dismissedMilestoneRevealOnce, seenMilestoneUpdateReveal, set } =
    usePreferences()
  const requestReveal = useMilestoneRevealStore((s) => s.request)
  if (!dismissedMilestoneRevealOnce || seenMilestoneUpdateReveal) return null

  return {
    id: 'milestone_update',
    kind: 'milestone_update',
    icon: GiftIcon,
    title: i18n.t('milestoneReveal_title'),
    description: i18n.t('milestoneReveal_tagline'),
    actions: [
      {
        id: 'replay',
        label: i18n.t('milestoneReveal_seeWhatsNew'),
        onPress: () => {
          // Clear the dismissal so a second skip doesn't paint over the reveal
          // logic (the reveal can still set it again on its own dismiss path).
          set({ dismissedMilestoneRevealOnce: false })
          requestReveal()
        },
      },
    ],
    onDismiss: () => set({ seenMilestoneUpdateReveal: true }),
  }
}

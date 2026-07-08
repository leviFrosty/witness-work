import {
  Check as CheckIcon,
  Crown as CrownIcon,
  Star as StarIcon,
  Trophy as TrophyIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { AchievementTier } from '@/lib/achievementTier'

/**
 * Canonical icon for each Achievement Tier. Single source of truth shared by
 * every service-report surface that renders a tier seal.
 */
export const tierIcon = (tier: AchievementTier): AppIcon => {
  switch (tier) {
    case 'reached':
      return CheckIcon
    case 'exceeded':
      return StarIcon
    case 'crushed':
      return TrophyIcon
    case 'record':
      return CrownIcon
  }
}

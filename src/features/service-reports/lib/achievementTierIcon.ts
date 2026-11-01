import {
  Check as CheckIcon,
  Crown as CrownIcon,
  Star as StarIcon,
  Trophy as TrophyIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { AchievementTier } from '@/lib/achievementTier'

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

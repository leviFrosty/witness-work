import {
  Star as StarIcon,
  UsersRound as UsersRoundIcon,
} from 'lucide-react-native'
import ProfileCardLayout, {
  type ProfileCardDetail,
} from '@/components/ProfileCardLayout'
import StreakBadge from '@/components/StreakBadge'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import { loadBuddyPhoto } from '@/features/buddies/lib/buddiesService'
import {
  buddyDisplayName,
  buddyStreakCount,
  buddyTenureLabel,
} from '@/features/buddies/lib/buddyProfile'
import type { Buddy } from '@/features/buddies/lib/state'
import { usePreferences } from '@/stores/preferences'
import { formatDate } from '@/lib/dates'

export default function BuddyProfileHeader({ buddy }: { buddy: Buddy }) {
  const theme = useTheme()
  const name = buddyDisplayName(buddy)
  const showStreaks = usePreferences((state) => state.showStreaks)
  const streak = showStreaks ? buddyStreakCount(buddy.streak) : 0
  const fullPhoto = buddy.avatar?.t === 'image' ? buddy.avatar.full : undefined
  const details: ProfileCardDetail[] = [
    buddy.tenure && {
      icon: StarIcon,
      tint: theme.colors.indigo,
      text: buddyTenureLabel(buddy.tenure),
    },
    {
      icon: UsersRoundIcon,
      tint: theme.colors.textAlt,
      text: i18n.t('buddies_sharingSince', {
        date: formatDate(buddy.pairedAt),
      }),
    },
  ].filter((detail): detail is ProfileCardDetail => !!detail)

  return (
    <ProfileCardLayout
      avatar={
        <BuddyAvatar
          avatar={buddy.avatar}
          name={name}
          color={buddy}
          size={44}
          focusable
          loadFullImage={
            fullPhoto
              ? () =>
                  loadBuddyPhoto(buddy.inboxId, fullPhoto).catch((error) => {
                    logger.warn('[buddies] full photo', error)
                    return null
                  })
              : undefined
          }
        />
      }
      title={name}
      subtitle={buddy.nickname ? buddy.name : undefined}
      trailing={streak > 0 ? <StreakBadge count={streak} /> : undefined}
      details={details}
    />
  )
}

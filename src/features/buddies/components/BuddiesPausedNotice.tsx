import moment from 'moment'
import { CirclePause as CirclePauseIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import { formatMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import {
  isSharingPaused,
  PAUSED_INDEFINITELY,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function BuddiesPausedNotice() {
  const theme = useTheme()
  const pausedUntil = useBuddies((state) => state.sharing.pausedUntil)
  if (!isSharingPaused({ pausedUntil }, Date.now())) return null

  const resume = () => {
    analytics.capture('buddies_sharing_changed', {
      setting: 'pause',
      value: 'off',
    })
    buddiesEngine
      .setSharing({ pausedUntil: 0 })
      .catch((error) => logger.warn('[buddies] sharing', error))
  }

  return (
    <XView
      style={{
        gap: 10,
        alignItems: 'center',
        minHeight: 44,
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <LucideIcon
        icon={CirclePauseIcon}
        size={theme.fontSize('md')}
        color={theme.colors.textAlt}
      />
      <Text
        style={{
          flex: 1,
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {pausedUntil === PAUSED_INDEFINITELY
          ? i18n.t('buddies_pausedNotice')
          : i18n.t('buddies_pausedNoticeUntil', {
              date: formatMonthDayCompact(moment(pausedUntil)),
            })}
      </Text>
      <Button noTransform onPress={resume}>
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('buddies_resumeSharing')}
        </Text>
      </Button>
    </XView>
  )
}

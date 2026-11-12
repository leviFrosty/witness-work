import { ActivityIndicator, View } from 'react-native'
import {
  CircleSlash as CircleSlashIcon,
  Clock as ClockIcon,
  Link2Off as Link2OffIcon,
  Pause as PauseIcon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { GuestStatus } from '@/features/territories/guest/session'

type Shown = Exclude<GuestStatus, 'ready'>

const COPY: Record<
  Exclude<Shown, 'loading'>,
  { icon: AppIcon; title: TranslationKey; description: TranslationKey }
> = {
  invalid: {
    icon: Link2OffIcon,
    title: 'territories.guest.invalid_title',
    description: 'territories.guest.invalid_description',
  },
  ended: {
    icon: CircleSlashIcon,
    title: 'territories.guest.ended_title',
    description: 'territories.guest.ended_description',
  },
  expired: {
    icon: ClockIcon,
    title: 'territories.guest.expired_title',
    description: 'territories.guest.expired_description',
  },
  paused: {
    icon: PauseIcon,
    title: 'territories.guest.paused_title',
    description: 'territories.guest.paused_description',
  },
  offline: {
    icon: WifiOffIcon,
    title: 'territories.guest.offline_title',
    description: 'territories.guest.offline_description',
  },
  forgotten: {
    icon: Link2OffIcon,
    title: 'territories.guest.forgotten_title',
    description: 'territories.guest.forgotten_description',
  },
}

export default function GuestStatusView({
  status,
  lost,
  onRetry,
}: {
  status: Shown
  lost: number
  onRetry?: () => void
}) {
  const theme = useTheme()
  if (status === 'loading')
    return (
      <View
        testID='guest-state-loading'
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <ActivityIndicator color={theme.colors.textAlt} />
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('territories.guest.opening')}
        </Text>
      </View>
    )
  const copy = COPY[status]
  return (
    <View
      testID={`guest-state-${status}`}
      style={{ flex: 1, justifyContent: 'center' }}
    >
      <ContentColumn style={{ padding: 30, gap: 14, alignItems: 'center' }}>
        <LucideIcon icon={copy.icon} size={40} color={theme.colors.textAlt} />
        <Text
          accessibilityRole='header'
          style={{
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('xl'),
            textAlign: 'center',
          }}
        >
          {i18n.t(copy.title)}
        </Text>
        <Text style={{ color: theme.colors.textAlt, textAlign: 'center' }}>
          {i18n.t(copy.description)}
        </Text>
        {lost > 0 && (
          <Text
            testID='guest-lost'
            style={{ fontFamily: theme.fonts.semiBold, textAlign: 'center' }}
          >
            {i18n.t('territories.guest.lost', { count: lost })}
          </Text>
        )}
        {onRetry && (
          <ActionButton testID='guest-retry' onPress={onRetry}>
            {i18n.t('territories.guest.tryAgain')}
          </ActionButton>
        )}
      </ContentColumn>
    </View>
  )
}

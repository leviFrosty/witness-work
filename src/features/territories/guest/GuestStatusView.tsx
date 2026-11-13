import { ActivityIndicator, View } from 'react-native'
import {
  Flag as FlagIcon,
  Clock as ClockIcon,
  Link2Off as Link2OffIcon,
  Pause as PauseIcon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { GuestStatus } from '@/features/territories/guest/session'

type Shown = Exclude<GuestStatus, 'ready'>

const COPY: Record<
  Exclude<Shown, 'loading'>,
  { icon: AppIcon; title: TranslationKey; description?: TranslationKey }
> = {
  invalid: {
    icon: Link2OffIcon,
    title: 'territories.guest.invalid_title',
    description: 'territories.guest.invalid_description',
  },
  ended: {
    icon: FlagIcon,
    title: 'territories.guest.ended_title',
  },
  expired: {
    icon: ClockIcon,
    title: 'territories.guest.expired_title',
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
  from,
  territory,
  joined,
  onRetry,
}: {
  status: Shown
  lost: number

  from: string | null

  territory?: string | null

  joined: boolean
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
  const over = status === 'ended' || status === 'expired'
  const body = { fontSize: theme.fontSize('md'), textAlign: 'center' as const }
  return (
    <View
      testID={`guest-state-${status}`}
      style={{ flex: 1, justifyContent: 'center' }}
    >
      <ContentColumn style={{ padding: 20 }}>
        <Card style={{ gap: 14, alignItems: 'center', paddingVertical: 28 }}>
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
          {!!territory && (
            <Text
              testID='guest-state-territory'
              style={{
                marginTop: -8,
                color: theme.colors.textAlt,
                textAlign: 'center',
              }}
            >
              {territory}
            </Text>
          )}
          {over && joined && lost === 0 && (
            <Text testID='guest-saved' style={body}>
              {i18n.t('territories.guest.savedBefore')}
            </Text>
          )}
          {lost > 0 && (
            <Text
              testID='guest-lost'
              style={{ ...body, fontFamily: theme.fonts.semiBold }}
            >
              {i18n.t('territories.guest.lost', { count: lost })}
            </Text>
          )}
          <Text style={body}>
            {over
              ? from
                ? i18n.t('territories.guest.askOwner', { name: from })
                : i18n.t('territories.guest.askSomeone')
              : copy.description && i18n.t(copy.description)}
          </Text>
          {onRetry && (
            <View style={{ alignSelf: 'stretch', marginTop: 6 }}>
              <ActionButton testID='guest-retry' onPress={onRetry}>
                {i18n.t('territories.guest.tryAgain')}
              </ActionButton>
            </View>
          )}
        </Card>
      </ContentColumn>
    </View>
  )
}

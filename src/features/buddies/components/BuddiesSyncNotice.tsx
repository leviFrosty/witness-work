import { ActivityIndicator, Platform } from 'react-native'
import {
  Ban as BanIcon,
  CircleAlert as CircleAlertIcon,
  Clock as ClockIcon,
  CloudOff as CloudOffIcon,
  ShieldAlert as ShieldAlertIcon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { BuddiesSyncNotice as Notice } from '@/features/buddies/lib/syncStatus'

const ICONS = {
  offline: WifiOffIcon,
  disabled: CloudOffIcon,
  suspended: BanIcon,
  unverified: ShieldAlertIcon,
  verifyLater: ClockIcon,
  error: CircleAlertIcon,
}

const MESSAGES = {
  offline: 'buddies_syncOffline',
  disabled: 'buddies_syncUnavailable',
  suspended: 'buddies_errorSuspended',
  unverified: 'buddies_syncUnverified',
  verifyLater: 'buddies_syncVerifyLater',
  error: 'buddies_syncFailed',
} as const

const RETRYABLE = new Set<Notice>(['error', 'unverified', 'verifyLater'])

export default function BuddiesSyncNotice({
  notice,
  syncing,
  onRetry,
}: {
  notice: Notice
  syncing: boolean
  onRetry: () => void
}) {
  const theme = useTheme()
  if (!notice) return null

  return (
    <XView
      accessibilityRole='alert'
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
        icon={ICONS[notice]}
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
        {i18n.t(MESSAGES[notice])}
      </Text>
      {notice === 'unverified' && (
        <InfoPopover
          centered
          title={i18n.t('account_unverifiedTitle')}
          description={i18n.t(
            Platform.OS === 'android'
              ? 'buddies_errorUnverifiedAndroid'
              : 'buddies_errorUnverified'
          )}
        />
      )}
      {!RETRYABLE.has(notice) ? null : syncing ? (
        <ActivityIndicator
          size='small'
          color={theme.colors.textAlt}
          accessibilityLabel={i18n.t('buddies_syncing')}
        />
      ) : (
        <Button noTransform onPress={onRetry}>
          <Text
            style={{
              color: theme.colors.accent,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('buddies_tryAgain')}
          </Text>
        </Button>
      )}
    </XView>
  )
}

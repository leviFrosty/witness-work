import { ActivityIndicator } from 'react-native'
import {
  CircleAlert as CircleAlertIcon,
  CloudOff as CloudOffIcon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { BuddiesSyncNotice as Notice } from '@/features/buddies/lib/syncStatus'

const ICONS = {
  offline: WifiOffIcon,
  disabled: CloudOffIcon,
  error: CircleAlertIcon,
}

const MESSAGES = {
  offline: 'buddies_syncOffline',
  disabled: 'buddies_syncUnavailable',
  error: 'buddies_syncFailed',
} as const

/**
 * A slim line saying why Buddies couldn't refresh, while what's saved still
 * shows. A plain failure can be tried again; a spinner takes its place while a
 * sync runs.
 */
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
      {notice !== 'error' ? null : syncing ? (
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

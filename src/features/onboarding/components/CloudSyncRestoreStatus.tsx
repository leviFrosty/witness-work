import {
  CircleAlert as CircleAlertIcon,
  CircleCheck as CircleCheckIcon,
  CloudOff as CloudOffIcon,
  RotateCw as RotateCwIcon,
  Save as SaveIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import { Spinner } from 'tamagui'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatRelative } from '@/lib/dates'
import type { CloudSyncRestoreState } from '@/features/onboarding/hooks/useCloudSyncRestore'
import type { SyncPayload } from '@/app/sync/payload'

const MESSAGES: Record<
  'none' | 'incomplete' | 'offline' | 'unavailable',
  { icon: AppIcon; key: TranslationKey }
> = {
  none: { icon: CircleCheckIcon, key: 'onboardingWelcomeBack_none' },
  incomplete: {
    icon: CircleAlertIcon,
    key: 'iCloudRemoteNotReady_descriptionCloud',
  },
  offline: { icon: CloudOffIcon, key: 'iCloudRestoreOfflineCloud' },
  unavailable: {
    icon: CircleAlertIcon,
    key: 'onboardingWelcomeBack_unavailable',
  },
}

export default function CloudSyncRestoreStatus({
  state,
  onRetry,
  onRestore,
}: {
  state: CloudSyncRestoreState
  onRetry: () => void
  onRestore: (remote: SyncPayload) => void
}) {
  const theme = useTheme()

  if (state.status === 'checking' || state.status === 'restoring')
    return (
      <Card
        accessibilityLiveRegion='polite'
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 18,
          paddingHorizontal: 18,
        }}
      >
        <Spinner color={theme.colors.textAlt} />
        <Text style={{ flex: 1, color: theme.colors.textAlt }}>
          {i18n.t(
            state.status === 'checking'
              ? 'onboardingWelcomeBack_checking'
              : 'onboardingWelcomeBack_restoring'
          )}
        </Text>
      </Card>
    )

  if (state.status === 'found')
    return (
      <Card
        style={{
          gap: 16,
          paddingVertical: 18,
          paddingHorizontal: 18,
          borderWidth: 1,
          borderColor: theme.colors.accentTranslucent,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accentTranslucent,
            }}
          >
            <LucideIcon icon={SaveIcon} size={16} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
              }}
            >
              {i18n.t('onboardingWelcomeBack_foundTitle')}
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.textAlt }}>
              {i18n.t('iCloudRestoreFoundSummary', {
                device:
                  state.remote.deviceName || i18n.t('iCloudAnotherDevice'),
                relative: formatRelative(state.remote.writtenAt),
              })}
            </Text>
          </View>
        </View>
        <ActionButton
          submitShortcut={false}
          onPress={() => onRestore(state.remote)}
        >
          {i18n.t('iCloudRestoreActionWithSync')}
        </ActionButton>
      </Card>
    )

  if (
    state.status === 'none' ||
    state.status === 'incomplete' ||
    state.status === 'offline' ||
    state.status === 'unavailable'
  ) {
    const { icon, key } = MESSAGES[state.status]
    return (
      <Card style={{ gap: 4, paddingTop: 18, paddingHorizontal: 18 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
        >
          <LucideIcon icon={icon} size={18} color={theme.colors.textAlt} />
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              color: theme.colors.textAlt,
              lineHeight: 18,
            }}
          >
            {i18n.t(key)}
          </Text>
        </View>
        <Button
          onPress={onRetry}
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            minHeight: 44,
            marginLeft: 30,
          }}
        >
          <LucideIcon
            icon={RotateCwIcon}
            size={14}
            color={theme.colors.textAlt}
          />
          <Text
            style={{
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('iCloudRestoreRetry')}
          </Text>
        </Button>
      </Card>
    )
  }

  return null
}

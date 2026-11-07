import { View } from 'react-native'
import { MapPinOff as MapPinOffIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { EdgePadding } from '@/lib/mapsFrame/protocol'
import type { MapUnavailableReason } from '@/vendor/web/maps/mapkitTokens'

const MESSAGE = {
  unconfigured: 'map_unavailableNotReady',
  signedOut: 'map_unavailableSignedOut',
  offline: 'map_unavailableOffline',
  busy: 'map_unavailableBusy',
  failed: 'map_unavailableBody',
} as const satisfies Record<MapUnavailableReason, string>

const RETRIES: readonly MapUnavailableReason[] = ['offline', 'busy', 'failed']

export default function MapUnavailable({
  reason,
  inset,
  onRetry,
}: {
  reason: MapUnavailableReason

  inset: EdgePadding
  onRetry: () => void
}) {
  const theme = useTheme()
  return (
    <View
      testID='map-unavailable'
      accessibilityRole='summary'
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingTop: inset.top + 20,
        paddingRight: inset.right + 20,
        paddingBottom: inset.bottom + 20,
        paddingLeft: inset.left + 20,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <LucideIcon icon={MapPinOffIcon} size={28} color={theme.colors.textAlt} />
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('md'),
          color: theme.colors.text,
          textAlign: 'center',
        }}
      >
        {i18n.t('map_unavailableTitle')}
      </Text>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
          textAlign: 'center',
          maxWidth: 360,
        }}
      >
        {i18n.t(MESSAGE[reason])}
      </Text>
      {RETRIES.includes(reason) && (
        <Button
          variant='outline'
          onPress={onRetry}
          style={{
            marginTop: 4,
            minHeight: 44,
            paddingHorizontal: 16,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.numbers.borderRadiusMd,
          }}
        >
          <Text
            style={{
              color: theme.colors.accent,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('common_tryAgain')}
          </Text>
        </Button>
      )}
    </View>
  )
}

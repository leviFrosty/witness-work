import { X as XIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useReconnect from '@/features/buddies/hooks/useReconnect'

/**
 * Reconnect and Dismiss for a buddy who changed their account key, at the end
 * of a row in Buddies; nothing once the offer is gone.
 */
export default function ReconnectButtons({ from }: { from: string }) {
  const theme = useTheme()
  const { offer, busy, reconnect, dismiss } = useReconnect(from)
  if (!offer) return null
  return (
    // Wide enough for Dismiss's frame to end at Reconnect's edge.
    <XView style={{ gap: (MIN_TOUCH_TARGET - theme.fontSize()) / 2 }}>
      <Button
        disabled={busy}
        onPress={reconnect}
        style={{
          backgroundColor: theme.colors.accent,
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 7,
        }}
      >
        <Text
          style={{
            color: theme.colors.textInverse,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('buddies_reconnect')}
        </Text>
      </Button>
      <IconButton
        icon={XIcon}
        frame
        onPress={dismiss}
        accessibilityLabel={i18n.t('dismiss')}
        color={theme.colors.textAlt}
      />
    </XView>
  )
}

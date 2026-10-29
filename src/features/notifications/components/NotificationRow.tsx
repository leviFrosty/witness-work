import { Pressable, View } from 'react-native'
import { Bell as BellIcon, X as XIcon } from 'lucide-react-native'
import UnlockArtTile, {
  UNLOCK_ART_SIZE,
} from '@/components/toast/UnlockArtTile'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'
import type { Theme } from '@/types/theme'
import type {
  NotificationAction,
  NotificationItem,
  NotificationTone,
} from '@/types/notifications'

function toneColors(theme: Theme, tone: NotificationTone = 'accent') {
  switch (tone) {
    case 'warn':
      return {
        color: theme.colors.warnText,
        background: theme.colors.warnTranslucent,
      }
    case 'error':
      return {
        color: theme.colors.error,
        background: theme.colors.errorTranslucent,
      }
    case 'supporter':
      return {
        color: theme.colors.supporter,
        background: theme.colors.supporterTranslucent,
      }
    default:
      return {
        color: theme.colors.accent,
        background: theme.colors.accentTranslucent,
      }
  }
}

/** The round icon that leads a row without art. */
const ICON_SIZE = 36
/** Between the leading icon or art and the text. */
const LEAD_GAP = 10

/**
 * A standard tray entry: icon (or an unlock's art), title, when it came in, a
 * dismiss button, an optional description, and up to two actions. Tapping the
 * row runs the first action.
 *
 * VoiceOver reads the row as one element, which hides the buttons inside it, so
 * the second action and Dismiss are its custom actions too.
 */
export default function NotificationRow({
  item,
  at,
  unread,
  last,
  onAction,
  onDismiss,
}: {
  item: NotificationItem
  at: number
  unread: boolean
  last: boolean
  onAction: (action: NotificationAction) => void
  onDismiss: () => void
}) {
  const theme = useTheme()
  const { color, background } = toneColors(theme, item.tone)
  const [primary, secondary] = item.actions ?? []
  const lead = item.art ? UNLOCK_ART_SIZE : ICON_SIZE

  return (
    <Pressable
      // A row without actions does nothing on tap, but isn't disabled:
      // VoiceOver would read it as dimmed, though Dismiss still works.
      onPress={primary ? () => onAction(primary) : undefined}
      accessibilityActions={[
        ...(secondary ? [{ name: 'secondary', label: secondary.label }] : []),
        { name: 'dismiss', label: i18n.t('dismiss') },
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'dismiss') onDismiss()
        else if (nativeEvent.actionName === 'secondary' && secondary)
          onAction(secondary)
      }}
      style={({ pressed }) => ({
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.colors.border,
        opacity: pressed && primary ? 0.7 : 1,
      })}
    >
      <XView style={{ gap: LEAD_GAP, alignItems: 'flex-start' }}>
        <View>
          {item.art ? (
            <UnlockArtTile art={item.art} />
          ) : (
            <View
              style={{
                width: ICON_SIZE,
                height: ICON_SIZE,
                borderRadius: ICON_SIZE / 2,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: background,
              }}
            >
              <LucideIcon
                icon={item.icon ?? BellIcon}
                size={18}
                color={color}
              />
            </View>
          )}
          {unread && (
            <View
              accessibilityElementsHidden
              style={{
                position: 'absolute',
                top: -2,
                left: -2,
                width: 10,
                height: 10,
                borderRadius: 5,
                borderWidth: 1.5,
                borderColor: theme.colors.card,
                backgroundColor: theme.colors.accent,
              }}
            />
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>{item.title}</Text>
          {item.description ? (
            <Text
              numberOfLines={3}
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {item.description}
            </Text>
          ) : null}
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
            }}
          >
            {formatRelative(at)}
          </Text>
        </View>
        <IconButton
          icon={XIcon}
          size={16}
          style={touchTargetFrame(16)}
          accessibilityLabel={i18n.t('dismiss')}
          onPress={onDismiss}
        />
      </XView>

      {primary ? (
        <XView style={{ gap: 8, paddingLeft: lead + LEAD_GAP }}>
          <Button
            noTransform
            onPress={() => onAction(primary)}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: theme.numbers.borderRadiusSm,
              backgroundColor: theme.colors.accent,
            }}
          >
            <Text
              style={{
                color: theme.colors.textInverse,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {primary.label}
            </Text>
          </Button>
          {secondary ? (
            <Button
              noTransform
              onPress={() => onAction(secondary)}
              style={{
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: theme.numbers.borderRadiusSm,
                backgroundColor: theme.colors.backgroundLighter,
              }}
            >
              <Text style={{ fontSize: theme.fontSize('sm') }}>
                {secondary.label}
              </Text>
            </Button>
          ) : null}
        </XView>
      ) : null}
    </Pressable>
  )
}

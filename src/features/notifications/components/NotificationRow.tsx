import { Pressable, View } from 'react-native'
import { Bell as BellIcon, X as XIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
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

/**
 * A standard tray entry: icon, title, when it came in, a dismiss button, an
 * optional description, and up to two actions. Tapping the row runs the first
 * action.
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

  return (
    <Pressable
      disabled={!primary}
      onPress={primary ? () => onAction(primary) : undefined}
      style={({ pressed }) => ({
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <XView style={{ gap: 10, alignItems: 'flex-start' }}>
        <View>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: background,
            }}
          >
            <LucideIcon icon={item.icon ?? BellIcon} size={18} color={color} />
          </View>
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
          hitSlop={12}
          accessibilityLabel={i18n.t('dismiss')}
          onPress={onDismiss}
        />
      </XView>

      {primary ? (
        <XView style={{ gap: 8, paddingLeft: 46 }}>
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

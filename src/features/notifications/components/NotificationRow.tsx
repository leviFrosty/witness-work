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

const ICON_SIZE = 36

const LEAD_GAP = 10

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
  const [primary, ...secondaryActions] = item.actions ?? []
  const lead = item.art ? UNLOCK_ART_SIZE : ICON_SIZE

  return (
    <Pressable
      onPress={primary ? () => onAction(primary) : undefined}
      accessibilityActions={[
        ...secondaryActions.map((action, index) => ({
          name: index === 0 ? 'secondary' : `action_${action.id}`,
          label: action.label,
        })),
        { name: 'dismiss', label: i18n.t('dismiss') },
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'dismiss') onDismiss()
        else if (nativeEvent.actionName === 'secondary' && secondaryActions[0])
          onAction(secondaryActions[0])
        else {
          const matched = secondaryActions.find(
            (action) => `action_${action.id}` === nativeEvent.actionName
          )
          if (matched) onAction(matched)
        }
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
        <XView
          style={{ gap: 8, paddingLeft: lead + LEAD_GAP, flexWrap: 'wrap' }}
        >
          <Button
            noTransform
            accessibilityRole='button'
            testID={`notification-action-${primary.id}`}
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
          {secondaryActions.map((action) => (
            <Button
              key={action.id}
              noTransform
              accessibilityRole='button'
              testID={`notification-action-${action.id}`}
              onPress={() => onAction(action)}
              style={{
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: theme.numbers.borderRadiusSm,
                backgroundColor: theme.colors.backgroundLighter,
              }}
            >
              <Text style={{ fontSize: theme.fontSize('sm') }}>
                {action.label}
              </Text>
            </Button>
          ))}
        </XView>
      ) : null}
    </Pressable>
  )
}

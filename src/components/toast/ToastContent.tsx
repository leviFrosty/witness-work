import { View } from 'react-native'
import {
  CircleAlert as CircleAlertIcon,
  CircleCheck as CircleCheckIcon,
  Info as InfoIcon,
} from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import { HoverTint } from '@/components/ui/PointerHover'
import i18n from '@/lib/locales'
import { tracking } from '@/lib/tracking'
import { type Toast } from '@/stores/toasts'

/** An unlock's picture, square. */
export const UNLOCK_ART_SIZE = 52
/** Room for the Undo button: a full 44 pt target. */
const ACTION_TARGET = 44

const DEFAULT_ICONS = {
  success: CircleCheckIcon,
  info: InfoIcon,
  error: CircleAlertIcon,
  news: InfoIcon,
} as const

/** A toast's card: its colour, corners and border, drawn by `ToastView`. */
export function toastSurface(toast: Toast, theme: ReturnType<typeof useTheme>) {
  const card = toast.intent === 'unlock' || toast.intent === 'news'
  return {
    borderRadius: card ? 22 : theme.numbers.borderRadiusLg,
    backgroundColor: card ? theme.colors.card : theme.colors.text,
    borderColor: card ? theme.colors.border : 'transparent',
  }
}

/**
 * What a toast shows. The User's own action answers in a dark bar with an
 * optional button (Undo); an unlock is a card with its art, a View pill and a
 * grabber, since it can be opened or swiped away.
 */
export default function ToastContent({
  toast,
  onAction,
  hovered,
}: {
  toast: Toast
  /** The trailing button (Undo) was pressed. */
  onAction: () => void
  hovered: boolean
}) {
  const theme = useTheme()

  if (toast.intent === 'unlock' || toast.intent === 'news') {
    const unlock = toast.intent === 'unlock'
    const icon = toast.icon ?? DEFAULT_ICONS.news
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 12,
          paddingStart: 12,
          paddingEnd: 12,
        }}
      >
        {unlock && toast.art ? (
          <View
            style={{
              width: UNLOCK_ART_SIZE,
              height: UNLOCK_ART_SIZE,
              borderRadius: 16,
              borderCurve: 'continuous',
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.backgroundLighter,
            }}
          >
            {toast.art(UNLOCK_ART_SIZE)}
          </View>
        ) : (
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
            <LucideIcon icon={icon} size={20} color={theme.colors.accent} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          {toast.eyebrow ? (
            <Text
              numberOfLines={1}
              style={{
                fontSize: theme.fontSize('xs'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.accent,
                textTransform: 'uppercase',
                letterSpacing: tracking(1),
              }}
            >
              {toast.eyebrow}
            </Text>
          ) : null}
          <Text
            numberOfLines={2}
            style={{
              fontSize: theme.fontSize('md'),
              fontFamily: theme.fonts.bold,
              color: theme.colors.text,
            }}
          >
            {toast.title}
          </Text>
          {toast.message ? (
            <Text
              numberOfLines={2}
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {toast.message}
            </Text>
          ) : null}
        </View>
        {unlock && toast.onOpen ? (
          // The whole card opens it; the pill only says so.
          <View
            accessible={false}
            importantForAccessibility='no'
            style={{
              paddingHorizontal: 14,
              height: 32,
              borderRadius: 16,
              justifyContent: 'center',
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
              {i18n.t('view')}
            </Text>
          </View>
        ) : null}
        {/* Says it can be swiped away. */}
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            bottom: 5,
            alignSelf: 'center',
            start: '50%',
            marginStart: -16,
            width: 32,
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.colors.border,
          }}
        />
        <HoverTint
          visible={hovered}
          borderRadius={22}
          borderCurve='continuous'
        />
      </View>
    )
  }

  const icon =
    toast.intent === 'undo' ? null : (toast.icon ?? DEFAULT_ICONS[toast.intent])
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 48,
        paddingStart: icon ? 14 : 16,
        paddingEnd: toast.action ? 4 : 16,
        paddingVertical: 6,
      }}
    >
      {icon ? (
        <LucideIcon
          icon={icon}
          size={20}
          color={
            toast.intent === 'error'
              ? theme.colors.errorAlt
              : theme.colors.textInverse
          }
        />
      ) : null}
      <View style={{ flex: 1, paddingVertical: 4 }}>
        <Text
          numberOfLines={2}
          style={{
            color: theme.colors.textInverse,
            fontSize: theme.fontSize('sm'),
            fontFamily: toast.message ? theme.fonts.semiBold : undefined,
          }}
        >
          {toast.title}
        </Text>
        {toast.message ? (
          <Text
            numberOfLines={2}
            style={{
              color: theme.colors.textInverseAlt,
              fontSize: theme.fontSize('xs'),
            }}
          >
            {toast.message}
          </Text>
        ) : null}
      </View>
      {toast.accessory ? (
        <View importantForAccessibility='no-hide-descendants'>
          {toast.accessory.render()}
        </View>
      ) : null}
      {toast.action ? (
        <Button
          noTransform
          pointerEffect='highlight'
          testID='toast-action'
          accessibilityRole='button'
          accessibilityLabel={toast.action.label}
          onPress={onAction}
          style={{
            minWidth: ACTION_TARGET,
            minHeight: ACTION_TARGET,
            paddingHorizontal: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
              textDecorationLine: 'underline',
            }}
          >
            {toast.action.label}
          </Text>
        </Button>
      ) : null}
    </View>
  )
}

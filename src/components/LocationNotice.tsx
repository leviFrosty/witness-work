import { Platform, View, type StyleProp, type ViewStyle } from 'react-native'
import { MapPinOff as MapPinOffIcon, X as XIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { LocationAccess, LocationFix } from '@/lib/locationPermission'

const OFF_MESSAGE = Platform.select<TranslationKey>({
  web: 'locationNotice.offWeb',
  default: 'locationNotice.off',
})

export const locationNoticeMessage = (
  access: LocationAccess,
  fix: LocationFix
): TranslationKey =>
  access === 'off'
    ? 'locationNotice.servicesOff'
    : access === 'approximate'
      ? 'locationNotice.approximate'
      : fix === null
        ? 'locationNotice.blockedWeb'
        : OFF_MESSAGE

const FIX_LABEL = {
  prompt: 'locationNotice.allow',
  settings: 'locationNotice.openSettings',
  turnOn: 'locationNotice.turnOn',
} as const satisfies Record<NonNullable<LocationFix>, TranslationKey>

export default function LocationNotice({
  access,
  fix,
  onFix,
  onDismiss,
  floating = false,
  style,
  testID = 'location-notice',
}: {
  access: LocationAccess
  fix: LocationFix
  onFix: () => void
  onDismiss?: () => void
  floating?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const theme = useTheme()
  return (
    <View
      testID={testID}
      accessibilityRole='alert'
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minHeight: MIN_TOUCH_TARGET,
        },
        floating && {
          paddingStart: 14,
          paddingEnd: onDismiss ? 0 : 4,
          paddingVertical: 4,
          borderRadius: theme.numbers.borderRadiusMd,
          borderCurve: 'continuous',
          backgroundColor: `${theme.colors.card}F2`,
        },
        style,
      ]}
    >
      <LucideIcon
        icon={MapPinOffIcon}
        size={16}
        color={theme.colors.warnText}
      />
      <Text
        testID={`${testID}-message`}
        style={{ flex: 1, fontSize: theme.fontSize('sm') }}
      >
        {i18n.t(locationNoticeMessage(access, fix))}
      </Text>
      {fix && (
        <Button
          onPress={onFix}
          testID={`${testID}-fix`}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            justifyContent: 'center',
            paddingHorizontal: 8,
          }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
              color: theme.colors.accent,
            }}
          >
            {i18n.t(FIX_LABEL[fix])}
          </Text>
        </Button>
      )}
      {onDismiss && (
        <IconButton
          icon={XIcon}
          onPress={onDismiss}
          accessibilityLabel={i18n.t('dismiss')}
          color={theme.colors.textAlt}
          size='sm'
          testID={`${testID}-dismiss`}
          style={{
            width: MIN_TOUCH_TARGET,
            height: MIN_TOUCH_TARGET,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />
      )}
    </View>
  )
}

import { View } from 'react-native'
import { QrCode as QrCodeIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export function GuestCapsule({
  label,
  testID,
  onPress,
  qr = false,
  filled = false,
  accessibilityLabel,
}: {
  label: string
  testID: string
  onPress: () => void
  qr?: boolean
  filled?: boolean
  accessibilityLabel?: string
}) {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 22,
        backgroundColor: filled ? theme.colors.accent : theme.colors.card,
      }}
    >
      {qr && (
        <LucideIcon
          icon={QrCodeIcon}
          size={18}
          color={filled ? theme.colors.textInverse : theme.colors.accent}
        />
      )}
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          color: filled ? theme.colors.textInverse : theme.colors.text,
        }}
      >
        {label}
      </Text>
    </Button>
  )
}

export default function GuestHeader({
  overline,
  title,
  meta,
  until,
  urgent = false,
  quietShare = false,
  onShare,
  onChangeStreet,
}: {
  overline?: string
  title: string

  meta: string
  until?: string
  urgent?: boolean
  quietShare?: boolean
  onShare?: () => void
  onChangeStreet?: () => void
}) {
  const theme = useTheme()
  return (
    <View style={{ gap: 4, paddingHorizontal: 5 }}>
      {!!overline && (
        <Text
          testID='guest-overline'
          style={{
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.medium,
          }}
        >
          {overline}
        </Text>
      )}
      <Text
        accessibilityRole='header'
        testID='guest-title'
        style={{
          fontFamily: theme.fonts.bold,
          fontSize: theme.fontSize('2xl'),
        }}
      >
        {title}
      </Text>
      <Text style={{ fontFamily: theme.fonts.medium }}>{meta}</Text>
      {!!until && (
        <Text
          testID='guest-ends'
          style={{
            color: urgent ? theme.colors.warnText : theme.colors.textAlt,
            fontFamily: urgent ? theme.fonts.semiBold : theme.fonts.regular,
          }}
        >
          {until}
        </Text>
      )}
      {(onShare || onChangeStreet) && (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 10,
            marginHorizontal: -5,
          }}
        >
          {onChangeStreet && (
            <GuestCapsule
              testID='guest-change-street'
              label={i18n.t('territories.guest.changeStreet')}
              onPress={onChangeStreet}
            />
          )}
          {onShare && (
            <GuestCapsule
              qr
              filled={!quietShare}
              testID='guest-share'
              label={i18n.t('territories.guest.shareGroup')}
              accessibilityLabel={i18n.t('territories.guest.shareGroup_a11y')}
              onPress={onShare}
            />
          )}
        </View>
      )}
    </View>
  )
}

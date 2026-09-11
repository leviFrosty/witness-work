import {
  Check as CheckIcon,
  Gift as GiftIcon,
  Heart as HeartIcon,
} from 'lucide-react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import { Sheet, Spinner } from 'tamagui'
import { ReactNode } from 'react'
import { PurchasesPackage } from 'react-native-purchases'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import XView from '@/components/ui/layout/XView'
import Button from '@/components/ui/Button'

type Tier = 'supporter' | 'tip'

export const TierSwitchCard = ({
  targetTier,
  onPress,
}: {
  targetTier: Tier
  onPress: () => void
}) => {
  const theme = useTheme()
  const isSupporter = targetTier === 'supporter'
  const tint = isSupporter ? theme.colors.supporter : theme.colors.textAlt
  const ctaBackground = isSupporter
    ? theme.colors.supporter
    : theme.colors.backgroundLighter

  return (
    <View
      style={{
        alignSelf: 'center',
        maxWidth: '100%',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: theme.numbers.borderRadiusMd,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundLightest,
        marginVertical: 10,
      }}
    >
      <XView style={{ gap: 8 }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          <LucideIcon
            icon={isSupporter ? HeartIcon : GiftIcon}
            size={14}
            color={tint}
            fill={isSupporter ? tint : undefined}
          />
        </View>
        <Text
          style={{
            flexShrink: 1,
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {isSupporter
            ? i18n.t('becomeSupporter')
            : i18n.t('paywallTipCardTitle')}
        </Text>
        <Button
          onPress={onPress}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 9,
            borderRadius: theme.numbers.borderRadiusSm,
            borderWidth: 1,
            borderColor: isSupporter ? tint : theme.colors.border,
            backgroundColor: ctaBackground,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              fontFamily: theme.fonts.semiBold,
              color: isSupporter ? '#343232' : theme.colors.text,
            }}
          >
            {isSupporter
              ? i18n.t('paywallSupporterCardCta')
              : i18n.t('paywallCtaSendTip')}
          </Text>
        </Button>
      </XView>
    </View>
  )
}

interface PriceOptionProps {
  pkg: PurchasesPackage
  selected: boolean
  onPress: () => void
  suffix?: string
  secondary?: string
  highlight?: boolean
}

export const PriceOption = ({
  pkg,
  selected,
  onPress,
  suffix,
  secondary,
  highlight,
}: PriceOptionProps) => {
  const theme = useTheme()
  const tint = highlight ? theme.colors.supporter : theme.colors.accent
  const tintTranslucent = highlight
    ? theme.colors.supporterTranslucent
    : theme.colors.accentTranslucent
  return (
    <Button
      onPress={onPress}
      accessibilityRole='radio'
      accessibilityState={{ checked: selected }}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: theme.numbers.borderRadiusMd,
        backgroundColor: selected
          ? tintTranslucent
          : theme.colors.backgroundLightest,
        borderWidth: selected ? 1 : 0,
        borderColor: selected ? tint : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <XView style={{ alignItems: 'center', gap: 8, flex: 1 }}>
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            borderWidth: 1.5,
            borderColor: selected ? tint : theme.colors.border,
            backgroundColor: selected ? tint : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected && (
            <LucideIcon
              icon={CheckIcon}
              size={10}
              color={theme.colors.textInverse}
            />
          )}
        </View>
        <View style={{ gap: 2, flex: 1 }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: 16,
              color: theme.colors.text,
            }}
          >
            {pkg.product.priceString}
            {suffix ? (
              <Text
                style={{ fontSize: 13, color: theme.colors.textAlt }}
              >{` ${suffix}`}</Text>
            ) : null}
          </Text>
          {secondary ? (
            <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
              {secondary}
            </Text>
          ) : null}
        </View>
      </XView>
    </Button>
  )
}

interface DevPillButtonProps {
  icon: AppIcon
  label: string
  busy: boolean
  onPress: () => void
  tint?: string
}

export const DevPillButton = ({
  icon,
  label,
  busy,
  onPress,
  tint,
}: DevPillButtonProps) => {
  const theme = useTheme()
  const color = tint ?? theme.colors.textAlt
  return (
    <Button
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.backgroundLighter,
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? (
        <Spinner size='small' />
      ) : (
        <LucideIcon icon={icon} size={14} color={color} />
      )}
      {!busy && (
        <Text
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.semiBold,
            color,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
      )}
    </Button>
  )
}

export const AllOptionsSheet = ({
  visible,
  onClose,
  children,
}: {
  visible: boolean
  onClose: () => void
  children: ReactNode
}) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Sheet
      open={visible}
      onOpenChange={(o: boolean) => {
        if (!o) onClose()
      }}
      dismissOnSnapToBottom
      modal
      snapPoints={[70]}
      snapPointsMode='percent'
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame backgroundColor={theme.colors.backgroundLighter}>
        <Sheet.ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <View
            style={{
              gap: 16,
              width: '100%',
              maxWidth: 680,
              alignSelf: 'center',
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
              }}
            >
              {i18n.t('paywallAllOptionsTitle')}
            </Text>
            <View style={{ gap: 6 }}>{children}</View>
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}

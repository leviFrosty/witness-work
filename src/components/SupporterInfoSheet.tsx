import { analytics } from '@/lib/analytics'
import { X as XIcon } from 'lucide-react-native'
import Sheet from '@/components/ui/Sheet'
import { View } from 'react-native'
import { useEffect, useRef } from 'react'
import { useNavigation } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import WholeWordsText from '@/components/ui/WholeWordsText'
import IconButton from '@/components/ui/IconButton'
import Button from '@/components/ui/Button'
import SupporterBadge from '@/components/SupporterBadge'
import SupporterBenefits from '@/components/SupporterBenefits'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import useCheapestSupporterPrice from '@/hooks/useCheapestSupporterPrice'
import { useAfterPopover } from '@/components/ui/popoverContext'
import type { FeatureKey } from '@/lib/featureAccess'
import type { SupporterGateAttribution } from '@/lib/supporterGateAnalytics'

interface Props {
  open: boolean
  setOpen: (open: boolean) => void

  featureKey?: FeatureKey
  attribution?: SupporterGateAttribution
}

const SupporterInfoSheet = ({
  open,
  setOpen,
  featureKey,
  attribution,
}: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { priceString } = useCheapestSupporterPrice()
  const afterPopover = useAfterPopover()
  const interactionHandled = useRef(false)

  const openPaywall = useRef(false)

  useEffect(() => {
    if (open) {
      interactionHandled.current = false
      analytics.capture('supporter_gate_viewed', {
        feature: featureKey ?? 'general',
        ...attribution,
      })
    }
  }, [open, featureKey, attribution])

  const dismiss = (method: string) => {
    if (!open || interactionHandled.current) return
    interactionHandled.current = true
    analytics.capture('supporter_gate_dismissed', {
      feature: featureKey ?? 'general',
      ...attribution,
      method,
    })
    setOpen(false)
  }

  const title = featureKey
    ? i18n.t('supporterGateSheetTitle')
    : i18n.t('supporterSheetTitle')
  const subtitle = featureKey
    ? i18n.t('supporterGateSheetSubtitle')
    : i18n.t('supporterSheetSubtitle')

  const handleDonatePress = () => {
    if (!open || interactionHandled.current) return
    interactionHandled.current = true
    analytics.capture('supporter_gate_clicked', {
      feature: featureKey ?? 'general',
      ...attribution,
    })
    openPaywall.current = true
    setOpen(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss('gesture_or_overlay')
      }}
      onClosed={() => {
        if (!openPaywall.current) return
        openPaywall.current = false
        afterPopover(() =>
          navigation.navigate('Paywall', {
            source: 'feature_gate',
            feature: featureKey,
            gateAttribution: attribution,
          })
        )
      }}
    >
      <Sheet.ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 40, gap: 18 }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 8 }}>
            <SupporterBadge size='md' style={{ alignSelf: 'flex-start' }} />
            <WholeWordsText
              style={{
                fontSize: theme.fontSize('2xl'),
                fontFamily: theme.fonts.bold,
                color: theme.colors.text,
              }}
            >
              {title}
            </WholeWordsText>
            <WholeWordsText
              style={{
                fontSize: 14,
                color: theme.colors.textAlt,
                lineHeight: 20,
              }}
            >
              {subtitle}
            </WholeWordsText>
          </View>
          <IconButton
            noTransform
            icon={XIcon}
            size='xl'
            onPress={() => dismiss('close_button')}
          />
        </View>

        <SupporterBenefits />

        <View style={{ gap: 10, marginTop: 6 }}>
          <Button
            noTransform
            style={{
              backgroundColor: theme.colors.supporter,
              borderRadius: theme.numbers.borderRadiusSm,
              paddingVertical: 12,
              paddingHorizontal: 24,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={handleDonatePress}
          >
            <Text
              style={{
                fontSize: theme.fontSize('lg'),
                color: theme.colors.textInverse,
                fontFamily: theme.fonts.bold,
              }}
            >
              {priceString
                ? i18n.t('supporterSheetSupportFrom', {
                    price: priceString,
                  })
                : i18n.t('supporterSheetLearnMore')}
            </Text>
          </Button>
          <Button
            noTransform
            style={{ alignSelf: 'center', paddingVertical: 8 }}
            onPress={() => dismiss('not_now')}
          >
            <Text
              style={{
                color: theme.colors.textAlt,
                textDecorationLine: 'underline',
              }}
            >
              {i18n.t('supporterSheetDismiss')}
            </Text>
          </Button>
        </View>
      </Sheet.ScrollView>
    </Sheet>
  )
}

export default SupporterInfoSheet

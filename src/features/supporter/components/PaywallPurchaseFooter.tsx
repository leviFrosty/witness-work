import { Linking, View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import links from '@/constants/links'
import SupporterCtaButton from '@/features/supporter/components/SupporterCtaButton'

interface Props {
  selected: boolean
  tier: 'supporter' | 'tip'
  ctaLabel: string
  onPurchase: () => unknown
  onRestore: () => unknown
  showRestore: boolean
}

export default function PaywallPurchaseFooter({
  selected,
  tier,
  ctaLabel,
  onPurchase,
  onRestore,
  showRestore,
}: Props) {
  const theme = useTheme()
  return (
    <View style={{ gap: 10 }}>
      <SupporterCtaButton
        disabled={!selected}
        onPress={onPurchase}
        shimmer={tier === 'supporter'}
      >
        <Text
          style={{
            fontSize: theme.fontSize('lg'),
            color: tier === 'supporter' ? '#343232' : theme.colors.textInverse,
            fontFamily: theme.fonts.bold,
            textAlign: 'center',
            flexShrink: 1,
          }}
        >
          {ctaLabel}
        </Text>
      </SupporterCtaButton>
      <Text
        style={{
          fontSize: 12,
          color: theme.colors.textAlt,
          textAlign: 'center',
        }}
      >
        {tier === 'supporter'
          ? i18n.t('paywallCtaReassuranceSupporter')
          : i18n.t('paywallCtaReassuranceTip')}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap',
          columnGap: 16,
        }}
      >
        {showRestore && (
          <Button
            onPress={onRestore}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
                textDecorationLine: 'underline',
              }}
            >
              {i18n.t('restorePurchase')}
            </Text>
          </Button>
        )}
        <Button
          onPress={() => Linking.openURL(links.termsOfUse)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('termsOfUse')}
          </Text>
        </Button>
        <Button
          onPress={() => Linking.openURL(links.privacyPolicy)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('privacyPolicy')}
          </Text>
        </Button>
      </View>
    </View>
  )
}

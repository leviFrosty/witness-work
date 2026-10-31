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
  /** A purchase is running; the CTA shows a spinner and can't be pressed. */
  purchasing?: boolean
  /**
   * Why Buy can't be pressed for the selected price (web only), shown under the
   * CTA in place of the reassurance line.
   */
  unavailableReason?: string
}

export default function PaywallPurchaseFooter({
  selected,
  tier,
  ctaLabel,
  onPurchase,
  purchasing = false,
  unavailableReason,
}: Props) {
  const theme = useTheme()
  const labelColor = tier === 'supporter' ? '#343232' : theme.colors.textInverse
  return (
    <View style={{ gap: 10 }}>
      <SupporterCtaButton
        disabled={!selected}
        loading={purchasing}
        loadingColor={labelColor}
        onPress={onPurchase}
        shimmer={tier === 'supporter'}
      >
        <Text
          style={{
            fontSize: theme.fontSize('lg'),
            color: labelColor,
            fontFamily: theme.fonts.bold,
            textAlign: 'center',
            flexShrink: 1,
          }}
        >
          {ctaLabel}
        </Text>
      </SupporterCtaButton>
      {unavailableReason ? (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
            textAlign: 'center',
          }}
        >
          {unavailableReason}
        </Text>
      ) : (
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
      )}
    </View>
  )
}

export function PaywallLegalFooter({
  onRestore,
  restoring = false,
  showRestore,
}: {
  onRestore: () => unknown
  restoring?: boolean
  showRestore: boolean
}) {
  const theme = useTheme()
  return (
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
          loading={restoring}
          accessibilityRole='button'
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
        onPress={() => {
          Linking.openURL(links.termsOfUse)
        }}
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
        onPress={() => {
          Linking.openURL(links.privacyPolicy)
        }}
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
  )
}

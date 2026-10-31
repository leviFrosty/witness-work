import {
  CircleCheck as CircleCheckIcon,
  Clock as ClockIcon,
} from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Purchases from 'react-native-purchases'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Spinner from '@/components/ui/Spinner'
import Wrapper from '@/components/ui/layout/Wrapper'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import useTheme from '@/contexts/theme'
import useCustomer from '@/hooks/useCustomer'
import { analytics } from '@/lib/analytics'
import { forwardedReturn, returnedAppUserId } from '@/lib/launchAddress'
import i18n from '@/lib/locales'
import type { PurchaseTier } from '@/lib/purchaseReturn'
import { ensureRevenueCatLinked } from '@/lib/serverAccount/revenueCatLinkRuntime'
import { supporterSinceDate } from '@/lib/supporterSince'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import {
  clearWebCheckoutRecord,
  readWebCheckoutRecord,
} from '@/features/supporter/lib/webCheckout'
import {
  checkWebPurchaseReturn,
  webReturnKind,
  type WebPurchaseReturnOutcome,
} from '@/features/supporter/lib/webPurchaseReturn'

type Shown = Exclude<WebPurchaseReturnOutcome, 'confirmed'> | 'checking'

const toTier = (value: unknown): PurchaseTier | null =>
  value === 'supporter' || value === 'tip' ? value : null

const COPY = {
  pending: {
    title: 'webPurchaseReturn_pendingTitleWeb',
    body: 'webPurchaseReturn_pendingBodyWeb',
  },
  signed_out: {
    title: 'webPurchaseReturn_completeTitleWeb',
    body: 'webPurchaseReturn_signedOutBodyWeb',
  },
  other_customer: {
    title: 'webPurchaseReturn_completeTitleWeb',
    body: 'webPurchaseReturn_otherCustomerBodyWeb',
  },
  // No tier and nothing in customer info: never says a purchase is complete.
  not_found: {
    title: 'webPurchaseReturn_notFoundTitleWeb',
    body: 'webPurchaseReturn_notFoundBodyWeb',
  },
} as const

/**
 * Where web checkout returns, `/supporter/thank-you?tier=…` (web only;
 * docs/web-purchases.md "The return page"). It confirms the purchase from fresh
 * customer info, then shows the Thank You screen. It never switches RevenueCat
 * customers, and never logs in with the id checkout returned.
 */
const WebPurchaseReturnScreen = () => {
  const theme = useTheme()
  const foldColumn = useFoldColumn(480)
  const navigation = useNavigation<RootStackNavigation>()
  const route = useRoute<RouteProp<RootStackParamList, 'Web Purchase Return'>>()
  const { ready, unavailable, setCustomer } = useCustomer()
  const [record] = useState(readWebCheckoutRecord)
  // Only the address names the purchase; without it, customer info must.
  const tier = toTier(route.params?.tier)
  const [shown, setShown] = useState<Shown>('checking')
  const [check, setCheck] = useState(0)

  useEffect(() => {
    if (!ready && !unavailable) return
    let current = true
    const returned = returnedAppUserId()
    void checkWebPurchaseReturn({
      tier,
      returnedAppUserId: returned,
      available: ready,
      appUserId: () => Purchases.getAppUserID(),
      fetchCustomer: async () => {
        // Browser mode keeps no copy of customer info: this asks RevenueCat.
        const customer = await Purchases.getCustomerInfo()
        if (current) setCustomer(customer)
        return customer
      },
      link: () =>
        ensureRevenueCatLinked({ force: true, reason: 'purchase_return' }),
      isSupporter: (customer) => supporterSinceDate(customer) !== null,
      checkoutStartedAt: record?.startedAt ?? null,
      clearRecord: clearWebCheckoutRecord,
      sleep: (ms) =>
        new Promise((resolve, reject) =>
          setTimeout(() => (current ? resolve() : reject()), ms)
        ),
    })
      .then((result) => {
        if (!current) return
        analytics.capture('supporter_web_purchase_returned', {
          tier:
            result.outcome === 'confirmed' ? result.tier : (tier ?? 'unknown'),
          outcome: result.outcome,
          return_kind: webReturnKind({
            returnedAppUserId: returned,
            forwarded: forwardedReturn(),
          }),
          retry: check > 0,
        })
        if (result.outcome !== 'confirmed') return setShown(result.outcome)
        navigation.replace('Thank You', { purchaseTier: result.tier })
      })
      // Left the screen while it waited.
      .catch(() => {})
    return () => {
      current = false
    }
  }, [ready, unavailable, check, tier, record, setCustomer, navigation])

  const goHome = () => navigation.navigate('Root', undefined, { pop: true })

  return (
    <Wrapper
      insets='top'
      style={{ flex: 1, justifyContent: 'center', padding: 24 }}
    >
      <View
        style={[
          {
            width: '100%',
            maxWidth: 480,
            alignSelf: 'center',
            alignItems: 'center',
            gap: 16,
          },
          foldColumn,
        ]}
      >
        {shown === 'checking' ? (
          <Spinner
            size='large'
            label={i18n.t('webPurchaseReturn_checkingWeb')}
          />
        ) : (
          <>
            {shown !== 'not_found' && (
              <LucideIcon
                icon={shown === 'pending' ? ClockIcon : CircleCheckIcon}
                size={44}
                color={
                  shown === 'pending'
                    ? theme.colors.textAlt
                    : theme.colors.accent
                }
              />
            )}
            <Text
              accessibilityRole='header'
              style={{
                fontSize: theme.fontSize('2xl'),
                fontFamily: theme.fonts.bold,
                color: theme.colors.text,
                textAlign: 'center',
              }}
            >
              {i18n.t(COPY[shown].title)}
            </Text>
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                color: theme.colors.textAlt,
                textAlign: 'center',
                lineHeight: 22,
              }}
            >
              {i18n.t(COPY[shown].body)}
            </Text>
            <View style={{ alignSelf: 'stretch', gap: 12, marginTop: 8 }}>
              {shown === 'pending' && (
                <ActionButton
                  onPress={() => {
                    setShown('checking')
                    setCheck((count) => count + 1)
                  }}
                >
                  {i18n.t('webPurchaseReturn_retryWeb')}
                </ActionButton>
              )}
              {shown === 'not_found' ? (
                <ActionButton onPress={goHome}>{i18n.t('goBack')}</ActionButton>
              ) : shown === 'pending' ? (
                <Button
                  variant='outline'
                  onPress={goHome}
                  style={{
                    minHeight: 44,
                    paddingVertical: 12,
                    borderRadius: theme.numbers.borderRadiusSm,
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: theme.fontSize('md'),
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.text,
                    }}
                  >
                    {i18n.t('goHome')}
                  </Text>
                </Button>
              ) : (
                <ActionButton onPress={goHome}>{i18n.t('goHome')}</ActionButton>
              )}
            </View>
          </>
        )}
      </View>
    </Wrapper>
  )
}

export default WebPurchaseReturnScreen

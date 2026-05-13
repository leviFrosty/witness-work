import { Alert, ScrollView, View } from 'react-native'
import { Image } from 'expo-image'
import * as Sentry from '@sentry/react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import XView from '@/components/ui/layout/XView'
import Button from '@/components/ui/Button'
import Wrapper from '@/components/ui/layout/Wrapper'
import { Spinner } from 'tamagui'
import Purchases, {
  PURCHASES_ERROR_CODE,
  PurchasesError,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases'
import SupporterBadge from '@/components/SupporterBadge'
import GlassCard from '@/components/ui/GlassCard'
import SegmentedControl from '@/components/ui/SegmentedControl'
import PreviousDonations from '@/features/supporter/components/PreviousDonations'
import Divider from '@/components/ui/Divider'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import {
  faCheck,
  faHeart,
  faMinus,
  faRotate,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ActionButton from '@/components/ui/ActionButton'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useCustomer from '@/hooks/useCustomer'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { logger } from '@/lib/logger'
import { TranslationKey } from '@/lib/locales'

type Tier = 'supporter' | 'tip'
type SupporterBilling = 'monthly' | 'annual'

const FEATURE_ROWS: ReadonlyArray<{
  labelKey: TranslationKey
  free: boolean
  supporter: boolean
}> = [
  { labelKey: 'paywallFeatureCore', free: true, supporter: true },
  { labelKey: 'paywallFeaturePrivacy', free: true, supporter: true },
  { labelKey: 'paywallFeatureWidgets', free: true, supporter: true },
  { labelKey: 'paywallFeatureSync', free: false, supporter: true },
  { labelKey: 'paywallFeatureAccent', free: false, supporter: true },
  { labelKey: 'paywallFeatureFuture', free: false, supporter: true },
]

const FounderLetter = () => {
  const theme = useTheme()
  return (
    <GlassCard padding={18}>
      <XView style={{ alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: theme.colors.supporterTranslucent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FontAwesomeIcon
            icon={faHeart}
            size={10}
            color={theme.colors.supporter}
          />
        </View>
        <Text
          style={{
            fontSize: 11,
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.supporter,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {i18n.t('paywallLetterEyebrow')}
        </Text>
      </XView>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
        <View
          style={{
            padding: 3,
            borderRadius: 44,
            backgroundColor: theme.colors.supporterTranslucent,
          }}
        >
          <Image
            source={require('@/assets/levi-portrait.png')}
            style={{ width: 80, height: 80, borderRadius: 40 }}
            contentFit='cover'
            cachePolicy='memory-disk'
            transition={150}
          />
        </View>
        <Text
          style={{
            flex: 1,
            fontSize: 14,
            color: theme.colors.text,
            lineHeight: 22,
          }}
        >
          {i18n.t('paywallLetterBody')}
        </Text>
      </View>
      <View style={{ marginTop: 12, alignItems: 'flex-start', gap: 2 }}>
        {/* TODO: replace src/assets/signature.png with actual signature art. */}
        <Image
          source={require('@/assets/signature.png')}
          style={{ width: 140, height: 48 }}
          contentFit='contain'
          cachePolicy='memory-disk'
          tintColor={theme.colors.text}
        />
        <XView style={{ alignItems: 'center', gap: 6 }}>
          <Text
            style={{
              fontSize: 13,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
              letterSpacing: 0.3,
            }}
          >
            {i18n.t('founderNoteSignOff')}
          </Text>
          <FontAwesomeIcon
            icon={faHeart}
            size={11}
            color={theme.colors.supporter}
          />
        </XView>
      </View>
    </GlassCard>
  )
}

const FREE_COL_WIDTH = 80
const SUPPORTER_COL_WIDTH = 100
const ROW_PADDING_HORIZONTAL = 18

const CompareCell = ({
  included,
  width,
  highlight,
}: {
  included: boolean
  width: number
  highlight?: boolean
}) => {
  const theme = useTheme()
  const includedColor = highlight
    ? theme.colors.supporter
    : theme.colors.textAlt
  return (
    <View style={{ width, alignItems: 'center' }}>
      <FontAwesomeIcon
        icon={included ? faCheck : faMinus}
        size={13}
        color={included ? includedColor : theme.colors.textAlt}
      />
    </View>
  )
}

const ComparisonChart = () => {
  const theme = useTheme()
  return (
    <GlassCard padding={0}>
      <View
        style={{
          paddingHorizontal: ROW_PADDING_HORIZONTAL,
          paddingTop: 16,
          paddingBottom: 8,
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {i18n.t('paywallCompareTitle')}
        </Text>
      </View>
      <View>
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: SUPPORTER_COL_WIDTH + ROW_PADDING_HORIZONTAL,
            backgroundColor: theme.colors.supporterTranslucent,
          }}
        />
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: ROW_PADDING_HORIZONTAL,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <View style={{ flex: 1 }} />
          <View style={{ width: FREE_COL_WIDTH, alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 11,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              {i18n.t('paywallColFree')}
            </Text>
          </View>
          <View style={{ width: SUPPORTER_COL_WIDTH }}>
            <XView style={{ alignItems: 'center', gap: 4, marginLeft: 15 }}>
              <FontAwesomeIcon
                icon={faHeart}
                size={10}
                color={theme.colors.supporter}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.supporter,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                {i18n.t('paywallColSupporter')}
              </Text>
            </XView>
          </View>
        </View>
        {FEATURE_ROWS.map((row, index) => (
          <View
            key={row.labelKey}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: ROW_PADDING_HORIZONTAL,
              paddingVertical: 12,
              borderBottomWidth: index === FEATURE_ROWS.length - 1 ? 0 : 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 14,
                color: theme.colors.text,
              }}
            >
              {i18n.t(row.labelKey)}
            </Text>
            <CompareCell included={row.free} width={FREE_COL_WIDTH + 20} />
            <CompareCell
              included={row.supporter}
              width={SUPPORTER_COL_WIDTH - 10}
              highlight
            />
          </View>
        ))}
      </View>
    </GlassCard>
  )
}

interface PriceOptionProps {
  pkg: PurchasesPackage
  selected: boolean
  onPress: () => void
  suffix?: string
  secondary?: string
  highlight?: boolean
  popular?: boolean
}

const PriceOption = ({
  pkg,
  selected,
  onPress,
  suffix,
  secondary,
  highlight,
  popular,
}: PriceOptionProps) => {
  const theme = useTheme()
  const tint = highlight ? theme.colors.supporter : theme.colors.accent
  const tintTranslucent = highlight
    ? theme.colors.supporterTranslucent
    : theme.colors.accentTranslucent
  return (
    <Button
      onPress={onPress}
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
      <XView style={{ alignItems: 'center', gap: 8 }}>
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
            <FontAwesomeIcon
              icon={faCheck}
              size={10}
              color={theme.colors.textInverse}
            />
          )}
        </View>
        <View style={{ gap: 2 }}>
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
      {popular && (
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: tint,
          }}
        >
          <Text
            style={{
              fontSize: 9,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textInverse,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            {i18n.t('paywallMostPopular')}
          </Text>
        </View>
      )}
    </Button>
  )
}

interface DevPillButtonProps {
  icon: IconDefinition
  label: string
  busy: boolean
  onPress: () => void
  tint?: string
}

const DevPillButton = ({
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
        <FontAwesomeIcon icon={icon} size={14} color={color} />
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

const PaywallScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const route = useRoute<RouteProp<RootStackParamList, 'Paywall'>>()
  const initialTier: Tier = route.params?.initialTier ?? 'supporter'
  const [selectedPackage, setSelectedPackage] =
    useState<PurchasesPackage | null>(null)
  const [currentOfferings, setCurrentOfferings] =
    useState<PurchasesOfferings | null>(null)
  const { customer, setCustomer, hasPurchasedBefore, revalidate, ready } =
    useCustomer()
  const [tier, setTier] = useState<Tier>(initialTier)
  const [supporterBilling, setSupporterBilling] =
    useState<SupporterBilling>('monthly')
  const navigation = useNavigation<RootStackNavigation>()

  const allOfferings = useMemo(() => {
    if (!currentOfferings) return []
    return Object.keys(currentOfferings.all).map(
      (key) => currentOfferings.all[key]
    )
  }, [currentOfferings])

  const monthlyPackages = useMemo(() => {
    return allOfferings
      .map((o) => o.monthly)
      .filter((p): p is PurchasesPackage => !!p)
      .sort((a, b) => a.product.price - b.product.price)
  }, [allOfferings])

  const annualPackages = useMemo(() => {
    return allOfferings
      .map((o) => o.annual)
      .filter((p): p is PurchasesPackage => !!p)
      .sort((a, b) => a.product.price - b.product.price)
  }, [allOfferings])

  // Offerings that are strictly one-time (no monthly or annual package). These
  // are framed as tips — no ongoing Supporter status.
  const tipPackages = useMemo(() => {
    return allOfferings
      .filter((o) => !o.monthly && !o.annual)
      .map((o) => o.availablePackages[0])
      .filter((p): p is PurchasesPackage => !!p)
      .sort((a, b) => a.product.price - b.product.price)
  }, [allOfferings])

  const activePackages = useMemo(() => {
    if (tier === 'tip') return tipPackages
    if (supporterBilling === 'annual' && annualPackages.length > 0) {
      return annualPackages
    }
    return monthlyPackages
  }, [tier, supporterBilling, monthlyPackages, annualPackages, tipPackages])

  // Fetches latest offerings from RevenueCat. Must wait until
  // `Purchases.configure` has run in CustomerProvider, otherwise the native
  // SDK throws "Purchases has not been configured" and the user sees
  // "Error Fetching Offerings" on first launch.
  const hasFetchedOfferings = useRef(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // `getOfferings` is served from the SDK's internal cache (~5 min TTL), so a
  // plain call won't pick up dashboard edits. `force` routes through
  // `syncAttributesAndOfferingsIfNeeded`, which bypasses that cache.
  const fetchOfferings = useCallback(async (force = false) => {
    logger.log('[Paywall] calling Purchases.getOfferings', { force })
    try {
      const offerings = force
        ? await Purchases.syncAttributesAndOfferingsIfNeeded()
        : await Purchases.getOfferings()
      logger.log('[Paywall] getOfferings success', {
        force,
        currentIdentifier: offerings.current?.identifier ?? null,
        allCount: Object.keys(offerings.all).length,
        allIdentifiers: Object.keys(offerings.all),
      })
      setCurrentOfferings(offerings)
    } catch (error) {
      const err = error as PurchasesError
      logger.error('[Paywall] getOfferings failed', {
        code: err?.code,
        message: err?.message,
        underlying: err?.underlyingErrorMessage,
        userInfo: err?.userInfo,
        raw: err,
      })
      hasFetchedOfferings.current = false
      Alert.alert(i18n.t('errorFetchingOfferings'), i18n.t('tryAgainLater'))
      Sentry.captureException(error)
      throw error
    }
  }, [])

  useEffect(() => {
    logger.log('[Paywall] effect fired', {
      ready,
      alreadyFetched: hasFetchedOfferings.current,
    })
    if (!ready || hasFetchedOfferings.current) return
    hasFetchedOfferings.current = true
    fetchOfferings().catch(() => {})
  }, [ready, fetchOfferings])

  const handleDevRefresh = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      Purchases.invalidateCustomerInfoCache()
      hasFetchedOfferings.current = false
      await fetchOfferings(true)
      await revalidate()
      hasFetchedOfferings.current = true
    } catch {
      // fetchOfferings already surfaces the error via Alert/Sentry.
    } finally {
      setIsRefreshing(false)
    }
  }, [fetchOfferings, isRefreshing, revalidate])

  const [isResetting, setIsResetting] = useState(false)

  // The RN SDK has no client-side "delete purchases" call — only the REST API
  // can delete a subscriber, and that needs a secret key. For dev/test this is
  // close enough: `logIn` with a fresh UUID switches the active user to a new
  // anonymous-style identity with no entitlements or purchase history, so the
  // paywall UI behaves as if the customer were brand new.
  const handleDevReset = useCallback(() => {
    if (isResetting) return
    Alert.alert(
      'Reset purchases?',
      'Switches to a fresh RevenueCat user on this device. The previous user and their purchase history remain on the RevenueCat dashboard. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setIsResetting(true)
            try {
              const freshId = `dev-reset-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 10)}`
              logger.log('[Paywall] dev reset — logging in as', { freshId })
              const { customerInfo } = await Purchases.logIn(freshId)
              setCustomer(customerInfo)
              Purchases.invalidateCustomerInfoCache()
              hasFetchedOfferings.current = false
              await fetchOfferings(true)
              await revalidate()
              hasFetchedOfferings.current = true
            } catch (error) {
              logger.error('[Paywall] dev reset failed', error)
              Sentry.captureException(error)
              Alert.alert(i18n.t('error'), i18n.t('tryAgainLater'))
            } finally {
              setIsResetting(false)
            }
          },
        },
      ]
    )
  }, [fetchOfferings, isResetting, revalidate, setCustomer])

  // Preselect a sensible default whenever the active list changes. Finds the
  // currently-selected price in the new list, otherwise picks the lowest.
  useEffect(() => {
    if (activePackages.length === 0) {
      setSelectedPackage(null)
      return
    }
    const currentPrice = selectedPackage?.product.price
    if (currentPrice !== undefined) {
      const closest = activePackages.reduce((best, pkg) => {
        const diff = Math.abs(pkg.product.price - currentPrice)
        const bestDiff = Math.abs(best.product.price - currentPrice)
        return diff < bestDiff ? pkg : best
      }, activePackages[0])
      setSelectedPackage(closest)
    } else {
      setSelectedPackage(activePackages[0])
    }
    // We intentionally exclude selectedPackage from deps — this effect only
    // reacts to the active list changing (tier/billing switch).
  }, [activePackages, selectedPackage?.product.price])

  const handlePurchase = useCallback(async () => {
    if (!selectedPackage) {
      return Alert.alert(i18n.t('noOfferingSelected'))
    }

    try {
      const { productIdentifier } =
        await Purchases.purchasePackage(selectedPackage)
      if (productIdentifier) {
        revalidate()
        navigation.replace('Thank You')
      }
    } catch (error: unknown) {
      const code = (error as PurchasesError).code
      // User-initiated cancellation from the StoreKit sheet throws here; it's
      // expected flow, not a failure — swallow it without alerting or paging.
      const cancelled = code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
      if (!cancelled) {
        Alert.alert(i18n.t('error'), i18n.t('errorCheckingOut'))
        Sentry.captureException(error)
      }
    }
  }, [navigation, revalidate, selectedPackage])

  const handleRestore = useCallback(async () => {
    try {
      const restored = await Purchases.restorePurchases()
      if (Object.keys(restored.allPurchaseDates).length === 0) {
        Alert.alert(i18n.t('noPurchasesFound'))
      }
      setCustomer(restored)
    } catch (error: unknown) {
      Sentry.captureException(error)
      Alert.alert(i18n.t('error_restoring_account'))
    }
  }, [setCustomer])

  const ctaLabel = useMemo(() => {
    if (!selectedPackage) return i18n.t('paywallCtaSelectPrice')
    const price = selectedPackage.product.priceString
    if (tier === 'tip') return i18n.t('paywallCtaTip', { price })
    if (supporterBilling === 'annual') {
      return i18n.t('paywallCtaSupporterAnnual', { price })
    }
    return i18n.t('paywallCtaSupporterMonthly', { price })
  }, [selectedPackage, tier, supporterBilling])

  if (!currentOfferings) {
    return (
      <Wrapper>
        <Spinner />
      </Wrapper>
    )
  }

  const showBillingToggle = tier === 'supporter' && annualPackages.length > 0
  const tierExplainer =
    tier === 'supporter'
      ? i18n.t('paywallSupporterTabDesc')
      : i18n.t('paywallTipTabDesc')

  return (
    <Wrapper
      insets='none'
      style={{
        justifyContent: 'space-between',
      }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 20,
          paddingBottom: 20,
          paddingHorizontal: 15,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <FounderLetter />
        <ComparisonChart />

        <SegmentedControl<Tier>
          variant='pill'
          value={tier}
          onChange={setTier}
          options={[
            {
              key: 'supporter',
              label: i18n.t('paywallTierSupporter'),
              trailing: <SupporterBadge iconOnly size='sm' />,
            },
            { key: 'tip', label: i18n.t('paywallTierTip') },
          ]}
        />

        <Text
          style={{
            fontSize: 13,
            color: theme.colors.textAlt,
            lineHeight: 18,
            paddingHorizontal: 4,
          }}
        >
          {tierExplainer}
        </Text>
        {__DEV__ && (
          <XView style={{ alignSelf: 'flex-end', gap: 6 }}>
            <DevPillButton
              icon={faRotate}
              label='Refresh'
              busy={isRefreshing}
              onPress={handleDevRefresh}
            />
            <DevPillButton
              icon={faTrash}
              label='Reset'
              busy={isResetting}
              onPress={handleDevReset}
              tint={theme.colors.error}
            />
          </XView>
        )}

        {showBillingToggle && (
          <SegmentedControl<SupporterBilling>
            variant='pill'
            size='sm'
            value={supporterBilling}
            onChange={setSupporterBilling}
            style={{ alignSelf: 'center' }}
            options={[
              { key: 'monthly', label: i18n.t('paywallBillingMonthly') },
              {
                key: 'annual',
                label: i18n.t('paywallBillingAnnual'),
                subLabel: { text: i18n.t('paywallBillingAnnualSave') },
              },
            ]}
          />
        )}

        <View style={{ gap: 6 }}>
          {activePackages.map((pkg, index) => {
            const key = `${pkg.offeringIdentifier}:${pkg.product.identifier}`
            const selectedKey = selectedPackage
              ? `${selectedPackage.offeringIdentifier}:${selectedPackage.product.identifier}`
              : null
            const monthlyEquivalent =
              tier === 'supporter' &&
              supporterBilling === 'annual' &&
              pkg.product.pricePerMonthString
                ? `≈ ${pkg.product.pricePerMonthString} ${i18n.t('eachMonth')}`
                : undefined
            // Nudge toward the second-cheapest monthly tier — RocketMoney-style
            // social proof without endorsing the floor or the ceiling.
            const isPopular =
              tier === 'supporter' &&
              supporterBilling === 'monthly' &&
              activePackages.length >= 2 &&
              index === 1
            return (
              <PriceOption
                key={key}
                pkg={pkg}
                selected={selectedKey === key}
                onPress={() => setSelectedPackage(pkg)}
                highlight={tier === 'supporter'}
                suffix={
                  tier === 'tip'
                    ? undefined
                    : supporterBilling === 'annual'
                      ? i18n.t('eachYear')
                      : i18n.t('eachMonth')
                }
                secondary={monthlyEquivalent}
                popular={isPopular}
              />
            )
          })}
        </View>

        <Button
          onPress={() => navigation.navigate('Donate')}
          style={{ alignSelf: 'center', paddingVertical: 10 }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('paywallLearnMore')}
          </Text>
        </Button>

        <Divider />
        {hasPurchasedBefore && customer ? (
          <PreviousDonations customer={customer} revalidate={revalidate} />
        ) : (
          <Button
            onPress={handleRestore}
            style={{ alignSelf: 'center', paddingVertical: 10 }}
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
      </ScrollView>
      <View
        style={{
          paddingHorizontal: 15,
          paddingTop: 10,
          paddingBottom: insets.bottom + 10,
        }}
      >
        <ActionButton disabled={!selectedPackage} onPress={handlePurchase}>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
            }}
          >
            {ctaLabel}
          </Text>
        </ActionButton>
      </View>
    </Wrapper>
  )
}

export default PaywallScreen

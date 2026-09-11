import {
  ChevronDown as ChevronDownIcon,
  CircleQuestionMark as CircleQuestionMarkIcon,
  RotateCw as RotateCwIcon,
  Trash2 as Trash2Icon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { Alert, ScrollView, useWindowDimensions, View } from 'react-native'
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
import SegmentedControl from '@/components/ui/SegmentedControl'
import PreviousDonations from '@/features/supporter/components/PreviousDonations'
import Divider from '@/components/ui/Divider'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Header from '@/components/ui/layout/Header'
import IconButton from '@/components/ui/IconButton'
import {
  getPackageKey,
  getVisiblePackages,
} from '@/features/supporter/lib/paywallOptions'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useCustomer from '@/hooks/useCustomer'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { logger } from '@/lib/logger'
import { isOfflineError } from '@/lib/offlineError'
import { clearAdoptedAccountId } from '@/lib/account'
import {
  FounderLetter,
  SocialProofRow,
  ComparisonChart,
  type NotesImportPaywallAllowance,
} from '@/features/supporter/components/PaywallBenefits'
import {
  TierSwitchCard,
  PriceOption,
  DevPillButton,
  AllOptionsSheet,
} from '@/features/supporter/components/PaywallOptions'
import PaywallPurchaseFooter from '@/features/supporter/components/PaywallPurchaseFooter'

type Tier = 'supporter' | 'tip'
type SupporterBilling = 'monthly' | 'annual'
// Each price list keeps its own independent selection — switching
// monthly↔annual (or to tips) never remaps a choice across views.
type PriceView = SupporterBilling | 'tip'

// Keep the price lists compact; unselected later options live behind "Show all options."
const SUPPORTER_VISIBLE_OPTION_LIMIT = __DEV__ ? 1 : 4
const TIP_VISIBLE_OPTION_LIMIT = __DEV__ ? 1 : 5

const PaywallScreen = ({
  notesImportAllowance,
}: {
  notesImportAllowance?: NotesImportPaywallAllowance
}) => {
  const theme = useTheme()
  const { width, height, fontScale } = useWindowDimensions()
  const dockFooter = height >= 650 && fontScale <= 1.3
  const isWide = width >= 1000 && fontScale <= 1.3
  const insets = useSafeAreaInsets()
  const route = useRoute<RouteProp<RootStackParamList, 'Paywall'>>()
  const initialTier: Tier = route.params?.initialTier ?? 'supporter'
  const [currentOfferings, setCurrentOfferings] =
    useState<PurchasesOfferings | null>(null)
  const { customer, setCustomer, hasPurchasedBefore, revalidate, ready } =
    useCustomer()
  const [tier, setTier] = useState<Tier>(initialTier)
  // Annual-first anchors the better value; monthly stays one tap away.
  const [supporterBilling, setSupporterBilling] =
    useState<SupporterBilling>('annual')
  const navigation = useNavigation<RootStackNavigation>()
  const scrollViewRef = useRef<ScrollView>(null)
  const pricingScrollViewRef = useRef<ScrollView>(null)
  const pendingTierScroll = useRef<Tier | null>(null)

  useEffect(() => {
    if (!isWide) return
    const frame = requestAnimationFrame(() => {
      pricingScrollViewRef.current?.scrollTo({ y: 0, animated: false })
    })
    return () => cancelAnimationFrame(frame)
  }, [isWide, tier])

  const handleTierSwitch = (nextTier: Tier) => {
    pendingTierScroll.current = isWide ? null : nextTier
    setTier(nextTier)
  }

  const handleTierSectionLayout = (section: Tier, y: number) => {
    if (pendingTierScroll.current !== section) return

    requestAnimationFrame(() => {
      if (pendingTierScroll.current !== section) return
      pendingTierScroll.current = null
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, y - 10),
        animated: true,
      })
    })
  }

  const priceView: PriceView = tier === 'tip' ? 'tip' : supporterBilling
  const [selectedByView, setSelectedByView] = useState<
    Partial<Record<PriceView, PurchasesPackage>>
  >({})
  const selectedPackage = selectedByView[priceView] ?? null
  const setSelectedPackage = (pkg: PurchasesPackage) =>
    setSelectedByView((prev) => ({ ...prev, [priceView]: pkg }))

  // FAQ lives in the header as a "?" icon instead of an inline text link —
  // keeps the pricing column focused on a single decision.
  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          buttonType='back'
          title={i18n.t('paywallTitle')}
          rightElement={
            <IconButton
              style={{ position: 'absolute', right: 0 }}
              icon={CircleQuestionMarkIcon}
              size='xl'
              accessibilityLabel={i18n.t('paywallLearnMore')}
              onPress={() =>
                navigation.navigate('FAQ', { scrollToCategory: 'supporter' })
              }
            />
          }
        />
      ),
    })
  }, [navigation])

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

  const [showAllOptions, setShowAllOptions] = useState(false)
  const selectedKey = selectedPackage ? getPackageKey(selectedPackage) : null

  const visibleOptionLimit =
    tier === 'supporter'
      ? SUPPORTER_VISIBLE_OPTION_LIMIT
      : TIP_VISIBLE_OPTION_LIMIT
  const visiblePackages = getVisiblePackages(
    activePackages,
    visibleOptionLimit,
    selectedKey
  )

  const hasHiddenOptions = visiblePackages.length < activePackages.length

  // Close the sheet when its contents swap out from under it (tier or
  // billing switch) rather than showing a different list mid-gesture.
  useEffect(() => {
    setShowAllOptions(false)
  }, [tier, supporterBilling])

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
      // Offline is expected, not a bug — surface the Alert but don't page Sentry
      // (JW-TIME-BW). Other failures still report.
      if (!isOfflineError(error)) Sentry.captureException(error)
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
              // Also drop any iCloud-adopted account id, otherwise the next
              // account reconcile would immediately log back in as it.
              clearAdoptedAccountId()
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

  // Preselect a default for the active view the first time it's shown, and
  // replace a selection that no longer exists in the list (e.g. after an
  // offerings refetch). An existing valid selection is left alone — each view
  // remembers its own choice independently.
  useEffect(() => {
    setSelectedByView((prev) => {
      const current = prev[priceView]
      if (
        current &&
        activePackages.some((p) => getPackageKey(p) === getPackageKey(current))
      ) {
        return prev
      }
      if (activePackages.length === 0) {
        if (!current) return prev
        const next = { ...prev }
        delete next[priceView]
        return next
      }
      // Default to the second-cheapest option — a gentle anchor above the
      // floor while the cheapest choice stays visibly one tap away.
      return {
        ...prev,
        [priceView]: activePackages[1] ?? activePackages[0],
      }
    })
  }, [activePackages, priceView, tier])

  const handlePurchase = useCallback(async () => {
    if (!selectedPackage) {
      return Alert.alert(i18n.t('noOfferingSelected'))
    }

    try {
      const { productIdentifier } =
        await Purchases.purchasePackage(selectedPackage)
      if (productIdentifier) {
        revalidate()
        // Pass the purchased tier so the Thank You screen shows the right
        // tone — a lifetime supporter who tips one-time should see the tip
        // thank-you, not the full supporter celebration, even though
        // `isSupporter` is still true.
        navigation.replace('Thank You', { purchaseTier: tier })
      }
    } catch (error: unknown) {
      const code = (error as PurchasesError).code
      // User-initiated cancellation from the StoreKit sheet throws here; it's
      // expected flow, not a failure — swallow it without alerting or paging.
      const cancelled = code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
      if (!cancelled) {
        Alert.alert(i18n.t('error'), i18n.t('errorCheckingOut'))
        // Offline mid-checkout is expected — the Alert already explains the
        // network instability; don't page Sentry for it (JW-TIME-BW).
        if (!isOfflineError(error)) Sentry.captureException(error)
      }
    }
  }, [navigation, revalidate, selectedPackage, tier])

  const handleRestore = useCallback(async () => {
    try {
      const restored = await Purchases.restorePurchases()
      if (Object.keys(restored.allPurchaseDates).length === 0) {
        Alert.alert(i18n.t('noPurchasesFound'))
      }
      setCustomer(restored)
    } catch (error: unknown) {
      // Offline during restore is expected — show the Alert, skip Sentry
      // (JW-TIME-BW).
      if (!isOfflineError(error)) Sentry.captureException(error)
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
      <Wrapper
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Spinner />
      </Wrapper>
    )
  }

  const showBillingToggle = tier === 'supporter' && annualPackages.length > 0

  const renderPriceOption = (
    pkg: PurchasesPackage,
    afterSelect?: () => void
  ) => {
    const key = getPackageKey(pkg)
    const monthlyEquivalent =
      tier === 'supporter' &&
      supporterBilling === 'annual' &&
      pkg.product.pricePerMonthString
        ? `≈ ${pkg.product.pricePerMonthString} ${i18n.t('eachMonth')}`
        : undefined
    return (
      <PriceOption
        key={key}
        pkg={pkg}
        selected={selectedKey === key}
        onPress={() => {
          setSelectedPackage(pkg)
          afterSelect?.()
        }}
        highlight={tier === 'supporter'}
        suffix={
          tier === 'tip'
            ? undefined
            : supporterBilling === 'annual'
              ? i18n.t('eachYear')
              : i18n.t('eachMonth')
        }
        secondary={monthlyEquivalent}
      />
    )
  }
  const tierExplainer =
    tier === 'supporter'
      ? i18n.t('paywallSupporterTabDesc')
      : i18n.t('paywallTipTabDesc')

  const benefits = (
    <View style={{ gap: 16 }}>
      <FounderLetter spacious={isWide} />
      <SocialProofRow />
      {tier === 'supporter' && (
        <View
          onLayout={(event) =>
            handleTierSectionLayout('supporter', event.nativeEvent.layout.y)
          }
        >
          <ComparisonChart
            spacious={isWide}
            notesImportAllowance={notesImportAllowance}
          />
        </View>
      )}
    </View>
  )
  const pricing = (
    <View
      style={{ gap: 14 }}
      onLayout={(event) => {
        if (tier === 'tip')
          handleTierSectionLayout('tip', event.nativeEvent.layout.y)
      }}
    >
      {isWide && (
        <Text
          style={{
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('xl'),
          }}
        >
          {tier === 'supporter'
            ? i18n.t('becomeSupporter')
            : i18n.t('paywallTierTip')}
        </Text>
      )}
      {/* Supporter is the primary flow; Tip gets its own heading when selected. */}
      {tier === 'tip' && !isWide && (
        <View>
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
              paddingHorizontal: 4,
            }}
          >
            {i18n.t('paywallTierTip')}
          </Text>
        </View>
      )}

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
            icon={RotateCwIcon}
            label='Refresh'
            busy={isRefreshing}
            onPress={handleDevRefresh}
          />
          <DevPillButton
            icon={Trash2Icon}
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
        {(isWide && showAllOptions ? activePackages : visiblePackages).map(
          (pkg) => renderPriceOption(pkg)
        )}
        {hasHiddenOptions && !(isWide && showAllOptions) && (
          <Button
            onPress={() => setShowAllOptions(true)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: theme.numbers.borderRadiusMd,
              backgroundColor: theme.colors.backgroundLightest,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <LucideIcon
              icon={ChevronDownIcon}
              size={14}
              color={theme.colors.textAlt}
            />
            <Text
              style={{
                fontSize: 14,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('paywallShowAllOptions')}
            </Text>
          </Button>
        )}
      </View>

      <Divider />
      <TierSwitchCard
        targetTier={tier === 'supporter' ? 'tip' : 'supporter'}
        onPress={() =>
          handleTierSwitch(tier === 'supporter' ? 'tip' : 'supporter')
        }
      />
      <Divider />
      {hasPurchasedBefore && customer && (
        <PreviousDonations customer={customer} revalidate={revalidate} />
      )}
    </View>
  )
  const purchaseFooter = (
    <PaywallPurchaseFooter
      selected={!!selectedPackage}
      tier={tier}
      ctaLabel={ctaLabel}
      onPurchase={handlePurchase}
      onRestore={handleRestore}
      showRestore={!hasPurchasedBefore}
    />
  )

  return (
    <Wrapper insets='none' style={{ flex: 1 }}>
      {isWide ? (
        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: 1100,
            alignSelf: 'center',
            flexDirection: 'row',
            gap: 24,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {benefits}
          </ScrollView>
          <View
            style={{
              width: 420,
              height: '100%',
              maxHeight: 760,
              alignSelf: 'flex-start',
              backgroundColor: theme.colors.card,
              borderRadius: theme.numbers.borderRadiusLg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: 'hidden',
            }}
          >
            <ScrollView
              ref={pricingScrollViewRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, gap: 20 }}
            >
              {pricing}
              {!dockFooter && purchaseFooter}
            </ScrollView>
            {dockFooter && (
              <View
                style={{
                  padding: 20,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                {purchaseFooter}
              </View>
            )}
          </View>
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingVertical: 20 }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 680,
                alignSelf: 'center',
                paddingHorizontal: 15,
                gap: 14,
              }}
            >
              {benefits}
              {pricing}
              {!dockFooter && purchaseFooter}
            </View>
          </ScrollView>
          {dockFooter && (
            <View
              style={{
                width: '100%',
                maxWidth: 680,
                alignSelf: 'center',
                paddingHorizontal: 15,
                paddingTop: 10,
                paddingBottom: insets.bottom + 10,
              }}
            >
              {purchaseFooter}
            </View>
          )}
        </>
      )}
      <AllOptionsSheet
        visible={!isWide && showAllOptions}
        onClose={() => setShowAllOptions(false)}
      >
        {activePackages.map((pkg) =>
          renderPriceOption(pkg, () => setShowAllOptions(false))
        )}
      </AllOptionsSheet>
    </Wrapper>
  )
}

export default PaywallScreen

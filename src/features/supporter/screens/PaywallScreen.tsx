import {
  ChevronDown as ChevronDownIcon,
  CircleAlert as CircleAlertIcon,
  CircleQuestionMark as CircleQuestionMarkIcon,
  PackageOpen as PackageOpenIcon,
  RotateCw as RotateCwIcon,
  Trash2 as Trash2Icon,
  WifiOff as WifiOffIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import {
  Alert,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import { errorTracking } from '@/lib/errorTracking'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import XView from '@/components/ui/layout/XView'
import Button from '@/components/ui/Button'
import Wrapper from '@/components/ui/layout/Wrapper'
import Spinner from '@/components/ui/Spinner'
import Empty from '@/components/ui/Empty'
import ActionButton from '@/components/ui/ActionButton'
import InlineNotice from '@/components/ui/InlineNotice'
import Purchases, {
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
import { isConnectivityError } from '@/lib/http/networkError'
import { addReconnectListener } from '@/lib/http/online'
import { addForegroundListener } from '@/lib/appLifecycle'
import {
  storeErrorOutcome,
  type StoreErrorOutcome,
} from '@/features/supporter/lib/purchaseErrors'
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
import PaywallPurchaseFooter, {
  PaywallLegalFooter,
} from '@/features/supporter/components/PaywallPurchaseFooter'
import { analytics } from '@/lib/analytics'

type Tier = 'supporter' | 'tip'
type SupporterBilling = 'monthly' | 'annual'
// Each price list keeps its own independent selection — switching
// monthly↔annual (or to tips) never remaps a choice across views.
type PriceView = SupporterBilling | 'tip'
// What asked for offerings, for `paywall_offerings_failed` / `_empty`.
type OfferingsTrigger = 'initial' | 'retry' | 'foreground' | 'reconnect'

const storePlatform = Platform.OS === 'android' ? 'android' : 'ios'

const totalPackages = (offerings: PurchasesOfferings) =>
  Object.values(offerings.all).reduce(
    (count, offering) => count + offering.availablePackages.length,
    0
  )

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
  const source = route.params?.source ?? 'unknown'
  const feature = route.params?.feature
  const gateAttribution = route.params?.gateAttribution
  const purchased = useRef(false)
  const openedAt = useRef(Date.now())
  const initialTier: Tier = route.params?.initialTier ?? 'supporter'
  const [currentOfferings, setCurrentOfferings] =
    useState<PurchasesOfferings | null>(null)
  const {
    customer,
    setCustomer,
    hasPurchasedBefore,
    revalidate,
    ready,
    unavailable,
  } = useCustomer()
  const [tier, setTier] = useState<Tier>(initialTier)
  // Annual-first anchors the better value; monthly stays one tap away.
  const [supporterBilling, setSupporterBilling] =
    useState<SupporterBilling>('annual')
  const navigation = useNavigation<RootStackNavigation>()
  useEffect(() => {
    analytics.capture('paywall_viewed', {
      source,
      feature,
      ...gateAttribution,
      initial_tier: initialTier,
    })
  }, [source, feature, gateAttribution, initialTier])

  useEffect(
    () =>
      navigation.addListener('beforeRemove', () => {
        analytics.capture('paywall_closed', {
          source,
          feature,
          ...gateAttribution,
          tier,
          billing: tier === 'tip' ? 'one_time' : supporterBilling,
          purchased: purchased.current,
          duration_ms: Date.now() - openedAt.current,
        })
      }),
    [navigation, source, feature, gateAttribution, tier, supporterBilling]
  )

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
              onPress={() => {
                navigation.navigate('FAQ', { scrollToCategory: 'supporter' })
              }}
            />
          }
        />
      ),
    })
  }, [navigation, source, gateAttribution])

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
  // SDK throws "Purchases has not been configured".
  const hasFetchedOfferings = useRef(false)
  const offeringsInFlight = useRef(false)
  const [loadingOfferings, setLoadingOfferings] = useState(false)
  // Why the last load failed; the screen shows it until a load succeeds.
  const [offeringsError, setOfferingsError] = useState<
    'offline' | 'failed' | null
  >(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // `getOfferings` is served from the SDK's internal cache (~5 min TTL), so a
  // plain call won't pick up dashboard edits. `force` routes through
  // `syncAttributesAndOfferingsIfNeeded`, which bypasses that cache.
  const fetchOfferings = useCallback(
    async ({
      force = false,
      trigger = 'initial',
    }: { force?: boolean; trigger?: OfferingsTrigger } = {}) => {
      if (offeringsInFlight.current) return
      offeringsInFlight.current = true
      setLoadingOfferings(true)
      logger.log('[Paywall] calling Purchases.getOfferings', { force, trigger })
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
        if (totalPackages(offerings) === 0) {
          analytics.capture('paywall_offerings_empty', {
            source,
            ...gateAttribution,
            trigger,
          })
        }
        setCurrentOfferings(offerings)
        setOfferingsError(null)
      } catch (error) {
        const err = error as PurchasesError
        const connectivity = isConnectivityError(error)
        analytics.capture('paywall_offerings_failed', {
          source,
          ...gateAttribution,
          error_code: err?.code ?? 'unknown',
          offline: isOfflineError(error),
          trigger,
        })
        const log = connectivity ? logger.warn : logger.error
        log('[Paywall] getOfferings failed', {
          code: err?.code,
          message: err?.message,
          underlying: err?.underlyingErrorMessage,
          userInfo: err?.userInfo,
          raw: err,
        })
        setOfferingsError(connectivity ? 'offline' : 'failed')
        // Offline is expected, not a bug (JW-TIME-BW). Other failures report.
        if (!connectivity) errorTracking.captureException(error)
        throw error
      } finally {
        offeringsInFlight.current = false
        setLoadingOfferings(false)
      }
    },
    [source, gateAttribution]
  )

  useEffect(() => {
    logger.log('[Paywall] effect fired', {
      ready,
      alreadyFetched: hasFetchedOfferings.current,
    })
    if (!ready || hasFetchedOfferings.current) return
    hasFetchedOfferings.current = true
    fetchOfferings().catch(() => {})
  }, [ready, fetchOfferings])

  // Without prices the screen is a dead end, so try again whenever the user
  // comes back to the app or the connection returns.
  const missingOfferings =
    !currentOfferings || totalPackages(currentOfferings) === 0
  const awaitingOfferings = ready && !unavailable && missingOfferings
  useEffect(() => {
    if (!awaitingOfferings) return
    const retry = (trigger: OfferingsTrigger) => () => {
      fetchOfferings({ trigger }).catch(() => {})
    }
    const foreground = addForegroundListener(retry('foreground'))
    const reconnect = addReconnectListener(retry('reconnect'))
    return () => {
      foreground.remove()
      reconnect.remove()
    }
  }, [awaitingOfferings, fetchOfferings])

  const retryOfferings = () => {
    // An empty list may be stale in the SDK's cache; a failure isn't cached.
    fetchOfferings({ force: !!currentOfferings, trigger: 'retry' }).catch(
      () => {}
    )
  }

  const handleDevRefresh = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      Purchases.invalidateCustomerInfoCache()
      await fetchOfferings({ force: true, trigger: 'retry' })
      await revalidate()
    } catch {
      Alert.alert(i18n.t('errorFetchingOfferings'))
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
              await fetchOfferings({ force: true, trigger: 'retry' })
              await revalidate()
            } catch (error) {
              logger.error('[Paywall] dev reset failed', error)
              errorTracking.captureException(error)
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

  const [purchasing, setPurchasing] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const showStoreError = (outcome: StoreErrorOutcome) => {
    Alert.alert(
      i18n.t(outcome.title),
      i18n.t(outcome.message),
      outcome.offerRestore
        ? [
            { text: i18n.t('cancel'), style: 'cancel' },
            {
              text: i18n.t('restorePurchase'),
              onPress: () => void handleRestore(),
            },
          ]
        : undefined
    )
  }

  const handleRestore = async () => {
    if (purchasing || restoring) return
    setRestoring(true)
    analytics.capture('supporter_restore_started', {
      source,
      ...gateAttribution,
    })
    try {
      const restored = await Purchases.restorePurchases()
      if (Object.keys(restored.allPurchaseDates).length === 0) {
        analytics.capture('supporter_restore_empty', {
          source,
          ...gateAttribution,
        })
        Alert.alert(i18n.t('noPurchasesFound'))
      } else {
        analytics.capture('supporter_purchases_restored', {
          source,
          ...gateAttribution,
        })
      }
      setCustomer(restored)
    } catch (error: unknown) {
      analytics.capture('supporter_restore_failed', {
        source,
        ...gateAttribution,
        error_code: (error as PurchasesError)?.code ?? 'unknown',
        offline: isOfflineError(error),
      })
      const outcome = storeErrorOutcome(error, 'restore', storePlatform)
      if (outcome.report) errorTracking.captureException(error)
      if (!outcome.silent) showStoreError(outcome)
    } finally {
      setRestoring(false)
    }
  }

  const handlePurchase = async () => {
    if (purchasing || restoring) return
    if (!selectedPackage) {
      return Alert.alert(i18n.t('noOfferingSelected'))
    }

    const purchaseProperties = {
      source,
      feature,
      ...gateAttribution,
      tier,
      billing: tier === 'supporter' ? supporterBilling : 'one_time',
      product_id: selectedPackage.product.identifier,
      package_id: selectedPackage.identifier,
      price: selectedPackage.product.price,
      currency: selectedPackage.product.currencyCode,
    }
    setPurchasing(true)
    analytics.capture('supporter_purchase_started', purchaseProperties)
    try {
      const { productIdentifier } =
        await Purchases.purchasePackage(selectedPackage)
      if (productIdentifier) {
        purchased.current = true
        analytics.capture('supporter_purchase_completed', purchaseProperties)
        revalidate()
        // Pass the purchased tier so the Thank You screen shows the right
        // tone — a lifetime supporter who tips one-time should see the tip
        // thank-you, not the full supporter celebration, even though
        // `isSupporter` is still true.
        navigation.replace('Thank You', { purchaseTier: tier })
      }
    } catch (error: unknown) {
      const code = (error as PurchasesError).code
      // Cancelling the store sheet throws here too; it's expected flow, so it
      // stays silent.
      const outcome = storeErrorOutcome(error, 'purchase', storePlatform)
      analytics.capture(
        outcome.silent
          ? 'supporter_purchase_cancelled'
          : 'supporter_purchase_failed',
        {
          ...purchaseProperties,
          error_code: code ?? 'unknown',
          offline: isOfflineError(error),
        }
      )
      if (outcome.report) errorTracking.captureException(error)
      if (!outcome.silent) showStoreError(outcome)
    } finally {
      setPurchasing(false)
    }
  }

  const ctaLabel = useMemo(() => {
    if (!selectedPackage) return i18n.t('paywallCtaSelectPrice')
    const price = selectedPackage.product.priceString
    if (tier === 'tip') return i18n.t('paywallCtaTip', { price })
    if (supporterBilling === 'annual') {
      return i18n.t('paywallCtaSupporterAnnual', { price })
    }
    return i18n.t('paywallCtaSupporterMonthly', { price })
  }, [selectedPackage, tier, supporterBilling])

  if (!currentOfferings || missingOfferings) {
    const empty = !!currentOfferings && !offeringsError
    return (
      <Wrapper
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 15,
        }}
      >
        {unavailable ? (
          <Empty
            icon={
              <LucideIcon
                icon={CircleAlertIcon}
                size={24}
                color={theme.colors.text}
              />
            }
            title={i18n.t('errorFetchingOfferings')}
            description={i18n.t('purchasesUnavailable')}
          />
        ) : offeringsError || empty ? (
          <Empty
            icon={
              <LucideIcon
                icon={
                  empty
                    ? PackageOpenIcon
                    : offeringsError === 'offline'
                      ? WifiOffIcon
                      : CircleAlertIcon
                }
                size={24}
                color={theme.colors.text}
              />
            }
            title={
              empty
                ? i18n.t('paywall_noOptionsTitle')
                : offeringsError === 'offline'
                  ? i18n.t('common_offlineTitle')
                  : i18n.t('errorFetchingOfferings')
            }
            description={
              empty
                ? i18n.t('thereAreNoOfferings')
                : offeringsError === 'offline'
                  ? i18n.t('paywall_offline')
                  : i18n.t('paywall_offeringsError')
            }
            action={
              <ActionButton onPress={retryOfferings} loading={loadingOfferings}>
                {i18n.t('common_tryAgain')}
              </ActionButton>
            }
          />
        ) : (
          <Spinner
            size='large'
            delayMs={300}
            label={i18n.t('paywall_loadingOptions')}
          />
        )}
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
      {Platform.OS === 'ios' && <SocialProofRow />}
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
          onChange={(billing) => {
            setSupporterBilling(billing)
          }}
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
        {activePackages.length === 0 && (
          <InlineNotice tone='info' message={i18n.t('thereAreNoOfferings')} />
        )}
        {(isWide && showAllOptions ? activePackages : visiblePackages).map(
          (pkg) => renderPriceOption(pkg)
        )}
        {hasHiddenOptions && !(isWide && showAllOptions) && (
          <Button
            onPress={() => {
              setShowAllOptions(true)
            }}
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
      <PaywallLegalFooter
        onRestore={handleRestore}
        restoring={restoring}
        showRestore={!hasPurchasedBefore}
      />
      {hasPurchasedBefore && customer && (
        <PreviousDonations customer={customer} />
      )}
    </View>
  )
  const purchaseFooter = (
    <PaywallPurchaseFooter
      selected={!!selectedPackage}
      tier={tier}
      ctaLabel={ctaLabel}
      onPurchase={handlePurchase}
      purchasing={purchasing}
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
        onClose={() => {
          setShowAllOptions(false)
        }}
      >
        {activePackages.map((pkg) =>
          renderPriceOption(pkg, () => setShowAllOptions(false))
        )}
      </AllOptionsSheet>
    </Wrapper>
  )
}

export default PaywallScreen

import { RefreshCw as RefreshCwIcon } from 'lucide-react-native'
import { View } from 'react-native'
import { errorTracking } from '@/lib/errorTracking'
import Purchases, {
  CustomerInfo,
  PurchasesStoreProduct,
} from 'react-native-purchases'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import XView from '@/components/ui/layout/XView'
import moment from 'moment'
import { formatDate } from '@/lib/dates'
import React, { useEffect, useMemo, useState } from 'react'
import Card from '@/components/ui/Card'
import useTheme from '@/contexts/theme'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import InlineNotice from '@/components/ui/InlineNotice'
import PointerTooltip from '@/components/ui/PointerTooltip'
import Spinner from '@/components/ui/Spinner'
import useCustomer from '@/hooks/useCustomer'
import { isConnectivityError } from '@/lib/http/networkError'
import { LIFETIME_SUPPORTER_ENTITLEMENT } from '@/lib/supporterSince'
import {
  billingKind,
  matchStoreProduct,
} from '@/features/supporter/lib/supporterPause'
import { useSubscriptionStatus } from '@/features/supporter/hooks/useManageSubscription'
import ManageSubscriptionSheet from '@/features/supporter/components/ManageSubscriptionSheet'

interface PreviousDonationsProps {
  customer: CustomerInfo
}

/** Why a store call failed, as the notice's tone. */
type Failure = 'offline' | 'error'

const failure = (error: unknown): Failure => {
  if (isConnectivityError(error)) return 'offline'
  errorTracking.captureException(error)
  return 'error'
}

/**
 * The store products behind the customer's purchases, for their prices. Fetches
 * again only when the set of product ids changes or on `retry`.
 */
const usePurchasedProducts = (customer: CustomerInfo) => {
  // Union purchase history with the live subscription map so we can always
  // resolve price + billing period for the active-subscription cards —
  // including users whose entitlement was granted manually in the RC
  // dashboard. Their real store subscription still lands in these maps with
  // its real product identifier, even though the granted entitlement points
  // at a synthetic promotional product that `getProducts` can't resolve.
  const idsKey = JSON.stringify(
    Array.from(
      new Set([
        ...Object.keys(customer.allPurchaseDates),
        ...Object.keys(customer.subscriptionsByProductIdentifier ?? {}),
      ])
    ).sort()
  )
  const [attempt, setAttempt] = useState(0)
  const [products, setProducts] = useState<PurchasesStoreProduct[]>([])
  const [settled, setSettled] = useState<{
    key: string
    error: Failure | null
  } | null>(null)
  const key = `${attempt}:${idsKey}`

  useEffect(() => {
    let current = true
    const ids = JSON.parse(idsKey) as string[]
    Purchases.getProducts(ids)
      .then((found) => {
        if (!current) return
        setProducts(found)
        setSettled({ key, error: null })
      })
      .catch((error: unknown) => {
        const kind = failure(error)
        if (current) setSettled({ key, error: kind })
      })
    return () => {
      current = false
    }
  }, [idsKey, key])

  const done = settled?.key === key
  return {
    products,
    loading: !done,
    error: done ? settled.error : null,
    retry: () => setAttempt((n) => n + 1),
  }
}

const PreviousDonations = ({ customer }: PreviousDonationsProps) => {
  const theme = useTheme()
  const { setCustomer } = useCustomer()
  const prices = usePurchasedProducts(customer)
  const { products } = prices
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<Failure | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const status = useSubscriptionStatus()
  const manageableProduct =
    status.state.kind === 'none' ? null : status.state.sub.productIdentifier

  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      await Purchases.invalidateCustomerInfoCache()
      setCustomer(await Purchases.getCustomerInfo())
      prices.retry()
    } catch (error) {
      setRefreshError(failure(error))
    } finally {
      setRefreshing(false)
    }
  }

  const notice = refreshError
    ? {
        tone: refreshError,
        message:
          refreshError === 'offline'
            ? i18n.t('storeError_offline')
            : i18n.t('yourDonations_refreshFailed'),
        onRetry: refresh,
        retrying: refreshing,
      }
    : prices.error
      ? {
          tone: prices.error,
          message:
            prices.error === 'offline'
              ? i18n.t('storeError_offline')
              : i18n.t('yourDonations_pricesFailed'),
          onRetry: prices.retry,
          retrying: prices.loading,
        }
      : null
  const priceSpinner = prices.loading ? <Spinner size='small' /> : null

  const nonSubscriptions = useMemo(() => {
    return customer.nonSubscriptionTransactions
      .map((transaction) => {
        const matchingProduct = matchStoreProduct(
          products,
          transaction.productIdentifier
        )

        return {
          ...transaction,
          name: matchingProduct?.priceString,
        }
      })
      .sort((a, b) => moment(b.purchaseDate).diff(a.purchaseDate))
  }, [customer.nonSubscriptionTransactions, products])

  // Read from `active`, not `all`: a revoked lifetime grant should drop out
  // entirely rather than appear here as inactive.
  const lifetimeSupporterEntitlement =
    LIFETIME_SUPPORTER_ENTITLEMENT in customer.entitlements.active
      ? customer.entitlements.active[LIFETIME_SUPPORTER_ENTITLEMENT]
      : undefined

  // Drive the recurring-donation cards off the customer's real subscriptions
  // rather than the entitlement identifier. This is billing-period accurate for
  // monthly and annual alike, and resolves price even when supporter status was
  // granted manually in the dashboard — the underlying store subscription still
  // appears here with its real product identifier. Active subscriptions sort
  // first, then most-recently purchased.
  const subscriptions = useMemo(() => {
    return Object.values(customer.subscriptionsByProductIdentifier ?? {})
      .map((sub) => {
        const product = matchStoreProduct(products, sub.productIdentifier)
        return {
          sub,
          product,
          kind: billingKind(product?.subscriptionPeriod),
        }
      })
      .sort((a, b) => {
        if (a.sub.isActive !== b.sub.isActive) return a.sub.isActive ? -1 : 1
        return moment(b.sub.purchaseDate).diff(a.sub.purchaseDate)
      })
  }, [customer.subscriptionsByProductIdentifier, products])

  return (
    <View style={{ gap: 20 }}>
      <XView style={{ paddingBottom: 15, gap: 10 }}>
        <Text
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('yourDonations')}
        </Text>
        <PointerTooltip label={i18n.t('yourDonations_refresh')}>
          <IconButton
            icon={RefreshCwIcon}
            onPress={refresh}
            loading={refreshing}
            accessibilityLabel={i18n.t('yourDonations_refresh')}
            color={theme.colors.textAlt}
          />
        </PointerTooltip>
      </XView>
      {notice && <InlineNotice {...notice} />}
      {lifetimeSupporterEntitlement && (
        <Card>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('lg'),
            }}
          >
            {i18n.t('lifetimeSupporter')}
          </Text>
          <XView style={{ gap: 10, flexWrap: 'wrap' }}>
            <Text style={{ fontFamily: theme.fonts.bold }}>
              {i18n.t('neverExpires')}
            </Text>
            <Badge color={theme.colors.accentTranslucent} size='sm'>
              {i18n.t('active')}
            </Badge>
          </XView>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('activatedOn', {
              date: formatDate(
                lifetimeSupporterEntitlement.originalPurchaseDate
              ),
            })}
          </Text>
        </Card>
      )}
      {subscriptions.map(({ sub, product, kind }) => {
        const title =
          kind === 'annual'
            ? i18n.t('annualDonation')
            : kind === 'monthly'
              ? i18n.t('monthlyDonation')
              : i18n.t('recurringDonation')
        const periodSuffix =
          kind === 'annual'
            ? i18n.t('eachYear')
            : kind === 'monthly'
              ? i18n.t('eachMonth')
              : ''
        return (
          <View key={sub.productIdentifier} style={{ gap: 10 }}>
            <Card>
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('lg'),
                }}
              >
                {title}
              </Text>
              <XView style={{ gap: 10, flexWrap: 'wrap' }}>
                {product?.priceString ? (
                  <Text style={{ fontFamily: theme.fonts.bold }}>
                    {product.priceString}
                    {periodSuffix ? ` ${periodSuffix}` : ''}
                  </Text>
                ) : (
                  priceSpinner
                )}
                <Badge
                  color={
                    sub.isActive
                      ? theme.colors.accentTranslucent
                      : theme.colors.backgroundLighter
                  }
                  size='sm'
                >
                  {sub.isActive ? i18n.t('active') : i18n.t('inactive')}
                </Badge>
              </XView>
              {sub.productIdentifier === manageableProduct && (
                <>
                  {status.label && (
                    <Text
                      style={{
                        fontSize: theme.fontSize('sm'),
                        color: theme.colors.textAlt,
                      }}
                    >
                      {status.label}
                    </Text>
                  )}
                  <Button
                    variant='outline'
                    onPress={() => setManageOpen(true)}
                    style={{
                      alignSelf: 'flex-start',
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: theme.numbers.borderRadiusSm,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: theme.fontSize('sm'),
                        fontFamily: theme.fonts.semiBold,
                      }}
                    >
                      {i18n.t('manageSubscription')}
                    </Text>
                  </Button>
                </>
              )}
            </Card>
          </View>
        )
      })}
      {nonSubscriptions.length > 0 && (
        <Card>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('oneTimeDonations')}
          </Text>
          {nonSubscriptions.map((transaction) => {
            return (
              <XView
                key={transaction.transactionIdentifier}
                style={{ flexWrap: 'wrap', gap: 12 }}
              >
                {transaction.name ? (
                  <Text style={{ fontFamily: theme.fonts.bold }}>
                    {transaction.name}
                  </Text>
                ) : (
                  priceSpinner
                )}
                <Text>{formatDate(transaction.purchaseDate)}</Text>
              </XView>
            )
          })}
        </Card>
      )}
      <ManageSubscriptionSheet
        open={manageOpen}
        setOpen={setManageOpen}
        source='paywall'
      />
    </View>
  )
}

export default PreviousDonations

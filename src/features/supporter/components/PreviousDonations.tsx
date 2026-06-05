import { View } from 'react-native'
import * as Sentry from '@sentry/react-native'
import Purchases, {
  CustomerInfo,
  PurchasesStoreProduct,
} from 'react-native-purchases'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import XView from '@/components/ui/layout/XView'
import moment from 'moment'
import React, { useEffect, useMemo, useState } from 'react'
import Card from '@/components/ui/Card'
import useTheme from '@/contexts/theme'
import Badge from '@/components/ui/Badge'
import IconButton from '@/components/ui/IconButton'
import { faRefresh } from '@fortawesome/free-solid-svg-icons'
import { LIFETIME_SUPPORTER_ENTITLEMENT } from '@/lib/supporterSince'

/**
 * Billing cadence we display, derived from a store product's ISO-8601
 * `subscriptionPeriod`. The App Store reports `P1M` for monthly and `P1Y` for
 * annual; the paywall only sells those two, so anything else falls back to a
 * neutral label rather than guessing.
 */
type SubscriptionPeriodKind = 'monthly' | 'annual' | 'other'

const periodKindFromProduct = (
  subscriptionPeriod: string | null | undefined
): SubscriptionPeriodKind => {
  switch (subscriptionPeriod) {
    case 'P1M':
      return 'monthly'
    case 'P1Y':
      return 'annual'
    default:
      return 'other'
  }
}

interface PreviousDonationsProps {
  customer: CustomerInfo
  revalidate: () => Promise<void>
}

const PreviousDonations = ({
  customer,
  revalidate,
}: PreviousDonationsProps) => {
  const theme = useTheme()
  const [products, setProducts] = useState<PurchasesStoreProduct[]>([])

  useEffect(() => {
    const getProducts = async () => {
      // Union purchase history with the live subscription map so we can always
      // resolve price + billing period for the active-subscription cards —
      // including users whose entitlement was granted manually in the RC
      // dashboard. Their real store subscription still lands in these maps with
      // its real product identifier, even though the granted entitlement points
      // at a synthetic promotional product that `getProducts` can't resolve.
      const ids = Array.from(
        new Set([
          ...Object.keys(customer.allPurchaseDates),
          ...Object.keys(customer.subscriptionsByProductIdentifier ?? {}),
        ])
      )

      const products = await Purchases.getProducts(ids)
      setProducts(products)
    }

    getProducts().catch((error) => Sentry.captureException(error))
  }, [customer.allPurchaseDates, customer.subscriptionsByProductIdentifier])

  const nonSubscriptions = useMemo(() => {
    return customer.nonSubscriptionTransactions
      .map((transaction) => {
        const matchingProduct = products.find(
          (p) => p.identifier === transaction.productIdentifier
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
        const product = products.find(
          (p) => p.identifier === sub.productIdentifier
        )
        return {
          sub,
          product,
          kind: periodKindFromProduct(product?.subscriptionPeriod),
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
        <IconButton
          icon={faRefresh}
          onPress={revalidate}
          color={theme.colors.textAlt}
        />
      </XView>
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
          <XView style={{ gap: 10 }}>
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
              date: moment(
                lifetimeSupporterEntitlement.originalPurchaseDate
              ).format('LL'),
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
              <XView style={{ gap: 10 }}>
                {!!product?.priceString && (
                  <Text style={{ fontFamily: theme.fonts.bold }}>
                    {product.priceString}
                    {periodSuffix ? ` ${periodSuffix}` : ''}
                  </Text>
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
              {sub.isActive && (
                <Text
                  style={{
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t('goToAppStoreToUpdateSubscriptions')}
                </Text>
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
              <XView key={transaction.transactionIdentifier}>
                <Text style={{ fontFamily: theme.fonts.bold }}>
                  {transaction.name}
                </Text>
                <Text>{moment(transaction.purchaseDate).format('LL')}</Text>
              </XView>
            )
          })}
        </Card>
      )}
    </View>
  )
}

export default PreviousDonations

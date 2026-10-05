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
import { LIFETIME_SUPPORTER_ENTITLEMENT } from '@/lib/supporterSince'
import {
  billingKind,
  matchStoreProduct,
} from '@/features/supporter/lib/supporterPause'
import { useSubscriptionStatus } from '@/features/supporter/hooks/useManageSubscription'
import ManageSubscriptionSheet from '@/features/supporter/components/ManageSubscriptionSheet'

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
  const [manageOpen, setManageOpen] = useState(false)
  const status = useSubscriptionStatus()
  const manageableProduct =
    status.state.kind === 'none' ? null : status.state.sub.productIdentifier

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

    getProducts().catch((error) => errorTracking.captureException(error))
  }, [customer.allPurchaseDates, customer.subscriptionsByProductIdentifier])

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
        <IconButton
          icon={RefreshCwIcon}
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
                <Text style={{ fontFamily: theme.fonts.bold }}>
                  {transaction.name}
                </Text>
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

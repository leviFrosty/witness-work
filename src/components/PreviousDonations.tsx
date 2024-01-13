import { View } from 'react-native'
import * as Sentry from 'sentry-expo'
import Purchases, {
  CustomerInfo,
  PurchasesStoreProduct,
} from 'react-native-purchases'
import Text from './MyText'
import i18n from '../lib/locales'
import XView from './layout/XView'
import moment from 'moment'
import React, { useEffect, useMemo, useState } from 'react'
import Card from './Card'
import useTheme from '../contexts/theme'
import Badge from './Badge'
import IconButton from './IconButton'
import { faRefresh } from '@fortawesome/free-solid-svg-icons'

const MONTHLY_DONATOR_ENTITLEMENT = 'Monthly Donator'

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
      const allPurchasedProducts = Object.keys(customer.allPurchaseDates)

      const products = await Purchases.getProducts(allPurchasedProducts)
      setProducts(products)
    }

    getProducts().catch((error) => Sentry.Native.captureException(error))
  }, [customer.allPurchaseDates])

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

  const monthlyDonatorEntitlement =
    MONTHLY_DONATOR_ENTITLEMENT in customer.entitlements.all
      ? customer.entitlements.all[MONTHLY_DONATOR_ENTITLEMENT]
      : undefined

  const monthlyDonationEntitlementProduct = useMemo(() => {
    const matchingProduct = products.find(
      (p) => p.identifier === monthlyDonatorEntitlement?.productIdentifier
    )

    return matchingProduct
  }, [monthlyDonatorEntitlement?.productIdentifier, products])

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
      {monthlyDonatorEntitlement && (
        <View style={{ gap: 10 }}>
          <Card>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('lg'),
              }}
            >
              {i18n.t('monthlyDonation')}
            </Text>
            <XView style={{ gap: 10 }}>
              <Text style={{ fontFamily: theme.fonts.bold }}>
                {monthlyDonationEntitlementProduct?.priceString}{' '}
                {i18n.t('eachMonth')}
              </Text>
              <Badge
                color={
                  monthlyDonatorEntitlement.isActive
                    ? theme.colors.accentTranslucent
                    : theme.colors.backgroundLighter
                }
                size='sm'
              >
                {monthlyDonatorEntitlement.isActive
                  ? i18n.t('active')
                  : i18n.t('inactive')}
              </Badge>
            </XView>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('goToAppStoreToUpdateSubscriptions')}
            </Text>
          </Card>
        </View>
      )}
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

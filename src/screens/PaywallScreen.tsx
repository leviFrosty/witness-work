import { Alert, ScrollView, View } from 'react-native'
import * as Sentry from '@sentry/react-native'
import Text from '../components/MyText'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import XView from '../components/layout/XView'
import Button from '../components/Button'
import Wrapper from '../components/layout/Wrapper'
import { Spinner } from 'tamagui'
import Purchases, {
  PurchasesError,
  PurchasesOffering,
  PurchasesOfferings,
} from 'react-native-purchases'
import IconButton from '../components/IconButton'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ActionButton from '../components/ActionButton'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useCustomer from '../hooks/useCustomer'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'

interface OfferButtonProps {
  offering: PurchasesOffering
  setSelectedOffering: React.Dispatch<
    React.SetStateAction<PurchasesOffering | null>
  >
  selectedOffering: PurchasesOffering | null
}

const OfferButton = ({
  offering,
  setSelectedOffering,
  selectedOffering,
}: OfferButtonProps) => {
  const theme = useTheme()
  return (
    <Button
      style={{
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: theme.numbers.borderRadiusMd,
        backgroundColor: theme.colors.backgroundLightest,
      }}
      onPress={() => setSelectedOffering(offering)}
      key={offering.identifier}
    >
      <XView>
        {selectedOffering?.identifier === offering.identifier && (
          <IconButton icon={faCheck} color={theme.colors.accent} />
        )}
        <Text style={{ fontFamily: theme.fonts.bold }}>
          {offering.availablePackages[0].product.priceString}
        </Text>
      </XView>
    </Button>
  )
}

const PaywallScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [selectedOffering, setSelectedOffering] =
    useState<PurchasesOffering | null>(null)
  const [currentOfferings, setCurrentOfferings] =
    useState<PurchasesOfferings | null>(null)
  const { revalidate } = useCustomer()
  const [oneTimePurchaseMethod, setOneTimePurchaseMethod] = useState(false)
  const navigation = useNavigation<RootStackNavigation>()

  const monthlyOfferings = useMemo(() => {
    if (!currentOfferings) return []
    return Object.keys(currentOfferings.all)
      .map((key) => {
        return currentOfferings.all[key]
      })
      .filter((offering) => !!offering.monthly)
      .sort(
        (a, b) =>
          a.availablePackages[0].product.price -
          b.availablePackages[0].product.price
      )
  }, [currentOfferings])

  const oneTimeOfferings = useMemo(() => {
    if (!currentOfferings) return []
    return Object.keys(currentOfferings.all)
      .map((key) => {
        return currentOfferings.all[key]
      })
      .filter((offering) => !offering.monthly)
      .sort(
        (a, b) =>
          a.availablePackages[0].product.price -
          b.availablePackages[0].product.price
      )
  }, [currentOfferings])

  // Fetches latest offerings & gets existing customer info from RevenueCat
  useEffect(() => {
    const getOfferings = async () => {
      const offerings = await Purchases.getOfferings()
      setCurrentOfferings(offerings)

      setSelectedOffering(offerings.current)

      if (offerings.current?.monthly) {
        setOneTimePurchaseMethod(false)
      }
    }

    getOfferings().catch((error) => {
      Alert.alert(i18n.t('errorFetchingOfferings'), i18n.t('tryAgainLater'))
      Sentry.captureException(error)
    })

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePurchase = useCallback(async () => {
    if (!selectedOffering) {
      return Alert.alert(i18n.t('noOfferingSelected'))
    }

    try {
      const { productIdentifier } = await Purchases.purchasePackage(
        selectedOffering.availablePackages[0]
      )
      if (productIdentifier) {
        revalidate()
        navigation.replace('Thank You')
      }
    } catch (error: unknown) {
      if (!(error as PurchasesError).userCancelled) {
        Alert.alert(i18n.t('error'), i18n.t('errorCheckingOut'))
      } else {
        Sentry.captureException(error)
      }
    }
  }, [navigation, revalidate, selectedOffering])

  const selectNearestOfferingFromOtherPaymentMethod = useCallback(
    (oneTime: boolean) => {
      const currentPrice = selectedOffering?.availablePackages[0].product.price
      if (!currentPrice) {
        return // Should never be undefined because a default selection is made at mount.
      }
      let closestOffering = { index: 0, difference: 100 }

      if (oneTime) {
        oneTimeOfferings.forEach((offering, index) => {
          const difference = Math.abs(
            offering.availablePackages[0].product.price - currentPrice
          )
          if (difference < closestOffering.difference) {
            closestOffering = { index, difference }
          }
        })

        setSelectedOffering(oneTimeOfferings[closestOffering.index])
        return
      }

      monthlyOfferings.forEach((offering, index) => {
        const difference = Math.abs(
          offering.availablePackages[0].product.price - currentPrice
        )
        if (difference < closestOffering.difference) {
          closestOffering = { index, difference }
        }
      })

      setSelectedOffering(monthlyOfferings[closestOffering.index])
      return
    },
    [monthlyOfferings, oneTimeOfferings, selectedOffering?.availablePackages]
  )

  const handleSetPurchaseMethod = useCallback(
    (oneTime: boolean) => {
      setOneTimePurchaseMethod(oneTime)
      selectNearestOfferingFromOtherPaymentMethod(oneTime)
    },
    [selectNearestOfferingFromOtherPaymentMethod]
  )

  if (!currentOfferings) {
    return (
      <Wrapper>
        <Spinner />
      </Wrapper>
    )
  }

  return (
    <Wrapper
      style={{
        paddingBottom: insets.bottom + 20,
        paddingTop: 40,
        paddingHorizontal: 15,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ gap: 10 }}>
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.accent,
            borderRadius: theme.numbers.borderRadiusLg,
            padding: 20,
            backgroundColor: theme.colors.card,
            gap: 20,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('support')} WitnessWork
          </Text>
          <View style={{ gap: 15 }}>
            <XView
              style={{
                backgroundColor: theme.colors.backgroundLighter,
                borderRadius: theme.numbers.borderRadiusXl,
                padding: 10,
              }}
            >
              <Button
                style={{
                  backgroundColor: oneTimePurchaseMethod
                    ? theme.colors.accentTranslucent
                    : undefined,
                  borderColor: oneTimePurchaseMethod
                    ? theme.colors.accent
                    : undefined,
                  borderWidth: oneTimePurchaseMethod ? 1 : 0,
                  paddingHorizontal: 30,
                  paddingVertical: 10,
                  borderRadius: theme.numbers.borderRadiusXl,
                  flex: 1,
                }}
                onPress={() => handleSetPurchaseMethod(true)}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    color: oneTimePurchaseMethod
                      ? theme.colors.accent
                      : theme.colors.text,
                  }}
                >
                  {i18n.t('oneTime')}
                </Text>
              </Button>
              <Button
                style={{
                  backgroundColor: !oneTimePurchaseMethod
                    ? theme.colors.accentTranslucent
                    : undefined,
                  borderColor: !oneTimePurchaseMethod
                    ? theme.colors.accent
                    : undefined,
                  borderWidth: !oneTimePurchaseMethod ? 1 : 0,
                  paddingHorizontal: 30,
                  paddingVertical: 10,
                  borderRadius: theme.numbers.borderRadiusXl,
                  flex: 1,
                }}
                onPress={() => handleSetPurchaseMethod(false)}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    color: !oneTimePurchaseMethod
                      ? theme.colors.accent
                      : theme.colors.text,
                  }}
                >
                  {i18n.t('monthly')}
                </Text>
              </Button>
            </XView>

            <View style={{ height: 185 }}>
              <ScrollView contentContainerStyle={{ gap: 5 }}>
                {oneTimePurchaseMethod
                  ? oneTimeOfferings.map((offering) => {
                      return (
                        <OfferButton
                          key={offering.identifier}
                          offering={offering}
                          selectedOffering={selectedOffering}
                          setSelectedOffering={setSelectedOffering}
                        />
                      )
                    })
                  : monthlyOfferings.map((offering) => {
                      return (
                        <OfferButton
                          key={offering.identifier}
                          offering={offering}
                          selectedOffering={selectedOffering}
                          setSelectedOffering={setSelectedOffering}
                        />
                      )
                    })}
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
      <View style={{ paddingHorizontal: 15 }}>
        <ActionButton disabled={!selectedOffering} onPress={handlePurchase}>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
            }}
          >
            {`${i18n.t('donate')} ${
              selectedOffering?.availablePackages[0].product.priceString
            } ${!selectedOffering?.monthly ? '' : i18n.t('eachMonth')}`}
          </Text>
        </ActionButton>
      </View>
    </Wrapper>
  )
}

export default PaywallScreen

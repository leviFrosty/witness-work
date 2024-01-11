import { createDrawerNavigator } from '@react-navigation/drawer'
import Header from '../components/layout/Header'
import SettingsScreen from './settings/SettingsScreen'
import { DashboardScreen } from './DashboardScreen'
import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases'
import { useEffect, useState } from 'react'
import useDevice from '../hooks/useDevice'
import IconButton from '../components/IconButton'
import { faHeart as faHeartRegular } from '@fortawesome/free-regular-svg-icons'
import { View } from 'react-native'
import useTheme from '../contexts/theme'
import { faHeart } from '@fortawesome/free-solid-svg-icons'

const HomeScreen = () => {
  const Drawer = createDrawerNavigator()
  const { isAndroid } = useDevice()
  const [customer, setCustomer] = useState<CustomerInfo>()
  const theme = useTheme()
  const hasPurchasedBefore =
    (customer?.allPurchaseDates
      ? Object.keys(customer.allPurchaseDates).length
      : 0) > 0

  useEffect(() => {
    const setup = async () => {
      if (isAndroid) {
        return
        // For now, android does not support donations.
      } else {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG)
        await Purchases.configure({
          apiKey: process.env.REVENUECAT_APPLE_API_KEY || '',
        })
      }

      const customerInfo = await Purchases.getCustomerInfo()
      setCustomer(customerInfo)
    }

    setup().catch(console.log)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Drawer.Navigator
      screenOptions={{
        header: ({ navigation }) => (
          <Header
            onPressLeftIcon={() => navigation.toggleDrawer()}
            rightElement={
              <View style={{ position: 'absolute', right: 0 }}>
                <IconButton
                  onPress={() => navigation.navigate('Donate')}
                  icon={hasPurchasedBefore ? faHeart : faHeartRegular}
                  color={
                    hasPurchasedBefore
                      ? theme.colors.errorAlt
                      : theme.colors.text
                  }
                />
              </View>
            }
          />
        ),
      }}
      drawerContent={SettingsScreen}
      initialRouteName='Dashboard'
    >
      <Drawer.Screen name='Dashboard' component={DashboardScreen} />
    </Drawer.Navigator>
  )
}
export default HomeScreen

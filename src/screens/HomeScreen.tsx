import { createDrawerNavigator } from '@react-navigation/drawer'
import Header from '../components/layout/Header'
import SettingsScreen from './settings/SettingsScreen'
import { DashboardScreen } from './DashboardScreen'
import IconButton from '../components/IconButton'
import { faHeart as faHeartRegular } from '@fortawesome/free-regular-svg-icons'
import { View } from 'react-native'
import useTheme from '../contexts/theme'
import { faHeart } from '@fortawesome/free-solid-svg-icons'
import useCustomer from '../hooks/useCustomer'
import { usePreferences } from '../stores/preferences'

const HomeScreen = () => {
  const Drawer = createDrawerNavigator()
  const { hasPurchasedBefore } = useCustomer()
  const { hideDonateHeart } = usePreferences()
  const theme = useTheme()

  return (
    <Drawer.Navigator
      screenOptions={{
        header: ({ navigation }) => (
          <Header
            onPressLeftIcon={() => navigation.toggleDrawer()}
            rightElement={
              !hideDonateHeart && (
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
              )
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

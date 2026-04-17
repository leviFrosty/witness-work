import { createDrawerNavigator } from '@react-navigation/drawer'
import Header from '../components/layout/Header'
import SettingsScreen from './settings/SettingsScreen'
import { HomeScreen } from './HomeScreen'
import IconButton from '../components/IconButton'
import { faHeart as faHeartRegular } from '@fortawesome/free-regular-svg-icons'
import { Platform, View } from 'react-native'
import useTheme from '../contexts/theme'
import { faHeart } from '@fortawesome/free-solid-svg-icons'
import useCustomer from '../hooks/useCustomer'
import useIsSupporter from '../hooks/useIsSupporter'
import { usePreferences } from '../stores/preferences'
import SyncPopover from '../components/sync/SyncPopover'

const DrawerNavigator = () => {
  const Drawer = createDrawerNavigator()
  const { hasPurchasedBefore } = useCustomer()
  const { isSupporter } = useIsSupporter()
  const { hideDonateHeart } = usePreferences()
  const theme = useTheme()

  const showSyncPopover = isSupporter && Platform.OS === 'ios'

  return (
    <Drawer.Navigator
      screenOptions={{
        header: ({ navigation }) => (
          <Header
            onPressLeftIcon={() => navigation.toggleDrawer()}
            rightElement={
              showSyncPopover ? (
                <View style={{ position: 'absolute', right: 0 }}>
                  <SyncPopover />
                </View>
              ) : (
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
              )
            }
          />
        ),
      }}
      drawerContent={SettingsScreen}
      initialRouteName='Dashboard'
    >
      <Drawer.Screen name='Dashboard' component={HomeScreen} />
    </Drawer.Navigator>
  )
}
export default DrawerNavigator

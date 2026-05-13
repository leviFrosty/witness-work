import { createDrawerNavigator } from '@react-navigation/drawer'
import Header from '../../components/layout/Header'
import SettingsScreen from '../../screens/settings/SettingsScreen'
import { HomeScreen } from '../../screens/HomeScreen'
import IconButton from '../../components/IconButton'
import { faHeart as faHeartRegular } from '@fortawesome/free-regular-svg-icons'
import { Platform, View } from 'react-native'
import useTheme from '../../contexts/theme'
import { faHeart } from '@fortawesome/free-solid-svg-icons'
import useCustomer from '../../hooks/useCustomer'
import useIsSupporter from '../../hooks/useIsSupporter'
import { usePreferences } from '../../stores/preferences'
import SyncPopover from '../sync/components/SyncPopover'
import MilestoneRevealRecoveryIcon from '../../components/MilestoneRevealRecoveryIcon'

const DrawerNavigator = () => {
  const Drawer = createDrawerNavigator()
  const { hasPurchasedBefore } = useCustomer()
  const { isSupporter } = useIsSupporter()
  const { hideDonateHeart, set } = usePreferences()
  const theme = useTheme()

  const showSyncPopover = isSupporter && Platform.OS === 'ios'

  // Dev-only reset for the milestone-reveal flow. Long-press the date in the
  // header to clear both flags so the grand reveal fires fresh on next mount.
  // Wired in __DEV__ only; the prop is undefined in production so production
  // callers see no behaviour change on long-press.
  const onLongPressTitle = __DEV__
    ? () => {
        set({
          seenMilestoneUpdateReveal: false,
          dismissedMilestoneRevealOnce: false,
          lastAppVersion: '1.36.0',
          homeChecklistAllDoneCelebrated: false,
        })
      }
    : undefined

  return (
    <Drawer.Navigator
      screenOptions={{
        header: ({ navigation }) => (
          <Header
            onPressLeftIcon={() => navigation.toggleDrawer()}
            onLongPressTitle={onLongPressTitle}
            rightElement={
              <View
                style={{
                  position: 'absolute',
                  right: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <MilestoneRevealRecoveryIcon />
                {showSyncPopover ? (
                  <SyncPopover />
                ) : (
                  !hideDonateHeart && (
                    <IconButton
                      onPress={() => navigation.navigate('Paywall')}
                      icon={hasPurchasedBefore ? faHeart : faHeartRegular}
                      color={
                        hasPurchasedBefore
                          ? theme.colors.errorAlt
                          : theme.colors.text
                      }
                    />
                  )
                )}
              </View>
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

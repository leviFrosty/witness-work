import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import TabBar from '../components/TabBar'
import Map from '../screens/MapScreen'
import DrawerNavigator from '../screens/DrawerNavigator'
import { usePreferences } from '../stores/preferences'
import Constants from 'expo-constants'
import { View } from 'react-native'
import WhatsNewSheet from '../components/WhatsNewSheet'
import { useEffect, useState } from 'react'
import ToolsScreen from '../screens/ToolsScreen'
import MonthScreen from '../screens/MonthScreen/MonthScreen'
import YearScreen from '../screens/YearScreen'
import usePublisher from '../hooks/usePublisher'
import { HomeTabStackParamList } from '../types/homeStack'

const HomeTabStack = () => {
  const Tab = createBottomTabNavigator<HomeTabStackParamList>()
  const { lastAppVersion, developerTools, set, publisher } = usePreferences()
  const { hasAnnualGoal } = usePublisher()
  const [lastVersion] = useState(lastAppVersion)
  const [showWhatsNew, setShowWhatsNew] = useState(false)

  useEffect(() => {
    const currentVersion = Constants.expoConfig?.version
    if (currentVersion !== lastAppVersion) {
      setShowWhatsNew(true)
      set({ lastAppVersion: currentVersion })
    }
  }, [lastAppVersion, set])

  return (
    <View style={{ flexGrow: 1 }}>
      {lastVersion && (
        <WhatsNewSheet
          lastVersion={lastVersion}
          show={showWhatsNew}
          setShow={setShowWhatsNew}
        />
      )}
      <Tab.Navigator
        initialRouteName='Home'
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ header: () => null }}
      >
        <Tab.Screen name='Home' component={DrawerNavigator} />
        {developerTools && <Tab.Screen name='Tools' component={ToolsScreen} />}
        {publisher !== 'publisher' && (
          <Tab.Screen name='Month' component={MonthScreen} />
        )}
        {hasAnnualGoal && <Tab.Screen name='Year' component={YearScreen} />}
        <Tab.Screen name='Map' component={Map} />
      </Tab.Navigator>
    </View>
  )
}

export default HomeTabStack

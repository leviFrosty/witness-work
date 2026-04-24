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
import ProgressScreen from '../screens/ProgressScreen'
import ScheduleScreen from '../screens/ScheduleScreen'
import { HomeTabStackParamList } from '../types/homeStack'
import { releaseNotes } from '../constants/releaseNotes'
import semver from 'semver'
import { logger } from '../lib/logger'

const HomeTabStack = () => {
  const Tab = createBottomTabNavigator<HomeTabStackParamList>()
  const { lastAppVersion, developerTools, set, publisher } = usePreferences()
  const [lastVersion] = useState(lastAppVersion)
  const [showWhatsNew, setShowWhatsNew] = useState(false)

  useEffect(() => {
    const currentVersion = Constants.expoConfig?.version
    if (!currentVersion || !lastAppVersion) return
    logger.log('[HomeTabStack] currentVersion', currentVersion)
    logger.log('[HomeTabStack] lastVersion', lastAppVersion)
    const notesBetweenVersions = releaseNotes.filter(
      (note) =>
        semver.gt(note.version, lastAppVersion) &&
        semver.lte(note.version, currentVersion)
    )
    logger.log('[HomeTabStack] notesBetweenVersions', notesBetweenVersions)
    const isNewVersionMessages = notesBetweenVersions.length > 0

    if (currentVersion !== lastAppVersion && isNewVersionMessages) {
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
          <Tab.Screen name='Progress' component={ProgressScreen} />
        )}
        <Tab.Screen name='Schedule' component={ScheduleScreen} />
        <Tab.Screen name='Map' component={Map} />
      </Tab.Navigator>
    </View>
  )
}

export default HomeTabStack

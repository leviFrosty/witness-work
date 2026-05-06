import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import TabBar from '../components/TabBar'
import Map from '../screens/MapScreen'
import DrawerNavigator from '../screens/DrawerNavigator'
import { usePreferences } from '../stores/preferences'
import usePublisher from '../hooks/usePublisher'
import Constants from 'expo-constants'
import { View } from 'react-native'
import WhatsNewSheet from '../components/WhatsNewSheet'
import { useEffect, useRef, useState } from 'react'
import ToolsScreen from '../screens/ToolsScreen'
import ProgressScreen from '../screens/ProgressScreen'
import ScheduleScreen from '../screens/ScheduleScreen'
import ContactsScreen from '../screens/ContactsScreen'
import { HomeTabStackParamList } from '../types/homeStack'
import { releaseNotes } from '../constants/releaseNotes'
import semver from 'semver'
import { logger } from '../lib/logger'
import { useNavigation } from '@react-navigation/native'
import { useRollover } from '../hooks/useRollover'
import { RootStackNavigation } from '../types/rootStack'

const HomeTabStack = () => {
  const Tab = createBottomTabNavigator<HomeTabStackParamList>()
  const { lastAppVersion, developerTools, set } = usePreferences()
  const { showsYearTabs } = usePublisher()
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

  const navigation = useNavigation<RootStackNavigation>()
  const rollover = useRollover()
  const { autoRolloverEnabled } = usePreferences()
  // Once-per-mount guard. Without this, swapping the auto-toggle inside the
  // rollover screen would re-trigger this effect (autoRolloverEnabled changes)
  // and potentially navigate or apply twice.
  const rolloverHandledRef = useRef(false)
  useEffect(() => {
    if (rolloverHandledRef.current) return
    if (rollover.pending.length === 0) return
    rolloverHandledRef.current = true
    if (autoRolloverEnabled) {
      rollover.apply()
    } else {
      navigation.navigate('Rollover')
    }
  }, [autoRolloverEnabled, navigation, rollover])

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
        <Tab.Screen name='Contacts' component={ContactsScreen} />
        {developerTools && <Tab.Screen name='Tools' component={ToolsScreen} />}
        {showsYearTabs && (
          <Tab.Screen name='Progress' component={ProgressScreen} />
        )}
        <Tab.Screen name='Schedule' component={ScheduleScreen} />
        <Tab.Screen name='Map' component={Map} />
      </Tab.Navigator>
    </View>
  )
}

export default HomeTabStack

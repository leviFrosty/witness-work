import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import NavigationTabBar from '@/app/navigation/NavigationTabBar'
import HomeNavigator from '@/app/navigation/HomeNavigator'
import { usePreferences } from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import Constants from 'expo-constants'
import { View } from 'react-native'
import ProfileDetailOverlay from '@/features/profile/components/ProfileDetailOverlay'
import TakeoverEnvironment from '@/app/takeover/TakeoverEnvironment'
import TakeoverHosts from '@/app/takeover/TakeoverHosts'
import { useEffect, useRef, useState } from 'react'
import ToolsScreen from '@/app/navigation/ToolsScreen'
import ProgressScreen from '@/features/progress/screens/ProgressScreen'
import ScheduleScreen from '@/features/plans/screens/ScheduleScreen'
import ContactsTabScreen from '@/app/contacts/ContactsTabScreen'
import { HomeTabStackParamList } from '@/types/homeStack'
import { releaseNotes } from '@/features/updates/constants/releaseNotes'
import { logger } from '@/lib/logger'
import { useRollover } from '@/features/service-reports/hooks/useRollover'
import useICloudPullSettled from '@/hooks/useICloudPullSettled'
import { UPDATE_REVEAL_VERSION } from '@/features/updates/constants/updateReveal'
import { isLaunchRevealArmed } from '@/features/updates/lib/devLaunchReveal'
import {
  RevealAction,
  evaluateRevealOnLaunch,
  getReleaseAnnounceBetween,
} from '@/features/updates/lib/evaluateRevealOnLaunch'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import SettingsSplitScreen from '@/app/navigation/SettingsSplitScreen'
import {
  getEffectiveTabOrder,
  type TabOrderKey,
} from '@/lib/tabOrderPreferences'

type LaunchDecision = {
  action: RevealAction
  currentVersion?: string
  /** The version the user last saw release notes for. */
  notesSince?: string
}

/**
 * What this launch announces: the update reveal (returning installs crossing
 * `UPDATE_REVEAL_VERSION`), the WhatsNewSheet (releases announced as 'sheet'),
 * the passive tray item (every other transition with notes), or nothing.
 */
const decideLaunch = (): LaunchDecision => {
  const currentVersion = Constants.expoConfig?.version
  const { lastAppVersion, updateReveal, unreadReleaseNotes } =
    usePreferences.getState()
  if (!currentVersion || !lastAppVersion) return { action: 'none' }
  // Armed from Developer Tools; holds until that reveal has been closed.
  if (isLaunchRevealArmed() && !updateReveal) {
    return { action: 'update-reveal', currentVersion }
  }
  logger.log('[HomeTabStack] currentVersion', currentVersion)
  logger.log('[HomeTabStack] lastVersion', lastAppVersion)
  const action = evaluateRevealOnLaunch({
    currentVersion,
    lastAppVersion,
    revealVersion: UPDATE_REVEAL_VERSION,
    revealEngaged: updateReveal?.version === UPDATE_REVEAL_VERSION,
    releaseAnnounce: getReleaseAnnounceBetween(
      releaseNotes,
      lastAppVersion,
      currentVersion
    ),
  })
  logger.log('[HomeTabStack] launch reveal action', action)
  // Earlier unread updates stack onto this one.
  return {
    action,
    currentVersion,
    notesSince: unreadReleaseNotes?.since ?? lastAppVersion,
  }
}

const Tab = createBottomTabNavigator<HomeTabStackParamList>()

// Called inline, not rendered as a component: the navigator only reads
// `Tab.Screen` elements among its direct children.
const renderTabScreen = (name: TabOrderKey) => {
  switch (name) {
    case 'Home':
      return <Tab.Screen key={name} name={name} component={HomeNavigator} />
    case 'Schedule':
      return <Tab.Screen key={name} name={name} component={ScheduleScreen} />
    case 'Contacts':
      return <Tab.Screen key={name} name={name} component={ContactsTabScreen} />
    case 'Progress':
      return <Tab.Screen key={name} name={name} component={ProgressScreen} />
  }
}

const HomeTabStack = () => {
  const { hasSidebar } = useAdaptiveLayout()
  const { developerTools, tabOrder: storedTabOrder, set } = usePreferences()
  const { showsYearTabs } = usePublisher()
  const tabOrder = getEffectiveTabOrder(storedTabOrder).filter(
    (name) => name !== 'Progress' || showsYearTabs
  )
  // Decided during the first render rather than in an effect: the update
  // reveal has to be on screen in the very first frame to pick up from the
  // splash.
  const [launch] = useState(decideLaunch)

  // Record the launch's version transition once.
  useEffect(() => {
    const { action, currentVersion, notesSince } = launch
    if (action === 'none' || !currentVersion) return
    switch (action) {
      case 'update-reveal':
      case 'stamp-only':
        set({ lastAppVersion: currentVersion })
        return
      case 'whats-new':
        set({ lastAppVersion: currentVersion, unreadReleaseNotes: null })
        return
      case 'whats-new-card':
        set({
          lastAppVersion: currentVersion,
          unreadReleaseNotes: {
            since: notesSince ?? currentVersion,
            at: Date.now(),
            cardDismissed: false,
          },
        })
        return
    }
  }, [launch, set])

  const rollover = useRollover()
  const { autoRolloverEnabled } = usePreferences()
  // With iCloud sync on, another device may already have rolled this month
  // over or dismissed it. Its pair and synced marker only arrive with a pull,
  // so auto mode waits for one (or a timeout), then decides on fresh data.
  const iCloudSettled = useICloudPullSettled()
  // Auto mode applies a pending rollover silently at launch. Otherwise the
  // decision waits in the notifications tray and comes up on Progress or before
  // that month's report (`useRolloverPrompt`) instead of interrupting launch.
  // Once-per-mount guard so toggling auto mode can't apply twice.
  const rolloverHandledRef = useRef(false)
  useEffect(() => {
    if (rolloverHandledRef.current || !iCloudSettled) return
    if (rollover.pending.length === 0 || !autoRolloverEnabled) return
    rolloverHandledRef.current = true
    rollover.apply()
  }, [autoRolloverEnabled, iCloudSettled, rollover])

  return (
    <View style={{ flexGrow: 1 }}>
      <TakeoverEnvironment />
      <Tab.Navigator
        initialRouteName='Home'
        tabBar={(props) => <NavigationTabBar {...props} />}
        screenOptions={{
          header: () => null,
          tabBarPosition: hasSidebar ? 'left' : 'bottom',
        }}
      >
        {/* At most four destinations, in the user's order (Preferences →
            Tab Order). Features join an existing destination (Map in
            Contacts, Buddies in Schedule) rather than adding tabs. */}
        {tabOrder.map(renderTabScreen)}
        {developerTools && <Tab.Screen name='Tools' component={ToolsScreen} />}
        {hasSidebar && (
          <Tab.Screen name='Settings' component={SettingsSplitScreen} />
        )}
      </Tab.Navigator>
      {/* One instance for every root header's account menu. */}
      <ProfileDetailOverlay />
      {/* One takeover at a time, through the takeover arbiter (ADR 0021). */}
      <TakeoverHosts
        launchReveal={launch.action === 'update-reveal'}
        whatsNewSince={
          launch.action === 'whats-new' ? launch.notesSince : undefined
        }
      />
    </View>
  )
}

export default HomeTabStack

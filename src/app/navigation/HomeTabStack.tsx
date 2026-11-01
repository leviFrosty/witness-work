import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import NavigationTabBar from '@/app/navigation/NavigationTabBar'
import HomeNavigator from '@/app/navigation/HomeNavigator'
import { usePreferences } from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import Constants from 'expo-constants'
import { View } from 'react-native'
import ProfileDetailOverlay from '@/features/profile/components/ProfileDetailOverlay'
import BuddiesEntryRow from '@/features/buddies/components/BuddiesEntryRow'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { analytics } from '@/lib/analytics'
import TakeoverEnvironment from '@/app/takeover/TakeoverEnvironment'
import TakeoverHosts from '@/app/takeover/TakeoverHosts'
import { useTakeover } from '@/stores/takeover'
import { useEffect, useRef, useState } from 'react'
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
import HorizontalSafeArea from '@/components/ui/layout/HorizontalSafeArea'
import { isRtlLayout } from '@/lib/direction'
import {
  getEffectiveTabOrder,
  type TabOrderKey,
} from '@/lib/tabOrderPreferences'

type LaunchDecision = {
  action: RevealAction
  currentVersion?: string

  notesSince?: string
}

const decideLaunch = (): LaunchDecision => {
  const currentVersion = Constants.expoConfig?.version
  const { lastAppVersion, updateReveal, unreadReleaseNotes } =
    usePreferences.getState()
  if (!currentVersion || !lastAppVersion) return { action: 'none' }

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

  return {
    action,
    currentVersion,
    notesSince: unreadReleaseNotes?.since ?? lastAppVersion,
  }
}

const Tab = createBottomTabNavigator<HomeTabStackParamList>()

const renderTabScreen = (name: TabOrderKey) => {
  switch (name) {
    case 'Home':
      return <Tab.Screen key={name} name={name} component={HomeNavigator} />
    case 'Schedule':
      return (
        <Tab.Screen
          key={name}
          name={name}
          getComponent={() =>
            require('@/features/plans/screens/ScheduleScreen').default
          }
        />
      )
    case 'Contacts':
      return (
        <Tab.Screen
          key={name}
          name={name}
          getComponent={() =>
            require('@/app/contacts/ContactsTabScreen').default
          }
        />
      )
    case 'Progress':
      return (
        <Tab.Screen
          key={name}
          name={name}
          getComponent={() =>
            require('@/features/progress/screens/ProgressScreen').default
          }
        />
      )
  }
}

const HomeTabStack = () => {
  const { hasSidebar, navigationRail } = useAdaptiveLayout()
  const buddiesEnabled = useBuddiesEnabled()
  const buddyRequests = useBuddies((state) => state.incomingClaims.length)
  const developerTools = usePreferences((s) => s.developerTools)
  const storedTabOrder = usePreferences((s) => s.tabOrder)
  const set = usePreferences((s) => s.set)

  const revealShown = useTakeover(
    (s) => s.arbiter.active?.kind === 'update-reveal'
  )
  const { showsYearTabs } = usePublisher()
  const tabOrder = getEffectiveTabOrder(storedTabOrder).filter(
    (name) => name !== 'Progress' || showsYearTabs
  )

  const [launch] = useState(decideLaunch)

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
  const autoRolloverEnabled = usePreferences((s) => s.autoRolloverEnabled)

  const iCloudSettled = useICloudPullSettled()

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
          tabBarPosition: hasSidebar
            ? 'left'
            : navigationRail
              ? isRtlLayout() === (navigationRail === 'left')
                ? 'right'
                : 'left'
              : 'bottom',
        }}
        layout={({ children }) => (
          <View
            style={{ flex: 1 }}
            accessibilityElementsHidden={revealShown}
            importantForAccessibility={
              revealShown ? 'no-hide-descendants' : 'auto'
            }
          >
            {children}
          </View>
        )}
        screenLayout={({ children }) => (
          <HorizontalSafeArea covered={navigationRail}>
            {children}
          </HorizontalSafeArea>
        )}
      >
        {}
        {tabOrder.map(renderTabScreen)}
        {hasSidebar && buddiesEnabled && (
          <Tab.Screen
            name='Buddies'
            options={{
              tabBarBadge: buddyRequests > 0 ? buddyRequests : undefined,
            }}
            listeners={{
              tabPress: () =>
                analytics.capture('buddies_opened', {
                  source: 'sidebar',
                  has_requests: buddyRequests > 0,
                }),
            }}
            getComponent={() =>
              require('@/app/buddies/BuddiesTabScreen').default
            }
          />
        )}
        {developerTools && (
          <Tab.Screen
            name='Tools'
            getComponent={() => require('@/app/navigation/ToolsScreen').default}
          />
        )}
        {hasSidebar && (
          <Tab.Screen
            name='Settings'
            getComponent={() =>
              require('@/app/navigation/SettingsSplitScreen').default
            }
          />
        )}
      </Tab.Navigator>
      {}
      <ProfileDetailOverlay
        renderBuddies={(onBeforeNavigate) => (
          <BuddiesEntryRow
            source='profile'
            onBeforeNavigate={onBeforeNavigate}
            stacked
          />
        )}
      />
      {}
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

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import NavigationTabBar from '@/app/navigation/NavigationTabBar'
import HomeNavigator from '@/app/navigation/HomeNavigator'
import { usePreferences } from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import Constants from 'expo-constants'
import { View } from 'react-native'
import WhatsNewSheet from '@/features/updates/components/WhatsNewSheet'
import MilestoneRevealOverlay from '@/features/milestones/components/MilestoneRevealOverlay'
import ProfileDetailOverlay from '@/features/profile/components/ProfileDetailOverlay'
import { useEffect, useRef, useState } from 'react'
import ToolsScreen from '@/app/navigation/ToolsScreen'
import ProgressScreen from '@/features/progress/screens/ProgressScreen'
import ScheduleScreen from '@/features/plans/screens/ScheduleScreen'
import ContactsTabScreen from '@/app/contacts/ContactsTabScreen'
import { HomeTabStackParamList } from '@/types/homeStack'
import { releaseNotes } from '@/features/updates/constants/releaseNotes'
import { logger } from '@/lib/logger'
import { useNavigation } from '@react-navigation/native'
import { useRollover } from '@/features/service-reports/hooks/useRollover'
import useICloudPullSettled from '@/hooks/useICloudPullSettled'
import { RootStackNavigation } from '@/types/rootStack'
import { useMilestoneRevealStore } from '@/features/milestones/stores/milestoneReveal'
import {
  evaluateRevealOnLaunch,
  getReleaseAnnounceBetween,
} from '@/features/updates/lib/evaluateRevealOnLaunch'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import SettingsSplitScreen from '@/app/navigation/SettingsSplitScreen'
import {
  getEffectiveTabOrder,
  type TabOrderKey,
} from '@/lib/tabOrderPreferences'

/**
 * Version that, on a returning install with `lastAppVersion` strictly less,
 * triggers The Milestone Update grand-reveal flow instead of the standard
 * `WhatsNewSheet`. Bump this if a future release wants its own dedicated reveal
 * — and reset the matching preference flags in the same migration.
 */
const MILESTONE_UPDATE_VERSION = '1.38.2'
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
  const {
    lastAppVersion,
    developerTools,
    seenMilestoneUpdateReveal,
    dismissedMilestoneRevealOnce,
    tabOrder: storedTabOrder,
    set,
  } = usePreferences()
  const { showsYearTabs } = usePublisher()
  const tabOrder = getEffectiveTabOrder(storedTabOrder).filter(
    (name) => name !== 'Progress' || showsYearTabs
  )
  const [whatsNewSince, setWhatsNewSince] = useState<string | null>(null)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const showMilestoneReveal = useMilestoneRevealStore((s) => s.show)
  const requestReveal = useMilestoneRevealStore((s) => s.request)
  const dismissReveal = useMilestoneRevealStore((s) => s.dismiss)

  const rootNavigation = useNavigation<RootStackNavigation>()

  // Decide between the grand-reveal overlay (one-time, returning users coming
  // up to MILESTONE_UPDATE_VERSION), the WhatsNewSheet (releases announced as
  // 'sheet') and the passive tray item (every other transition with notes).
  useEffect(() => {
    const currentVersion = Constants.expoConfig?.version
    if (!currentVersion || !lastAppVersion) return
    logger.log('[HomeTabStack] currentVersion', currentVersion)
    logger.log('[HomeTabStack] lastVersion', lastAppVersion)

    const releaseAnnounce = getReleaseAnnounceBetween(
      releaseNotes,
      lastAppVersion,
      currentVersion
    )
    // Read outside the render snapshot so stamping it below doesn't re-run
    // this effect. Earlier unread updates stack onto this one.
    const { unreadReleaseNotes } = usePreferences.getState()
    const notesSince = unreadReleaseNotes?.since ?? lastAppVersion

    const action = evaluateRevealOnLaunch({
      currentVersion,
      lastAppVersion,
      milestoneRevealVersion: MILESTONE_UPDATE_VERSION,
      seenMilestoneUpdateReveal,
      dismissedMilestoneRevealOnce,
      releaseAnnounce,
    })
    logger.log('[HomeTabStack] launch reveal action', action)

    switch (action) {
      case 'milestone-reveal':
        requestReveal()
        set({ lastAppVersion: currentVersion })
        return
      case 'whats-new':
        setWhatsNewSince(notesSince)
        setShowWhatsNew(true)
        set({ lastAppVersion: currentVersion, unreadReleaseNotes: null })
        return
      case 'whats-new-card':
        set({
          lastAppVersion: currentVersion,
          unreadReleaseNotes: {
            since: notesSince,
            at: Date.now(),
            cardDismissed: false,
          },
        })
        return
      case 'stamp-only':
        set({ lastAppVersion: currentVersion })
        return
      case 'none':
        return
    }
  }, [
    lastAppVersion,
    seenMilestoneUpdateReveal,
    dismissedMilestoneRevealOnce,
    requestReveal,
    set,
  ])

  const handleRevealDismiss = () => {
    dismissReveal()
    set({ dismissedMilestoneRevealOnce: true })
  }

  const handleRevealSeeWhatsNew = () => {
    dismissReveal()
    rootNavigation.navigate('MilestoneShowcase')
  }

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
      {whatsNewSince && (
        <WhatsNewSheet
          sinceVersion={whatsNewSince}
          show={showWhatsNew}
          setShow={setShowWhatsNew}
        />
      )}
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
      {/* Mounted last so it overlays the tab bar. The global ConfettiProvider
          renders above this tree, so confetti drifts in front of the title — a
          deliberate cinematic choice. */}
      <MilestoneRevealOverlay
        show={showMilestoneReveal}
        onDismiss={handleRevealDismiss}
        onSeeWhatsNew={handleRevealSeeWhatsNew}
      />
    </View>
  )
}

export default HomeTabStack

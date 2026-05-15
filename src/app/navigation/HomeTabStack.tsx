import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import TabBar from '@/components/ui/TabBar'
import Map from '@/features/map/screens/MapScreen'
import DrawerNavigator from '@/app/navigation/DrawerNavigator'
import { usePreferences } from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import Constants from 'expo-constants'
import { View } from 'react-native'
import WhatsNewSheet from '@/features/updates/components/WhatsNewSheet'
import MilestoneRevealOverlay from '@/features/milestones/components/MilestoneRevealOverlay'
import { useEffect, useRef, useState } from 'react'
import ToolsScreen from '@/app/navigation/ToolsScreen'
import ProgressScreen from '@/features/progress/screens/ProgressScreen'
import ScheduleScreen from '@/features/plans/screens/ScheduleScreen'
import ContactsScreen from '@/features/contacts/screens/ContactsScreen'
import { HomeTabStackParamList } from '@/types/homeStack'
import { releaseNotes } from '@/features/updates/constants/releaseNotes'
import semver from 'semver'
import { logger } from '@/lib/logger'
import { useNavigation } from '@react-navigation/native'
import { useRollover } from '@/features/service-reports/hooks/useRollover'
import { RootStackNavigation } from '@/types/rootStack'
import { useMilestoneRevealStore } from '@/features/milestones/stores/milestoneReveal'
import { evaluateRevealOnLaunch } from '@/features/updates/lib/evaluateRevealOnLaunch'

/**
 * Version that, on a returning install with `lastAppVersion` strictly less,
 * triggers The Milestone Update grand-reveal flow instead of the standard
 * `WhatsNewSheet`. Bump this if a future release wants its own dedicated reveal
 * — and reset the matching preference flags in the same migration.
 */
const MILESTONE_UPDATE_VERSION = '1.38.2'

const HomeTabStack = () => {
  const Tab = createBottomTabNavigator<HomeTabStackParamList>()
  const {
    lastAppVersion,
    developerTools,
    seenMilestoneUpdateReveal,
    dismissedMilestoneRevealOnce,
    set,
  } = usePreferences()
  const { showsYearTabs } = usePublisher()
  const [lastVersion] = useState(lastAppVersion)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const showMilestoneReveal = useMilestoneRevealStore((s) => s.show)
  const requestReveal = useMilestoneRevealStore((s) => s.request)
  const dismissReveal = useMilestoneRevealStore((s) => s.dismiss)

  const rootNavigation = useNavigation<RootStackNavigation>()

  // Decide between the grand-reveal overlay (one-time, returning users coming
  // up to MILESTONE_UPDATE_VERSION) and the standard WhatsNewSheet (every
  // other version transition with notes).
  useEffect(() => {
    const currentVersion = Constants.expoConfig?.version
    if (!currentVersion || !lastAppVersion) return
    logger.log('[HomeTabStack] currentVersion', currentVersion)
    logger.log('[HomeTabStack] lastVersion', lastAppVersion)

    const hasReleaseNotesBetween = releaseNotes.some(
      (note) =>
        semver.gt(note.version, lastAppVersion) &&
        semver.lte(note.version, currentVersion)
    )

    const action = evaluateRevealOnLaunch({
      currentVersion,
      lastAppVersion,
      milestoneRevealVersion: MILESTONE_UPDATE_VERSION,
      seenMilestoneUpdateReveal,
      dismissedMilestoneRevealOnce,
      hasReleaseNotesBetween,
    })
    logger.log('[HomeTabStack] launch reveal action', action)

    switch (action) {
      case 'milestone-reveal':
        requestReveal()
        set({ lastAppVersion: currentVersion })
        return
      case 'whats-new':
        setShowWhatsNew(true)
        set({ lastAppVersion: currentVersion })
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
      {/* Mounted unconditionally so it stamps lastAppVersion on mount. During the
          milestone reveal path show=false — the gate effect reads the pre-stamp
          value from its closure snapshot, so effect ordering doesn't matter. */}
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

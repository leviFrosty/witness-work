import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable'
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  useNavigation,
} from '@react-navigation/native'
import HomeNavigator from '@/app/navigation/HomeNavigator'
import TabScreenLayout from '@/app/navigation/TabScreenLayout'
import TabShortcuts from '@/app/navigation/TabShortcuts'
import { tabIcon, tabTitle } from '@/app/navigation/tabItems'
import QuickActionSheet from '@/components/QuickActionSheet'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import Constants from 'expo-constants'
import { Platform, View } from 'react-native'
import ProfileDetailOverlay from '@/features/profile/components/ProfileDetailOverlay'
import TakeoverEnvironment from '@/app/takeover/TakeoverEnvironment'
import TakeoverHosts from '@/app/takeover/TakeoverHosts'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  HomeTabStackNavigation,
  HomeTabStackParamList,
} from '@/types/homeStack'
import { RootStackNavigation } from '@/types/rootStack'
import i18n, { _i18n } from '@/lib/locales'
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

const Tab = createNativeBottomTabNavigator<HomeTabStackParamList>()

/** Tabs that act instead of opening a destination. */
const ACTION_TABS: readonly string[] = ['QuickAction']

// Tab titles are drawn natively, so they're set again when the language changes.
const subscribeToLanguage = (onChange: () => void) => _i18n.onChange(onChange)
const getLanguage = () => _i18n.locale

// Called inline, not rendered as a component: the navigator only reads
// `Tab.Screen` elements among its direct children.
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
  const theme = useTheme()
  const navigation = useNavigation<
    RootStackNavigation & HomeTabStackNavigation
  >()
  const { hasSidebar } = useAdaptiveLayout()
  const storedTabOrder = usePreferences((s) => s.tabOrder)
  const set = usePreferences((s) => s.set)
  const { showsYearTabs } = usePublisher()
  const tabOrder = getEffectiveTabOrder(storedTabOrder).filter(
    (name) => name !== 'Progress' || showsYearTabs
  )
  // Decided during the first render rather than in an effect: the update
  // reveal has to be on screen in the very first frame to pick up from the
  // splash.
  const [launch] = useState(decideLaunch)
  const [quickActionOpen, setQuickActionOpen] = useState(false)
  const language = useSyncExternalStore(subscribeToLanguage, getLanguage)
  const isDark = theme.colors.background === '#121212'
  // The native tab bar takes its light or dark look and its colors from here.
  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      primary: theme.colors.accent,
      background: theme.colors.background,
      card: theme.colors.card,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.error,
    },
  }

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
  const autoRolloverEnabled = usePreferences((s) => s.autoRolloverEnabled)
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
      <ThemeProvider value={navigationTheme}>
        <Tab.Navigator
          initialRouteName='Home'
          layout={({ state, navigation: tabNavigation, children }) => (
            <>
              {children}
              <TabShortcuts
                state={state}
                navigation={tabNavigation}
                actions={ACTION_TABS}
              />
            </>
          )}
          screenLayout={({ children }) => (
            <TabScreenLayout>{children}</TabScreenLayout>
          )}
          screenOptions={({ route }) => ({
            title: tabTitle(route.name, language),
            tabBarIcon: tabIcon(route.name),
            // Each tab renders on first visit, as before.
            lazy: true,
            // A sidebar on iPad, which hides into the top tab bar; iPhone and
            // narrower iPad windows keep the tab bar.
            tabBarControllerMode: hasSidebar ? 'tabSidebar' : 'tabBar',
            // Every tab stays one tap away while scrolling.
            tabBarMinimizeBehavior: 'none',
            tabBarLabelVisibilityMode: 'labeled',
            tabBarInactiveTintColor: Platform.select({
              android: theme.colors.textAlt,
            }),
            // Screens lay out their own scroll insets (`useTabBarInsets`).
            overrideScrollViewContentInsetAdjustmentBehavior: false,
          })}
        >
          {/* At most four destinations, in the user's order (Preferences →
              Tab Order). Features join an existing destination (Map in
              Contacts, Buddies in Schedule) rather than adding tabs: Android
              allows five items, and iPhone moves a sixth into More. */}
          {tabOrder.map(renderTabScreen)}
          {/* An action, not a destination: it opens the menu and never shows
              as selected. On iOS, the react-native-screens patch takes its
              taps before the tab bar or sidebar starts selecting it. */}
          <Tab.Screen
            name='QuickAction'
            component={EmptyTab}
            options={{
              // On iOS 26 the search role sets it apart from the tabs, as the
              // old Add button was. Builds with the iOS 27 SDK keep it in the
              // bar until react-native-screens supports iOS 27's prominent
              // tab. It keeps its own icon and, through the label, its title.
              tabBarSystemItem: 'search',
              tabBarLabel: tabTitle('QuickAction', language),
              tabBarAccessibilityLabel: i18n.t('quickAction', {
                locale: language,
              }),
              tabBarSelectionEnabled: false,
            }}
            listeners={{ tabPress: () => setQuickActionOpen(true) }}
          />
          {/* After Quick Action, so it's Settings that the iPad's top tab bar
              tucks behind its next-page button when space runs out. */}
          {hasSidebar && (
            <Tab.Screen
              name='Settings'
              getComponent={() =>
                require('@/app/navigation/SettingsSplitScreen').default
              }
            />
          )}
        </Tab.Navigator>
      </ThemeProvider>
      <QuickActionSheet
        navigation={navigation}
        sheetOpen={quickActionOpen}
        setSheetOpen={setQuickActionOpen}
      />
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

/** Quick Action's tab never opens, so it has nothing to show. */
const EmptyTab = () => null

export default HomeTabStack

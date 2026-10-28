import {
  Check as CheckIcon,
  Plus as PlusIcon,
  RefreshCw as RefreshCwIcon,
  Settings as SettingsIcon,
} from 'lucide-react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { HomeScreen } from '@/features/home/screens/HomeScreen'
import IconButton from '@/components/ui/IconButton'
import HeaderPillButton from '@/components/ui/HeaderPillButton'
import useHomeEditing from '@/hooks/useHomeEditing'
import useAvailableHomeSections from '@/hooks/useAvailableHomeSections'
import RootHeader from '@/components/RootHeader'
import useTheme from '@/contexts/theme'
import { DevSettings, View } from 'react-native'
import { triggerDevRemount } from '@/lib/devRemount'
import { usePreferences } from '@/stores/preferences'
import NotificationsBell from '@/app/notifications/NotificationsBell'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useOpenSettings from '@/hooks/useOpenSettings'
import i18n from '@/lib/locales'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { useUpdateRevealStore } from '@/features/updates/stores/updateReveal'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'

// A single-screen stack keeps the route named `Dashboard`, which screen
// analytics has always reported for Home.
const Stack = createNativeStackNavigator()

const HomeNavigator = () => {
  const set = usePreferences((s) => s.set)
  const theme = useTheme()
  const {
    isWide,
    contentMaxWidth,
    hasSidebar,
    sidebarVisible,
    navigationRail,
  } = useAdaptiveLayout()
  // A visible sidebar or the iPhone Duo rail already holds Settings.
  const showsSettings = !(hasSidebar && sidebarVisible) && !navigationRail
  const requestUpdateReveal = useUpdateRevealStore((s) => s.request)
  const buddiesAvailable = useBuddiesEnabled()
  const homeEditing = useHomeEditing({ buddiesAvailable })
  const { hidden } = useAvailableHomeSections({ buddiesAvailable })
  const openSettings = useOpenSettings()

  // Dev-only reset for the update reveal. Long-press the header title to clear
  // its state and play it again, launch version and all. Wired in __DEV__
  // only; the prop is undefined in production so production callers see no
  // behaviour change on long-press.
  const onLongPressTitle = __DEV__
    ? () => {
        set({
          updateReveal: null,
          unreadReleaseNotes: null,
          homeChecklistAllDoneCelebrated: false,
        })
        requestUpdateReveal('dev')
      }
    : undefined

  // Home renders its own header so scrolling can tuck it away.
  const header = (
    // Paints the full-width strip; the navigation theme's default background
    // is near-white even in dark mode.
    <View style={{ backgroundColor: theme.colors.background }}>
      <RootHeader
        title={i18n.t('Home')}
        onLongPressTitle={onLongPressTitle}
        contentStyle={{ maxWidth: isWide ? contentMaxWidth : 720 }}
        actions={
          homeEditing.editing ? (
            // As on the Home Screen: add on one side, Done on the other.
            <>
              {hidden.length ? (
                <HeaderPillButton
                  icon={PlusIcon}
                  label={i18n.t('homeEdit.addSections')}
                  onPress={() => homeEditing.setAdding(true)}
                  compact='auto'
                />
              ) : null}
              <HeaderPillButton
                icon={CheckIcon}
                label={i18n.t('done')}
                onPress={homeEditing.finish}
              />
            </>
          ) : (
            <>
              {__DEV__ && (
                <IconButton
                  icon={RefreshCwIcon}
                  size='xl'
                  hitSlop={12}
                  // Not "reload JS": agent-device reads that as a LogBox overlay.
                  accessibilityLabel='DEV: remount all screens (hold to restart)'
                  onPress={triggerDevRemount}
                  onLongPress={() => DevSettings.reload()}
                />
              )}
              {/* App-wide controls live on Home: Settings here as well as in
              the avatar's menu, where few look for it. */}
              {showsSettings && (
                <PointerTooltip label={i18n.t('settings')} effect='none'>
                  <IconButton
                    icon={SettingsIcon}
                    size='xl'
                    color={theme.colors.text}
                    accessibilityLabel={i18n.t('settings')}
                    frame
                    onPress={openSettings}
                    testID='home-settings'
                  />
                </PointerTooltip>
              )}
              <NotificationsBell />
            </>
          )
        }
      />
    </View>
  )

  return (
    <Stack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.background },
        headerShown: false,
      }}
    >
      <Stack.Screen name='Dashboard'>
        {() => <HomeScreen header={header} />}
      </Stack.Screen>
    </Stack.Navigator>
  )
}
export default HomeNavigator

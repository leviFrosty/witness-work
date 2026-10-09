import { useNotesImportEnabled } from '@/hooks/useNotesImportEnabled'
import { RefreshCw as RefreshCwIcon } from 'lucide-react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { HomeScreen } from '@/features/home/screens/HomeScreen'
import IconButton from '@/components/ui/IconButton'
import RootHeader from '@/components/RootHeader'
import { useEffect } from 'react'
import useTheme from '@/contexts/theme'
import { DevSettings, View } from 'react-native'
import { triggerDevRemount } from '@/lib/devRemount'
import { usePreferences } from '@/stores/preferences'
import NotificationsBell from '@/app/notifications/NotificationsBell'
import HomeStreakChip from '@/features/profile/components/HomeStreakChip'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import i18n from '@/lib/locales'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { useUpdateRevealStore } from '@/features/updates/stores/updateReveal'

// A single-screen stack keeps the route named `Dashboard`, which screen
// analytics has always reported for Home.
const Stack = createNativeStackNavigator()

const HomeNavigator = () => {
  const notesImportEnabled = useNotesImportEnabled()
  const set = usePreferences((s) => s.set)
  const theme = useTheme()
  const { isWide, contentMaxWidth } = useAdaptiveLayout()
  const focusNotesImports = useNotesImportManager((s) => s.focus)
  const requestUpdateReveal = useUpdateRevealStore((s) => s.request)

  // Populate settings-level status immediately and resume persisted work.
  useEffect(() => {
    if (notesImportEnabled) focusNotesImports()
  }, [focusNotesImports, notesImportEnabled])

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

  return (
    <Stack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.background },
        // Paint the full-width strip; the navigation theme's default
        // background is near-white even in dark mode.
        header: () => (
          <View style={{ backgroundColor: theme.colors.background }}>
            <RootHeader
              title={i18n.t('Home')}
              onLongPressTitle={onLongPressTitle}
              contentStyle={{ maxWidth: isWide ? contentMaxWidth : 720 }}
              actions={
                <>
                  {__DEV__ && (
                    <IconButton
                      icon={RefreshCwIcon}
                      size='xl'
                      hitSlop={12}
                      accessibilityLabel='DEV: remount all screens (hold to reload JS)'
                      onPress={triggerDevRemount}
                      onLongPress={() => DevSettings.reload()}
                    />
                  )}
                  <HomeStreakChip />
                  <NotificationsBell />
                </>
              }
            />
          </View>
        ),
      }}
    >
      <Stack.Screen name='Dashboard' component={HomeScreen} />
    </Stack.Navigator>
  )
}
export default HomeNavigator

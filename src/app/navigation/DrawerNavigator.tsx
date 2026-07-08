import {
  Heart as HeartIcon,
  Menu as MenuIcon,
  RefreshCw as RefreshCwIcon,
} from 'lucide-react-native'
import { createDrawerNavigator } from '@react-navigation/drawer'
import Header from '@/components/ui/layout/Header'
import SettingsScreen from '@/features/settings/screens/SettingsScreen'
import { HomeScreen } from '@/features/home/screens/HomeScreen'
import IconButton from '@/components/ui/IconButton'
import { Platform, View } from 'react-native'
import { useEffect } from 'react'
import useTheme from '@/contexts/theme'
import { DevSettings } from 'react-native'
import { triggerDevRemount } from '@/lib/devRemount'
import useCustomer from '@/hooks/useCustomer'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import SyncPopover from '@/app/sync/components/SyncPopover'
import MilestoneRevealRecoveryIcon from '@/features/milestones/components/MilestoneRevealRecoveryIcon'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import { unviewedReadyImportCount } from '@/features/notes-import/lib/notesImportLedger'
import NotesImportReadyDot from '@/features/notes-import/components/NotesImportReadyDot'
import i18n from '@/lib/locales'

const DrawerNavigator = () => {
  const Drawer = createDrawerNavigator()
  const { hasPurchasedBefore } = useCustomer()
  const { isSupporter } = useIsSupporter()
  const { hideDonateHeart, set } = usePreferences()
  const theme = useTheme()
  const notesImportReadyCount = useNotesImportManager((s) =>
    unviewedReadyImportCount(s.entries)
  )
  const focusNotesImports = useNotesImportManager((s) => s.focus)

  const showSyncPopover = isSupporter && Platform.OS === 'ios'

  // Populate settings-level status immediately and resume persisted work.
  useEffect(() => {
    focusNotesImports()
  }, [focusNotesImports])

  // Dev-only reset for the milestone-reveal flow. Long-press the date in the
  // header to clear both flags so the grand reveal fires fresh on next mount.
  // Wired in __DEV__ only; the prop is undefined in production so production
  // callers see no behaviour change on long-press.
  const onLongPressTitle = __DEV__
    ? () => {
        set({
          seenMilestoneUpdateReveal: false,
          dismissedMilestoneRevealOnce: false,
          lastAppVersion: '1.36.0',
          homeChecklistAllDoneCelebrated: false,
        })
      }
    : undefined

  return (
    <Drawer.Navigator
      screenOptions={{
        header: ({ navigation }) => (
          <Header
            leftElement={
              <View style={{ position: 'relative' }}>
                <IconButton
                  icon={MenuIcon}
                  size='xl'
                  hitSlop={24}
                  color={theme.colors.text}
                  accessibilityLabel={
                    notesImportReadyCount > 0
                      ? `${i18n.t('settings')}. ${i18n.t('notesImport_readyCount', { count: notesImportReadyCount })}.`
                      : i18n.t('settings')
                  }
                  onPress={() => navigation.toggleDrawer()}
                />
                <NotesImportReadyDot
                  visible={notesImportReadyCount > 0}
                  style={{ position: 'absolute', top: -2, right: -3 }}
                />
              </View>
            }
            onLongPressTitle={onLongPressTitle}
            rightElement={
              <View
                style={{
                  position: 'absolute',
                  right: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                {__DEV__ && (
                  <IconButton
                    icon={RefreshCwIcon}
                    accessibilityLabel='DEV: remount all screens (hold to reload JS)'
                    onPress={triggerDevRemount}
                    onLongPress={() => DevSettings.reload()}
                  />
                )}
                <MilestoneRevealRecoveryIcon />
                {showSyncPopover ? (
                  <SyncPopover />
                ) : (
                  !hideDonateHeart && (
                    <IconButton
                      onPress={() => navigation.navigate('Paywall')}
                      icon={hasPurchasedBefore ? HeartIcon : HeartIcon}
                      color={
                        hasPurchasedBefore
                          ? theme.colors.errorAlt
                          : theme.colors.text
                      }
                    />
                  )
                )}
              </View>
            }
          />
        ),
      }}
      drawerContent={SettingsScreen}
      initialRouteName='Dashboard'
    >
      <Drawer.Screen name='Dashboard' component={HomeScreen} />
    </Drawer.Navigator>
  )
}
export default DrawerNavigator

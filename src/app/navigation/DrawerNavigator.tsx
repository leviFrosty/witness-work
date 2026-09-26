import { useFeatureFlag } from '@/lib/featureFlags'
import { analytics } from '@/lib/analytics'
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
import { PixelRatio, Platform, View, useWindowDimensions } from 'react-native'
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
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'

const Drawer = createDrawerNavigator()

const DrawerNavigator = () => {
  const notesImportEnabled = useFeatureFlag('notes-import')
  const { hasPurchasedBefore } = useCustomer()
  const { isSupporter } = useIsSupporter()
  const { hideDonateHeart, set } = usePreferences()
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const { hasSidebar } = useAdaptiveLayout()
  const notesImportReadyCount = useNotesImportManager((s) =>
    unviewedReadyImportCount(s.entries)
  )
  const focusNotesImports = useNotesImportManager((s) => s.focus)

  const showSyncPopover = isSupporter && Platform.OS === 'ios'

  // The slide drawer translates the scene by exactly this width. A fractional
  // width lands the drawer's edge and the scene's edge on different physical
  // pixels, which shows up as a flickering 1px seam while dragging. Snap it to
  // the pixel grid so both edges rasterize at the same spot.
  const drawerWidth = PixelRatio.roundToNearestPixel(
    Math.min(width * 0.88, 380)
  )

  // Populate settings-level status immediately and resume persisted work.
  useEffect(() => {
    if (notesImportEnabled) focusNotesImports()
  }, [focusNotesImports, notesImportEnabled])

  // Dev-only reset for the milestone-reveal flow. Long-press the center of the
  // header to clear both flags so the grand reveal fires fresh on next mount.
  // Wired in __DEV__ only; the prop is undefined in production so production
  // callers see no behaviour change on long-press.
  const onLongPressTitle = __DEV__
    ? () => {
        set({
          seenMilestoneUpdateReveal: false,
          dismissedMilestoneRevealOnce: false,
          lastAppVersion: '1.36.0',
          unreadReleaseNotes: null,
          homeChecklistAllDoneCelebrated: false,
        })
      }
    : undefined

  return (
    // Paint behind the drawer in the app background. Without this, any gap
    // between the sliding scene and the drawer reveals react-navigation's
    // default theme background, which is near-white even in dark mode.
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Drawer.Navigator
        screenOptions={{
          // Keep the same navigator across resizing so Home retains its state.
          // The wide layout has no drawer surface; Settings lives in the sidebar.
          // Preserve the platform default in compact layouts (slide on iOS).
          drawerType: hasSidebar ? 'permanent' : undefined,
          swipeEnabled: !hasSidebar,
          drawerStyle: {
            width: hasSidebar ? 0 : drawerWidth,
            backgroundColor: theme.colors.background,
          },
          sceneStyle: { backgroundColor: theme.colors.background },
          header: ({ navigation }) => (
            <Header
              buttonType={hasSidebar ? 'none' : undefined}
              leftElement={
                hasSidebar ? undefined : (
                  <View style={{ position: 'relative' }}>
                    <IconButton
                      icon={MenuIcon}
                      size='xl'
                      hitSlop={24}
                      color={theme.colors.text}
                      accessibilityLabel={
                        notesImportEnabled && notesImportReadyCount > 0
                          ? `${i18n.t('settings')}. ${i18n.t('notesImport_readyCount', { count: notesImportReadyCount })}.`
                          : i18n.t('settings')
                      }
                      onPress={() => navigation.toggleDrawer()}
                    />
                    <NotesImportReadyDot
                      visible={notesImportEnabled && notesImportReadyCount > 0}
                      style={{ position: 'absolute', top: -2, right: -3 }}
                    />
                  </View>
                )
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
                        onPress={() => {
                          analytics.capture('paywall_opened', {
                            source: 'header_heart',
                          })
                          navigation.navigate('Paywall', {
                            source: 'header_heart',
                          })
                        }}
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
        drawerContent={(props) => <SettingsScreen {...props} />}
        initialRouteName='Dashboard'
      >
        <Drawer.Screen name='Dashboard' component={HomeScreen} />
      </Drawer.Navigator>
    </View>
  )
}
export default DrawerNavigator

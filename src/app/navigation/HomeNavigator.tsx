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
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

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
  const foldColumn = useFoldColumn(isWide ? null : 720)

  const showsSettings = !(hasSidebar && sidebarVisible) && !navigationRail
  const requestUpdateReveal = useUpdateRevealStore((s) => s.request)
  const buddiesAvailable = useBuddiesEnabled()
  const homeEditing = useHomeEditing({ buddiesAvailable })
  const { hidden } = useAvailableHomeSections({ buddiesAvailable })
  const openSettings = useOpenSettings()

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

  const header = (
    <View style={{ backgroundColor: theme.colors.background }}>
      <RootHeader
        title={i18n.t('Home')}
        onLongPressTitle={onLongPressTitle}
        contentStyle={[
          { maxWidth: isWide ? contentMaxWidth : 720 },
          foldColumn,
        ]}
        actions={
          homeEditing.editing ? (
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
                  accessibilityLabel='DEV: remount all screens (hold to restart)'
                  onPress={triggerDevRemount}
                  onLongPress={() => DevSettings.reload()}
                />
              )}
              {}
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

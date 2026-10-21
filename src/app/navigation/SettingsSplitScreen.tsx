import { ReactNode, useEffect, useRef, useState } from 'react'
import { Dimensions, View } from 'react-native'
import { StackActions, useIsFocused } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { getAdaptiveLayout } from '@/lib/sidebarLayout'
import { navigationRef } from '@/features/contacts/lib/linking'

import Header from '@/components/ui/layout/Header'
import SettingsContents from '@/features/settings/components/SettingsContents'
import SettingsOverviewScreen from '@/features/settings/screens/SettingsOverviewScreen'
import { settingsDetailScreens } from '@/app/navigation/settingsDetailScreens'
import { RootStackParamList } from '@/types/rootStack'
import SidebarToggle from '@/components/ui/SidebarToggle'
import WindowControlsInsetView, {
  NO_WINDOW_CONTROLS,
} from '../../../modules/window-controls'

const SettingsDetailStack = createNativeStackNavigator<RootStackParamList>()

type LayoutProps = {
  selectedDestination?: keyof RootStackParamList
  onNavigate: (destination: keyof RootStackParamList) => void
  children: ReactNode
}

/** List on the left, the selected destination's stack on the right. */
const SettingsSplitLayout = ({
  selectedDestination,
  onNavigate,
  children,
}: LayoutProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [controls, setControls] = useState(NO_WINDOW_CONTROLS)

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          paddingTop: insets.top + 8,
          width: '100%',
          maxWidth: 1200,
          alignSelf: 'center',
        }}
      >
        <View style={{ width: 350 }}>
          <WindowControlsInsetView onInsetsChange={setControls}>
            <View
              style={{
                paddingStart: 12 + controls.start,
                paddingEnd: 12,
              }}
            >
              <SidebarToggle mode='show' />
            </View>
          </WindowControlsInsetView>
          <SettingsContents
            onNavigate={onNavigate}
            selectedDestination={selectedDestination}
          />
        </View>
        <View
          style={{
            flex: 1,
            borderStartWidth: 1,
            borderStartColor: theme.colors.border,
            marginRight: 16,
            overflow: 'hidden',
            borderRadius: theme.numbers.borderRadiusLg,
          }}
        >
          {/* The pane starts below the status bar, so its headers must not
              pad for it again. */}
          <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
            {children}
          </SafeAreaInsetsContext.Provider>
        </View>
      </View>
    </View>
  )
}

type PaneRoute = { name: keyof RootStackParamList; params?: object }

/**
 * The Settings tab exists only beside the sidebar. When the window gets too
 * narrow for one (Split View, Stage Manager), the tab goes away and the app
 * would land on Home, so this reopens Settings as a page at the same
 * destination.
 */
function useKeepSettingsWhenSidebarHides() {
  const isFocused = useIsFocused()
  const focused = useRef(isFocused)
  const pane = useRef<PaneRoute[]>([])

  useEffect(() => {
    focused.current = isFocused
  }, [isFocused])

  useEffect(
    () => () => {
      const { width, fontScale } = Dimensions.get('window')
      const { hasSidebar } = getAdaptiveLayout(width, fontScale, 0, false)
      if (!focused.current || hasSidebar) return
      const routes = pane.current
      requestAnimationFrame(() => {
        if (!navigationRef.isReady()) return
        navigationRef.dispatch(StackActions.push('SettingsMenu'))
        for (const route of routes)
          navigationRef.dispatch(StackActions.push(route.name, route.params))
      })
    },
    []
  )

  return (state: { routes: PaneRoute[] }) => {
    pane.current = state.routes.map(({ name, params }) => ({ name, params }))
  }
}

/**
 * Wide Settings tab: the settings list stays visible while destinations open
 * beside it, like Contacts. Screens pushed from a destination (e.g. a
 * Preferences subsection) stack inside the pane; anything else bubbles up to
 * the root stack.
 */
export default function SettingsSplitScreen() {
  const { isWide } = useAdaptiveLayout()
  const rememberPane = useKeepSettingsWhenSidebarHides()
  if (!isWide) return <SettingsOverviewScreen />

  return (
    <SettingsDetailStack.Navigator
      screenListeners={{
        state: (event) => rememberPane(event.data.state),
      }}
      initialRouteName='PreferencesPublisher'
      layout={({ state, navigation, children }) => (
        <SettingsSplitLayout
          selectedDestination={state.routes[0]?.name}
          onNavigate={(destination) => {
            navigation.reset({ index: 0, routes: [{ name: destination }] })
          }}
        >
          {children}
        </SettingsSplitLayout>
      )}
    >
      {settingsDetailScreens.map((screen) => (
        <SettingsDetailStack.Screen
          key={screen.name}
          name={screen.name}
          getComponent={screen.getComponent}
          options={({ navigation, route }) => {
            const isRoot = navigation.getState().routes[0]?.key === route.key
            return {
              // Switching destinations replaces the pane rather than pushing.
              animation: isRoot ? 'none' : 'default',
              header: () => (
                <Header
                  buttonType={isRoot ? 'none' : 'back'}
                  title={screen.title()}
                  rightElement={screen.headerRight && <screen.headerRight />}
                />
              ),
            }
          }}
        />
      ))}
    </SettingsDetailStack.Navigator>
  )
}

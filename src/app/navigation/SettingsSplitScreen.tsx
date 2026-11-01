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
import FoldSplit from '@/components/ui/layout/FoldSplit'

const SettingsDetailStack = createNativeStackNavigator<RootStackParamList>()

type LayoutProps = {
  selectedDestination?: keyof RootStackParamList
  onNavigate: (destination: keyof RootStackParamList) => void
  children: ReactNode
}

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
      {}
      <FoldSplit
        style={{
          flex: 1,
          paddingTop: insets.top + 8,
          width: '100%',
          maxWidth: 1200,
          alignSelf: 'center',
        }}
        gap={0}
        leadingWidth={350}
        leading={
          <>
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
          </>
        }
        trailingStyle={{
          borderStartWidth: 1,
          borderStartColor: theme.colors.border,
          marginRight: 16,
          overflow: 'hidden',
          borderRadius: theme.numbers.borderRadiusLg,
        }}
        trailing={
          <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
            {children}
          </SafeAreaInsetsContext.Provider>
        }
      />
    </View>
  )
}

type PaneRoute = { name: keyof RootStackParamList; params?: object }

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

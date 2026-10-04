import { ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { analytics } from '@/lib/analytics'
import Header from '@/components/ui/layout/Header'
import { InputLayoutProvider } from '@/components/ui/inputs/InputLayout'
import SettingsContents from '@/features/settings/components/SettingsContents'
import SettingsOverviewScreen from '@/features/settings/screens/SettingsOverviewScreen'
import { settingsDetailScreens } from '@/app/navigation/settingsDetailScreens'
import { RootStackParamList } from '@/types/rootStack'
import SidebarToggle from '@/components/ui/SidebarToggle'

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
        <InputLayoutProvider value='drawer'>
          <ScrollView
            style={{ width: 350, flexGrow: 0 }}
            contentContainerStyle={{
              paddingTop: 16,
              paddingBottom: insets.bottom + 24,
              paddingHorizontal: 12,
            }}
          >
            <SidebarToggle mode='show' />
            <SettingsContents
              onNavigate={onNavigate}
              selectedDestination={selectedDestination}
            />
          </ScrollView>
        </InputLayoutProvider>
        <View
          style={{
            flex: 1,
            borderLeftWidth: 1,
            borderLeftColor: theme.colors.border,
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

/**
 * Wide Settings tab: the settings list stays visible while destinations open
 * beside it, like Contacts. Screens pushed from a destination (e.g. a
 * Preferences subsection) stack inside the pane; anything else bubbles up to
 * the root stack.
 */
export default function SettingsSplitScreen() {
  const { isWide } = useAdaptiveLayout()
  if (!isWide) return <SettingsOverviewScreen />

  return (
    <SettingsDetailStack.Navigator
      initialRouteName='PreferencesPublisher'
      layout={({ state, navigation, children }) => (
        <SettingsSplitLayout
          selectedDestination={state.routes[0]?.name}
          onNavigate={(destination) => {
            analytics.capture('settings_split_destination_selected', {
              destination,
            })
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
          component={screen.component}
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

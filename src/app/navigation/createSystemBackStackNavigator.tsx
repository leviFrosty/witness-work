import { useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import {
  createNavigatorFactory,
  type ParamListBase,
  type StackActionHelpers,
  type StackNavigationState,
  StackRouter,
  type StackRouterOptions,
  type StaticConfig,
  type TypedNavigator,
  useNavigationBuilder,
} from '@react-navigation/native'
import {
  NativeStackView,
  type NativeStackNavigationEventMap,
  type NativeStackNavigationOptions,
  type NativeStackNavigatorProps,
  type NativeStackTypeBag,
} from '@react-navigation/native-stack'
import useTheme from '@/contexts/theme'
import { SystemBackButtonContext } from '@/components/ui/layout/SystemBackButton'
import { useDisplayRegions } from '@/stores/displayRegions'

/** The navigation bar with nothing but the system's Back button. */
const backButtonOnly: NativeStackNavigationOptions = {
  headerShown: true,
  headerTransparent: true,
  headerTitle: '',
  headerLargeTitle: false,
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
}

const isPush = (options: NativeStackNavigationOptions) =>
  options.presentation === undefined || options.presentation === 'card'

/**
 * A native stack whose pushed screens let the navigation bar draw their Back
 * button where the device has a vertical bar (iPhone Duo), as UIKit's
 * navigation controllers do: the system puts it beside the status bar, and the
 * app's headers keep the title and actions. Elsewhere the bar would sit over
 * those actions and take their taps, so headers keep their own Back button.
 */
function SystemBackStackNavigator({
  id,
  initialRouteName,
  UNSTABLE_routeNamesChangeBehavior,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  UNSTABLE_router,
  ...rest
}: NativeStackNavigatorProps) {
  const { state, describe, descriptors, navigation, NavigationContent } =
    useNavigationBuilder<
      StackNavigationState<ParamListBase>,
      StackRouterOptions,
      StackActionHelpers<ParamListBase>,
      NativeStackNavigationOptions,
      NativeStackNavigationEventMap
    >(StackRouter, {
      id,
      initialRouteName,
      UNSTABLE_routeNamesChangeBehavior,
      children,
      layout,
      screenListeners,
      screenOptions,
      screenLayout,
      UNSTABLE_router,
    })
  const theme = useTheme()
  const verticalBar = useDisplayRegions(
    (s) =>
      Platform.OS === 'ios' && (s.regions?.verticalBarEdge ?? null) !== null
  )
  // Routes whose header asked for the system's Back button.
  const [requested, setRequested] = useState<ReadonlySet<string>>(new Set())
  const [request] = useState(() => (key: string) => {
    setRequested((keys) => (keys.has(key) ? keys : new Set(keys).add(key)))
    return () =>
      setRequested((keys) => {
        if (!keys.has(key)) return keys
        const next = new Set(keys)
        next.delete(key)
        return next
      })
  })

  const adapted = Object.fromEntries(
    state.routes.map((route, index) => {
      const descriptor = descriptors[route.key]
      const { options } = descriptor
      const available = verticalBar && index > 0 && isPush(options)
      const context = { available, routeKey: route.key, request }
      if (!available)
        return [
          route.key,
          {
            ...descriptor,
            render: () => (
              <SystemBackButtonContext.Provider value={context}>
                {descriptor.render()}
              </SystemBackButtonContext.Provider>
            ),
          },
        ]

      // The app's header moves into the screen, so the native bar can show
      // without remounting it when the request comes in.
      const { header } = options
      const headerShown = options.headerShown !== false
      const systemBack = requested.has(route.key)
      return [
        route.key,
        {
          ...descriptor,
          options: {
            ...options,
            header: undefined,
            ...(systemBack
              ? { ...backButtonOnly, headerTintColor: theme.colors.text }
              : { headerShown: false }),
          },
          render: () => (
            <SystemBackButtonContext.Provider value={context}>
              <View style={styles.screen}>
                {header && headerShown ? (
                  <View
                    style={options.headerTransparent ? styles.overlay : null}
                    pointerEvents='box-none'
                  >
                    {header({
                      back: { title: undefined, href: undefined },
                      options,
                      route,
                      navigation: descriptor.navigation,
                    })}
                  </View>
                ) : null}
                {descriptor.render()}
              </View>
            </SystemBackButtonContext.Provider>
          ),
        },
      ]
    })
  )

  return (
    <NavigationContent>
      <NativeStackView
        {...rest}
        state={state}
        navigation={navigation}
        descriptors={adapted}
        describe={describe}
      />
    </NavigationContent>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
})

type SystemBackStackTypeBag<
  ParamList extends ParamListBase,
  NavigatorID extends string | undefined,
> = Omit<NativeStackTypeBag<ParamList, NavigatorID>, 'Navigator'> & {
  Navigator: typeof SystemBackStackNavigator
}

export default function createSystemBackStackNavigator<
  const ParamList extends ParamListBase,
  const NavigatorID extends string | undefined = string | undefined,
  const TypeBag extends SystemBackStackTypeBag<
    ParamList,
    NavigatorID
  > = SystemBackStackTypeBag<ParamList, NavigatorID>,
  const Config extends StaticConfig<TypeBag> = StaticConfig<TypeBag>,
>(config?: Config): TypedNavigator<TypeBag, Config> {
  return createNavigatorFactory(SystemBackStackNavigator)(config)
}

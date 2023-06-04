import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect } from "react";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { i18n } from "./src/lib/translations";
import { getLocales } from "expo-localization";
import * as Sentry from "sentry-expo";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeStackScreen from "./src/stacks/HomeStackScreen";
import useSettingStore from "./src/stores/SettingsStore";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import TerritoryStackScreen from "./src/stacks/TerritoryStackScreen";
import NativeBase from "./src/components/NativeBase";
import { RootStackParamList } from "./src/stacks/ParamLists";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Error tracking application setup
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  debug: true,
});

// Sets default language based on system language
i18n.locale = getLocales()[0].languageCode;

// When a value is missing from a language it'll fall back to another language with the key present.
i18n.enableFallback = true;

function App() {
  const onLayoutRootView = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  const Tab = createBottomTabNavigator<RootStackParamList>();

  useEffect(() => {
    onLayoutRootView();
  }, []);

  const { language: userPreferenceLanguage } = useSettingStore();

  useEffect(() => {
    if (userPreferenceLanguage) {
      i18n.locale = userPreferenceLanguage;
    }
  }, [userPreferenceLanguage]);

  return (
    <NativeBase>
      <SafeAreaProvider>
        <NavigationContainer theme={DarkTheme}>
          <Tab.Navigator
            initialRouteName="Home"
            screenOptions={({ route }) => ({
              tabBarIcon: ({ focused, color, size }) => {
                type PossibleIcon =
                  | "home"
                  | "home-outline"
                  | "map"
                  | "map-outline"
                  | "help";
                let iconName: PossibleIcon = "help";

                if (route.name === "Home") {
                  iconName = focused ? "home" : "home-outline";
                } else if (route.name === "Territory") {
                  iconName = focused ? "map" : "map-outline";
                }

                return (
                  <MaterialCommunityIcons
                    name={iconName}
                    size={size}
                    color={color}
                  />
                );
              },
              headerShown: false,
            })}
          >
            <Tab.Screen name="Home" component={HomeStackScreen} />
            <Tab.Screen name="Territory" component={TerritoryStackScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </NativeBase>
  );
}

export default Sentry.Native.wrap(App);

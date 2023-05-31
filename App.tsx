import { useColorScheme } from "react-native";
import { useMaterial3Theme } from "@pchmn/expo-material3-theme";
import * as SplashScreen from "expo-splash-screen";
import {
  PaperProvider,
  MD3DarkTheme,
  MD3LightTheme,
  adaptNavigationTheme,
} from "react-native-paper";
import { useCallback, useEffect } from "react";
import {
  NavigationContainer,
  DefaultTheme as NavigationDefaultTheme,
  DarkTheme as NavigationDarkTheme,
} from "@react-navigation/native";
import { i18n } from "./translations";
import { getLocales } from "expo-localization";
import * as Sentry from "sentry-expo";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeStackScreen from "./stacks/HomeStackScreen";
import useSettingStore from "./stores/SettingsStore";

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

export type RootStackParamList = {
  Home: undefined;
};

function App() {
  const onLayoutRootView = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);
  const deviceColorScheme = useColorScheme();
  const { userPreferenceColorScheme } = useSettingStore();

  const colorScheme = userPreferenceColorScheme || deviceColorScheme;

  const { theme } = useMaterial3Theme();
  const paperTheme =
    colorScheme === "dark"
      ? { ...MD3DarkTheme, colors: theme.dark }
      : { ...MD3LightTheme, colors: theme.light };
  const { DarkTheme, LightTheme } = adaptNavigationTheme({
    reactNavigationLight: NavigationDefaultTheme,
    reactNavigationDark: NavigationDarkTheme,
  });

  const Tab = createBottomTabNavigator<RootStackParamList>();

  useEffect(() => {
    onLayoutRootView();
  }, []);

  return (
    <PaperProvider theme={paperTheme}>
      <SafeAreaProvider>
        <NavigationContainer
          theme={deviceColorScheme === "dark" ? DarkTheme : LightTheme}
        >
          <Tab.Navigator
            initialRouteName="Home"
            screenOptions={{ headerShown: false }}
          >
            <Tab.Screen name="Home" component={HomeStackScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </PaperProvider>
  );
}

export default Sentry.Native.wrap(App);

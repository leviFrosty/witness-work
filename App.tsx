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
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "./screens/HomeScreen";
import { i18n } from "./translations";
import { getLocales } from "expo-localization";
import * as Sentry from "sentry-expo";

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
  const colorScheme = useColorScheme();
  const { theme } = useMaterial3Theme();
  const paperTheme =
    colorScheme === "dark"
      ? { ...MD3DarkTheme, colors: theme.dark }
      : { ...MD3LightTheme, colors: theme.light };
  const { DarkTheme, LightTheme } = adaptNavigationTheme({
    reactNavigationLight: NavigationDefaultTheme,
    reactNavigationDark: NavigationDarkTheme,
  });

  const Stack = createNativeStackNavigator<RootStackParamList>();

  useEffect(() => {
    onLayoutRootView();
  }, []);

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer
        theme={colorScheme === "dark" ? DarkTheme : LightTheme}
      >
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}

export default Sentry.Native.wrap(App);

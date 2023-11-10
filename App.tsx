import "react-native-gesture-handler";
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import RootStackComponent from "./src/stacks/RootStack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import * as Sentry from "sentry-expo";
import "./src/lib/locales";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar"; // automatically switches bar style based on theme!
import getThemeFromColorScheme from "./src/constants/theme";
import { ThemeContext } from "./src/contexts/theme";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

Sentry.init({
  dsn: "https://f9600209459a43d18c3d2c3a6ac2aa7b@o572512.ingest.sentry.io/4505271593074688",
  enableInExpoDevelopment: true,
  debug: __DEV__,
  attachScreenshot: true,
});

export default function App() {
  const colorScheme = useColorScheme();
  const theme = getThemeFromColorScheme(colorScheme);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  try {
    return (
      <NavigationContainer>
        <SafeAreaProvider>
          <ThemeContext.Provider value={theme}>
            <StatusBar />
            <RootStackComponent />
          </ThemeContext.Provider>
        </SafeAreaProvider>
      </NavigationContainer>
    );
  } catch (error) {
    Sentry.Native.captureException(error);
  }
}

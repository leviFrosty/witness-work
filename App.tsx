import "react-native-gesture-handler";
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import RootStackComponent from "./src/stacks/RootStack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import * as Sentry from "sentry-expo";
import "./src/lib/locales";

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
  try {
    return (
      <NavigationContainer>
        <SafeAreaProvider>
          <RootStackComponent />
        </SafeAreaProvider>
      </NavigationContainer>
    );
  } catch (error) {
    Sentry.Native.captureException(error);
  }
}

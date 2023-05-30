import { View, useColorScheme } from "react-native";
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

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export type RootStackParamList = {
  Home: undefined;
};

export default function App() {
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
    onLayoutRootView()
  }, [])

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer
        theme={colorScheme === "dark" ? DarkTheme : LightTheme}
      >
        <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false}} >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={
              {
                // headerShown: false,
              }
            }
          />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}

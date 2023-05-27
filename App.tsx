import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, useColorScheme } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useCallback } from "react";
import Entypo from "@expo/vector-icons/Entypo";
import { useFonts } from "expo-font";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const styles = StyleSheet.create({
  lightThemeContainer: {
    backgroundColor: "#ffffff",
  },
  darkThemeContainer: {
    backgroundColor: "#242c40",
  },
  lightThemeText: {
    color: "#242c40",
  },
  darkThemeText: {
    color: "#ffffff",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: "Inter-Regular",
  },
});

export default function App() {
  const [fontsLoaded] = useFonts({
    "Inter-Regular": require("./assets/fonts/Inter-Regular.otf"),
  });
  const colorScheme = useColorScheme();
  const randomWidth = useSharedValue(10);

  const config = {
    duration: 500,
    easing: Easing.bezier(0.5, 0.01, 0, 1),
  };

  const ViewStyle = useAnimatedStyle(() => {
    return {
      width: withTiming(randomWidth.value, config),
    };
  });

  const themeTextStyle =
    colorScheme === "light" ? styles.lightThemeText : styles.darkThemeText;
  const themeContainerStyle =
    colorScheme === "light"
      ? styles.lightThemeContainer
      : styles.darkThemeContainer;

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[styles.container, themeContainerStyle]}
        onLayout={onLayoutRootView}
      >
        <Animated.View style={ViewStyle}>
          <Text style={[styles.text, themeTextStyle]}>
            Color scheme: {colorScheme}
          </Text>
          <StatusBar style="auto" />
          <Entypo name="rocket" size={30} color="#AC94C9" />
        </Animated.View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

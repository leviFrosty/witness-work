import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useCallback } from "react";
import Entypo from "@expo/vector-icons/Entypo";
import { useFonts } from "expo-font";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Inter-Regular",
  },
  font: {
    fontFamily: "Inter-Regular",
  },
});

export default function App() {
  const [fontsLoaded] = useFonts({
    "Inter-Regular": require("./assets/fonts/Inter-Regular.otf"),
  });

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
      <SafeAreaView style={styles.container} onLayout={onLayoutRootView}>
        <Text style={styles.font}>Hello World!</Text>
        <Text style={styles.font}>Hello World!</Text>
        <StatusBar style="auto" />
        <Entypo name="rocket" size={30} color="#AC94C9" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

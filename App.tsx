import "react-native-gesture-handler";
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import RootStackComponent from "./src/stacks/RootStack";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function App() {
  return (
    <NavigationContainer>
      <SafeAreaProvider>
        <RootStackComponent />
      </SafeAreaProvider>
    </NavigationContainer>
  );
}

import React from "react";
import { Dimensions, SafeAreaView, View } from "react-native";
import OnBoarding from "./src/components/onboarding/Onboarding";
import { usePreferences } from "./src/stores/preferences";
import { NavigationContainer } from "@react-navigation/native";
import RootStackComponent from "./src/stacks/RootStack";

export default function App() {
  const { onboardingComplete, set } = usePreferences();

  return (
    <NavigationContainer>
      {onboardingComplete ? (
        <RootStackComponent />
      ) : (
        <OnBoarding
          setOnboardingComplete={(c: boolean) => set({ onboardingComplete: c })}
        />
      )}
    </NavigationContainer>
  );
}

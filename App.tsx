import React from "react";
import OnBoarding from "./src/components/onboarding/Onboarding";
import { usePreferences } from "./src/stores/preferences";
import { NavigationContainer } from "@react-navigation/native";
import RootStackComponent from "./src/stacks/RootStack";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function App() {
  const { onboardingComplete, set } = usePreferences();

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        {onboardingComplete ? (
          <RootStackComponent />
        ) : (
          <OnBoarding
            setOnboardingComplete={(c: boolean) =>
              set({ onboardingComplete: c })
            }
          />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

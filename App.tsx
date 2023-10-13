import React from "react";
import { Dimensions, SafeAreaView } from "react-native";
import OnBoarding from "./src/components/onboarding/Onboarding";
import Home from "./src/screens/Home";
import { usePreferences } from "./src/stores/preferences";

export default function App() {
  const { onboardingComplete, set } = usePreferences();

  return (
    <SafeAreaView
      style={{
        height: Dimensions.get("window").height,
        marginTop: 40,
        marginHorizontal: 15,
      }}
    >
      {onboardingComplete ? (
        <Home />
      ) : (
        <OnBoarding
          setOnboardingComplete={(c: boolean) => set({ onboardingComplete: c })}
        />
      )}
    </SafeAreaView>
  );
}

import React from "react";
import { Dimensions, SafeAreaView, View } from "react-native";
import OnBoarding from "./src/components/onboarding/Onboarding";
import Home from "./src/screens/Home";
import { usePreferences } from "./src/stores/preferences";
import theme from "./src/constants/theme";

export default function App() {
  const { onboardingComplete, set } = usePreferences();

  return (
    <View
      style={{ position: "relative", backgroundColor: theme.colors.background }}
    >
      <View
        style={{
          backgroundColor: theme.colors.accentBackground,
          width: "100%",
          height: 300,
          position: "absolute",
          top: 0,
        }}
      />
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
            setOnboardingComplete={(c: boolean) =>
              set({ onboardingComplete: c })
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}
